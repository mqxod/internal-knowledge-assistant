import type { UserDocument } from "../modules/users/user.model.js";
import type { VerifiedSession } from "../modules/auth/identity.types.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`; the role here always comes from MongoDB, never the client. */
      auth?: {
        user: UserDocument;
        session: VerifiedSession;
      };
      requestId?: string;
    }
  }
}

export {};
