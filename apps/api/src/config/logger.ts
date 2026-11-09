import { pino, type Logger } from "pino";

export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    base: { service: "ika-api" },
    // Defence in depth: never emit credentials even if a caller logs a request object.
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
        "*.token",
        "*.apiKey",
        "*.secretKey",
        "*.password",
      ],
      censor: "[REDACTED]",
    },
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  });
}

export type { Logger };
