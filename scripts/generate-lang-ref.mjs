#!/usr/bin/env node
// Generates LANGUAGE.md — the language reference — from the ANTLR grammars.
//
//   node scripts/generate-lang-ref.mjs           # (re)write LANGUAGE.md
//   node scripts/generate-lang-ref.mjs --check   # exit 1 if LANGUAGE.md is stale
//
// The *structure* of the language (tokens, operators, precedence, grammar
// rules) is read from src/forge-antlr/ForgeLexer.g4 and Forge.g4, so the
// reference cannot drift from the grammar. The *meaning* of each construct
// lives in the SEMANTICS table below, keyed by the normalized shape of the
// grammar alternative it documents. Adding a construct to the grammar without
// documenting it here makes generation FAIL — that is deliberate; it is the
// same keep-in-sync convention the static analyzer follows for the evaluator.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "LANGUAGE.md");

const lexerSrc = readFileSync(join(ROOT, "src/forge-antlr/ForgeLexer.g4"), "utf8");
const parserSrc = readFileSync(join(ROOT, "src/forge-antlr/Forge.g4"), "utf8");
const evaluatorSrc = readFileSync(join(ROOT, "src/ForgeExprEvaluator.ts"), "utf8");
const utilsSrc = readFileSync(join(ROOT, "src/forge-antlr/utils.ts"), "utf8");

// --------------------------------------------------------------------------
// Grammar parsing
// --------------------------------------------------------------------------

/** Split on `|` at paren depth 0, outside single-quoted literals. */
function splitAlternatives(body) {
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

/** ForgeLexer.g4 -> Map(tokenName -> {literals: string[] | null, hidden}). */
function parseLexerGrammar(src) {
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
    tokens.set(name, { literals: pure ? literals : null, hidden });
  }
  return tokens;
}

/** Forge.g4 -> Map(ruleName -> alternatives[]), in file order. */
function parseParserGrammar(src) {
  const stripped = src.replace(/\/\/[^\n]*/g, "");
  const rules = new Map();
  for (const m of stripped.matchAll(/([a-zA-Z_]\w*)\s*:\s*([^;]+);/g)) {
    const [, name, body] = m;
    if (name === "grammar" || name === "options") continue;
    rules.set(name, splitAlternatives(body.replace(/\s+/g, " ").trim()));
  }
  return rules;
}

const TOKENS = parseLexerGrammar(lexerSrc);
const RULES = parseParserGrammar(parserSrc);

/** Surface spelling(s) of a token, e.g. AND_TOK -> `&&` / `and`. */
function lexemes(tokName) {
  const t = TOKENS.get(tokName);
  if (!t) throw new Error(`Token ${tokName} referenced by grammar but not in lexer`);
  if (!t.literals) return tokName; // pattern token: keep the name
  return t.literals.map((l) => `\`${l}\``).join(" / ");
}

// --------------------------------------------------------------------------
// Expression cascade -> normalized alternative signatures
// --------------------------------------------------------------------------

const CASCADE_RE = /^expr(?:\d+(?:_\d+)?)?$/;
const cascade = [...RULES.keys()].filter((r) => CASCADE_RE.test(r));

/** Normalize an alternative: cascade rule refs become `_`; spacing canonical. */
function signatureOf(alt) {
  return alt
    .replace(/([()?])/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (CASCADE_RE.test(w) ? "_" : w))
    .join(" ");
}

/** True when the alternative is just the descent into the next tighter level. */
function isDescent(sig) {
  return sig === "_";
}

// --------------------------------------------------------------------------
// SEMANTICS: one entry per non-descent alternative in the expression cascade.
// Key = normalized signature (see signatureOf). Missing key => build error.
// status: "yes" (evaluates), "no" (parses but evaluation is rejected/fails).
// --------------------------------------------------------------------------

