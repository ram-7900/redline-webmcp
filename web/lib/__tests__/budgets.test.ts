import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_SPECS, type ToolSpec } from "../toolSpecs.ts";

/**
 * Chrome publishes per-field character budgets for WebMCP tools, and an overrun is
 * truncated silently rather than rejected. The tail of these descriptions is where the
 * "this never commits" caveats live, so a silent truncation would remove exactly the
 * sentences that constrain an agent.
 */
const LIMITS = { name: 30, toolDescription: 500, parameterDescription: 150 };

const specs = Object.values(TOOL_SPECS) as ToolSpec[];

test("every tool name fits the 30 character budget", () => {
  assert.equal(specs.length, 8);
  for (const spec of specs) {
    assert.ok(
      spec.name.length <= LIMITS.name,
      `${spec.name} is ${spec.name.length} chars, over ${LIMITS.name}`,
    );
  }
});

test("every tool description fits the 500 character budget", () => {
  for (const spec of specs) {
    assert.ok(
      spec.description.length <= LIMITS.toolDescription,
      `${spec.name} description is ${spec.description.length} chars, over ${LIMITS.toolDescription}`,
    );
  }
});

test("every parameter description fits the 150 character budget", () => {
  let checked = 0;
  for (const spec of specs) {
    const properties =
      (spec.inputSchema as { properties?: Record<string, { description?: string }> })
        .properties ?? {};
    for (const [parameter, schema] of Object.entries(properties)) {
      assert.ok(schema.description, `${spec.name}.${parameter} has no description`);
      checked += 1;
      assert.ok(
        schema.description!.length <= LIMITS.parameterDescription,
        `${spec.name}.${parameter} is ${schema.description!.length} chars, over ` +
          `${LIMITS.parameterDescription}`,
      );
    }
  }
  assert.ok(checked >= 12, `expected to check at least 12 parameters, checked ${checked}`);
});

test("the spec key matches each tool's declared name", () => {
  for (const [key, spec] of Object.entries(TOOL_SPECS)) {
    assert.equal(key, (spec as ToolSpec).name);
  }
});

test("read-only tools are annotated, and writing tools are not", () => {
  const readOnly = specs
    .filter((spec) => spec.annotations?.readOnlyHint)
    .map((spec) => spec.name);
  assert.deepEqual(readOnly.sort(), [
    "get_sheet_summary",
    "list_staged_changes",
    "query_rows",
  ]);

  // Anything echoing uploaded cell values is untrusted content by definition.
  for (const name of readOnly) {
    const spec = TOOL_SPECS[name as keyof typeof TOOL_SPECS] as ToolSpec;
    assert.ok(
      spec.annotations?.untrustedContentHint,
      `${name} returns sheet contents and must carry untrustedContentHint`,
    );
  }
});

test("no tool claims to commit", () => {
  for (const spec of specs) {
    const promisesCommit = /\bcommits\b(?!.*only the)/i.test(spec.description);
    assert.ok(
      !promisesCommit || spec.name === "request_commit",
      `${spec.name} description implies it commits`,
    );
  }
});
