import assert from "node:assert/strict";
import test from "node:test";

import { CsvError, MAX_ROWS, parseCsv, toCsv } from "../csv.ts";

test("parses a header and rows with stable ids", () => {
  const sheet = parseCsv("name,phone\nada,555\nalan,556\n");
  assert.deepEqual(sheet.columns, ["name", "phone"]);
  assert.deepEqual(
    sheet.rows.map((row) => row.id),
    ["r1", "r2"],
  );
  assert.equal(sheet.rows[0].cells.name, "ada");
});

test("honours quoted commas, escaped quotes and embedded newlines", () => {
  const sheet = parseCsv('name,note\n"Lovelace, Ada","said ""hi""\nthen left"\n');
  assert.equal(sheet.rows[0].cells.name, "Lovelace, Ada");
  assert.equal(sheet.rows[0].cells.note, 'said "hi"\nthen left');
});

test("treats CRLF as a single record break", () => {
  const sheet = parseCsv("a,b\r\n1,2\r\n");
  assert.equal(sheet.rows.length, 1);
});

test("pads short records and fills blank header names", () => {
  const sheet = parseCsv("name,,phone\nada\n");
  assert.deepEqual(sheet.columns, ["name", "column_2", "phone"]);
  assert.equal(sheet.rows[0].cells.phone, "");
});

test("disambiguates duplicate column names", () => {
  const sheet = parseCsv("name,name\na,b\n");
  assert.deepEqual(sheet.columns, ["name", "name_2"]);
});

test("rejects empty input, headerless data and oversized files", () => {
  assert.throws(() => parseCsv("   "), CsvError);
  assert.throws(() => parseCsv("name,phone\n"), /no data rows/);
  const big = ["a", ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => String(i))].join("\n");
  assert.throws(() => parseCsv(big), /Too many rows/);
});

test("rejects an unterminated quoted field instead of guessing", () => {
  assert.throws(() => parseCsv('name\n"unclosed\n'), /Unterminated/);
});

test("round-trips values that need quoting", () => {
  const original = 'name,note\n"Lovelace, Ada","said ""hi"""\n';
  assert.deepEqual(parseCsv(toCsv(parseCsv(original))), parseCsv(original));
});
