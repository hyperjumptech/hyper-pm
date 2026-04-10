import { eventLineSchema } from "../storage/event-line";

export type DoctorIssue =
  | {
      kind: "invalid-json";
      line: number;
      message: string;
    }
  | {
      kind: "invalid-event";
      line: number;
      message: string;
    };

/**
 * Validates raw JSONL lines and returns the first structural issues encountered.
 *
 * @param lines - Event log lines (including blanks).
 */
export const runDoctorOnLines = (lines: string[]): DoctorIssue[] => {
  const issues: DoctorIssue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (e) {
      issues.push({
        kind: "invalid-json",
        line: i + 1,
        message: e instanceof Error ? e.message : "parse error",
      });
      return issues;
    }
    const parsed = eventLineSchema.safeParse(json);
    if (!parsed.success) {
      issues.push({
        kind: "invalid-event",
        line: i + 1,
        message: parsed.error.message,
      });
      return issues;
    }
  }
  return issues;
};
