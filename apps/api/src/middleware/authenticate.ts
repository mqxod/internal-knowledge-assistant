import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserRole } from "@ika/shared";
import { ERROR_CODES, SIGN_IN_AS_HEADER } from "@ika/shared";
import type { Logger } from "../config/logger.js";
import type { IdentityProvider } from "../modules/auth/identity.types.js";
import type { UsersService } from "../modules/users/users.service.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";

const BEARER = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;

/**
 * Verifies the Clerk session token, then resolves the application user from MongoDB.
 * Nothing about identity or role is taken from the request body, query or custom headers.
 */
export function authenticate(
  identity: IdentityProvider,
  users: UsersService,
  logger: Logger,
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const match = header ? BEARER.exec(header) : null;
    if (!match?.[1]) return next(new UnauthorizedError());

    let session;
    try {
      session = await identity.verifySessionToken(match[1]);
    } catch (err) {
      logger.info({ reqId: req.requestId, reason: (err as Error).name }, "Rejected session token");
      return next(new UnauthorizedError("Your session is invalid or has expired. Please sign in again."));
    }

    const user = await users.resolveSignedInUser(session.clerkUserId);
    if (!user) {
      return next(
        new ForbiddenError(
          "Your account could not be set up. Verify your email address, or ask an administrator for help.",
          ERROR_CODES.ACCOUNT_NOT_PROVISIONED,
        ),
      );
    }
    // The client's choice can only lower privileges, never raise them.
    const role: UserRole = user.role === "admin" && req.get(SIGN_IN_AS_HEADER) === "member" ? "member" : user.role;
    req.auth = { user, session, role };
    next();
  };
}

/** Disabled accounts are rejected even when their Clerk session is still valid. */
export const requireActiveUser: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new UnauthorizedError());
  if (req.auth.user.status !== "active") {
    return next(new ForbiddenError("Your account has been disabled.", ERROR_CODES.ACCOUNT_DISABLED));
  }
  next();
};

export interface RequireRoleOptions {
  /** When true, admin-only routes additionally require a second factor on the session. */
  requireAdminMfa?: boolean;
}

export function requireRole(roles: UserRole[], options: RequireRoleOptions = {}): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new UnauthorizedError());
    const { session, role } = req.auth;
    if (!roles.includes(role)) return next(new ForbiddenError());
    const adminOnlyRoute = roles.length === 1 && roles[0] === "admin";
    if (options.requireAdminMfa && adminOnlyRoute && session.secondFactorVerified !== true) {
      return next(
        new ForbiddenError(
          "Administrator actions require multi-factor authentication. Enable MFA in your profile and sign in again.",
          ERROR_CODES.ADMIN_MFA_REQUIRED,
        ),
      );
    }
    next();
  };
}
