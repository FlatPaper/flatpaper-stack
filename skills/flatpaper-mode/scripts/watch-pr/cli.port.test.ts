import { expect, it } from "bun:test";
import { runPort } from "./port.test-helper.ts";

it("names absent checks in pretty status and READY output", () => {
  const status = runPort({}, ["--status-only", "--pretty"]);
  expect(status.status).toBe(0);
  expect(status.stdout).toContain("➖ no checks");
  const ready = runPort({}, ["--pretty"]);
  expect(ready.status).toBe(0);
  expect(ready.stdout).toContain("checks=none reported on the head commit");
});
