// Reads the ANTLR grammars so generators do not each re-parse them.
//
// Everything published about the language — the prose reference, the machine
// manifest — is derived from these two files, so a grammar edit cannot leave a
// published artifact behind. Generators call `checkOrWrite` to get the same
// write/--check behaviour.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** Split on `|` at paren depth 0, outside single-quoted literals. */
export function splitAlternatives(body) {
  const alts = [];
  let depth = 0, inQuote = false, cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inQuote) {
      cur += c;
      if (c === "\\") { cur += body[++i] ?? ""; continue; }
      if (c === "'") inQuote = false;
      continue;
    }
    if (c === "'") { inQuote = true; cur += c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "|" && depth === 0) { alts.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) alts.push(cur.trim());
  return alts;
}

/**
 * ForgeLexer.g4 -> Map(tokenName -> {literals, hidden, body, index}).
 *
 * `literals` is null for a pattern token (one whose alternatives are not all
 * bare literals); `body` keeps the raw right-hand side for those. `index` is
 * the declaration position, which decides ties: ANTLR takes the longest match
 * and breaks a tie in favour of the rule declared first.
 */
export function parseLexerGrammar(src) {
  const tokens = new Map();
  for (const line of src.split("\n")) {
    const m = line.match(/^([A-Z][A-Z_0-9]*)\s*:\s*(.*?);\s*(\/\/.*)?$/);
    if (!m) continue;
    const [, name, rawBody] = m;
    const hidden = /->\s*(skip|channel)/.test(rawBody);
    const body = rawBody.replace(/->\s*(skip|channel\(\w+\))\s*$/, "").trim();
    const parts = splitAlternatives(body);
    const literals = [];
    let pure = parts.length > 0;
    for (const p of parts) {
      const lm = p.match(/^'((?:[^'\\]|\\.)*)'$/);
      if (lm) literals.push(lm[1].replace(/\\(.)/g, "$1"));
      else pure = false;
    }
    tokens.set(name, { literals: pure ? literals : null, hidden, body, index: tokens.size });
  }
  return tokens;
}

/** Forge.g4 -> Map(ruleName -> alternatives[]), in file order. */
export function parseParserGrammar(src) {
  const stripped = src.replace(/\/\/[^\n]*/g, "");
  const rules = new Map();
  for (const m of stripped.matchAll(/([a-zA-Z_]\w*)\s*:\s*([^;]+);/g)) {
    const [, name, body] = m;
    if (name === "grammar" || name === "options") continue;
    rules.set(name, splitAlternatives(body.replace(/\s+/g, " ").trim()));
  }
  return rules;
}

export const TOKENS = parseLexerGrammar(read("src/forge-antlr/ForgeLexer.g4"));
export const RULES = parseParserGrammar(read("src/forge-antlr/Forge.g4"));

/** Every literal spelling in the lexer, mapped to its declaring token. */
export function literalSpellings() {
  const byLiteral = new Map();
  for (const [name, tok] of TOKENS) {
    for (const lit of tok.literals ?? []) {
      if (!byLiteral.has(lit)) byLiteral.set(lit, name);
    }
  }
  return byLiteral;
}

/** IDENTIFIER_TOK's `[head] [rest]*` character classes. */
export function bareIdentifier() {
  const { body } = TOKENS.get("IDENTIFIER_TOK");
  const m = body.match(/^\[((?:[^\]\\]|\\.)*)\]\s*\[((?:[^\]\\]|\\.)*)\]\*$/);
  if (!m) throw new Error(`IDENTIFIER_TOK is no longer 'head-set rest-set*': ${body}`);
  return { head: parseCharSet(m[1]), rest: parseCharSet(m[2]), minLength: 1 };
}

/** True when `s` is drawn from the bare character classes. */
export function matchesBareIdentifier(s) {
  const { head, rest, minLength } = bareIdentifier();
  const inClass = ({ ranges, chars }, c) =>
    chars.includes(c) || ranges.some(([lo, hi]) => c >= lo && c <= hi);
  return s.length >= minLength &&
    inClass(head, s[0]) &&
    [...s.slice(1)].every((c) => inClass(rest, c));
}

/**
 * Every spelling a bare name cannot carry, which is what `FORGE_RESERVED_KEYWORDS`
 * holds. A literal that matches the identifier pattern is claimed by its own token
 * exactly when that token is declared before IDENTIFIER_TOK, so `/` is reserved
 * (SLASH_TOK precedes it) and `//` is not (CCOMMENT follows it).
 */
export function reservedKeywords() {
  const identifierIndex = TOKENS.get("IDENTIFIER_TOK").index;
  const words = new Set();
  for (const [lit, token] of literalSpellings()) {
    if (matchesBareIdentifier(lit) && TOKENS.get(token).index < identifierIndex) words.add(lit);
  }
  return words;
}

/**
 * Parse an ANTLR character set body (the text between `[` and `]`) into
 * ranges and single characters, keeping source order.
 */
export function parseCharSet(body) {
  const ranges = [], chars = [];
  const next = (i) => (body[i] === "\\" ? [body[i + 1], i + 2] : [body[i], i + 1]);
  let i = 0;
  while (i < body.length) {
    const [c, after] = next(i);
    if (body[after] === "-" && after + 1 < body.length) {
      const [hi, end] = next(after + 1);
      ranges.push([c, hi]);
      i = end;
    } else {
      chars.push(c);
      i = after;
    }
  }
  return { ranges, chars };
}

/** Write `content` to `path`, or (with --check) fail when it is stale. */
export function checkOrWrite(path, content) {
  const full = join(ROOT, path);
  const rel = relative(ROOT, full);
  if (process.argv.includes("--check")) {
    let existing = null;
    try {
      existing = readFileSync(full, "utf8");
    } catch {
      // fall through: a missing file is stale
    }
    if (existing !== content) {
      console.error(`${rel} is stale. Regenerate with: npm run docs`);
      process.exit(1);
    }
    console.log(`${rel} is up to date.`);
  } else {
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    console.log(`Wrote ${rel}`);
  }
}
