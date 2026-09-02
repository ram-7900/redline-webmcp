/**
 * Redline's WebMCP tools.
 *
 * The tool surface is deliberately asymmetric: agents can read the sheet and stage any
 * number of proposals, but nothing here writes committed data. `commitPending` is
 * reachable only from the page's own Commit control, so an agent's most destructive
 * possible action is proposing a change a human then declines.
 *
 * Descriptions stay inside Chrome's published budgets (500 characters for a tool, 150
 * for a parameter, 30 for a name). An overrun is silently truncated, which would quietly
 * drop the part of a description that tells an agent what a tool must not be used for.
 */
"use client";

import {
  committedValue,
  effectiveValue,
  pendingChanges,
  pendingChangesInBatch,
  SheetError,
  stageEdits,
  type ProposedEdit,
  type SheetState,
} from "./sheet";
import { toCsv } from "./csv";
import type { Store } from "./store";
import { refuse, text, useWebMCPTool, type ToolResult } from "./webmcp";
import {
  runTransform,
  TRANSFORM_NAMES,
  TransformServiceError,
  type TransformName,
} from "./transformClient";
import { OPERATORS, TOOL_SPECS, type Operator } from "./toolSpecs";

const QUERY_LIMIT = 50;
const SAMPLE_ROWS = 3;

function requireColumn(state: SheetState, column: unknown): string {
  const name = String(column ?? "");
  if (!state.sheet.columns.includes(name)) {
    throw new SheetError(
      `No column named "${name}". Columns are: ${state.sheet.columns.join(", ")}`,
    );
  }
  return name;
}

function requireSheet(state: SheetState): void {
  if (state.sheet.rows.length === 0) {
    throw new SheetError("No sheet is loaded. The user needs to upload a CSV first.");
  }
}

function matches(value: string, operator: Operator, target: string): boolean {
  const haystack = value.toLowerCase();
  const needle = target.toLowerCase();
  switch (operator) {
    case "contains":
      return haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "starts_with":
      return haystack.startsWith(needle);
    case "is_empty":
      return value.trim() === "";
    case "is_not_empty":
      return value.trim() !== "";
  }
}

/** Resolves an explicit row_ids list, defaulting to the whole sheet. */
function resolveRowIds(state: SheetState, rowIds: unknown): string[] {
  if (rowIds === undefined || rowIds === null) {
    return state.sheet.rows.map((row) => row.id);
  }
  if (!Array.isArray(rowIds)) {
    throw new SheetError("row_ids must be an array of row ids.");
  }
  const known = new Set(state.sheet.rows.map((row) => row.id));
  const unknown = rowIds.map(String).filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new SheetError(
      `Unknown row ids: ${unknown.slice(0, 5).join(", ")}. Use query_rows to get valid ids.`,
    );
  }
  return rowIds.map(String);
}

