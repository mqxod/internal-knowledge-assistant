import path from "node:path";
import { ALLOWED_UPLOAD_EXTENSIONS, ERROR_CODES, type ContentType } from "@ika/shared";
import { AppError, ValidationError } from "../../utils/errors.js";
import { normalizeText } from "./chunker.js";

/** Browsers report .md inconsistently, so octet-stream/empty is accepted and the bytes are checked instead. */
const ALLOWED_MIME_TYPES = new Set([
  "text/markdown",
  "text/x-markdown",
  "text/plain",
  "application/octet-stream",
  "",
]);

export interface ValidatedUpload {
  filename: string;
  contentType: ContentType;
  text: string;
  sizeBytes: number;
}

export function sanitizeFilename(original: string): string {
  const base = path.basename(original.replace(/\\/g, "/"));
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "document";
}

export function validateUpload(file: Express.Multer.File | undefined, maxBytes: number): ValidatedUpload {
  if (!file) throw new ValidationError("Please attach a .md or .txt file in the `file` field.");

  const filename = sanitizeFilename(file.originalname);
  const ext = path.extname(filename).toLowerCase();
  if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new AppError(415, ERROR_CODES.UNSUPPORTED_FILE_TYPE, "Only Markdown (.md) and plain-text (.txt) files are supported.");
  }
  const mime = (file.mimetype ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new AppError(415, ERROR_CODES.UNSUPPORTED_FILE_TYPE, "The file type is not supported. Upload a Markdown or plain-text file.");
  }
  if (file.size > maxBytes || file.buffer.length > maxBytes) {
    throw new AppError(413, ERROR_CODES.FILE_TOO_LARGE, `Files must be ${Math.round(maxBytes / 1024)} KB or smaller.`);
  }

  const buf = file.buffer;
  const utf16Bom = buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff));
  if (utf16Bom || buf.includes(0x00)) {
    throw new AppError(400, ERROR_CODES.INVALID_FILE_ENCODING, "The file must be UTF-8 encoded text.");
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw new AppError(400, ERROR_CODES.INVALID_FILE_ENCODING, "The file must be UTF-8 encoded text.");
  }

  const text = normalizeText(decoded);
  if (!/[\p{L}\p{N}]/u.test(text)) {
    throw new AppError(400, ERROR_CODES.EMPTY_DOCUMENT, "The document is empty.");
  }

  return {
    filename,
    contentType: ext === ".txt" ? "text" : "markdown",
    text,
    sizeBytes: buf.length,
  };
}
