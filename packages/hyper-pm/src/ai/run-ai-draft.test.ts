/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { runAiDraft } from "./run-ai-draft";

describe("runAiDraft", () => {
  it("returns assistant content", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  drafted " } }],
      }),
    });

    await expect(
      runAiDraft({ apiKey: "k", prompt: "hi" }, fetchFn as unknown as typeof fetch),
    ).resolves.toBe("drafted");

    expect(fetchFn).toHaveBeenCalled();
  });
});
