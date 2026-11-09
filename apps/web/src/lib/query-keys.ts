import type { ListDocumentsQuery, ListUsersQuery } from "@ika/shared";

export const queryKeys = {
  me: ["me"] as const,
  usage: ["usage", "me"] as const,
  documents: {
    all: ["documents"] as const,
    list: (q: Partial<ListDocumentsQuery>) => ["documents", "list", q] as const,
    detail: (id: string) => ["documents", "detail", id] as const,
    stats: ["documents", "stats"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (q: Partial<ListUsersQuery>) => ["users", "list", q] as const,
  },
  audit: ["audit"] as const,
};
