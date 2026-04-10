/**
 * Serializes a value for stdout using the selected CLI format.
 *
 * @param format - `json` emits compact JSON; `text` uses JSON.stringify fallback for objects.
 * @param value - Arbitrary record to print.
 */
export const formatOutput = (
  format: "json" | "text",
  value: unknown,
): string => {
  if (format === "json") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
};
