#!/usr/bin/env node
// UI-label translation gate — rules in CLAUDE.md §21.
//
//   npm run i18n:check                       code ↔ spreadsheet (CI runs this)
//   npm run i18n:check -- --add-missing      append a row for every label the
//                                            code uses but the sheet lacks
//                                            (English + screen filled; the
//                                            translations are left for you)
//
// The spreadsheet is src/lib/data/ui-labels.xlsx: column A is the English
// text, then one column per language whose header ends in its code —
// "Hindi (hi)". The app serves exactly those columns (/api/ui-labels/<code>).
//
// What `check` enforces:
//   1. Every string that reaches t() / showSnackbar() — literals, constants,
//      label maps and label/title/... properties — has a row in the sheet.
//   2. Every language column has a translation in every row, and each keeps
//      its ${placeholders} (only the English plural ${s} may be dropped).
//      No English text appears twice.
//   3. No visible JSX text or display-prop literal bypasses t().

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import ExcelJS from "exceljs";
import { LABEL_SHEET_PATH, cellText, placeholdersMatch, readLabelSheet } from "../src/lib/ui-labels-sheet.mjs";

const ROOT = process.cwd();
const SHEET = path.join(ROOT, LABEL_SHEET_PATH);

// Deliberately English in every language: units, codes, protocol tokens.
const KEEP_ENGLISH = new Set([
  "Kg", "kg", "°C", "km", "L", "CSV", "X-API-Key", "Bearer", "RationSmart", "DigitalGreen",
  "https://api.example.com/feed-library",
]);
// Object properties whose string values reach t() indirectly (t(item.label) …).
const LABEL_PROPS = new Set(["label", "title", "badge", "content", "statusText", "message"]);
// JSX attributes that never hold user-visible text.
const NON_VISIBLE_ATTRS = new Set([
  "className", "style", "href", "key", "id", "type", "role", "src", "accept", "autoComplete",
  "autoCapitalize", "inputMode", "htmlFor", "name", "target", "rel", "viewBox", "d", "fill",
  "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "transform", "xmlns", "method",
  "pattern", "mode", "variant", "size", "value", "width", "height", "aria-hidden", "aria-live",
  "aria-modal", "aria-labelledby", "aria-describedby", "aria-controls", "data-testid",
  "enterKeyHint", "fillRule", "clipRule", "loading", "decoding", "direction", "icon", "color",
  "tone", "kind", "status", "as", "download", "lang", "dir", "spellCheck", "strategy",
]);
// The only aria-* attributes a screen reader reads out (the rest are states).
const SPOKEN_ARIA = new Set(["aria-label", "aria-valuetext", "aria-placeholder", "aria-roledescription"]);
const TRANSLATING_CALLS = /^(t|fillText|fillTemplate|getUiLabel|labelForLanguage|current)$/;

// ── shared helpers ────────────────────────────────────────────────────────────
const hasWords = (s) => {
  const words = s.replace(/\$\{[^}]*\}/g, " ").match(/[A-Za-z]{3,}/g) ?? [];
  // ALL-CAPS tokens (HTTP, UTC) and brand names don't need translating.
  return words.some((w) => !/^[A-Z]{2,6}$/.test(w) && !KEEP_ENGLISH.has(w));
};

