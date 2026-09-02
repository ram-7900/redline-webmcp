"use client";

import {
  committedValue,
  pendingChanges,
  pendingChangesInBatch,
  type SheetState,
} from "@/lib/sheet";

/**
 * The review queue, and the only path to committing.
 *
 * No WebMCP tool can reach these handlers. That is the product's central guarantee, so
 * the control stays here in the page rather than behind any callable surface.
 */
export function ReviewPanel({
  state,
  onRejectBatch,
  onRejectChange,
  onRejectAll,
  onCommit,
}: {
  state: SheetState;
  onRejectBatch: (batchId: string) => void;
  onRejectChange: (changeId: string) => void;
  onRejectAll: () => void;
  onCommit: () => void;
}) {
  const pending = pendingChanges(state);

  if (pending.length === 0) {
    return (
      <div className="rounded-md border border-black/10 p-4 text-sm opacity-60 dark:border-white/15">
        Nothing staged. When an agent proposes changes, they queue up here for your
        approval before anything is written.
      </div>
    );
  }

  const groups = state.batches
    .map((batch) => ({ batch, changes: pendingChangesInBatch(state, batch.id) }))
    .filter((group) => group.changes.length > 0);

  return (
    <div className="rounded-md border border-amber-300 dark:border-amber-500/40">
      <div className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/40 dark:bg-amber-500/10">
        <p className="text-sm font-medium">
          {pending.length} changes awaiting your approval
        </p>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onRejectAll}
            className="rounded border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Reject all
          </button>
          <button
            type="button"
            onClick={onCommit}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Commit {pending.length}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-black/5 dark:divide-white/10">
        {groups.map(({ batch, changes }) => (
          <li key={batch.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{batch.summary}</span>
              <code className="font-mono text-xs opacity-40">{batch.tool}</code>
              <span className="text-sm opacity-60">{changes.length} changes</span>
              <button
                type="button"
                onClick={() => onRejectBatch(batch.id)}
                className="ml-auto text-sm text-red-700 underline underline-offset-2 hover:no-underline dark:text-red-400"
              >
                Reject group
              </button>
            </div>

            <ul className="mt-2 space-y-1 font-mono text-xs">
              {changes.slice(0, 6).map((change) => (
                <li key={change.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="opacity-40">
                    {change.rowId}.{change.column}
                  </span>
                  <span className="line-through opacity-50">
                    {committedValue(state.sheet, change.rowId, change.column) || "—"}
                  </span>
                  <span aria-hidden className="opacity-40">
                    ⇒
                  </span>
                  <span className="font-medium">{change.after || "—"}</span>
                  <button
                    type="button"
                    onClick={() => onRejectChange(change.id)}
                    className="ml-auto text-red-700 underline underline-offset-2 hover:no-underline dark:text-red-400"
                  >
                    reject
                  </button>
                </li>
              ))}
              {changes.length > 6 && (
                <li className="opacity-50">… {changes.length - 6} more in this group</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
