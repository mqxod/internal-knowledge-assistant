import { z } from "zod";

/** Structured output contract the model must satisfy. Validated again after parsing. */
export const aiAnswerSchema = z.object({
  found: z.boolean().describe("true only if the supplied context fully supports the answer"),
  answer: z.string().describe("Concise answer in Markdown, or an empty string when found=false"),
  sources: z
    .array(z.object({ sectionId: z.string().describe("An id copied exactly from the supplied context") }))
    .describe("Sections that directly support the answer"),
});
export type AIAnswer = z.infer<typeof aiAnswerSchema>;

export interface AIContextSection {
  sectionId: string;
  documentTitle: string;
  sectionTitle: string;
  content: string;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIResult {
  answer: AIAnswer;
  usage: AIUsage;
}

export interface AIProvider {
  readonly name: string;
  generateAnswer(input: { question: string; sections: AIContextSection[] }): Promise<AIResult>;
}