// ── source scan ───────────────────────────────────────────────────────────────
function scanSource() {
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(ROOT, "tsconfig.json"), ts.sys.readFile).config, ts.sys, ROOT);
  const program = ts.createProgram(cfg.fileNames, cfg.options);
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles().filter((sf) => {
    const f = sf.fileName;
    return f.startsWith(path.join(ROOT, "src")) && !/__tests__|\.test\./.test(f) && !f.endsWith(".d.ts");
  });
  const where = (sf, node) => `${path.relative(ROOT, sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
  const labels = new Map();
  const add = (k, loc) => {
    if (!/[A-Za-z]/.test(k) || KEEP_ENGLISH.has(k)) return;
    if (!labels.has(k)) labels.set(k, []);
    labels.get(k).push(loc);
  };
  const bypass = [];

  const unwrap = (e) => {
    while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression?.(e))) e = e.expression;
    return e;
  };
  const objectInit = (expr) => {
    expr = unwrap(expr);
    if (!ts.isIdentifier(expr)) return null;
    let sym = checker.getSymbolAtLocation(expr);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    const decl = sym?.valueDeclaration;
    const init = decl && ts.isVariableDeclaration(decl) ? unwrap(decl.initializer) : null;
    return init && ts.isObjectLiteralExpression(init) ? init : null;
  };
  // Every string literal an expression can evaluate to, or null if unknown.
  const literals = (expr, depth = 0) => {
    expr = unwrap(expr);
    if (!expr || depth > 6) return null;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
    if (ts.isConditionalExpression(expr)) {
      const a = literals(expr.whenTrue, depth + 1), b = literals(expr.whenFalse, depth + 1);
      return a && b ? [...a, ...b] : null;
    }
    if (ts.isBinaryExpression(expr) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(expr.operatorToken.kind))
      return literals(expr.left, depth + 1);
    const type = checker.getTypeAtLocation(expr);
    const parts = type.isUnion() ? type.types : [type];
    if (parts.every((p) => p.isStringLiteral() || p.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null))) {
      const out = parts.filter((p) => p.isStringLiteral()).map((p) => p.value);
      if (out.length) return out;
    }
    if (ts.isIdentifier(expr)) {
      const decl = checker.getSymbolAtLocation(expr)?.valueDeclaration;
      if (decl && ts.isVariableDeclaration(decl) && decl.initializer) return literals(decl.initializer, depth + 1);
    }
    if (ts.isElementAccessExpression(expr)) {
      const obj = objectInit(expr.expression);
      if (obj) return obj.properties.flatMap((p) => (ts.isPropertyAssignment(p) ? literals(p.initializer, depth + 1) ?? [] : []));
    }
    return null;
  };
  const calleeName = (node) => {
    const e = node.expression;
    return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "";
  };

  for (const sf of files) {
    const visit = (node, ctx) => {
      let c = ctx;
      if (ts.isCallExpression(node)) {
        const name = calleeName(node);
        if ((name === "t" || name === "showSnackbar" || (name === "current" && /^t/.test(node.expression.expression?.getText(sf) ?? ""))) && node.arguments[0]) {
          literals(node.arguments[0])?.forEach((k) => add(k, where(sf, node.arguments[0])));
          if (name === "showSnackbar" && ts.isTemplateExpression(unwrap(node.arguments[0])))
            bypass.push(`${where(sf, node)}  showSnackbar(\`…\`) — pre-filled template can't be translated; use fillText(t("…\${x}…"), …)`);
        }
        c = { ...c, inT: c.inT || TRANSLATING_CALLS.test(name), inCall: true };
      }
      if (ts.isPropertyAssignment(node) && LABEL_PROPS.has(node.name.getText(sf)))
        literals(node.initializer)?.forEach((k) => add(k, where(sf, node)));
      if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && /^(script|Script|style)$/.test((ts.isJsxElement(node) ? node.openingElement : node).tagName.getText(sf)))
        return;
      if (ts.isJsxAttribute(node)) c = { ...c, attr: node.name.getText(sf) };
      if (ts.isJsxExpression(node)) c = { ...c, inJsx: true };
      if (ts.isElementAccessExpression(node) || (ts.isBinaryExpression(node) && /^[!=]==?$/.test(node.operatorToken.getText(sf)))) c = { ...c, inCmp: true };

      const visibleAttr =
        !c.attr ||
        (!NON_VISIBLE_ATTRS.has(c.attr) && (!c.attr.startsWith("aria-") || SPOKEN_ARIA.has(c.attr)));
      if (ts.isJsxText(node) && hasWords(node.text) && !c.inT)
        bypass.push(`${where(sf, node)}  text ${JSON.stringify(node.text.replace(/\s+/g, " ").trim())}`);
      if (ts.isJsxAttribute(node) && visibleAttr && node.initializer && ts.isStringLiteral(node.initializer) && hasWords(node.initializer.text))
        bypass.push(`${where(sf, node)}  ${c.attr}=${JSON.stringify(node.initializer.text)}`);
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
          c.inJsx && !c.inT && !c.inCall && !c.inCmp && visibleAttr && hasWords(node.getText(sf)))
        bypass.push(`${where(sf, node)}  ${c.attr ?? "child"} ${node.getText(sf).slice(0, 80)}`);
      ts.forEachChild(node, (ch) => visit(ch, c));
    };
    visit(sf, {});
  }
  return { labels, bypass };
}

