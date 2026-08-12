#!/usr/bin/env node
// Generates docs/sgq-language.json — the language as data — from the ANTLR
// grammars and the functions that decode what they lex.
//
//   node scripts/generate-language-manifest.mjs           # (re)write it
//   node scripts/generate-language-manifest.mjs --check   # exit 1 if stale
//
// LANGUAGE.md tells a *reader* how to spell an expression. This tells a
// *program*: downstream tools that emit expressions (spytial-core,
// spytial-lean) otherwise hand-copy the character classes, the keyword list,
// the escape tables, and the whole precedence cascade into their own source,
// where nothing catches the copy going stale.
//
// Every field is derived, never transcribed. When a shape below stops matching
// the grammar, generation fails rather than emitting a plausible manifest.

import { read, TOKENS, bareIdentifier, reservedKeywords, parseCharSet, builtins, checkOrWrite }
  from "./grammar.mjs";
import { constructRecords } from "./constructs.mjs";

const fail = (msg) => { throw new Error(`${msg}\nEdit scripts/generate-language-manifest.mjs to match.`); };

const bodyOf = (name) => TOKENS.get(name)?.body ?? fail(`No token ${name} in the lexer grammar`);

const bare = bareIdentifier();

// --------------------------------------------------------------------------
// The two quoted forms: `'D' (~[escapable] | '\\' .)+ 'D'`
// --------------------------------------------------------------------------

/**
 * `escapeDecodes` maps the character after the escape to what it denotes; a
 * character absent from it denotes itself. `mustEscape` is the complement set
 * the lexer refuses raw, so it is exactly what an encoder has to prefix.
 */
function quotedForm(tokenName, decodes) {
  const body = bodyOf(tokenName);
  const m = body.match(/^'(.)' \(~\[((?:[^\]\\]|\\.)*)\] \| '\\\\' \.\)([+*]) '\1'$/);
  if (!m) fail(`${tokenName} is no longer a delimited escape-run: ${body}`);
  const [, delimiter, escapable, quantifier] = m;
  const { ranges, chars } = parseCharSet(escapable);
  if (ranges.length) fail(`${tokenName}'s escapable set has ranges, which have no encoding here`);
  if (!chars.includes("\\")) fail(`${tokenName} does not treat \\ as escapable`);
  return {
    delimiter,
    escape: "\\",
    mustEscape: chars,
    escapeDecodes: decodes,
    minLength: quantifier === "+" ? 1 : 0,
  };
}

// A quoted identifier's escapes are resolved by getIdentifierName, whose whole
// rule is "drop the backslash" — so nothing decodes to anything but itself.
const utilsSrc = read("src/forge-antlr/utils.ts");
if (!utilsSrc.includes(String.raw`.replace(/\\(.)/g, '$1')`)) {
  fail("getIdentifierName no longer unescapes with a bare drop-the-backslash replace");
}

// A string literal's escapes are resolved by unquoteStringLiteral's switch.
const evaluatorSrc = read("src/ForgeExprEvaluator.ts");
const switchBody = evaluatorSrc.match(
  /export function unquoteStringLiteral[\s\S]*?switch \(escaped\) \{([\s\S]*?)\n  \}/
)?.[1] ?? fail("Could not find unquoteStringLiteral's escape switch");
if (!/default: out \+= escaped;/.test(switchBody)) {
  fail("unquoteStringLiteral's default branch is no longer 'the character itself'");
}
// The right-hand sides are JS escapes, and `\0` is not valid JSON, so they are
// resolved here rather than through JSON.parse.
const JS_ESCAPES = { "0": "\0", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" };
const decodeJsLiteral = (src) => src.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g,
  (_, e) => e[0] === "u" || e[0] === "x"
    ? String.fromCodePoint(parseInt(e.replace(/[ux{}]/g, ""), 16))
    : JS_ESCAPES[e] ?? e);

const stringDecodes = Object.fromEntries(
  [...switchBody.matchAll(/case "(.)": out \+= "((?:[^"\\]|\\.)*)";/g)]
    .map(([, from, to]) => [from, decodeJsLiteral(to)])
);
if (!Object.keys(stringDecodes).length) fail("unquoteStringLiteral has no escape cases");

// --------------------------------------------------------------------------
// Reserved: every spelling a bare name cannot carry. grammar.mjs derives it,
// and the reference checks that same set against FORGE_RESERVED_KEYWORDS, so
// the manifest and the runtime helper cannot disagree.
// --------------------------------------------------------------------------

const reserved = [...reservedKeywords()].sort();

// --------------------------------------------------------------------------

// Numbers: `[digits]+ ('.' [digits]+)?`. The leading `-` is not part of the
// token -- it is the `constant` construct's `negation` part.
const numberMatch = bodyOf("NUM_CONST_TOK")
  .match(/^\[((?:[^\]\\]|\\.)*)\]\+ \('(.)' \[((?:[^\]\\]|\\.)*)\]\+\)\?$/);
if (!numberMatch) fail(`NUM_CONST_TOK is no longer 'digits+ (point digits+)?': ${bodyOf("NUM_CONST_TOK")}`);
if (numberMatch[1] !== numberMatch[3]) fail("NUM_CONST_TOK uses different digits either side of the point");

const manifest = {
  sgqVersion: JSON.parse(read("package.json")).version,
  identifier: {
    bare,
    quoted: quotedForm("QUOTED_IDENTIFIER_TOK", {}),
    reserved,
  },
  string: quotedForm("STRING_TOK", stringDecodes),
  number: { digits: parseCharSet(numberMatch[1]), decimalPoint: numberMatch[2] },
  builtins: builtins(),
  constructs: constructRecords(),
};

checkOrWrite("docs/sgq-language.json", JSON.stringify(manifest, null, 2) + "\n");
