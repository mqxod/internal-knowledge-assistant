import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { USER_ROLES, USER_STATUSES } from "@ika/shared";

const userSchema = new Schema(
  {
    /** Null until the provisioned employee signs in for the first time. */
    clerkUserId: { type: String, default: null },
    /** Always stored normalised (trimmed, lower-case). */
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, enum: USER_ROLES, required: true, default: "member" },
    status: { type: String, enum: USER_STATUSES, required: true, default: "active" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "users" },
);

userSchema.index({ email: 1 }, { unique: true, name: "uniq_email" });
userSchema.index(
  { clerkUserId: 1 },
  {
    unique: true,
    name: "uniq_clerk_user_id",
    partialFilterExpression: { clerkUserId: { $type: "string" } },
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;
export const UserModel = model("User", userSchema);
