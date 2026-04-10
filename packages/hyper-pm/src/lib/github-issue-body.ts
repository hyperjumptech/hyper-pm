/**
 * Builds GitHub Issue body with a fenced JSON block carrying `hyper_pm_id`.
 *
 * @param params - Stable ids and free-form fields.
 */
export const buildGithubIssueBody = (params: {
  hyperPmId: string;
  type: "epic" | "story" | "ticket";
  parentIds: Record<string, string | undefined>;
  description: string;
}): string => {
  const meta = {
    hyper_pm_id: params.hyperPmId,
    type: params.type,
    parent_ids: params.parentIds,
  };
  return `${params.description.trim()}\n\n\`\`\`json\n${JSON.stringify(meta, null, 2)}\n\`\`\`\n`;
};

/**
 * Extracts `hyper_pm_id` from an issue body if the JSON fence is present.
 *
 * @param body - GitHub issue body markdown.
 */
export const parseHyperPmIdFromIssueBody = (
  body: string,
): string | undefined => {
  const fence = body.match(/```json\s*([\s\S]*?)```/i);
  if (!fence?.[1]) return undefined;
  try {
    const data: unknown = JSON.parse(fence[1].trim());
    if (typeof data !== "object" || data === null) return undefined;
    const id = (data as Record<string, unknown>)["hyper_pm_id"];
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
};
