import type {
  AuditLogDTO,
  ChatAnswerDTO,
  CreateUserInput,
  DocumentDTO,
  DocumentDetailDTO,
  DocumentStatsDTO,
  ListDocumentsQuery,
  ListUsersQuery,
  MeDTO,
  Paginated,
  UpdateDocumentInput,
  UpdateUserInput,
  UsageSummary,
  UserDTO,
} from "@ika/shared";
import { IDEMPOTENCY_HEADER } from "@ika/shared";
import type { ApiClient } from "@/lib/api-client";

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Typed endpoint wrappers. Components never build URLs themselves. */
export const api = {
  me: (c: ApiClient) => c<MeDTO>("/auth/me"),
  usage: (c: ApiClient) => c<UsageSummary>("/usage/me"),

  ask: (c: ApiClient, question: string, idempotencyKey: string) =>
    c<ChatAnswerDTO>("/chat", { method: "POST", body: { question }, headers: { [IDEMPOTENCY_HEADER]: idempotencyKey } }),

  documents: {
    list: (c: ApiClient, q: Partial<ListDocumentsQuery>) => c<Paginated<DocumentDTO>>(`/documents${qs(q)}`),
    stats: (c: ApiClient) => c<DocumentStatsDTO>("/documents/stats"),
    get: (c: ApiClient, id: string) => c<DocumentDetailDTO>(`/documents/${encodeURIComponent(id)}`),
    upload: (c: ApiClient, file: File, accessLevel: string, title?: string) => {
      const form = new FormData();
      form.set("accessLevel", accessLevel);
      if (title) form.set("title", title);
      form.set("file", file);
      return c<DocumentDTO>("/documents", { method: "POST", body: form });
    },
    update: (c: ApiClient, id: string, input: UpdateDocumentInput) =>
      c<DocumentDTO>(`/documents/${encodeURIComponent(id)}`, { method: "PATCH", body: input }),
    remove: (c: ApiClient, id: string) => c<{ id: string }>(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  users: {
    list: (c: ApiClient, q: Partial<ListUsersQuery>) => c<Paginated<UserDTO>>(`/users${qs(q)}`),
    create: (c: ApiClient, input: CreateUserInput) => c<UserDTO>("/users", { method: "POST", body: input }),
    update: (c: ApiClient, id: string, input: UpdateUserInput) =>
      c<UserDTO>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: input }),
  },

  audit: (c: ApiClient, limit = 10) => c<AuditLogDTO[]>(`/audit-logs?limit=${limit}`),
};
