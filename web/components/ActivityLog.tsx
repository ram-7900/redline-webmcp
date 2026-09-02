"use client";

import type { Activity } from "@/lib/store";

const TONE: Record<Activity["outcome"], string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  refused: "text-amber-700 dark:text-amber-400",
  error: "text-red-700 dark:text-red-400",
};

const LABEL: Record<Activity["outcome"], string> = {
  ok: "ok",
  refused: "refused",
  error: "error",
};

/**
 * What the agent has done, as it happens.
 *
 * Refusals get their own tone rather than reading as failures — the spec has no
 * structured refusal outcome (webmcp issue #282), so this is matched from the result
 * text prefix the tools emit.
 */
export function ActivityLog({ entries }: { entries: Activity[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm opacity-50">
        No tool calls yet. Ask your agent to describe or edit the sheet.
      </p>
    );
  }

  return (
    <ol className="space-y-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="border-l-2 border-black/10 pl-3 dark:border-white/15">
          <div className="flex items-baseline gap-2">
            <code className="font-mono text-xs">{entry.tool}</code>
            <span className={`text-xs font-medium ${TONE[entry.outcome]}`}>
              {LABEL[entry.outcome]}
            </span>
            <span className="ml-auto font-mono text-[0.7rem] opacity-40">
              {new Date(entry.at).toLocaleTimeString()}
            </span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap opacity-70">{entry.detail}</p>
        </li>
      ))}
    </ol>
  );
}
