#!/usr/bin/env node
// UI-label translation gate — rules in CLAUDE.md §21.
//
//   npm run i18n:check                       code ↔ dictionaries (CI runs this)
//   npm run i18n:sheet -- <sheet.csv>        sheet ↔ dictionaries report
//        [--apply]                           copy the sheet's wording into the dictionaries
//        [--missing <out.csv>]               write rows for labels the sheet lacks
//
// <sheet.csv> is the "All Strings" tab of RationSmart_Multilingual_Labels.xlsx
// (Drive) downloaded as CSV. The sheet is the reviewed source of truth for
// wording; the dictionaries in src/lib/data/ui-labels/ are what the app loads.
//
// What `check` enforces:
//   1. Every string that reaches t() / showSnackbar() — literals, constants,
//      label maps and label/title/... properties — exists in all 9 dictionaries.
//   2. Every dictionary has the same keys, no empty values, and each
//      translation keeps its ${placeholders} (only the English plural ${s} may
//      be dropped).
//   3. No visible JSX text or display-prop literal bypasses t().

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const DICT_DIR = path.join(ROOT, "src/lib/data/ui-labels");
const LANGS = ["hi", "tl", "id", "th", "vi", "bn", "ne", "am", "om"];

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
const SLOT = /\$\{[\w.]+\}/g;

// ── shared helpers ────────────────────────────────────────────────────────────
const slots = (s) => (s.match(SLOT) ?? []).sort();
const sameSlots = (en, tr) => {
  const want = slots(en), got = slots(tr);
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  return eq(want, got) || eq(want.filter((x) => x !== "${s}"), got);
};
const norm = (s) => String(s ?? "").replace(/[ \t]*\n[ \t]*/g, "\n").trim();
const readDicts = () =>
  Object.fromEntries(LANGS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(DICT_DIR, `${l}.json`), "utf8"))]));
