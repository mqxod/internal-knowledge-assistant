export interface VerifiedSession {
  clerkUserId: string;
  sessionId: string | null;
  /**
   * Whether a second factor was verified for this session.
   * `null` when the token carries no factor-verification claim.
   */
  secondFactorVerified: boolean | null;
}

export interface IdentityProfile {
  email: string | null;
  emailVerified: boolean;
  name: string;
}

/** Thin seam over the identity vendor so it can be swapped or faked in tests. */
export interface IdentityProvider {
  /** Verifies signature, issuer, expiry/nbf and authorised party. Throws on any failure. */
  verifySessionToken(token: string): Promise<VerifiedSession>;
  getProfile(clerkUserId: string): Promise<IdentityProfile>;
}
