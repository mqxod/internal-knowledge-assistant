import { Router } from "express";
import { z } from "zod";
import {
  createUserSchema,
  listUsersQuerySchema,
  objectIdSchema,
  updateUserSchema,
  type ListUsersQuery,
} from "@ika/shared";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { sendSuccess } from "../../utils/response.js";
import type { UsersService } from "./users.service.js";

const idParams = z.object({ id: objectIdSchema });

/** Mounted behind authenticate + requireActiveUser + requireRole(["admin"]). */
export function usersRouter(users: UsersService): Router {
  const router = Router();

  router.get("/", validateQuery(listUsersQuerySchema), async (req, res) => {
    sendSuccess(res, await users.list(req.validatedQuery as ListUsersQuery));
  });

  router.post("/", validateBody(createUserSchema), async (req, res) => {
    sendSuccess(res, await users.create(req.body, req.auth!.user), "User invited", 201);
  });

  router.patch("/:id", validateParams(idParams), validateBody(updateUserSchema), async (req, res) => {
    sendSuccess(res, await users.update(String(req.params.id), req.body, req.auth!.user), "User updated");
  });

  return router;
}
