import type {
  AccessLevel,
  ContentType,
  DocumentStatus,
  ErrorCode,
  UserRole,
  UserStatus,
} from "./constants";

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  code: ErrorCode;
  error: { code: ErrorCode; details?: unknown };
  /** Present on MONTHLY_LIMIT_REACHED responses. */
  usage?: UsageSummary;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  /** False until the invited employee signs in for the first time. */
  linked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsageSummary {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
  month: string;
}

export interface DocumentDTO {
  id: string;
  title: string;
  filename: string;
  contentType: ContentType;
  accessLevel: AccessLevel;
  status: DocumentStatus;
  sectionCount: number;
  sizeBytes: number;
  errorCode: string | null;
  uploadedBy: { id: string; name: string; email: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SectionDTO {
  id: string;
  sectionTitle: string;
  parentHeading: string | null;
  headingPath: string[];
  sectionIndex: number;
  content: string;
  charCount: number;
}

export interface DocumentDetailDTO extends DocumentDTO {
  sections: SectionDTO[];
}

export interface DocumentStatsDTO {
  total: number;
  ready: number;
  processing: number;
  failed: number;
  adminOnly: number;
  recent: DocumentDTO[];
}

export interface SourceDTO {
  documentId: string;
  documentTitle: string;
  sectionId: string;
  sectionTitle: string;
  /** Short excerpt of the cited section so users can inspect the source. */
  excerpt: string;
}

export interface ChatAnswerDTO {
  answer: string;
  found: boolean;
  sources: SourceDTO[];
  usage: UsageSummary;
  requestId: string;
}

export interface AuditLogDTO {
  id: string;
  action: string;
  actor: { id: string; name: string; email: string } | null;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PublicConfigDTO {
  monthlyQueryLimit: number;
  maxQuestionLength: number;
  maxUploadSizeBytes: number;
  allowedExtensions: readonly string[];
}

export interface MeDTO {
  /** `user.role` is the role in effect for this session (an admin may sign in as a member). */
  user: UserDTO;
  /** True when the account itself holds the admin role, regardless of the session's choice. */
  adminEligible: boolean;
  config: PublicConfigDTO;
}
