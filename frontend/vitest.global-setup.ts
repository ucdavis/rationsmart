import type { TestProject } from "vitest/node";
import { LABEL_SHEET_PATH, readLabelSheet } from "./src/lib/ui-labels-sheet.mjs";

type LabelSheet = Awaited<ReturnType<typeof readLabelSheet>>;

declare module "vitest" {
  export interface ProvidedContext {
    uiLabelSheet: LabelSheet;
  }
}

// Parse src/lib/data/ui-labels.xlsx ONCE per run, before any test starts, and
// hand it to every test file (vitest.setup.ts answers /api/ui-labels/<code>
// from it). Parsing it inside each file made the first non-English test wait
// for exceljs, which on a busy CI runner took longer than findBy*'s timeout.
export default async function setup(project: TestProject) {
  project.provide("uiLabelSheet", await readLabelSheet(LABEL_SHEET_PATH));
}
