/**
 * Application store.
 *
 * A plain observable store rather than React state because WebMCP tool callbacks live
 * outside the render tree: a tool invoked by an agent must read the sheet as it is at
 * call time, and a closure captured at render would hand it a stale one.
 */

import { emptyState, type SheetState } from "./sheet";

export type ActivityOutcome = "ok" | "refused" | "error";

export type Activity = {
  id: string;
  at: number;
  tool: string;
  outcome: ActivityOutcome;
  detail: string;
};

export type AppState = {
  sheet: SheetState;
  activity: Activity[];
  fileName: string | null;
};

const MAX_ACTIVITY = 40;

export type Store = {
  getState: () => AppState;
  subscribe: (listener: () => void) => () => void;
  update: (recipe: (state: AppState) => AppState) => void;
  log: (entry: Omit<Activity, "id" | "at">) => void;
};

export function createStore(): Store {
  let state: AppState = { sheet: emptyState(), activity: [], fileName: null };
  const listeners = new Set<() => void>();
  let sequence = 0;

  const emit = () => listeners.forEach((listener) => listener());

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(recipe) {
      state = recipe(state);
      emit();
    },
    log(entry) {
      sequence += 1;
      const activity: Activity = { ...entry, id: `act_${sequence}`, at: Date.now() };
      state = {
        ...state,
        activity: [activity, ...state.activity].slice(0, MAX_ACTIVITY),
      };
      emit();
    },
  };
}
