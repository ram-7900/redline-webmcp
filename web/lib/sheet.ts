/**
 * Redline's data model.
 *
 * Two layers, never mixed:
 *   - `sheet` is committed truth. Only a human commit writes to it.
 *   - `changes` are staged proposals. Agents write here and nowhere else.
 *
 * Every function is pure so the staging rules can be reasoned about — and tested —
 * without React or a browser.
 */

export type CellValue = string;

export type Row = {
  id: string;
  cells: Record<string, CellValue>;
};

export type Sheet = {
  columns: string[];
  rows: Row[];
};

export type ChangeStatus = "pending" | "rejected" | "superseded";

export type StagedChange = {
  id: string;
  batchId: string;
  rowId: string;
  column: string;
  before: CellValue;
  after: CellValue;
  status: ChangeStatus;
};

export type Batch = {
  id: string;
  tool: string;
  summary: string;
  createdAt: number;
};

export type SheetState = {
  sheet: Sheet;
  batches: Batch[];
  changes: StagedChange[];
};

export type ProposedEdit = {
  rowId: string;
  column: string;
  after: CellValue;
};

/** Raised when a tool call names something the sheet does not have. */
export class SheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetError";
  }
}

export function emptyState(): SheetState {
  return { sheet: { columns: [], rows: [] }, batches: [], changes: [] };
}

export function loadSheet(sheet: Sheet): SheetState {
  return { sheet, batches: [], changes: [] };
}

export function findRow(sheet: Sheet, rowId: string): Row | undefined {
  return sheet.rows.find((row) => row.id === rowId);
}

export function committedValue(sheet: Sheet, rowId: string, column: string): CellValue {
  return findRow(sheet, rowId)?.cells[column] ?? "";
}

/** The single live proposal for a cell, if one is awaiting review. */
export function pendingChangeFor(
  state: SheetState,
  rowId: string,
  column: string,
): StagedChange | undefined {
  return state.changes.find(
    (change) =>
      change.status === "pending" && change.rowId === rowId && change.column === column,
  );
}

/**
 * What a cell will hold if the human commits right now.
 *
 * Agents read through this, so a proposal they staged is visible to their next call
 * without ever touching committed truth.
 */
export function effectiveValue(
  state: SheetState,
  rowId: string,
  column: string,
): CellValue {
  return (
    pendingChangeFor(state, rowId, column)?.after ??
    committedValue(state.sheet, rowId, column)
  );
}

export function pendingChanges(state: SheetState): StagedChange[] {
  return state.changes.filter((change) => change.status === "pending");
}

export function pendingChangesInBatch(state: SheetState, batchId: string): StagedChange[] {
  return state.changes.filter(
    (change) => change.status === "pending" && change.batchId === batchId,
  );
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

/**
 * Records a batch of proposals.
 *
 * Edits that would not change the effective value are dropped rather than staged, so a
 * broad agent instruction ("title-case every name") does not bury the reviewer in
 * hundreds of no-op rows. Re-staging a cell supersedes the earlier proposal, keeping at
 * most one live proposal per cell — otherwise committing would depend on change order.
 */
export function stageEdits(
  state: SheetState,
  input: { tool: string; summary: string; edits: ProposedEdit[] },
): { state: SheetState; batch: Batch; staged: number; skipped: number } {
  const batch: Batch = {
    id: nextId("batch"),
    tool: input.tool,
    summary: input.summary,
    createdAt: Date.now(),
  };

  const changes = [...state.changes];
  const staged: StagedChange[] = [];
  let skipped = 0;

  for (const edit of input.edits) {
    if (!state.sheet.columns.includes(edit.column)) {
      throw new SheetError(
        `No column named "${edit.column}". Columns are: ${state.sheet.columns.join(", ")}`,
      );
    }
    if (!findRow(state.sheet, edit.rowId)) {
      throw new SheetError(`No row with id "${edit.rowId}".`);
    }

    const current = effectiveValue({ ...state, changes }, edit.rowId, edit.column);
    if (current === edit.after) {
      skipped += 1;
      continue;
    }

    for (let index = 0; index < changes.length; index += 1) {
      const existing = changes[index];
      if (
        existing.status === "pending" &&
        existing.rowId === edit.rowId &&
        existing.column === edit.column
      ) {
        changes[index] = { ...existing, status: "superseded" };
      }
    }

    const change: StagedChange = {
      id: nextId("chg"),
      batchId: batch.id,
      rowId: edit.rowId,
      column: edit.column,
      before: committedValue(state.sheet, edit.rowId, edit.column),
      after: edit.after,
      status: "pending",
    };
    changes.push(change);
    staged.push(change);
  }

  return {
    state: { ...state, batches: [...state.batches, batch], changes },
    batch,
    staged: staged.length,
    skipped,
  };
}

function setStatus(
  state: SheetState,
  matches: (change: StagedChange) => boolean,
  status: ChangeStatus,
): { state: SheetState; affected: number } {
  let affected = 0;
  const changes = state.changes.map((change) => {
    if (change.status !== "pending" || !matches(change)) return change;
    affected += 1;
    return { ...change, status };
  });
  return { state: { ...state, changes }, affected };
}

export function rejectBatch(
  state: SheetState,
  batchId: string,
): { state: SheetState; affected: number } {
  return setStatus(state, (change) => change.batchId === batchId, "rejected");
}

export function rejectChange(
  state: SheetState,
  changeId: string,
): { state: SheetState; affected: number } {
  return setStatus(state, (change) => change.id === changeId, "rejected");
}

export function rejectAll(state: SheetState): { state: SheetState; affected: number } {
  return setStatus(state, () => true, "rejected");
}

/**
 * Applies every pending proposal to committed truth.
 *
 * Rejected and superseded changes are dropped, not applied. This is the only function
 * that writes to `sheet`, and no agent tool reaches it — the human's commit control is
 * its sole caller.
 */
export function commitPending(state: SheetState): { state: SheetState; applied: number } {
  const applying = pendingChanges(state);
  if (applying.length === 0) return { state, applied: 0 };

  const byRow = new Map<string, Record<string, CellValue>>();
  for (const change of applying) {
    const patch = byRow.get(change.rowId) ?? {};
    patch[change.column] = change.after;
    byRow.set(change.rowId, patch);
  }

  const rows = state.sheet.rows.map((row) => {
    const patch = byRow.get(row.id);
    return patch ? { ...row, cells: { ...row.cells, ...patch } } : row;
  });

  return {
    state: { sheet: { ...state.sheet, rows }, batches: [], changes: [] },
    applied: applying.length,
  };
}
