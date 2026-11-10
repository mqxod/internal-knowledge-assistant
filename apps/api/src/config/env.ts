import { z } from "zod";

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Number of reverse-proxy hops in front of the API (1 behind Nginx). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  CLERK_SECRET_KEY: z.string().startsWith("sk_", "CLERK_SECRET_KEY must start with sk_"),
  /** Optional PEM public key for networkless JWT verification. */
  CLERK_JWT_KEY: z.string().optional(),
  /** Allowed `azp` origins for Clerk session tokens. Defaults to FRONTEND_URL. */
  CLERK_AUTHORIZED_PARTIES: csv.optional(),
  REQUIRE_ADMIN_MFA: booleanString.default(false),
  /** Verified sign-ins with these emails get the admin role automatically (comma-separated). */
  ADMIN_EMAILS: csv.optional(),

  /** anthropic | openai. When unset, inferred from the key prefix (sk-ant- → anthropic, else openai). */
  AI_PROVIDER: z.enum(["anthropic", "openai"]).optional(),
  AI_API_KEY: z.string().min(1, "AI_API_KEY is required"),
  /** Defaults per provider: claude-opus-5-5 (anthropic) / gpt-5.4-mini (openai). */
  AI_MODEL: z.string().min(1).optional(),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max", "none"]).default("low"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(32_000).default(4096),
  /** Organisation-wide cap on AI provider calls per UTC month (spend guardrail). */
  AI_MONTHLY_REQUEST_BUDGET: z.coerce.number().int().min(1).default(20_000),

  /** Qdrant base URL (e.g. http://qdrant:6333). Unset = keyword-only search. */
  VECTOR_DB_URL: z.url().optional().or(z.literal("").transform(() => undefined)),
  VECTOR_DB_API_KEY: z.string().optional(),
  VECTOR_COLLECTION: z.string().regex(/^[A-Za-z0-9_-]+$/).default("sections"),
  /** OpenAI key for embeddings. Defaults to AI_API_KEY when the AI provider is OpenAI. */
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(64).max(4096).default(1536),
  /** Cosine similarity below which a semantic hit is ignored (guards against "close enough" guesses). */
  VECTOR_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.4),
  VECTOR_TOP_K: z.coerce.number().int().min(1).max(50).default(12),

  MONTHLY_QUERY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(100),
  MAX_QUESTION_LENGTH: z.coerce.number().int().min(10).max(4000).default(1000),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(20).default(2),
  MAX_SECTIONS_PER_DOCUMENT: z.coerce.number().int().min(1).max(5000).default(500),
  MAX_CHUNK_CHARS: z.coerce.number().int().min(300).max(8000).default(1800),
  RETRIEVAL_TOP_K: z.coerce.number().int().min(1).max(20).default(6),
  MAX_CONTEXT_CHARS: z.coerce.number().int().min(1000).max(60_000).default(12_000),
  MIN_KEYWORD_COVERAGE: z.coerce.number().min(0).max(1).default(0.34),
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),

  FRONTEND_URL: z.url("FRONTEND_URL must be a valid URL"),
});

export type Env = z.infer<typeof envSchema>;

const DEFAULT_MODELS = { anthropic: "claude-opus-5-5", openai: "gpt-5.4-mini" } as const;

