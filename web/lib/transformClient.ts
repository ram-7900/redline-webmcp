/**
 * Client for the Python transform service.
 *
 * Calls go through a same-origin path that Next rewrites to the service, so the browser
 * never makes a cross-origin request and no CORS preflight sits in the hot path.
 */

import { TRANSFORM_NAMES, type TransformName } from "./toolSpecs";

// Re-exported so callers can reach the names through the client they already import.
export { TRANSFORM_NAMES, type TransformName };

export type TransformResult = {
  row_id: string;
  value: string;
  changed: boolean;
  note?: string | null;
};

export type TransformResponse = {
  transform: TransformName;
  results: TransformResult[];
  changed: number;
  unchanged: number;
  failed: number;
};

export class TransformServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransformServiceError";
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/py";
const TIMEOUT_MS = 15_000;

export async function runTransform(
  transform: TransformName,
  values: Array<{ row_id: string; value: string }>,
  region: string,
  signal?: AbortSignal,
): Promise<TransformResponse> {
  // Every network call gets a deadline: an agent waiting on a hung fetch looks to the
  // user like the page froze, with no indication of which side is stuck.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/transform`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transform, values, region }),
      signal: combined,
    });
  } catch (error) {
    if (timeout.aborted) {
      throw new TransformServiceError(
        "The transform service did not respond within 15 seconds.",
      );
    }
    throw new TransformServiceError(
      `Could not reach the transform service: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new TransformServiceError(
      `The transform service rejected the request (HTTP ${response.status}).`,
    );
  }

  return (await response.json()) as TransformResponse;
}
