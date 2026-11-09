import { createClerkClient, verifyToken } from "@clerk/backend";
import type { IdentityProfile, IdentityProvider, VerifiedSession } from "./identity.types.js";

export interface ClerkIdentityOptions {
  secretKey: string;
  jwtKey?: string | undefined;
  authorizedParties: string[];
}

export class ClerkIdentityProvider implements IdentityProvider {
  private readonly client;

  constructor(private readonly options: ClerkIdentityOptions) {
    this.client = createClerkClient({ secretKey: options.secretKey });
  }

  async verifySessionToken(token: string): Promise<VerifiedSession> {
    // verifyToken validates the RS256 signature (JWKS or the pinned PEM key), exp/nbf/iat
    // with a small clock skew, and the `azp` claim against our allowed origins.
    const payload = await verifyToken(token, {
      secretKey: this.options.secretKey,
      ...(this.options.jwtKey ? { jwtKey: this.options.jwtKey } : {}),
      authorizedParties: this.options.authorizedParties,
    });
    if (!payload.sub) throw new Error("Token has no subject");
    // Sessions with outstanding tasks (e.g. forced MFA enrolment) are not fully active.
    if (payload.sts && payload.sts !== "active") throw new Error("Session is not active");
    const fva = payload.fva;
    return {
      clerkUserId: payload.sub,
      sessionId: payload.sid ?? null,
      secondFactorVerified: Array.isArray(fva) ? fva[1] !== -1 : null,
    };
  }

  async getProfile(clerkUserId: string): Promise<IdentityProfile> {
    const user = await this.client.users.getUser(clerkUserId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return {
      email: primary?.emailAddress.toLowerCase() ?? null,
      emailVerified: primary?.verification?.status === "verified",
      name: name || primary?.emailAddress || "Unnamed user",
    };
  }
}
