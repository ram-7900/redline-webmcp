/**
 * WebMCP integration layer.
 *
 * Spec: https://github.com/webmachinelearning/webmcp (index.bs IDL)
 * The spec exposes `document.modelContext` only, under [Exposed=Window, SecureContext].
 * Some deployed builds have been reported to alias it onto `navigator`; we probe both
 * so the app degrades to a working manual UI rather than throwing on either shape.
 */
"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

export type ToolDefinition = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: WebMCP.ToolAnnotations;
  execute: (
    input: Record<string, unknown>,
    options: WebMCP.ToolExecuteCallbackOptions,
  ) => Promise<ToolResult> | ToolResult;
};

/** Wraps plain text in the MCP content envelope every tool must return. */
export function text(body: string): ToolResult {
  return { content: [{ type: "text", text: body }] };
}

/**
 * A tool declining a well-formed call on purpose.
 *
 * The spec has no structured refusal outcome — see webmcp issue #282 — so we encode
 * refusals as a success-shaped result whose text carries a stable prefix. Agents read
 * the prose; our activity log matches the prefix to render refusals distinctly.
 */
export const REFUSAL_PREFIX = "REFUSED:";

export function refuse(reason: string): ToolResult {
  return text(`${REFUSAL_PREFIX} ${reason}`);
}

export function getModelContext(): WebMCP.ModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  const fromDocument = document.modelContext;
  if (fromDocument) return fromDocument;
  const aliased = (navigator as unknown as { modelContext?: WebMCP.ModelContext })
    .modelContext;
  return aliased;
}

export type SupportState = "pending" | "supported" | "unsupported";

/**
 * Whether this browser exposes WebMCP.
 *
 * Read through useSyncExternalStore so the server and the first client render agree on
 * "pending" and the real answer arrives on hydration — a plain effect would flash the
 * unsupported notice on every load. Support cannot change after load, so the subscribe
 * function has nothing to listen to.
 */
export function useWebMCPSupport(): SupportState {
  return useSyncExternalStore(
    () => () => {},
    () => (getModelContext() ? "supported" : "unsupported"),
    () => "pending",
  );
}

/**
 * Registers one tool for the lifetime of the calling component.
 *
 * `execute` is read through a ref so the registration is stable across renders while the
 * handler still closes over current state. Re-registering under a live name rejects per
 * spec, so registration is keyed on the name alone and the abort in cleanup is what
 * releases it — without that abort the tool outlives the component as a ghost an agent
 * can still call.
 */
export function useWebMCPTool(definition: ToolDefinition): void {
  const latest = useRef(definition);
  useEffect(() => {
    latest.current = definition;
  });

  const { name, title, description, inputSchema, annotations } = definition;
  const schemaKey = JSON.stringify(inputSchema ?? null);
  const annotationsKey = JSON.stringify(annotations ?? null);

  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;

    const controller = new AbortController();

    modelContext
      .registerTool(
        {
          name,
          title,
          description,
          inputSchema: latest.current.inputSchema,
          annotations: latest.current.annotations,
          execute: (input, options) =>
            latest.current.execute(input as Record<string, unknown>, options),
        },
        { signal: controller.signal },
      )
      .catch((error: unknown) => {
        // A duplicate-name rejection here means a previous registration outlived its
        // component. Surface it instead of silently running with a stale tool.
        console.error(`WebMCP: failed to register "${name}"`, error);
      });

    return () => controller.abort();
  }, [name, title, description, schemaKey, annotationsKey]);
}