const writeDict = (l, d) => fs.writeFileSync(path.join(DICT_DIR, `${l}.json`), JSON.stringify(d, null, 2) + "\n");
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
function check() {
  const dicts = readDicts();
  const { labels, bypass } = scanSource();
  const problems = [];
  const allKeys = new Set(LANGS.flatMap((l) => Object.keys(dicts[l])));
  for (const [k, locs] of labels) {
    const miss = LANGS.filter((l) => !(k in dicts[l]));
    if (miss.length) problems.push(`missing in ${miss.length === LANGS.length ? "ALL languages" : miss.join(",")}: ${JSON.stringify(k)}  (${locs[0]})`);
  }
  for (const k of allKeys)
    for (const l of LANGS) {
      const v = dicts[l][k];
      if (v === undefined) problems.push(`${l}.json lacks key present in other dictionaries: ${JSON.stringify(k)}`);
      else if (!v.trim()) problems.push(`${l}.json has an empty value: ${JSON.stringify(k)}`);
      else if (!sameSlots(k, v)) problems.push(`${l}.json placeholders differ from English: ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
    }
  for (const b of bypass) problems.push(`not translated (bypasses t()): ${b}`);

  console.log(`i18n: ${labels.size} labels in code, ${allKeys.size} dictionary keys × ${LANGS.length} languages`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    console.error("\nFix: wrap text in t(), add the label + translations to every file in src/lib/data/ui-labels/ and to the Drive sheet (CLAUDE.md §21).");
    process.exit(1);
  }
  console.log("i18n: OK");
}

// ── sheet mode ────────────────────────────────────────────────────────────────
const SHEET_LANG = { Hindi: "hi", Filipino: "tl", Indonesian: "id", Thai: "th", Vietnamese: "vi", Bengali: "bn", Nepali: "ne", Amharic: "am", Oromo: "om", Tigrigna: "ti", French: "fr", Arabic: "ar" };

function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const csvCell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

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

function sheet(csvPath, { apply, missingOut }) {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows[0];
  const enCol = header.findIndex((h) => /^Source \(English\)/.test(h));
  if (enCol < 0) throw new Error(`No "Source (English)" column in ${csvPath}`);
  const cols = {};
  header.forEach((h, i) => { const name = Object.keys(SHEET_LANG).find((n) => h.startsWith(n)); if (name) cols[SHEET_LANG[name]] = i; });

  const dicts = readDicts();
  const byNorm = new Map(Object.keys(dicts.hi).map((k) => [norm(k), k]));
  const sheetKeys = new Set();
  const diffs = Object.fromEntries(LANGS.map((l) => [l, 0]));
  const badCells = [];
  let applied = 0;
  rows.slice(1).forEach((r, idx) => {
    const en = norm(r[enCol]);
    if (!en) return;
    sheetKeys.add(en);
    const key = byNorm.get(en);
    if (!key) return;
    const lead = key.match(/^\s*/)[0], trail = key.match(/\s*$/)[0];
    for (const l of LANGS) {
      let v = norm(r[cols[l]]);
      if (!v) continue;
      if (!sameSlots(key, v)) {
        // Reviewers sometimes translate the slot names (${min} → ${नयुनतम}): restore them in order.
        const got = v.match(/\$\{[^}]*\}/g) ?? [], want = key.match(SLOT) ?? [];
        if (want.length && got.length === want.length) { let i = 0; v = v.replace(/\$\{[^}]*\}/g, () => want[i++]); }
        else { badCells.push(`row ${idx + 2} ${l}: ${JSON.stringify(key)} → ${JSON.stringify(v)}`); continue; }
      }
      if (!key.includes("\n")) v = v.replace(/\n/g, " ");
      const nv = lead + v + trail;
      if (dicts[l][key] !== nv) { diffs[l]++; if (apply) { dicts[l][key] = nv; applied++; } }
    }
  });
  if (apply) LANGS.forEach((l) => writeDict(l, dicts[l]));

  const { labels } = scanSource();
  const missing = [...labels.keys()].filter((k) => !sheetKeys.has(norm(k)));
  console.log(`sheet: ${sheetKeys.size} strings · app labels missing from sheet: ${missing.length}`);
  console.log(`cells where sheet ≠ app: ${JSON.stringify(diffs)}${apply ? ` → applied ${applied}` : " (run with --apply to take the sheet's wording)"}`);
  if (badCells.length) console.log(`\nsheet cells with broken placeholders (app keeps its own text — fix in the sheet):\n  ${badCells.join("\n  ")}`);
  if (missingOut) {
    const order = Object.entries(cols).sort((a, b) => a[1] - b[1]);
    const width = Math.max(header.length, ...order.map(([, i]) => i + 1));
    const lines = missing.map((k) => {
      const cells = Array(width).fill("");
      cells[0] = [...new Set(labels.get(k).map(screenOf))].join(" | ");
      cells[enCol] = k;
      for (const [l, i] of order) cells[i] = dicts[l]?.[k] ?? "";
      return cells.map(csvCell).join(",");
    });
    fs.writeFileSync(missingOut, [header.map(csvCell).join(","), ...lines].join("\n") + "\n");
    console.log(`\nwrote ${missing.length} row(s) to ${missingOut} — Tigrigna/French/Arabic columns are blank and still need translating.`);
  } else if (missing.length) {
    console.log(`\nadd these to the sheet (or rerun with --missing <out.csv>):\n  ${missing.slice(0, 40).map((k) => JSON.stringify(k)).join("\n  ")}${missing.length > 40 ? `\n  … ${missing.length - 40} more` : ""}`);
  }
  if (missing.length || badCells.length) process.exitCode = 1;
}

// ── entry ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args[0] === "--sheet") {
  const csv = args[1];
  if (!csv) { console.error("usage: npm run i18n:sheet -- <sheet.csv> [--apply] [--missing <out.csv>]"); process.exit(2); }
  const mi = args.indexOf("--missing");
  sheet(csv, { apply: args.includes("--apply"), missingOut: mi > 0 ? args[mi + 1] : null });
} else {
  check();
}
