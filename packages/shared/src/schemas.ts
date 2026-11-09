import { z } from "zod";
import { ACCESS_LEVELS, DOCUMENT_STATUSES, USER_ROLES, USER_STATUSES } from "./constants";

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid identifier");

/** Max question length is enforced server-side from config; this is the absolute ceiling. */
export const ABSOLUTE_MAX_QUESTION_LENGTH = 4000;

export const askQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Question must be at least 3 characters")
    .max(ABSOLUTE_MAX_QUESTION_LENGTH),
});
export type AskQuestionInput = z.infer<typeof askQuestionSchema>;

export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, "Invalid idempotency key");

export const uploadDocumentFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  accessLevel: z.enum(ACCESS_LEVELS).default("all"),
});
export type UploadDocumentFields = z.infer<typeof uploadDocumentFieldsSchema>;

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    accessLevel: z.enum(ACCESS_LEVELS).optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.accessLevel !== undefined, {
    message: "Provide at least one field to update",
  });
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  accessLevel: z.enum(ACCESS_LEVELS).optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const createUserSchema = z
  .object({
    email: z.email().trim().toLowerCase().max(254),
    name: z.string().trim().min(1).max(120),
    role: z.enum(USER_ROLES).default("member"),
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .strict()
  .refine((v) => v.role !== undefined || v.status !== undefined, {
    message: "Provide at least one field to update",
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(200).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
