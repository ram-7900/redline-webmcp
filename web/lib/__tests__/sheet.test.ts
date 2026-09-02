import assert from "node:assert/strict";
import test from "node:test";

import {
  commitPending,
  committedValue,
  effectiveValue,
  loadSheet,
  pendingChanges,
  rejectBatch,
  rejectChange,
  SheetError,
  stageEdits,
  type Sheet,
} from "../sheet.ts";

function sheet(): Sheet {
  return {
    columns: ["name", "phone"],
    rows: [
      { id: "r1", cells: { name: "ada lovelace", phone: "555 0100" } },
      { id: "r2", cells: { name: "alan turing", phone: "555 0101" } },
    ],
  };
}

test("staged edits do not touch committed truth", () => {
  const start = loadSheet(sheet());
  const { state } = stageEdits(start, {
    tool: "stage_edit",
    summary: "title-case names",
    edits: [{ rowId: "r1", column: "name", after: "Ada Lovelace" }],
  });

  assert.equal(committedValue(state.sheet, "r1", "name"), "ada lovelace");
  assert.equal(effectiveValue(state, "r1", "name"), "Ada Lovelace");
  assert.equal(pendingChanges(state).length, 1);
});

test("rejecting a batch reverts its cells and leaves the rest pending", () => {
  const start = loadSheet(sheet());
  const first = stageEdits(start, {
    tool: "stage_edit",
    summary: "names",
    edits: [{ rowId: "r1", column: "name", after: "Ada Lovelace" }],
  });
  const second = stageEdits(first.state, {
    tool: "stage_transform",
    summary: "phones",
    edits: [{ rowId: "r1", column: "phone", after: "+15550100" }],
  });

  const { state, affected } = rejectBatch(second.state, first.batch.id);

  assert.equal(affected, 1);
  // Criterion 10: after a rejection the agent's own read must report reverted truth.
  assert.equal(effectiveValue(state, "r1", "name"), "ada lovelace");
  assert.equal(effectiveValue(state, "r1", "phone"), "+15550100");
  assert.equal(pendingChanges(state).length, 1);
});

test("commit applies pending changes and drops rejected ones", () => {
  const start = loadSheet(sheet());
  const staged = stageEdits(start, {
    tool: "stage_edit",
    summary: "title-case names",
    edits: [
      { rowId: "r1", column: "name", after: "Ada Lovelace" },
      { rowId: "r2", column: "name", after: "Alan Turing" },
    ],
  });
  const rejectedId = staged.state.changes.find((change) => change.rowId === "r2")!.id;
  const { state: afterReject } = rejectChange(staged.state, rejectedId);

  const { state, applied } = commitPending(afterReject);

  assert.equal(applied, 1);
  assert.equal(committedValue(state.sheet, "r1", "name"), "Ada Lovelace");
  assert.equal(committedValue(state.sheet, "r2", "name"), "alan turing");
  assert.equal(pendingChanges(state).length, 0);
});

test("re-staging a cell supersedes the earlier proposal", () => {
  const start = loadSheet(sheet());
  const first = stageEdits(start, {
    tool: "stage_edit",
    summary: "first guess",
    edits: [{ rowId: "r1", column: "name", after: "ADA LOVELACE" }],
  });
  const second = stageEdits(first.state, {
    tool: "stage_edit",
    summary: "corrected",
    edits: [{ rowId: "r1", column: "name", after: "Ada Lovelace" }],
  });

  assert.equal(pendingChanges(second.state).length, 1);
  assert.equal(effectiveValue(second.state, "r1", "name"), "Ada Lovelace");

  const { state } = commitPending(second.state);
  assert.equal(committedValue(state.sheet, "r1", "name"), "Ada Lovelace");
});

test("no-op edits are skipped rather than staged", () => {
  const start = loadSheet(sheet());
  const { staged, skipped } = stageEdits(start, {
    tool: "stage_edit",
    summary: "already correct",
    edits: [
      { rowId: "r1", column: "name", after: "ada lovelace" },
      { rowId: "r2", column: "name", after: "Alan Turing" },
    ],
  });

  assert.equal(staged, 1);
  assert.equal(skipped, 1);
});

test("unknown column and unknown row are rejected with a usable message", () => {
  const start = loadSheet(sheet());

  assert.throws(
    () =>
      stageEdits(start, {
        tool: "stage_edit",
        summary: "bad column",
        edits: [{ rowId: "r1", column: "email", after: "x" }],
      }),
    (error: unknown) =>
      error instanceof SheetError && /Columns are: name, phone/.test(error.message),
  );

  assert.throws(
    () =>
      stageEdits(start, {
        tool: "stage_edit",
        summary: "bad row",
        edits: [{ rowId: "r99", column: "name", after: "x" }],
      }),
    (error: unknown) => error instanceof SheetError && /r99/.test(error.message),
  );
});

test("committing with nothing pending is a no-op", () => {
  const start = loadSheet(sheet());
  const { state, applied } = commitPending(start);
  assert.equal(applied, 0);
  assert.equal(state, start);
});
