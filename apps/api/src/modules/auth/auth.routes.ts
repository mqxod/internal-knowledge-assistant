import { Router } from "express";
import { ALLOWED_UPLOAD_EXTENSIONS, type MeDTO } from "@ika/shared";
import type { AppConfig } from "../../config/env.js";
import { sendSuccess } from "../../utils/response.js";
import { toUserDTO } from "../users/users.mapper.js";

export function authRouter(config: AppConfig): Router {
  const router = Router();
  router.get("/me", (req, res) => {
    const body: MeDTO = {
      user: { ...toUserDTO(req.auth!.user.toObject()), role: req.auth!.role },
      adminEligible: req.auth!.user.role === "admin",
      config: {
        monthlyQueryLimit: config.limits.monthlyQueryLimit,
        maxQuestionLength: config.limits.maxQuestionLength,
        maxUploadSizeBytes: config.limits.maxUploadSizeBytes,
        allowedExtensions: ALLOWED_UPLOAD_EXTENSIONS,
      },
    };
    sendSuccess(res, body);
  });
  return router;
}
