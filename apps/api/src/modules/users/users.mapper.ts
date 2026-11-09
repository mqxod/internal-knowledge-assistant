import type { UserDTO } from "@ika/shared";
import type { User } from "./user.model.js";
import type { Types } from "mongoose";

type UserLike = User & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toUserDTO(u: UserLike): UserDTO {
  return {
    id: u._id.toString(),
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    linked: Boolean(u.clerkUserId),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}
