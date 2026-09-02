/**
 * CSV parsing and serialisation.
 *
 * Hand-rolled rather than pulled from a dependency because the format Redline needs is
 * narrow — RFC 4180 quoting, no type inference — and uploaded files are untrusted input
 * whose parser is worth being able to read end to end.
 */

import type { Row, Sheet } from "./sheet";

export const MAX_ROWS = 200;
export const MAX_COLUMNS = 30;

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

/** Splits CSV text into rows of raw fields, honouring quoted commas and newlines. */
function splitRecords(input: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character !== '"') {
        field += character;
      } else if (input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      // Treat CRLF as one break rather than an empty record.
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      field = "";
      record = [];
    } else {
      field += character;
    }
  }

  if (quoted) throw new CsvError("Unterminated quoted field.");
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records.filter((entry) => entry.some((value) => value.trim() !== ""));
}

export function parseCsv(input: string): Sheet {
  const records = splitRecords(input);
  if (records.length === 0) throw new CsvError("File is empty.");

  const header = records[0].map((name, index) => name.trim() || `column_${index + 1}`);
  if (header.length > MAX_COLUMNS) {
    throw new CsvError(`Too many columns (${header.length}). The limit is ${MAX_COLUMNS}.`);
  }

  // Duplicate headers would make a column name ambiguous in every tool call.
  const seen = new Set<string>();
  const columns = header.map((name) => {
    let unique = name;
    let suffix = 2;
    while (seen.has(unique)) {
      unique = `${name}_${suffix}`;
      suffix += 1;
    }
    seen.add(unique);
    return unique;
  });

  const body = records.slice(1);
  if (body.length === 0) throw new CsvError("File has a header but no data rows.");
  if (body.length > MAX_ROWS) {
    throw new CsvError(
      `Too many rows (${body.length}). Redline handles up to ${MAX_ROWS} for review.`,
    );
  }

  const rows: Row[] = body.map((record, index) => {
    const cells: Record<string, string> = {};
    columns.forEach((column, position) => {
      cells[column] = (record[position] ?? "").trim();
    });
    return { id: `r${index + 1}`, cells };
  });

  return { columns, rows };
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(sheet: Sheet): string {
  const lines = [sheet.columns.map(quote).join(",")];
  for (const row of sheet.rows) {
    lines.push(sheet.columns.map((column) => quote(row.cells[column] ?? "")).join(","));
  }
  return lines.join("\n");
}