export interface AppConfig {
  env: Env["NODE_ENV"];
  port: number;
  logLevel: Env["LOG_LEVEL"];
  trustProxy: number;
  mongoUri: string;
  frontendUrl: string;
  clerk: {
    secretKey: string;
    jwtKey: string | undefined;
    authorizedParties: string[];
    requireAdminMfa: boolean;
  };
  adminEmails: string[];
  ai: {
    provider: "anthropic" | "openai";
    apiKey: string;
    model: string;
    effort: "low" | "medium" | "high" | "xhigh" | "max" | undefined;
    timeoutMs: number;
    maxOutputTokens: number;
    monthlyRequestBudget: number;
  };
  /** Null when semantic search is disabled (no vector DB URL or no embedding key). */
  vector: {
    url: string;
    apiKey: string | undefined;
    collection: string;
    minScore: number;
    topK: number;
    embedding: { apiKey: string; model: string; dimensions: number; timeoutMs: number };
  } | null;
  limits: {
    monthlyQueryLimit: number;
    maxQuestionLength: number;
    maxUploadSizeBytes: number;
    maxSectionsPerDocument: number;
    maxChunkChars: number;
    retrievalTopK: number;
    maxContextChars: number;
    minKeywordCoverage: number;
    chatRateLimitPerMinute: number;
    apiRateLimitPerMinute: number;
  };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // Values are never printed, only variable names and the rule they violate.
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const e = parsed.data;
  const frontendOrigin = new URL(e.FRONTEND_URL).origin;
  const aiProvider = e.AI_PROVIDER ?? (e.AI_API_KEY.startsWith("sk-ant-") ? "anthropic" : "openai");
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    mongoUri: e.MONGODB_URI,
    frontendUrl: frontendOrigin,
    clerk: {
      secretKey: e.CLERK_SECRET_KEY,
      jwtKey: e.CLERK_JWT_KEY?.replace(/\\n/g, "\n") || undefined,
      authorizedParties: e.CLERK_AUTHORIZED_PARTIES?.length
        ? e.CLERK_AUTHORIZED_PARTIES
        : [frontendOrigin],
      requireAdminMfa: e.REQUIRE_ADMIN_MFA,
    },
    adminEmails: (e.ADMIN_EMAILS ?? []).map((m) => m.toLowerCase()),
    ai: {
      provider: aiProvider,
      apiKey: e.AI_API_KEY,
      model: e.AI_MODEL ?? DEFAULT_MODELS[aiProvider],
      effort: e.AI_EFFORT === "none" ? undefined : e.AI_EFFORT,
      timeoutMs: e.AI_TIMEOUT_MS,
      maxOutputTokens: e.AI_MAX_OUTPUT_TOKENS,
      monthlyRequestBudget: e.AI_MONTHLY_REQUEST_BUDGET,
    },
    vector: buildVectorConfig(e, aiProvider),
    limits: {
      monthlyQueryLimit: e.MONTHLY_QUERY_LIMIT,
      maxQuestionLength: e.MAX_QUESTION_LENGTH,
      maxUploadSizeBytes: Math.floor(e.MAX_UPLOAD_SIZE_MB * 1024 * 1024),
      maxSectionsPerDocument: e.MAX_SECTIONS_PER_DOCUMENT,
      maxChunkChars: e.MAX_CHUNK_CHARS,
      retrievalTopK: e.RETRIEVAL_TOP_K,
      maxContextChars: e.MAX_CONTEXT_CHARS,
      minKeywordCoverage: e.MIN_KEYWORD_COVERAGE,
      chatRateLimitPerMinute: e.CHAT_RATE_LIMIT_PER_MINUTE,
      apiRateLimitPerMinute: e.API_RATE_LIMIT_PER_MINUTE,
    },
  };
}

function buildVectorConfig(e: Env, aiProvider: "anthropic" | "openai"): AppConfig["vector"] {
  const embeddingKey = e.EMBEDDING_API_KEY || (aiProvider === "openai" ? e.AI_API_KEY : undefined);
  if (!e.VECTOR_DB_URL || !embeddingKey) return null;
  return {
    url: e.VECTOR_DB_URL.replace(/\/+$/, ""),
    apiKey: e.VECTOR_DB_API_KEY || undefined,
    collection: e.VECTOR_COLLECTION,
    minScore: e.VECTOR_MIN_SCORE,
    topK: e.VECTOR_TOP_K,
    embedding: {
      apiKey: embeddingKey,
      model: e.EMBEDDING_MODEL,
      dimensions: e.EMBEDDING_DIMENSIONS,
      timeoutMs: Math.min(e.AI_TIMEOUT_MS, 15_000),
    },
  };
}
