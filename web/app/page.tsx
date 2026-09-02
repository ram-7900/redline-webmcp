"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActivityLog } from "@/components/ActivityLog";
import { ReviewPanel } from "@/components/ReviewPanel";
import { SheetGrid } from "@/components/SheetGrid";
import { StatusBar } from "@/components/StatusBar";
import { CsvError, parseCsv, toCsv } from "@/lib/csv";
import {
  commitPending,
  loadSheet,
  rejectAll,
  rejectBatch,
  rejectChange,
} from "@/lib/sheet";
import { createStore, type AppState } from "@/lib/store";
import { useRedlineTools } from "@/lib/tools";
import { getModelContext, useWebMCPSupport } from "@/lib/webmcp";

const SERVER_STATE: AppState = {
  sheet: { sheet: { columns: [], rows: [] }, batches: [], changes: [] },
  activity: [],
  fileName: null,
};

export default function Home() {
  const [store] = useState(createStore);
  const state = useSyncExternalStore(store.subscribe, store.getState, () => SERVER_STATE);

  const support = useWebMCPSupport();
  const [toolCount, setToolCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useRedlineTools(store);

  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;

    let live = true;
    const refresh = () => {
      modelContext
        .getTools()
        .then((tools) => {
          if (live) setToolCount(tools.length);
        })
        .catch(() => {
          if (live) setToolCount(0);
        });
    };
    refresh();
    modelContext.addEventListener("toolchange", refresh);
    return () => {
      live = false;
      modelContext.removeEventListener("toolchange", refresh);
    };
  }, []);

  const load = useCallback(
    (csv: string, fileName: string) => {
      try {
        const sheet = parseCsv(csv);
        store.update(() => ({ sheet: loadSheet(sheet), activity: [], fileName }));
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof CsvError ? cause.message : `Could not read that file: ${cause}`,
        );
      }
    },
    [store],
  );

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      load(await file.text(), file.name);
    },
    [load],
  );

  const loadSample = useCallback(async () => {
    const response = await fetch("/sample-contacts.csv");
    load(await response.text(), "sample-contacts.csv");
  }, [load]);

  const commit = useCallback(() => {
    const { state: next, applied } = commitPending(store.getState().sheet);
    if (applied === 0) return;
    store.update((current) => ({ ...current, sheet: next }));
    // Logged through the same channel as tool calls so the history reads as one
    // sequence: what the agent proposed, then what the human actually accepted.
    store.log({
      tool: "commit",
      outcome: "ok",
      detail: `You committed ${applied} changes.`,
    });
  }, [store]);

  const download = useCallback(() => {
    const csv = toCsv(store.getState().sheet.sheet);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = store.getState().fileName ?? "redline-export.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [store]);

  const hasSheet = state.sheet.sheet.rows.length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Redline</h1>
        <p className="mt-1 max-w-2xl opacity-70">
          An agent bulk-edits your data through WebMCP. Every change it makes is staged —
          nothing is written until you approve it here.
        </p>
      </header>

      <StatusBar support={support} toolCount={toolCount} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Upload CSV
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => void loadSample()}
          className="rounded border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Load messy sample
        </button>
        {hasSheet && (
          <button
            type="button"
            onClick={download}
            className="rounded border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Download committed CSV
          </button>
        )}
        {state.fileName && (
          <span className="font-mono text-xs opacity-50">{state.fileName}</span>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {hasSheet ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <ReviewPanel
              state={state.sheet}
              onRejectBatch={(batchId) =>
                store.update((current) => ({
                  ...current,
                  sheet: rejectBatch(current.sheet, batchId).state,
                }))
              }
              onRejectChange={(changeId) =>
                store.update((current) => ({
                  ...current,
                  sheet: rejectChange(current.sheet, changeId).state,
                }))
              }
              onRejectAll={() =>
                store.update((current) => ({
                  ...current,
                  sheet: rejectAll(current.sheet).state,
                }))
              }
              onCommit={commit}
            />
            <SheetGrid state={state.sheet} />
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide opacity-60">
              Agent activity
            </h2>
            <ActivityLog entries={state.activity} />
          </aside>
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-dashed border-black/15 p-10 text-center dark:border-white/20">
          <p className="opacity-70">Load a CSV to begin.</p>
          <p className="mt-1 text-sm opacity-50">
            The sample is 60 rows of deliberately messy contact data — inconsistent names,
            unformatted phone numbers, mixed-case emails and five different date formats.
          </p>
        </div>
      )}
    </main>
  );
}
