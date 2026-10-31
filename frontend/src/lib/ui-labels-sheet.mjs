// UI-label spreadsheet reader — rules in CLAUDE.md §21.
//
// src/lib/data/ui-labels.xlsx, first worksheet:
//   column A    the English text exactly as the code passes it to t()
//   B, C, …     one column per language; the header ends in its code —
//               "Hindi (hi)". Adding a column with a code adds a language.
//   no code     ("Screen(s)", "Tigrigna" while it's being translated) — notes,
//               never served.
//
// Shared by the server route that serves each language
// (src/app/api/ui-labels/[lang]/route.ts), `npm run i18n:check` and the test
// setup, so all three read the sheet the same way. Plain .mjs so the Node
// check script can import it without a TypeScript loader. Server-side only:
// exceljs must never reach the browser bundle.

import ExcelJS from "exceljs";

export const LABEL_SHEET_PATH = "src/lib/data/ui-labels.xlsx";

const CODE_IN_HEADER = /\(([a-z]{2,3})\)\s*$/;
const SLOT = /\$\{[\w.]+\}/g;

/** A language code the sheet can declare — and the only shape the route serves. */
export const isLabelLangCode = (/** @type {string} */ code) => /^[a-z]{2,3}$/.test(code);

/**
 * Plain text of a cell, whatever Excel stored: a number someone typed, rich
 * text, a formula's cached result or a hyperlink.
 * @param {unknown} value
 * @returns {string}
 */
export function cellText(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (value instanceof Date) return value.toISOString();
  const v = /** @type {Record<string, unknown>} */ (value);
  if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
  if (typeof v.text === "string") return v.text;
  if ("result" in v) return cellText(v.result);
  return "";
}

/**
 * A translation must keep the English text's ${slots}; only the English
 * plural ${s} may be dropped.
 * @param {string} en
 * @param {string} translated
 */
export function placeholdersMatch(en, translated) {
  const want = (en.match(SLOT) ?? []).sort();
  const got = (translated.match(SLOT) ?? []).sort();
  const eq = (/** @type {string[]} */ a, /** @type {string[]} */ b) =>
    a.length === b.length && a.every((x, i) => x === b[i]);
  return eq(want, got) || eq(want.filter((x) => x !== "${s}"), got);
}

/**
 * @typedef {{ code: string, name: string, column: number }} SheetLanguage
 * @typedef {{ line: number, en: string, cells: Record<string, string> }} SheetRow
 * @typedef {{ languages: SheetLanguage[], rows: SheetRow[] }} LabelSheet
 */

/**
 * @param {string | ArrayBuffer} source  file path, or the file's bytes
 * @returns {Promise<LabelSheet>}
 */
export async function readLabelSheet(source) {
  const wb = new ExcelJS.Workbook();
  if (typeof source === "string") await wb.xlsx.readFile(source);
  else await wb.xlsx.load(source);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("UI-label sheet has no worksheet");

  /** @type {SheetLanguage[]} */
  const languages = [];
  ws.getRow(1).eachCell((cell, column) => {
    if (column === 1) return;
    const name = cellText(cell.value).trim();
    const code = CODE_IN_HEADER.exec(name)?.[1];
    if (code) languages.push({ code, name, column });
  });

  /** @type {SheetRow[]} */
  const rows = [];
  for (let line = 2; line <= ws.rowCount; line++) {
    const row = ws.getRow(line);
    const en = cellText(row.getCell(1).value);
    if (!en.trim()) continue;
    /** @type {Record<string, string>} */
    const cells = {};
    for (const { code, column } of languages) cells[code] = cellText(row.getCell(column).value);
    rows.push({ line, en, cells });
  }
  return { languages, rows };
}

/**
 * One language's { English: translation } map. A blank cell, or one whose
 * ${placeholders} don't match, is left out so that label stays in English —
 * a sentence with a missing value is worse than an untranslated one.
 * `npm run i18n:check` fails on both, so they only reach users if CI is skipped.
 * @param {LabelSheet} sheet
 * @param {string} code
 * @returns {Record<string, string>}
 */
export function dictionaryFor(sheet, code) {
  /** @type {Record<string, string>} */
  const dict = {};
  for (const { en, cells } of sheet.rows) {
    const value = cells[code];
    if (value && value.trim() && placeholdersMatch(en, value)) dict[en] = value;
  }
  return dict;
}
