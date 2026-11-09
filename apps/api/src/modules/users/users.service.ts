import { Types } from "mongoose";
import {
  ERROR_CODES,
  type CreateUserInput,
  type ListUsersQuery,
  type Paginated,
  type UpdateUserInput,
  type UserDTO,
} from "@ika/shared";
import type { Logger } from "../../config/logger.js";
import { withTransaction } from "../../database/transaction.js";
import { ConflictError, ForbiddenError, NotFoundError, isDuplicateKeyError } from "../../utils/errors.js";
import { escapeRegex } from "../../utils/text.js";
import type { AuditService } from "../audit/audit.service.js";
import type { IdentityProvider } from "../auth/identity.types.js";
import { UserModel, type UserDocument } from "./user.model.js";
import { toUserDTO } from "./users.mapper.js";

export class UsersService {
  constructor(
    private readonly identity: IdentityProvider,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {}

  /**
   * Resolves the application user for a verified Clerk identity.
   * First sign-in links a pre-provisioned (invited) record by *verified* email; otherwise
   * a verified identity is self-provisioned as an active **member**. Admin rights are only
   * ever granted by an existing admin or the bootstrap CLI, never by signing in.
   */
  async resolveSignedInUser(clerkUserId: string): Promise<UserDocument | null> {
    const existing = await UserModel.findOne({ clerkUserId });
    if (existing) return existing;

    const profile = await this.identity.getProfile(clerkUserId);
    if (!profile.email || !profile.emailVerified) return null;

    const linked = await UserModel.findOneAndUpdate(
      { email: profile.email, clerkUserId: null },
      { $set: { clerkUserId } },
      { returnDocument: "after" },
    );
    if (linked) {
      await this.audit.record({
        actorId: linked._id,
        action: "user.linked",
        resourceType: "user",
        resourceId: linked._id,
      });
      this.logger.info({ userId: linked._id.toString() }, "Linked Clerk identity to provisioned user");
      return linked;
    }

    // Email already belongs to a different Clerk identity: never let a second account claim it.
    if (await UserModel.exists({ email: profile.email })) return null;

    try {
      const created = await UserModel.create({
        clerkUserId,
        email: profile.email,
        name: profile.name,
        role: "member",
        status: "active",
      });
      await this.audit.record({
        actorId: created._id,
        action: "user.self_provisioned",
        resourceType: "user",
        resourceId: created._id,
      });
      this.logger.info({ userId: created._id.toString() }, "Self-provisioned member on first sign-in");
      return created;
    } catch (err) {
      // Concurrent first requests from the same user: the other request won the insert.
      if (isDuplicateKeyError(err)) return UserModel.findOne({ clerkUserId });
      throw err;
    }
  }

  async list(query: ListUsersQuery): Promise<Paginated<UserDTO>> {
    const filter = query.search
      ? {
          $or: [
            { email: { $regex: escapeRegex(query.search), $options: "i" } },
            { name: { $regex: escapeRegex(query.search), $options: "i" } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      UserModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      UserModel.countDocuments(filter),
    ]);
    return {
      items: items.map(toUserDTO),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /** Admin-controlled provisioning: the employee can sign in once their email matches. */
  async create(input: CreateUserInput, actor: UserDocument): Promise<UserDTO> {
    try {
      return await withTransaction(async (session) => {
        const [created] = await UserModel.create(
          [{ email: input.email, name: input.name, role: input.role, status: "active", createdBy: actor._id }],
          { session },
        );
        if (!created) throw new Error("User creation failed");
        await this.audit.record(
          {
            actorId: actor._id,
            action: "user.create",
            resourceType: "user",
            resourceId: created._id,
            metadata: { role: input.role },
          },
          session,
        );
        return toUserDTO(created.toObject());
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError(ERROR_CODES.USER_ALREADY_EXISTS, "A user with this email already exists.");
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateUserInput, actor: UserDocument): Promise<UserDTO> {
    if (actor._id.equals(id)) {
      throw new ForbiddenError("You cannot change your own role or status.", ERROR_CODES.CANNOT_MODIFY_SELF);
    }
    return withTransaction(async (session) => {
      const target = await UserModel.findById(id).session(session);
      if (!target) throw new NotFoundError(ERROR_CODES.USER_NOT_FOUND, "User not found.");

      const demotingAdmin =
        target.role === "admin" &&
        target.status === "active" &&
        ((input.role !== undefined && input.role !== "admin") || input.status === "disabled");
      if (demotingAdmin) {
        const otherAdmins = await UserModel.countDocuments({
          role: "admin",
          status: "active",
          _id: { $ne: target._id },
        }).session(session);
        if (otherAdmins === 0) {
          throw new ForbiddenError("At least one active administrator must remain.");
        }
      }

      const before = { role: target.role, status: target.status };
      if (input.role !== undefined) target.role = input.role;
      if (input.status !== undefined) target.status = input.status;
      await target.save({ session });

      if (input.role !== undefined && input.role !== before.role) {
        await this.audit.record(
          {
            actorId: actor._id,
            action: "user.role_change",
            resourceType: "user",
            resourceId: target._id,
            metadata: { from: before.role, to: input.role },
          },
          session,
        );
      }
      if (input.status !== undefined && input.status !== before.status) {
        await this.audit.record(
          {
            actorId: actor._id,
            action: "user.status_change",
            resourceType: "user",
            resourceId: target._id,
            metadata: { from: before.status, to: input.status },
          },
          session,
        );
      }
      return toUserDTO(target.toObject());
    });
  }

  /** Used by the bootstrap CLI: promotes/creates the first admin from a verified Clerk user. */
  async bootstrapAdmin(clerkUserId: string): Promise<UserDTO> {
    const profile = await this.identity.getProfile(clerkUserId);
    if (!profile.email || !profile.emailVerified) {
      throw new Error("The Clerk user must have a verified primary email address.");
    }
    return withTransaction(async (session) => {
      const user = await UserModel.findOneAndUpdate(
        { $or: [{ clerkUserId }, { email: profile.email }] },
        {
          $set: { clerkUserId, role: "admin", status: "active" },
          $setOnInsert: { email: profile.email, name: profile.name },
        },
        { upsert: true, returnDocument: "after", session },
      );
      await this.audit.record(
        { actorId: null, action: "user.bootstrap_admin", resourceType: "user", resourceId: user._id },
        session,
      );
      return toUserDTO(user.toObject());
    });
  }
}

export function isObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id);
}
