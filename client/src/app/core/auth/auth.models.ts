/**
 * Shapes mirror the API contracts in src/Application/Features/Auth/DTOs.
 * The backend serializes records verbatim, so the wire format is snake_case.
 */

/** Mirrors RegisterDTO. */
export interface RegisterRequest {
  login: string;
  password: string;
  first_name: string;
  last_name: string | null;
}

/** Mirrors LoginDTO. */
export interface LoginRequest {
  login: string;
  password: string;
}

/** Mirrors AuthResponseDTO. */
export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  /** ISO-8601 UTC instant at which the access token expires. */
  expires_at: string;
}

/** Response of GET /shifter/v1/auth/me. */
export interface CurrentUser {
  id: number;
  login: string;
}

/** Credentials as persisted on the client. */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Error envelope produced by GlobalExceptionMiddleware. */
export interface ApiError {
  status: number;
  error: string;
  message: string;
}

/**
 * Constraints enforced by RegisterHandler. Mirrored here so the form can reject
 * bad input before a round trip; the server remains the authority.
 */
export const LOGIN_MIN_LENGTH = 4;
export const LOGIN_MAX_LENGTH = 20;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;
export const ALLOWED_CHARS = /^[a-zA-Z0-9@._-]+$/;
