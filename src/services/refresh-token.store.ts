import { createHash, randomBytes } from "node:crypto";

export interface RefreshTokenRecord {
  /** SHA-256 hash of the opaque token, used as the lookup key. */
  tokenHash: string;
  deviceId: string;
  /** All tokens in a rotation chain share a familyId. */
  familyId: string;
  expiresAt: number;
  used: boolean;
}

export interface RefreshTokenStore {
  create(record: RefreshTokenRecord): Promise<void>;
  find(tokenHash: string): Promise<RefreshTokenRecord | undefined>;
  markUsed(tokenHash: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateFamilyId(): string {
  return randomBytes(16).toString("hex");
}

class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private store = new Map<string, RefreshTokenRecord>();

  async create(record: RefreshTokenRecord): Promise<void> {
    this.store.set(record.tokenHash, record);
    // Opportunistic cleanup of expired entries.
    if (this.store.size > 5000) {
      const now = Date.now();
      for (const [k, v] of this.store) {
        if (v.expiresAt < now) this.store.delete(k);
      }
    }
  }

  async find(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    const r = this.store.get(tokenHash);
    if (!r) return undefined;
    if (r.expiresAt < Date.now()) {
      this.store.delete(tokenHash);
      return undefined;
    }
    return r;
  }

  async markUsed(tokenHash: string): Promise<void> {
    const r = this.store.get(tokenHash);
    if (r) this.store.set(tokenHash, { ...r, used: true });
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const [k, v] of this.store) {
      if (v.familyId === familyId) this.store.delete(k);
    }
  }
}

let singleton: RefreshTokenStore = new InMemoryRefreshTokenStore();

export function getRefreshTokenStore(): RefreshTokenStore {
  return singleton;
}

export function setRefreshTokenStore(store: RefreshTokenStore): void {
  singleton = store;
}
