import { describe, expect, it } from "vitest";
import { parseMarkdown, parsePlainText, splitContent } from "../src/modules/documents/chunker.js";

const opts = { maxChunkChars: 1800, maxSections: 500 };

describe("markdown chunking", () => {
  it("splits by headings and skips empty heading-only sections", () => {
    const doc = parseMarkdown(
      "# Employee Handbook\n\n## Annual Leave\n\nEmployees receive 20 annual leave days.\n\n## Sick Leave\n\nEmployees must notify their manager.\n",
      "fallback",
      opts,
    );
    expect(doc.detectedTitle).toBe("Employee Handbook");
    expect(doc.sections.map((s) => ({ t: s.sectionTitle, c: s.content }))).toEqual([
      { t: "Annual Leave", c: "Employees receive 20 annual leave days." },
      { t: "Sick Leave", c: "Employees must notify their manager." },
    ]);
    expect(doc.sections[0]!.parentHeading).toBe("Employee Handbook");
    expect(doc.sections[0]!.headingPath).toEqual(["Employee Handbook", "Annual Leave"]);
  });

  it("tracks nested heading paths and pops siblings correctly", () => {
    const doc = parseMarkdown(
      "# Ops\n\n## Deploy\n\nIntro.\n\n### Rollback\n\nRun rollback.\n\n## Monitoring\n\nCheck dashboards.",
      "f",
      opts,
    );
    const rollback = doc.sections.find((s) => s.sectionTitle === "Rollback")!;
    expect(rollback.headingPath).toEqual(["Ops", "Deploy", "Rollback"]);
    expect(rollback.parentHeading).toBe("Deploy");
    expect(doc.sections.find((s) => s.sectionTitle === "Monitoring")!.headingPath).toEqual(["Ops", "Monitoring"]);
  });

  it("does not treat # inside fenced code as headings", () => {
    const doc = parseMarkdown("## Script\n\n```bash\n# not a heading\necho hi\n```\n", "f", opts);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]!.content).toContain("# not a heading");
  });

  it("supports setext headings and preamble content", () => {
    const doc = parseMarkdown("Some intro text.\n\nPolicies\n========\n\nBody here.", "f", opts);
    expect(doc.sections.map((s) => s.sectionTitle)).toEqual(["Overview", "Policies"]);
  });

  it("strips inline markdown from titles", () => {
    const doc = parseMarkdown("## **Remote** [Work](http://x) `Policy` ##\n\nText.", "f", opts);
    expect(doc.sections[0]!.sectionTitle).toBe("Remote Work Policy");
  });

  it("splits very large sections without cutting words and keeps the heading", () => {
    const sentence = "Employees must follow the deployment checklist before every release. ";
    const body = Array.from({ length: 6 }, () => sentence.repeat(10).trim()).join("\n\n");
    const doc = parseMarkdown(`## Release Process\n\n${body}`, "f", { maxChunkChars: 900, maxSections: 50 });
    expect(doc.sections.length).toBeGreaterThan(1);
    for (const s of doc.sections) {
      expect(s.content.length).toBeLessThanOrEqual(900);
      expect(s.sectionTitle).toMatch(/^Release Process \(part \d+ of \d+\)$/);
      expect(s.headingPath).toEqual(["Release Process"]);
      expect(s.content.startsWith("Employees")).toBe(true);
      expect(s.content.endsWith("release.")).toBe(true);
    }
  });

  it("enforces the section limit", () => {
    const md = Array.from({ length: 30 }, (_, i) => `## S${i}\n\nContent ${i}.`).join("\n\n");
    expect(() => parseMarkdown(md, "f", { maxChunkChars: 1800, maxSections: 10 })).toThrow(/sections/);
  });
});

describe("plain-text chunking", () => {
  it("detects ALL-CAPS and colon headings", () => {
    const doc = parsePlainText(
      "IT SECURITY POLICY\n\nPASSWORDS\nUse 14 characters.\n\nLaptop encryption:\nAlways on.",
      "f",
      opts,
    );
    expect(doc.detectedTitle).toBe("IT SECURITY POLICY");
    expect(doc.sections.map((s) => [s.sectionTitle, s.content])).toEqual([
      ["PASSWORDS", "Use 14 characters."],
      ["Laptop encryption", "Always on."],
    ]);
  });

  it("falls back to paragraph chunks titled after the document", () => {
    const doc = parsePlainText("This is a plain note. It has sentences.\n\nAnother paragraph here.", "Notes", opts);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]!.sectionTitle).toBe("Overview");
  });
});

describe("splitContent", () => {
  it("returns content unchanged when under the limit", () => {
    expect(splitContent("short", 100)).toEqual(["short"]);
  });
  it("hard-wraps a single giant sentence on whitespace", () => {
    const parts = splitContent("word ".repeat(500).trim(), 300);
    expect(parts.every((p) => p.length <= 300 && !p.startsWith(" ") && p.split(" ").every((w) => w === "word"))).toBe(true);
  });
});
