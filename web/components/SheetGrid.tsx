"use client";

import { committedValue, pendingChangeFor, type SheetState } from "@/lib/sheet";

/**
 * The sheet, with staged proposals drawn over committed values.
 *
 * A pending cell shows both states rather than only the new one: a reviewer approving a
 * bulk change needs to see what it replaces, and showing only the result would ask them
 * to approve a diff they cannot see.
 */
export function SheetGrid({ state }: { state: SheetState }) {
  const { sheet } = state;

  return (
    <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/15">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-black/[0.03] text-left dark:bg-white/[0.06]">
            <th className="px-2 py-2 font-mono text-xs font-normal opacity-50">row</th>
            {sheet.columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row) => (
            <tr key={row.id} className="border-t border-black/5 dark:border-white/10">
              <td className="px-2 py-1.5 font-mono text-xs opacity-40">{row.id}</td>
              {sheet.columns.map((column) => {
                const pending = pendingChangeFor(state, row.id, column);
                const committed = committedValue(sheet, row.id, column);

                if (!pending) {
                  return (
                    <td key={column} className="px-3 py-1.5 align-top">
                      {committed || <span className="opacity-30">—</span>}
                    </td>
                  );
                }

                return (
                  <td
                    key={column}
                    className="bg-amber-100/70 px-3 py-1.5 align-top dark:bg-amber-500/15"
                  >
                    <span className="block text-xs line-through opacity-50">
                      {committed || "—"}
                    </span>
                    <span className="block font-medium text-amber-900 dark:text-amber-200">
                      {pending.after || "—"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
