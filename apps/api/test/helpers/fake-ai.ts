import type { AIContextSection, AIProvider, AIResult } from "../../src/modules/ai/ai.types.js";

export type AIHandler = (input: { question: string; sections: AIContextSection[] }) => Promise<AIResult> | AIResult;

/** Deterministic AI stand-in that records exactly what context it was given. */
export class FakeAI implements AIProvider {
  readonly name = "fake";
  calls: { question: string; sections: AIContextSection[] }[] = [];
  handler: AIHandler = ({ sections }) => ({
    answer: {
      found: true,
      answer: `Answer based on ${sections[0]?.sectionTitle ?? "nothing"}.`,
      sources: sections.slice(0, 2).map((s) => ({ sectionId: s.sectionId })),
    },
    usage: { inputTokens: 100, outputTokens: 20 },
  });

  async generateAnswer(input: { question: string; sections: AIContextSection[] }): Promise<AIResult> {
    this.calls.push(structuredClone(input));
    return this.handler(input);
  }

  reset() {
    this.calls = [];
    this.handler = new FakeAI().handler;
  }
}
