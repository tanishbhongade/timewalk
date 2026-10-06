import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { loadEnv } from "../config/env.js";
import {
  generateFamilyId,
  generateRefreshToken,
  getRefreshTokenStore,
  hashRefreshToken,
  type RefreshTokenStore,
} from "./refresh-token.store.js";
import { logger } from "../utils/logger.js";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private readonly secret: Uint8Array;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly store: RefreshTokenStore;

  constructor() {
    const env = loadEnv();
    this.secret = new TextEncoder().encode(env.JWT_SECRET);
    this.accessTtl = env.JWT_ACCESS_TTL_SECONDS;
    this.refreshTtl = env.JWT_REFRESH_TTL_SECONDS;
    this.store = getRefreshTokenStore();
  }

  private async signAccessToken(deviceId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(deviceId)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtl}s`)
      .setIssuer("timewalk")
      .setAudience("timewalk-api")
      .setJti(randomUUID())
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: "timewalk",
      audience: "timewalk-api",
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new Error("Token is missing subject");
    }
    return payload.sub;
  }

  private async issuePair(
    deviceId: string,
    familyId: string,
  ): Promise<TokenPair> {
    const accessToken = await this.signAccessToken(deviceId);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    await this.store.create({
      tokenHash,
      deviceId,
      familyId,
      expiresAt: Date.now() + this.refreshTtl * 1000,
      used: false,
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  /** First-time anonymous token issuance. */
  async issueAnonymous(deviceId: string): Promise<TokenPair> {
    const familyId = generateFamilyId();
    return this.issuePair(deviceId, familyId);
  }

  /**
   * Rotate a refresh token. Returns a new pair, marks the old token as used,
   * and detects reuse (which revokes the entire family).
   */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(refreshToken);
    const record = await this.store.find(tokenHash);

    if (!record) {
      throw new AuthError(
        "INVALID_REFRESH_TOKEN",
        "Refresh token is invalid or expired",
      );
    }

    if (record.used) {
      // Reuse detected — someone is playing with an old token. Kill the family.
      logger.warn(
        { deviceId: record.deviceId, familyId: record.familyId },
        "refresh token reuse detected; revoking family",
      );
      await this.store.revokeFamily(record.familyId);
      throw new AuthError(
        "REFRESH_TOKEN_REUSED",
        "Refresh token reuse detected",
      );
    }

    await this.store.markUsed(tokenHash);
    return this.issuePair(record.deviceId, record.familyId);
  }

  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    const record = await this.store.find(tokenHash);
    if (record) {
      await this.store.revokeFamily(record.familyId);
    }
    // Don't leak whether the token existed.
  }
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

let singleton: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!singleton) singleton = new AuthService();
  return singleton;
}

export function setAuthService(service: AuthService): void {
  singleton = service;
}
