/**
 * Calls an OpenAI-compatible chat completions endpoint when explicitly requested.
 *
 * @param params - API key, model, and user prompt (minimal exfiltration per PRD).
 * @param fetchFn - Injectable fetch (defaults to global fetch).
 */
export const runAiDraft = async (
  params: {
    apiKey: string;
    prompt: string;
    model?: string;
  },
  fetchFn: typeof fetch = fetch,
): Promise<string> => {
  const model = params.model ?? "gpt-4o-mini";
  const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: params.prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`AI request failed (${res.status})`);
  }
  const data: unknown = await res.json();
  const msg = (data as { choices?: { message?: { content?: string } }[] })
    ?.choices?.[0]?.message?.content;
  if (typeof msg !== "string") {
    throw new Error("AI response missing content");
  }
  return msg.trim();
};
