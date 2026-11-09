import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import {
  ERROR_CODES,
  listDocumentsQuerySchema,
  objectIdSchema,
  updateDocumentSchema,
  uploadDocumentFieldsSchema,
  type ListDocumentsQuery,
} from "@ika/shared";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { AppError } from "../../utils/errors.js";
import { sendSuccess } from "../../utils/response.js";
import type { DocumentsService } from "./documents.service.js";

const idParams = z.object({ id: objectIdSchema });

/** Mounted behind authenticate + requireActiveUser + requireRole(["admin"]). */
export function documentsRouter(documents: DocumentsService, maxUploadBytes: number): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 1, fields: 5, fieldSize: 1024, parts: 8 },
  });

  router.get("/", validateQuery(listDocumentsQuerySchema), async (req, res) => {
    sendSuccess(res, await documents.list(req.validatedQuery as ListDocumentsQuery));
  });

  router.get("/stats", async (_req, res) => {
    sendSuccess(res, await documents.stats());
  });

  router.post(
    "/",
    (req, res, next) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return next(
              new AppError(413, ERROR_CODES.FILE_TOO_LARGE, `Files must be ${Math.round(maxUploadBytes / 1024)} KB or smaller.`),
            );
          }
          return next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, "The upload request is malformed."));
        }
        next(err as Error | undefined);
      });
    },
    validateBody(uploadDocumentFieldsSchema),
    async (req, res) => {
      const doc = await documents.upload(req.file, req.body, req.auth!.user);
      sendSuccess(res, doc, "Document uploaded and indexed", 201);
    },
  );

  router.get("/:id", validateParams(idParams), async (req, res) => {
    sendSuccess(res, await documents.getDetail(String(req.params.id)));
  });

  router.patch("/:id", validateParams(idParams), validateBody(updateDocumentSchema), async (req, res) => {
    sendSuccess(res, await documents.update(String(req.params.id), req.body, req.auth!.user), "Document updated");
  });

  router.delete("/:id", validateParams(idParams), async (req, res) => {
    await documents.delete(String(req.params.id), req.auth!.user);
    sendSuccess(res, { id: String(req.params.id) }, "Document deleted");
  });

  return router;
}
