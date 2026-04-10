import { describe, expect, it } from "vitest";
import * as npmPublishEntry from "./npm-publish-entry";
import * as publicIndex from "./index";

describe("npm-publish-entry", () => {
  it("re-exports the same public API surface as index.ts", () => {
    expect(Object.keys(npmPublishEntry).sort()).toEqual(
      Object.keys(publicIndex).sort(),
    );
  });
});
