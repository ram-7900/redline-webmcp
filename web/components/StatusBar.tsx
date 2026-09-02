"use client";

import type { SupportState } from "@/lib/webmcp";

const DOT: Record<SupportState, string> = {
  pending: "bg-neutral-400",
  supported: "bg-emerald-500",
  unsupported: "bg-amber-500",
};

export function StatusBar({
  support,
  toolCount,
}: {
  support: SupportState;
  toolCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-black/10 bg-black/[0.02] px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.03]">
      <span className={`size-2 shrink-0 rounded-full ${DOT[support]}`} aria-hidden />
      {support === "pending" && <span>Checking for WebMCP…</span>}
      {support === "supported" && (
        <span>
          WebMCP connected — <strong>{toolCount}</strong> tools registered. Ask your agent
          to edit this sheet.
        </span>
      )}
      {support === "unsupported" && (
        <span>
          No WebMCP in this browser. The sheet still works by hand. To enable it, open{" "}
          <code className="font-mono text-[0.85em]">chrome://flags/#enable-webmcp-testing</code>{" "}
          in Chrome 149+, relaunch, and reload over HTTPS.
        </span>
      )}
    </div>
  );
}
