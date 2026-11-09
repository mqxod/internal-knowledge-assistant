import { NO_ANSWER_MESSAGE, type SourceDTO } from "@ika/shared";
import { excerpt } from "../../utils/text.js";
import type { AIAnswer } from "../ai/ai.types.js";
import type { RetrievedSection } from "../search/search.service.js";

export interface ValidatedAnswer {
  found: boolean;
  answer: string;
  sources: SourceDTO[];
  invalidCitations: number;
}

export function noAnswer(invalidCitations = 0): ValidatedAnswer {
  return { found: false, answer: NO_ANSWER_MESSAGE, sources: [], invalidCitations };
}

/**
 * Only section IDs the backend actually retrieved (and therefore authorised) for this request
 * are accepted. Titles come from our records, never from model output. An answer with no valid
 * citation is treated as unsupported.
 */
export function validateCitations(ai: AIAnswer, retrieved: RetrievedSection[]): ValidatedAnswer {
  const byId = new Map(retrieved.map((s) => [s.sectionId, s]));
  const seen = new Set<string>();
  const sources: SourceDTO[] = [];
  let invalid = 0;

  for (const { sectionId } of ai.sources) {
    const section = byId.get(sectionId.trim());
    if (!section) {
      invalid++;
      continue;
    }
    if (seen.has(section.sectionId)) continue;
    seen.add(section.sectionId);
    sources.push({
      documentId: section.documentId,
      documentTitle: section.documentTitle,
      sectionId: section.sectionId,
      sectionTitle: section.sectionTitle,
      excerpt: excerpt(section.content),
    });
  }

  if (!ai.found || !ai.answer.trim() || sources.length === 0) return noAnswer(invalid);
  return { found: true, answer: ai.answer.trim(), sources, invalidCitations: invalid };
}