const SEMANTICS = new Map(Object.entries({
  // ---- binders (the `expr` level) ----
  "LET_TOK letDeclList blockOrBar": {
    name: "let binding", example: "let x = e | body", status: "no",
    meaning: "Bind names to expression values inside a body. Parses, but evaluation is not implemented and fails.",
  },
  "BIND_TOK letDeclList blockOrBar": {
    name: "bind", example: "bind x = e | body", status: "no",
    meaning: "Alloy `bind`. Parses, but evaluation is rejected.",
  },
  "quant DISJ_TOK ? quantDeclList blockOrBar": {
    name: "quantified formula", example: "all x: S | body", status: "yes",
    meaning: "Quantifiers `all`, `no`, `some`, `lone`, `one`, `two`, and the aggregator `sum x: S | intExpr`. " +
      "`disj` requires the bound variables to take pairwise-distinct values. The body must use the bar form (`| expr`).",
  },
  // ---- boolean connectives ----
  "_ OR_TOK _": { name: "disjunction", example: "a or b", ops: ["OR_TOK"], status: "yes", meaning: "Logical or (short-circuits)." },
  "_ XOR_TOK _": { name: "exclusive or", example: "a xor b", ops: ["XOR_TOK"], status: "yes", meaning: "Logical exclusive or." },
  "_ IFF_TOK _": { name: "biconditional", example: "a iff b", ops: ["IFF_TOK"], status: "yes", meaning: "Logical if-and-only-if." },
  "_ IMP_TOK _ ( ELSE_TOK _ ) ?": {
    name: "implication", example: "a implies b else c", ops: ["IMP_TOK", "ELSE_TOK"], status: "yes",
    meaning: "Implication, with an optional else branch (`a => b else c` means `(a and b) or ((not a) and c)`).",
  },
  "_ AND_TOK _": { name: "conjunction", example: "a and b", ops: ["AND_TOK"], status: "yes", meaning: "Logical and (short-circuits)." },
  "NEG_TOK _": { name: "negation", example: "not a", ops: ["NEG_TOK"], status: "yes", meaning: "Logical negation of a boolean formula." },
  // ---- comparisons ----
  "_ NEG_TOK ? compareOp _": {
    name: "comparison", example: "a in b", ops: ["IN_TOK", "EQ_TOK", "LT_TOK", "GT_TOK", "LEQ_TOK", "GEQ_TOK", "NI_TOK", "IS_TOK"], status: "yes",
    meaning: "Subset (`in`), reverse containment (`ni`), set equality (`=`), and numeric comparisons. " +
      "A scalar is a singleton set, so `in` doubles as membership. A leading `!`/`not` negates the comparison. " +
      "`is` parses but its evaluation is rejected.",
  },
  // ---- multiplicity tests ----
  "( NO_TOK | SOME_TOK | LONE_TOK | ONE_TOK | TWO_TOK | SET_TOK ) _": {
    name: "multiplicity test", example: "some e", ops: ["NO_TOK", "SOME_TOK", "LONE_TOK", "ONE_TOK", "TWO_TOK", "SET_TOK"], status: "yes",
    meaning: "Cardinality predicates over a set: `no` (empty), `some` (non-empty), `lone` (at most one), `one` (exactly one), `two` (exactly two). `set e` is the identity.",
  },
  // ---- set / relational algebra ----
  "_ ( PLUS_TOK | MINUS_TOK ) _": {
    name: "union / difference", example: "a + b", ops: ["PLUS_TOK", "MINUS_TOK"], status: "yes",
    meaning: "Set union and set difference. (For integer arithmetic use the `add[...]`/`subtract[...]` builtins; `1 + 2` is the two-element set.)",
  },
  "CARD_TOK _": { name: "cardinality", example: "#e", ops: ["CARD_TOK"], status: "yes", meaning: "Number of tuples in the set." },
  "_ PPLUS_TOK _": {
    name: "override", example: "a ++ b", ops: ["PPLUS_TOK"], status: "yes",
    meaning: "Relational override: tuples of `b`, plus the tuples of `a` whose first atom is not a first atom of `b`.",
  },
  "_ AMP_TOK _": { name: "intersection", example: "a & b", ops: ["AMP_TOK"], status: "yes", meaning: "Set intersection." },
  "_ arrowOp _": {
    name: "product", example: "a -> b", ops: ["ARROW_TOK"], status: "yes",
    meaning: "Cartesian product. Multiplicity annotations (`a one -> lone b`) are declaration syntax and are rejected in expressions.",
  },
  "_ ( SUBT_TOK | SUPT_TOK ) _": {
    name: "restriction", example: "S <: r", ops: ["SUBT_TOK", "SUPT_TOK"], status: "yes",
    meaning: "Domain restriction (`S <: r`: tuples of `r` starting in `S`) and range restriction (`r :> S`: tuples ending in `S`).",
  },
  "_ LEFT_SQUARE_TOK exprList RIGHT_SQUARE_TOK": {
    name: "box join / builtin call", example: "f[a, b]", ops: ["LEFT_SQUARE_TOK", "RIGHT_SQUARE_TOK"], status: "yes",
    meaning: "`a[b]` is the box join `b.a`. When the callee names a builtin (see the builtin table) it is a function call instead: `add[1, 2]`.",
  },
  "_ DOT_TOK _": {
    name: "join", example: "a.f", ops: ["DOT_TOK"], status: "yes",
    meaning: "Relational join: match the last column of the left operand against the first column of the right.",
  },
  "name LEFT_SQUARE_TOK exprList RIGHT_SQUARE_TOK": {
    name: "applied name (grammar corner)", example: "x.f[a]", status: "no",
    meaning: "A bracket application whose callee is parsed as a bare name inside a dot-chain. Redundant with box join; evaluation is not implemented.",
  },
  // ---- unary relational / label prefixes ----
  "( TILDE_TOK | EXP_TOK | STAR_TOK | GET_LABEL_TOK | GET_LABEL_STR_TOK | GET_LABEL_BOOL_TOK | GET_LABEL_NUM_TOK ) _": {
    name: "unary prefixes", example: "^r",
    ops: ["TILDE_TOK", "EXP_TOK", "STAR_TOK", "GET_LABEL_TOK", "GET_LABEL_STR_TOK", "GET_LABEL_BOOL_TOK", "GET_LABEL_NUM_TOK"], status: "yes",
    meaning: "`~r` transpose, `^r` transitive closure, `*r` reflexive-transitive closure. " +
      "`@:`/`@str:` label of an atom as a string, `@bool:`/`@num:` label converted to boolean/number (extensions; not Forge).",
  },
  // ---- atoms (the expr18 level) ----
  "const": {
    name: "constant", example: "none", status: "yes",
    meaning: "`none` (empty set), `univ` (all atoms), `iden` (identity relation), integer literals (incl. negative), and `\"...\"` string literals.",
  },
  "qualName": {
    name: "name", example: "Person", status: "yes",
    meaning: "A type, relation, atom, or bound variable. An unresolved name evaluates to the empty set and raises an `unresolved-name` diagnostic.",
  },
  "AT_TOK name": { name: "@name", example: "@x", status: "no", meaning: "Alloy-specific; evaluation is rejected." },
  "BACKQUOTE_TOK name": {
    name: "atom literal", example: "`n0", status: "yes",
    meaning: "The atom with exactly this id, bypassing type/relation/variable lookup.",
  },
  "THIS_TOK": { name: "this", example: "this", status: "no", meaning: "Alloy-specific; evaluation is rejected." },
  "LEFT_CURLY_TOK quantDeclList blockOrBar RIGHT_CURLY_TOK": {
    name: "set comprehension", example: "{x: S | body}", status: "yes",
    meaning: "The set of bindings satisfying the body. Multiple binders build a relation: `{x: A, y: B | body}` is a set of pairs.",
  },
  "LEFT_PAREN_TOK _ RIGHT_PAREN_TOK": { name: "parentheses", example: "(e)", status: "yes", meaning: "Grouping." },
  "block": {
    name: "block", example: "{ e1 e2 }", status: "yes",
    meaning: "A conjunction of boolean expressions, separated by whitespace (there is no `;` in the language).",
  },
  "sexpr": { name: "s-expression", example: "sexpr", status: "no", meaning: "Reserved for internal use; evaluation is rejected." },
}));

