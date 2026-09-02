"use client";

import { useEffect, useState } from "react";
import { getModelContext, text, useWebMCPSupport, useWebMCPTool } from "@/lib/webmcp";

export default function Home() {
  const support = useWebMCPSupport();
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [pings, setPings] = useState<string[]>([]);

  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;

    let live = true;
    const refresh = () => {
      modelContext
        .getTools()
        .then((tools) => {
          if (live) setToolNames(tools.map((tool) => tool.name));
        })
        .catch(() => {
          if (live) setToolNames([]);
        });
    };
    refresh();
    modelContext.addEventListener("toolchange", refresh);
    return () => {
      live = false;
      modelContext.removeEventListener("toolchange", refresh);
    };
  }, []);

  useWebMCPTool({
    name: "redline_ping",
    title: "Ping Redline",
    description:
      "Health check that confirms Redline's WebMCP tools are reachable from this page. Returns a confirmation message echoing the note you send.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        note: { type: "string", description: "Short text to echo back." },
      },
      required: ["note"],
    },
    execute: ({ note }) => {
      const stamped = `${new Date().toLocaleTimeString()} — ${String(note)}`;
      setPings((previous) => [stamped, ...previous].slice(0, 10));
      return text(`Redline is reachable. You said: ${String(note)}`);
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 font-sans">
      <h1 className="text-3xl font-semibold tracking-tight">Redline</h1>
      <p className="mt-2 text-base opacity-70">
        An agent bulk-edits your data. Nothing commits until you approve the redline.
      </p>

      <section className="mt-10 rounded-lg border border-black/10 p-5 dark:border-white/15">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          WebMCP status
        </h2>
        {support === "pending" && <p className="mt-2">Checking…</p>}
        {support === "supported" && (
          <p className="mt-2">
            Connected. <span className="font-mono text-sm">document.modelContext</span> is
            available and Redline&rsquo;s tools are registered.
          </p>
        )}
        {support === "unsupported" && (
          <div className="mt-2 space-y-2">
            <p>
              This browser does not expose WebMCP, so agent tools are off. The app still
              works manually.
            </p>
            <p className="text-sm opacity-70">
              To enable it: open Chrome 149+, visit{" "}
              <span className="font-mono">chrome://flags/#enable-webmcp-testing</span>, set
              it to Enabled, relaunch, and reload this page over HTTPS.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          Registered tools ({toolNames.length})
        </h2>
        <ul className="mt-2 space-y-1 font-mono text-sm">
          {toolNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
          {toolNames.length === 0 && <li className="opacity-60">none</li>}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          Tool calls received
        </h2>
        <ul className="mt-2 space-y-1 font-mono text-sm">
          {pings.map((ping) => (
            <li key={ping}>{ping}</li>
          ))}
          {pings.length === 0 && (
            <li className="opacity-60">
              none yet — ask your agent to call redline_ping
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
