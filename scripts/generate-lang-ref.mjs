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

import { TOKENS, RULES, read, reservedKeywords, builtins, checkOrWrite } from "./grammar.mjs";
import { proseRows } from "./constructs.mjs";

const utilsSrc = read("src/forge-antlr/utils.ts");

/** Surface spelling(s) of a token, e.g. AND_TOK -> `&&` / `and`. */
function lexemes(tokName) {
  const t = TOKENS.get(tokName);
  if (!t) throw new Error(`Token ${tokName} referenced by grammar but not in lexer`);
  if (!t.literals) return tokName; // pattern token: keep the name
  return t.literals.map((l) => `\`${l}\``).join(" / ");
}

// --------------------------------------------------------------------------
// Cross-checks (fail loudly rather than emit a stale or incomplete reference)
// --------------------------------------------------------------------------

// 1. Every non-descent cascade alternative must be described in constructs.mjs.
const rows = proseRows();

// 2. Reserved words derived from the lexer must match FORGE_RESERVED_KEYWORDS.
const reservedFromLexer = reservedKeywords();
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
const { binary: binaryBuiltins, unary: unaryBuiltins, set: setBuiltins } = builtins();

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

// Keywords and other claimed spellings read differently: a skimmer takes a
// "Reserved words" list as "these strings are special everywhere", which for
// `/` would wrongly outlaw slashed names like `foo/bar`. So the list holds only
// word-shaped keywords, and non-word spellings get their own note.
const wordShaped = /^[A-Za-z_][A-Za-z_0-9]*$/;
const reservedList = [...reservedFromLexer].filter((w) => wordShaped.test(w))
  .sort().map((w) => `\`${w}\``).join(", ");
const backquoteOnlyDescriptions = {
  "/": "matches the identifier pattern but lexes as the qualified-name separator",
};
const backquoteOnlyList = [...reservedFromLexer].filter((w) => !wordShaped.test(w))
  .sort().map((w) => {
    const why = backquoteOnlyDescriptions[w];
    if (!why) throw new Error(`Backquote-only spelling ${w} has no description`);
    return `\`${w}\` ${why}. A name that is exactly \`${w}\` can only be written backquoted (\`\` \`${w}\` \`\`); a name that merely contains it, like \`foo/bar\`, is an ordinary identifier and needs no quoting.`;
  }).join("\n\n");

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

### Names that must be backquoted

${backquoteOnlyList}

### Machine-readable form

Code that *generates* expressions needs this page's content as data rather than
as prose. [\`docs/sgq-language.json\`](docs/sgq-language.json) carries it: the
bare-identifier character classes, both quoting forms with their escape tables,
every spelling a bare identifier cannot carry, and the whole cascade below —
each construct with its spellings, its precedence, and the level each of its
operands descends to. It is generated from this same grammar, ships in the npm
package, and is checked against the real lexer and parser by a test.

The parenthesisation rule is the one thing worth restating: a subexpression
needs parentheses exactly when its own \`precedence\` is below the level of the
slot it fills. Those levels are not always the neighbouring one — \`+\` takes
its right operand two levels in, so \`a + #b\` is a parse error.

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

checkOrWrite("LANGUAGE.md", doc);
