import type { AppConfig } from "./config/env.js";
import type { Logger } from "./config/logger.js";
import type { AIProvider } from "./modules/ai/ai.types.js";
import { AnthropicProvider } from "./modules/ai/anthropic.provider.js";
import { OpenAIProvider } from "./modules/ai/openai.provider.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { ClerkIdentityProvider } from "./modules/auth/clerk.identity.js";
import type { IdentityProvider } from "./modules/auth/identity.types.js";
import { ChatService } from "./modules/chat/chat.service.js";
import { DocumentsService } from "./modules/documents/documents.service.js";
import { SearchService } from "./modules/search/search.service.js";
import { UsageService } from "./modules/usage/usage.service.js";
import { UsersService } from "./modules/users/users.service.js";
import { OpenAIEmbedder } from "./modules/vector/openai.embedder.js";
import { QdrantStore } from "./modules/vector/qdrant.store.js";
import { SemanticIndex } from "./modules/vector/semantic-index.service.js";
import type { Embedder, VectorStore } from "./modules/vector/vector.types.js";

export interface Container {
  config: AppConfig;
  logger: Logger;
  identity: IdentityProvider;
  ai: AIProvider;
  audit: AuditService;
  users: UsersService;
  documents: DocumentsService;
  search: SearchService;
  /** Null when semantic search is disabled (keyword-only). */
  semantic: SemanticIndex | null;
  usage: UsageService;
  chat: ChatService;
}

export interface ContainerOverrides {
  identity?: IdentityProvider;
  ai?: AIProvider;
  /** Supplying both enables semantic search even without VECTOR_DB_URL (tests). */
  embedder?: Embedder;
  vectorStore?: VectorStore;
  now?: () => Date;
}

/** Composition root. External integrations can be overridden (tests use fakes). */
export function createContainer(config: AppConfig, logger: Logger, overrides: ContainerOverrides = {}): Container {
  const identity =
    overrides.identity ??
    new ClerkIdentityProvider({
      secretKey: config.clerk.secretKey,
      jwtKey: config.clerk.jwtKey,
      authorizedParties: config.clerk.authorizedParties,
    });
  const ai =
    overrides.ai ??
    (config.ai.provider === "openai" ? new OpenAIProvider(config.ai, logger) : new AnthropicProvider(config.ai, logger));
  const audit = new AuditService(logger);
  const users = new UsersService(identity, audit, logger, config.adminEmails);
  const semantic = createSemanticIndex(config, logger, overrides);
  const documents = new DocumentsService(config, audit, logger, semantic);
  const search = new SearchService(config, semantic, logger);
  const usage = new UsageService(
    {
      monthlyLimit: config.limits.monthlyQueryLimit,
      aiMonthlyBudget: config.ai.monthlyRequestBudget,
      replayWindowMs: 24 * 60 * 60 * 1000,
      staleReservationMs: config.ai.timeoutMs * 2 + 60_000,
    },
    logger,
    overrides.now,
  );
  const chat = new ChatService(config, search, ai, usage, logger);
  return { config, logger, identity, ai, audit, users, documents, search, semantic, usage, chat };
}

function createSemanticIndex(config: AppConfig, logger: Logger, overrides: ContainerOverrides): SemanticIndex | null {
  const options = { topK: config.vector?.topK ?? 12, minScore: config.vector?.minScore ?? 0.4 };
  if (overrides.embedder && overrides.vectorStore) {
    return new SemanticIndex(overrides.embedder, overrides.vectorStore, options, logger);
  }
  if (!config.vector) return null;
  return new SemanticIndex(
    new OpenAIEmbedder(config.vector.embedding),
    new QdrantStore({ url: config.vector.url, apiKey: config.vector.apiKey, collection: config.vector.collection }),
    options,
    logger,
  );
}