export function useRedlineTools(store: Store): void {
  /**
   * Runs a tool body, turning a thrown error into a readable result rather than a
   * rejected promise. An agent that receives a stack trace has nothing to act on; an
   * agent told "no column named x, columns are a, b, c" fixes its own call.
   */
  const guard = async (
    tool: string,
    body: () => Promise<ToolResult> | ToolResult,
  ): Promise<ToolResult> => {
    try {
      const result = await body();
      const detail = result.content[0]?.text ?? "";
      store.log({
        tool,
        outcome: detail.startsWith("REFUSED:") ? "refused" : "ok",
        detail,
      });
      return result;
    } catch (error) {
      const message =
        error instanceof SheetError || error instanceof TransformServiceError
          ? error.message
          : `Unexpected failure: ${(error as Error).message}`;
      store.log({ tool, outcome: "error", detail: message });
      return text(`Error: ${message}`);
    }
  };

  useWebMCPTool({
    ...TOOL_SPECS.get_sheet_summary,
    execute: () =>
      guard("get_sheet_summary", () => {
        const state = store.getState().sheet;
        if (state.sheet.rows.length === 0) {
          return text("No sheet is loaded yet. Ask the user to upload a CSV.");
        }

        const stats = state.sheet.columns.map((column) => {
          const empty = state.sheet.rows.filter(
            (row) => (row.cells[column] ?? "").trim() === "",
          ).length;
          return `${column} (${empty} empty)`;
        });

        const samples = state.sheet.rows.slice(0, SAMPLE_ROWS).map((row) => {
          const cells = state.sheet.columns
            .map((column) => `${column}=${effectiveValue(state, row.id, column)}`)
            .join(", ");
          return `  ${row.id}: ${cells}`;
        });

        return text(
          [
            `${state.sheet.rows.length} rows, ${state.sheet.columns.length} columns.`,
            `Columns: ${stats.join("; ")}`,
            `${pendingChanges(state).length} changes are staged and awaiting review.`,
            "Sample rows:",
            ...samples,
          ].join("\n"),
        );
      }),
  });

  useWebMCPTool({
    ...TOOL_SPECS.query_rows,
    execute: (input) =>
      guard("query_rows", () => {
        const state = store.getState().sheet;
        requireSheet(state);

        const column = requireColumn(state, input.column);
        const operator = String(input.operator) as Operator;
        if (!OPERATORS.includes(operator)) {
          throw new SheetError(`Unknown operator "${operator}". Use one of: ${OPERATORS.join(", ")}`);
        }
        const target = String(input.value ?? "");
        const show = Array.isArray(input.show)
          ? input.show.map((name) => requireColumn(state, name))
          : [column];

        const hits = state.sheet.rows.filter((row) =>
          matches(effectiveValue(state, row.id, column), operator, target),
        );

        if (hits.length === 0) return text(`No rows match. Checked ${state.sheet.rows.length} rows.`);

        const lines = hits.slice(0, QUERY_LIMIT).map((row) => {
          const cells = show
            .map((name) => `${name}=${effectiveValue(state, row.id, name)}`)
            .join(", ");
          return `  ${row.id}: ${cells}`;
        });

        const truncated =
          hits.length > QUERY_LIMIT
            ? `\n  … ${hits.length - QUERY_LIMIT} more not shown.`
            : "";

        return text(`${hits.length} rows match.\n${lines.join("\n")}${truncated}`);
      }),
  });

  useWebMCPTool({
    ...TOOL_SPECS.stage_edit,
    execute: (input) =>
      guard("stage_edit", () => {
        const state = store.getState().sheet;
        requireSheet(state);

        const column = requireColumn(state, input.column);
        const value = String(input.value ?? "");
        const rowIds = resolveRowIds(state, input.row_ids);
        const reason = String(input.reason ?? `Set ${column} to "${value}"`).slice(0, 120);

        const edits: ProposedEdit[] = rowIds.map((rowId) => ({ rowId, column, after: value }));
        const result = stageEdits(state, { tool: "stage_edit", summary: reason, edits });
        store.update((current) => ({ ...current, sheet: result.state }));

        if (result.staged === 0) {
          return text(`Nothing staged: all ${result.skipped} rows already hold that value.`);
        }
        return text(
          `Staged ${result.staged} changes to ${column} for review` +
            (result.skipped > 0 ? `, skipped ${result.skipped} already correct.` : ".") +
            " Nothing is committed until the user approves it.",
        );
      }),
  });

  useWebMCPTool({
    ...TOOL_SPECS.stage_transform,
    execute: (input, options) =>
      guard("stage_transform", async () => {
        const state = store.getState().sheet;
        requireSheet(state);

        const column = requireColumn(state, input.column);
        const transform = String(input.transform) as TransformName;
        if (!TRANSFORM_NAMES.includes(transform)) {
          throw new SheetError(
            `Unknown transform "${transform}". Available: ${TRANSFORM_NAMES.join(", ")}`,
          );
        }
        const rowIds = resolveRowIds(state, input.row_ids);
        const region = String(input.region ?? "US").toUpperCase().slice(0, 2);

        const values = rowIds.map((rowId) => ({
          row_id: rowId,
          value: effectiveValue(state, rowId, column),
        }));

        const response = await runTransform(transform, values, region, options.signal);

        const edits: ProposedEdit[] = response.results
          .filter((item) => item.changed)
          .map((item) => ({ rowId: item.row_id, column, after: item.value }));

        const result = stageEdits(store.getState().sheet, {
          tool: "stage_transform",
          summary: `${transform} on ${column}`,
          edits,
        });
        store.update((current) => ({ ...current, sheet: result.state }));

        const failures = response.results.filter((item) => item.note);
        const reasons = [...new Set(failures.map((item) => item.note))].slice(0, 3).join("; ");

        const parts = [
          `Staged ${result.staged} changes to ${column} using ${transform}.`,
          `${response.unchanged} were already correct.`,
        ];
        if (failures.length > 0) {
          parts.push(
            `${failures.length} could not be converted and were left alone (${reasons}).`,
          );
        }
        parts.push("Awaiting the user's approval.");
        return text(parts.join(" "));
      }),
  });

  useWebMCPTool({
    ...TOOL_SPECS.list_staged_changes,
    execute: () =>
      guard("list_staged_changes", () => {
        const state = store.getState().sheet;
        const pending = pendingChanges(state);
        if (pending.length === 0) return text("Nothing is staged. The sheet has no pending changes.");

        const groups = state.batches
          .map((batch) => {
            const count = pendingChangesInBatch(state, batch.id).length;
            return count === 0 ? null : `  ${batch.id}: ${batch.summary} — ${count} changes`;
          })
          .filter(Boolean);

        const preview = pending.slice(0, 5).map((change) => {
          const before = committedValue(state.sheet, change.rowId, change.column) || "(empty)";
          return `  ${change.rowId}.${change.column}: ${before} → ${change.after}`;
        });

        return text(
          [
            `${pending.length} changes staged across ${groups.length} groups.`,
            ...groups,
            "Examples:",
            ...preview,
          ].join("\n"),
        );
      }),
  });

  useWebMCPTool({
    ...TOOL_SPECS.discard_staged,
    execute: (input) =>
      guard("discard_staged", () => {
        const state = store.getState().sheet;
        const batchId = input.batch_id === undefined ? undefined : String(input.batch_id);

        if (batchId && !state.batches.some((batch) => batch.id === batchId)) {
          throw new SheetError(`No staged group with id "${batchId}".`);
        }

        const changes = state.changes.map((change) =>
          change.status === "pending" && (!batchId || change.batchId === batchId)
            ? { ...change, status: "rejected" as const }
            : change,
        );
        const affected = state.changes.filter(
          (change) =>
            change.status === "pending" && (!batchId || change.batchId === batchId),
        ).length;

        store.update((current) => ({ ...current, sheet: { ...state, changes } }));
        return text(`Withdrew ${affected} staged changes.`);
      }),
  });

  useWebMCPTool({
    ...TOOL_SPECS.request_commit,
    execute: (input) =>
      guard("request_commit", () => {
        const state = store.getState().sheet;
        const pending = pendingChanges(state).length;
        const note = String(input.note ?? "").slice(0, 200);

        if (pending === 0) {
          return refuse("nothing is staged, so there is nothing for the user to approve.");
        }
        return refuse(
          `only the person at the keyboard can commit. ${pending} changes are waiting in the ` +
            `review panel and they can approve or reject each one there.` +
            (note ? ` Your note to them: ${note}` : ""),
        );
      }),
  });

  useWebMCPTool({
    ...TOOL_SPECS.export_csv,
    execute: () =>
      guard("export_csv", () => {
        const state = store.getState().sheet;
        requireSheet(state);

        const pending = pendingChanges(state).length;
        if (pending > 0) {
          return refuse(
            `${pending} changes are still awaiting review. Exporting now would omit them. ` +
              "Ask the user to approve or reject them first.",
          );
        }

        const csv = toCsv(state.sheet);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = store.getState().fileName ?? "redline-export.csv";
        anchor.click();
        URL.revokeObjectURL(url);

        return text(`Exported ${state.sheet.rows.length} committed rows as CSV.`);
      }),
  });
}