// ── check mode ────────────────────────────────────────────────────────────────
async function check() {
  const sheet = await readLabelSheet(SHEET);
  const { labels, bypass } = scanSource();
  const problems = [];
  const langs = sheet.languages.map((l) => l.code);
  if (!langs.length) problems.push(`${LABEL_SHEET_PATH}: no language columns — headers need a code, e.g. "Hindi (hi)"`);
  const seen = new Set(langs);
  if (seen.size !== langs.length) problems.push(`${LABEL_SHEET_PATH}: a language code appears in two column headers`);

  const rowOf = new Map();
  for (const row of sheet.rows) {
    if (rowOf.has(row.en)) problems.push(`row ${row.line} repeats the English text of row ${rowOf.get(row.en).line}: ${JSON.stringify(row.en)}`);
    else rowOf.set(row.en, row);
    for (const code of langs) {
      const v = row.cells[code];
      if (!v.trim()) problems.push(`row ${row.line} ${code}: no translation for ${JSON.stringify(row.en)}`);
      else if (!placeholdersMatch(row.en, v)) problems.push(`row ${row.line} ${code}: placeholders differ from English: ${JSON.stringify(row.en)} → ${JSON.stringify(v)}`);
    }
  }
  const missing = [...labels.keys()].filter((k) => !rowOf.has(k));
  for (const k of missing) problems.push(`not in the sheet: ${JSON.stringify(k)}  (${labels.get(k)[0]})`);
  for (const b of bypass) problems.push(`not translated (bypasses t()): ${b}`);

  console.log(`i18n: ${labels.size} labels in code, ${sheet.rows.length} sheet rows × ${langs.length} languages (${langs.join(", ")})`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    console.error(
      `\nFix: wrap text in t(), and give every label a row in ${LABEL_SHEET_PATH} with all language columns filled (CLAUDE.md §21).` +
        (missing.length ? `\n     npm run i18n:check -- --add-missing appends the ${missing.length} missing row(s).` : "")
    );
    process.exit(1);
  }
  console.log("i18n: OK");
}

// ── add-missing mode ──────────────────────────────────────────────────────────
function screenOf(loc) {
  const p = loc.split(":")[0];
  const named = { "cattle-info": "Animal Inputs", "feed-selection": "Feed Selection", report: "Report", reports: "Saved Reports", profile: "Profile", feedback: "Feedback", "calf-plan": "Calf Plan", login: "Login", register: "Register", "forgot-pin": "Forgot PIN", "set-new-pin": "Set New PIN", "verify-email": "Verify Email", welcome: "Welcome", terms: "Terms", help: "Help", "feed-row": "Component: FeedRow" };
  const admin = (s) => (s && !s.includes(".") ? "Admin " + s.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "Admin Landing");
  let m;
  if ((m = p.match(/src\/(?:app\/\(main\)|components)\/admin\/?([^/]*)/))) return admin(m[1]);
  if ((m = p.match(/src\/(?:app\/(?:\(main\)\/)?|components\/)([^/]+)\//)) && named[m[1]]) return named[m[1]];
  if ((m = p.match(/src\/components\/(?:ui\/)?([^/.]+)\.tsx?$/))) return "Component: " + m[1];
  return "Constants";
}

async function addMissing() {
  const sheet = await readLabelSheet(SHEET);
  const have = new Set(sheet.rows.map((r) => r.en));
  const { labels } = scanSource();
  const missing = [...labels.keys()].filter((k) => !have.has(k));
  if (!missing.length) return console.log("i18n: every label already has a row");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SHEET);
  const ws = wb.worksheets[0];
  let screenCol = 0;
  ws.getRow(1).eachCell((cell, col) => { if (/^screen/i.test(cellText(cell.value).trim())) screenCol = col; });
  for (const k of missing) {
    const row = ws.addRow([]);
    row.getCell(1).value = k;
    if (screenCol) row.getCell(screenCol).value = [...new Set(labels.get(k).map(screenOf))].join(" | ");
  }
  await wb.xlsx.writeFile(SHEET);
  console.log(`i18n: appended ${missing.length} row(s) to ${LABEL_SHEET_PATH} — fill in every language column:\n  ${missing.map((k) => JSON.stringify(k)).join("\n  ")}`);
}

// ── entry ─────────────────────────────────────────────────────────────────────
await (process.argv.includes("--add-missing") ? addMissing() : check());
