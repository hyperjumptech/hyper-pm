/**
 * Extracts GitHub issue numbers referenced after closing / reference keywords (PR description, comments).
 * Matches `Closes #12`, `fixes: #34`, `Resolves #1, #2` style fragments.
 *
 * @param text - Markdown body (e.g. pull request description).
 * @returns Sorted unique positive issue numbers.
 */
export const parseClosingIssueRefsFromText = (text: string): number[] => {
  const out = new Set<number>();
  const head = /\b(?:Closes|Fixes|Resolves|Refs)\s*:?\s*/gi;
  let hm: RegExpExecArray | null = head.exec(text);
  while (hm !== null) {
    const start = hm.index + hm[0].length;
    const tail = text.slice(start);
    const lineEnd = tail.search(/\n\n|\r\n\r\n/);
    const segment = lineEnd === -1 ? tail : tail.slice(0, lineEnd);
    const refRe = /#(\d+)\b/g;
    let rm: RegExpExecArray | null = refRe.exec(segment);
    while (rm !== null) {
      const n = Number(rm[1]);
      if (Number.isFinite(n) && n > 0) out.add(n);
      rm = refRe.exec(segment);
    }
    hm = head.exec(text);
  }
  return [...out].sort((a, b) => a - b);
};
