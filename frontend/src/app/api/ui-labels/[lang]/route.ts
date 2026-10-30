import path from "node:path";
import { NextResponse } from "next/server";
import {
  LABEL_SHEET_PATH,
  dictionaryFor,
  isLabelLangCode,
  readLabelSheet,
  type LabelSheet,
} from "@/lib/ui-labels-sheet.mjs";

// GET /api/ui-labels/<code> — the { English: translation } map for one
// language column of src/lib/data/ui-labels.xlsx (CLAUDE.md §21).
//
// Built at deploy time: `next build` reads the spreadsheet on the server and
// writes one static JSON file per language column, so the browser never
// downloads the spreadsheet or a parser, and the CDN serves each language.
// A new column is a new language on the next deploy; a code with no column
// is a 404 and the app stays in English.
export const dynamic = "force-static";
export const dynamicParams = false;

let sheet: Promise<LabelSheet> | undefined;
function labelSheet(): Promise<LabelSheet> {
  sheet ??= readLabelSheet(path.join(process.cwd(), LABEL_SHEET_PATH));
  return sheet;
}

export async function generateStaticParams() {
  const { languages } = await labelSheet();
  return languages.map(({ code }) => ({ lang: code }));
}

export async function GET(_req: Request, { params }: { params: { lang: string } }) {
  const s = await labelSheet();
  if (!isLabelLangCode(params.lang) || !s.languages.some((l) => l.code === params.lang)) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  return NextResponse.json(dictionaryFor(s, params.lang));
}
