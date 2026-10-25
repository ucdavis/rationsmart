// @vitest-environment node
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  cellText,
  dictionaryFor,
  placeholdersMatch,
  readLabelSheet,
} from "@/lib/ui-labels-sheet.mjs";

async function workbook(rows: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("UI labels");
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe("readLabelSheet", () => {
  it("treats every header ending in (code) as a language and ignores the rest", async () => {
    const sheet = await readLabelSheet(
      await workbook([
        ["English", "Hindi (hi)", "Tigrigna", "Thai (th)", "Screen(s)"],
        ["Continue", "जारी रखें", "ቀጽል", "ดำเนินการต่อ", "Welcome"],
      ])
    );
    expect(sheet.languages.map((l) => [l.code, l.name])).toEqual([
      ["hi", "Hindi (hi)"],
      ["th", "Thai (th)"],
    ]);
    expect(sheet.rows).toEqual([
      { line: 2, en: "Continue", cells: { hi: "जारी रखें", th: "ดำเนินการต่อ" } },
    ]);
  });

  it("skips rows with no English and keeps English text exactly, whitespace included", async () => {
    const sheet = await readLabelSheet(
      await workbook([
        ["English", "Hindi (hi)"],
        ["", "x"],
        ["Smart feeding.\n Maximum yield.", "y"],
      ])
    );
    expect(sheet.rows.map((r) => r.en)).toEqual(["Smart feeding.\n Maximum yield."]);
  });
});

describe("dictionaryFor", () => {
  it("leaves out blank cells and cells whose placeholders don't match, so they stay English", async () => {
    const sheet = await readLabelSheet(
      await workbook([
        ["English", "Hindi (hi)"],
        ["Continue", "जारी रखें"],
        ["Missing", ""],
        ["Range ${min} – ${max}", "सीमा"],
        ["Exported ${count} record${s}.", "${count} रिकॉर्ड निर्यात किए गए।"],
        ["1.5", 1.5],
      ])
    );
    expect(dictionaryFor(sheet, "hi")).toEqual({
      Continue: "जारी रखें",
      "Exported ${count} record${s}.": "${count} रिकॉर्ड निर्यात किए गए।",
      "1.5": "1.5",
    });
    expect(dictionaryFor(sheet, "th")).toEqual({});
  });
});

describe("cellText / placeholdersMatch", () => {
  it("reads rich text, formula results and hyperlinks as plain text", () => {
    expect(cellText({ richText: [{ text: "Save " }, { text: "Report" }] })).toBe("Save Report");
    expect(cellText({ formula: "A1", result: "x" })).toBe("x");
    expect(cellText({ text: "Help", hyperlink: "https://x" })).toBe("Help");
    expect(cellText(null)).toBe("");
    expect(cellText(true)).toBe("true");
  });

  it("allows only the English plural ${s} to be dropped", () => {
    expect(placeholdersMatch("${a} and ${b}", "${b} y ${a}")).toBe(true);
    expect(placeholdersMatch("${n} item${s}", "${n} आइटम")).toBe(true);
    expect(placeholdersMatch("${n} item", "आइटम")).toBe(false);
  });
});
