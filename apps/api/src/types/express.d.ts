import type { UserRole } from "@ika/shared";
import type { UserDocument } from "../modules/users/user.model.js";
import type { VerifiedSession } from "../modules/auth/identity.types.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`; the role here always comes from MongoDB, never the client. */
      auth?: {
        user: UserDocument;
        session: VerifiedSession;
        /**
         * Role in effect for this request: the stored role, optionally lowered to "member" when
         * an admin chose "Member" at sign-in. Authorization decisions must use this, not user.role.
         */
        role: UserRole;
      };
      requestId?: string;
    }
  }
}

export {};
