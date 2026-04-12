/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { assertArgvNoForcedCliFlags } from "./assert-argv-no-forced-cli-flags";

describe("assertArgvNoForcedCliFlags", () => {
  it("allows normal subcommand tokens", () => {
    // Act & Assert
    expect(() =>
      assertArgvNoForcedCliFlags(["epic", "read", "--id", "x"]),
    ).not.toThrow();
  });

  it("rejects exact forbidden flags", () => {
    // Act & Assert
    expect(() => assertArgvNoForcedCliFlags(["--repo", "/x"])).toThrow(
      /--repo/,
    );
    expect(() => assertArgvNoForcedCliFlags(["--temp-dir", "/t"])).toThrow(
      /--temp-dir/,
    );
    expect(() => assertArgvNoForcedCliFlags(["--format", "text"])).toThrow(
      /--format/,
    );
  });

  it("rejects equals-form forbidden flags", () => {
    // Act & Assert
    expect(() => assertArgvNoForcedCliFlags(["--repo=/tmp/a"])).toThrow(
      /--repo=/,
    );
    expect(() => assertArgvNoForcedCliFlags(["--format=json"])).toThrow(
      /--format=/,
    );
  });
});
