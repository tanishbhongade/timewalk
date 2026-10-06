export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request", details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class UpstreamError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(502, code, message, details, true);
    this.name = "UpstreamError";
  }
}

export class TimeoutError extends AppError {
  constructor(message = "Upstream dependency timed out") {
    super(504, "UPSTREAM_TIMEOUT", message, undefined, true);
    this.name = "TimeoutError";
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(code: string, message: string) {
    super(503, code, message, undefined, true);
    this.name = "ServiceUnavailableError";
  }
}