// --------------------------------------------------------------------------
// Cross-checks (fail loudly rather than emit a stale or incomplete reference)
// --------------------------------------------------------------------------

// 1. Every non-descent cascade alternative must have a SEMANTICS entry.
const rows = [];
for (const rule of cascade) {
  const entries = [];
  for (const alt of RULES.get(rule)) {
    const sig = signatureOf(alt);
    if (isDescent(sig)) continue;
    const entry = SEMANTICS.get(sig);
    if (!entry) {
      throw new Error(
        `No SEMANTICS entry for grammar alternative of '${rule}':\n  signature: ${sig}\n` +
        `Add one to scripts/generate-lang-ref.mjs (this is the docs' keep-in-sync check).`
      );
    }
    entries.push(entry);
  }
  if (entries.length) rows.push({ rule, entries });
}

// 2. Reserved words derived from the lexer must match FORGE_RESERVED_KEYWORDS.
const reservedFromLexer = new Set();
for (const { literals, hidden } of TOKENS.values()) {
  if (hidden || !literals) continue;
  for (const lit of literals) {
    if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(lit)) reservedFromLexer.add(lit);
  }
}
const utilsMatch = utilsSrc.match(/FORGE_RESERVED_KEYWORDS = new Set\(\[([\s\S]*?)\]\)/);
if (!utilsMatch) throw new Error("Could not find FORGE_RESERVED_KEYWORDS in utils.ts");
const reservedFromUtils = new Set([...utilsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
const onlyLexer = [...reservedFromLexer].filter((w) => !reservedFromUtils.has(w));
const onlyUtils = [...reservedFromUtils].filter((w) => !reservedFromLexer.has(w));
if (onlyLexer.length || onlyUtils.length) {
  throw new Error(
    `FORGE_RESERVED_KEYWORDS is out of sync with the lexer.\n` +
    `  in lexer only: ${onlyLexer.join(", ") || "-"}\n  in utils only: ${onlyUtils.join(", ") || "-"}`
  );
}

// 3. Builtins are read from the evaluator source.
function extractBuiltins(varName) {
  const m = evaluatorSrc.match(new RegExp(`${varName}[^=]*= \\[(.*?)\\]`));
  if (!m) throw new Error(`Could not find ${varName} in ForgeExprEvaluator.ts`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}
const binaryBuiltins = extractBuiltins("SUPPORTED_BINARY_BUILTINS");
const unaryBuiltins = extractBuiltins("SUPPORTED_UNARY_BUILTINS");
const setBuiltins = extractBuiltins("SUPPORTED_SET_BUILTINS");

// --------------------------------------------------------------------------
// Rendering
// --------------------------------------------------------------------------

function opsColumn(entry) {
  if (!entry.ops) return "—";
  return entry.ops.map((t) => lexemes(t)).join(", ");
}

const statusMark = (s) => (s === "yes" ? "✓" : "✗");

// A literal `|` breaks a GFM table cell even inside backticks; escape it.
const mdCell = (s) => s.replace(/\|/g, "\\|");

// Inline code for a table cell. Backtick-containing examples (the atom
// literal) can't use backtick fences, so fall back to an entity-escaped
// <code> span.
function mdCode(s) {
  if (s.includes("`")) {
    return `<code>${s.replace(/`/g, "&#96;").replace(/\|/g, "&#124;")}</code>`;
  }
  return `\`${s}\``;
}

const precedenceTable = [
  "| # | Construct | Example | Operators | Evaluates | Meaning |",
  "|---|-----------|---------|-----------|:---------:|---------|",
  ...rows.flatMap(({ entries }, i) =>
    entries.map((e) =>
      [
        "",
        `${i + 1}`,
        mdCell(e.name),
        mdCell(mdCode(e.example)),
        mdCell(opsColumn(e)),
        statusMark(e.status),
        mdCell(e.meaning),
        "",
      ].join(" | ").trim()
    )
  ),
].join("\n");

// Grammar appendix: rules reachable from parseExpr, literals substituted in.
function renderBody(alts) {
  return alts
    .map((alt) =>
      alt.replace(/\b([A-Z][A-Z_0-9]*)\b/g, (tok) => {
        const t = TOKENS.get(tok);
        if (!t || !t.literals) return tok;
        const rendered = t.literals.map((l) => `'${l}'`).join(" | ");
        return t.literals.length > 1 ? `(${rendered})` : rendered;
      })
    )
    .join("\n    | ");
}
const reachable = [];
{
  const queue = ["parseExpr"];
  const seen = new Set(queue);
  while (queue.length) {
    const r = queue.shift();
    if (!RULES.has(r)) continue;
    reachable.push(r);
    for (const alt of RULES.get(r)) {
      for (const w of alt.split(/[^\w]+/)) {
        if (RULES.has(w) && !seen.has(w)) { seen.add(w); queue.push(w); }
      }
    }
  }
}
const grammarAppendix = reachable
  .map((r) => `${r}\n    : ${renderBody(RULES.get(r))}\n    ;`)
  .join("\n\n");

const reservedList = [...reservedFromLexer].sort().map((w) => `\`${w}\``).join(", ");

const patternTokenDescriptions = {
  STRING_TOK: 'A double-quoted string literal: `"dark blue"`. Escapes: `\\"`, `\\\\`, `\\n`, `\\t`, `\\r`, `\\0`; any other escaped character stands for itself.',
  NUM_CONST_TOK: "An integer or decimal literal: `42`, `3.5`. Negate with a leading `-`.",
  IDENTIFIER_TOK: "A name: letters, digits, `_`, `$`, `/` (not starting with a digit).",
  QUOTED_IDENTIFIER_TOK: "A backquoted name: `` `n0 ``. Names an atom by id, and escapes reserved words.",
};
const patternTokens = [...TOKENS.entries()]
  .filter(([, t]) => !t.hidden && !t.literals)
  .map(([name]) => {
    const desc = patternTokenDescriptions[name];
    if (!desc) {
      throw new Error(`Pattern token ${name} has no description in patternTokenDescriptions`);
    }
    return `- **${name}** — ${desc}`;
  })
  .join("\n");

const doc = `<!-- GENERATED FILE — DO NOT EDIT.
     Built from src/forge-antlr/ForgeLexer.g4, src/forge-antlr/Forge.g4, and
     the evaluator's builtin tables by scripts/generate-lang-ref.mjs.
     Regenerate with: npm run docs:lang -->

# The Expression Language

This library evaluates a single **expression** (the \`parseExpr\` grammar entry
point) against a data instance. The language is the expression fragment of
[Forge](https://forge-fm.org) (itself a dialect of Alloy), with a few
extensions (string literals, label access) and deliberate omissions.

**Everything is a set of tuples.** A sig name denotes the set of its atoms, a
relation name the set of its tuples, and a scalar (one atom, one number, one
string) is a singleton set. Boolean formulas evaluate to \`true\`/\`false\`.

**There is no temporal fragment.** The temporal operators (\`always\`,
\`eventually\`, \`after\`, \`before\`, \`once\`, \`historically\`, \`until\`,
\`release\`, \`since\`, \`triggered\`) and primed expressions (\`e'\`) were
removed from the grammar; their syntax is a parse error, and the former
keywords are ordinary identifiers.

## Lexical structure

${patternTokens}

Comments run from \`//\` or \`--\` to the end of the line, or between \`/*\`
and \`*/\`. A \`#lang\` line is ignored.

### Reserved words

${reservedList}

A data-instance entity whose name collides with a reserved word is still
reachable by backquoting: \`\` \`set\` \`\` names the *atom* with id \`set\`.

## Operators and precedence

Constructs are listed loosest-binding first; higher numbers bind tighter.
"Evaluates ✗" marks syntax the grammar accepts but the evaluator rejects.

${precedenceTable}

## Builtin functions

Called with square brackets, e.g. \`add[1, 2]\`.

| Builtins | Arity | Notes |
|----------|-------|-------|
| ${binaryBuiltins.map((b) => `\`${b}\``).join(", ")} | 2 | Integer/real arithmetic. \`divide\` is real division. |
| ${unaryBuiltins.map((b) => `\`${b}\``).join(", ")} | 1 | |
| ${setBuiltins.map((b) => `\`${b}\``).join(", ")} | set | Aggregate over a set; numeric strings resolve to numbers. \`sum\` also has a quantifier form \`sum x: S \\| intExpr\`. |

Builtin names are **not** reserved words: a data instance that names an
entity \`add\` shadows the builtin (see issue #59).

## Grammar

The expression grammar, with token literals substituted in. Pattern tokens
(see [Lexical structure](#lexical-structure)) keep their names.

\`\`\`
${grammarAppendix}
\`\`\`
`;

// --------------------------------------------------------------------------

const check = process.argv.includes("--check");
if (check) {
  let existing = null;
  try {
    existing = readFileSync(OUT, "utf8");
  } catch {
    // fall through: missing file is stale
  }
  if (existing !== doc) {
    console.error("LANGUAGE.md is stale. Regenerate with: npm run docs:lang");
    process.exit(1);
  }
  console.log("LANGUAGE.md is up to date.");
} else {
  writeFileSync(OUT, doc);
  console.log(`Wrote ${OUT}`);
}
