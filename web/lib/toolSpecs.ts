/**
 * Tool contracts, separated from their implementations.
 *
 * Names, descriptions and input schemas are the interface an agent actually programs
 * against, so they live as plain data that can be inspected, diffed and tested without
 * standing up React. `budgets.test.ts` asserts against these values directly.
 *
 * Chrome's published budgets: 30 characters for a name, 500 for a tool description, 150
 * for a parameter description. An overrun is truncated silently — which would cut the
 * tail off exactly the sentences saying what a tool must never be used for.
 */

/** Column normalisations the transform service implements. */
export const TRANSFORM_NAMES = [
  "title_case",
  "normalize_phone",
  "normalize_date",
  "trim_whitespace",
  "lowercase_email",
] as const;

export type TransformName = (typeof TRANSFORM_NAMES)[number];

export const OPERATORS = [
  "contains",
  "equals",
  "starts_with",
  "is_empty",
  "is_not_empty",
] as const;

export type Operator = (typeof OPERATORS)[number];

export type ToolSpec = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
};

const NO_INPUT = { type: "object", properties: {} } as const;

export const TOOL_SPECS = {
  get_sheet_summary: {
    name: "get_sheet_summary",
    title: "Describe the sheet",
    description:
      "Returns the sheet's columns, row count, how many values are empty in each column, and a few sample rows. Call this before staging anything so you use real column names and row ids.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: NO_INPUT,
  },

  query_rows: {
    name: "query_rows",
    title: "Find rows",
    description:
      "Finds rows where one column matches a condition and returns their row ids and values. Use those ids with stage_edit or stage_transform. At most 50 rows come back, but the full match count is always reported.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        column: { type: "string", description: "Column to test." },
        operator: {
          type: "string",
          enum: OPERATORS,
          description: "How to compare. is_empty and is_not_empty ignore value.",
        },
        value: { type: "string", description: "Text to compare against." },
        show: {
          type: "array",
          items: { type: "string" },
          description: "Extra columns to include. Defaults to the tested column.",
        },
      },
      required: ["column", "operator"],
    },
  },

  stage_edit: {
    name: "stage_edit",
    title: "Stage a value",
    description:
      "Stages one value into a column, for the rows you name or for every row if you name none. This does not change the sheet: the proposal enters the human's review queue where each change can be accepted or rejected. Rows already holding the value are skipped.",
    inputSchema: {
      type: "object",
      properties: {
        column: { type: "string", description: "Column to write." },
        value: { type: "string", description: "Value to stage into that column." },
        row_ids: {
          type: "array",
          items: { type: "string" },
          description: "Rows to change. Omit to stage across every row.",
        },
        reason: { type: "string", description: "Short note shown to the reviewer." },
      },
      required: ["column", "value"],
    },
  },

  stage_transform: {
    name: "stage_transform",
    title: "Stage a normalisation",
    description:
      "Stages a normalisation across a column: title_case, normalize_phone, normalize_date, trim_whitespace or lowercase_email. Values that cannot be converted are left untouched and reported with a reason. Like every write here the result is staged for review, not committed.",
    inputSchema: {
      type: "object",
      properties: {
        column: { type: "string", description: "Column to normalise." },
        transform: {
          type: "string",
          enum: TRANSFORM_NAMES,
          description: "Which normalisation to apply.",
        },
        row_ids: {
          type: "array",
          items: { type: "string" },
          description: "Rows to change. Omit to cover every row.",
        },
        region: {
          type: "string",
          description: "Two-letter country code for phone numbers lacking one. Default US.",
        },
      },
      required: ["column", "transform"],
    },
  },

  list_staged_changes: {
    name: "list_staged_changes",
    title: "List staged changes",
    description:
      "Lists everything staged and waiting for the human to review, grouped by the tool call that proposed it, with the batch id needed to withdraw a group.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputSchema: NO_INPUT,
  },

  discard_staged: {
    name: "discard_staged",
    title: "Withdraw staged changes",
    description:
      "Withdraws changes you staged, before the human acts on them. Pass a batch_id from list_staged_changes to withdraw one group, or omit it to withdraw everything still pending.",
    inputSchema: {
      type: "object",
      properties: {
        batch_id: {
          type: "string",
          description: "Group to withdraw. Omit to withdraw all pending changes.",
        },
      },
    },
  },

  request_commit: {
    name: "request_commit",
    title: "Ask for approval",
    description:
      "Hands the decision back to the human. This tool never commits and always refuses to: committing is reachable only from the Commit button in the page, which no tool can press. Call it to summarise what is waiting for their approval.",
    inputSchema: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "What to tell the reviewer about these changes.",
        },
      },
    },
  },

  export_csv: {
    name: "export_csv",
    title: "Export committed data",
    description:
      "Downloads the sheet as CSV. Only committed values are exported. Refuses while changes are still staged, so an export can never quietly ship data the human has not approved — ask them to review first.",
    inputSchema: NO_INPUT,
  },
} as const satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOL_SPECS;
