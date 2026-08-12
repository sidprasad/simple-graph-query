import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { CharStreams, CommonTokenStream, Token } from "antlr4ts";
import { ForgeLexer } from "../src/forge-antlr/ForgeLexer";
import { ForgeParser } from "../src/forge-antlr/ForgeParser";
import { getIdentifierName, FORGE_RESERVED_KEYWORDS } from "../src/forge-antlr/utils";
import { unquoteStringLiteral } from "../src/ForgeExprEvaluator";
import { ParseErrorListener } from "../src/errorListener";

// docs/sgq-language.json states the lexical rules as data so that downstream
// generators need not hand-copy them. A manifest nothing checks is just a
// second place for the rules to be wrong, so the encoders below are written
// from the manifest alone and run against the real lexer.

const ROOT = join(__dirname, "..");

type CharClass = { ranges: [string, string][]; chars: string[] };
type Quoted = {
  delimiter: string;
  escape: string;
  mustEscape: string[];
  escapeDecodes: Record<string, string>;
  minLength: number;
};
const manifest: {
  sgqVersion: string;
  identifier: {
    bare: { head: CharClass; rest: CharClass; minLength: number };
    quoted: Quoted;
    reserved: string[];
  };
  string: Quoted;
} = JSON.parse(readFileSync(join(ROOT, "docs/sgq-language.json"), "utf8"));

// --------------------------------------------------------------------------
// A consumer of the manifest, written against nothing else.
// --------------------------------------------------------------------------

const inClass = (cc: CharClass, c: string) =>
  cc.chars.includes(c) || cc.ranges.some(([lo, hi]) => c >= lo && c <= hi);

function isBare(name: string): boolean {
  const { head, rest, minLength } = manifest.identifier.bare;
  return name.length >= minLength &&
    inClass(head, name[0]) &&
    [...name.slice(1)].every((c) => inClass(rest, c)) &&
    !manifest.identifier.reserved.includes(name);
}

/** Wrap in the delimiter, escaping what cannot ride raw. */
function quote(text: string, form: Quoted): string {
  if ([...text].length < form.minLength) {
    throw new Error(`unspellable: ${JSON.stringify(text)}`);
  }
  const body = [...text]
    .map((c) => (form.mustEscape.includes(c) ? form.escape + c : c))
    .join("");
  return form.delimiter + body + form.delimiter;
}

const encodeName = (name: string) =>
  isBare(name) ? name : quote(name, manifest.identifier.quoted);
const encodeString = (s: string) => quote(s, manifest.string);

// --------------------------------------------------------------------------
// The lexer, as the oracle.
// --------------------------------------------------------------------------

/** Token types of `src`, or null when the lexer rejects it. */
function lex(src: string): number[] | null {
  const lexer = new ForgeLexer(CharStreams.fromString(src));
  lexer.removeErrorListeners();
  lexer.addErrorListener(new ParseErrorListener());
  const stream = new CommonTokenStream(lexer);
  try {
    stream.fill();
  } catch {
    return null;
  }
  return stream.getTokens().map((t) => t.type).filter((t) => t !== Token.EOF);
}

const lexesAs = (src: string, type: number) => {
  const types = lex(src);
  return types !== null && types.length === 1 && types[0] === type;
};

/** What the parser makes of `src` in name position. */
function readName(src: string): string {
  const lexer = new ForgeLexer(CharStreams.fromString(src));
  lexer.removeErrorListeners();
  lexer.addErrorListener(new ParseErrorListener());
  const parser = new ForgeParser(new CommonTokenStream(lexer));
  parser.removeErrorListeners();
  parser.addErrorListener(new ParseErrorListener());
  return getIdentifierName(parser.name());
}

const expand = (cc: CharClass) => [
  ...cc.ranges.flatMap(([lo, hi]) =>
    Array.from({ length: hi.charCodeAt(0) - lo.charCodeAt(0) + 1 }, (_, i) =>
      String.fromCharCode(lo.charCodeAt(0) + i))),
  ...cc.chars,
];

/** Names chosen to break a hand-written encoder. */
const AWKWARD_NAMES = [
  "n0", "Person", "camelCase", "with_underscores", "a$b", "a/b", "//",
  "set", "some", "in", "Int", "sum", "no", "/",
  "has space", "back`tick", "back\\slash", "both`\\here", "\"quoted\"",
  "new\nline", "tab\there", "nul\0here", "σ", "é", "→", "😀", "x'", "-lead", "0lead",
];

// --------------------------------------------------------------------------

describe("docs/sgq-language.json", () => {
  it("is up to date with the grammar", () => {
    // Throws (failing the test) on a non-zero exit; stderr carries the reason.
    execFileSync(process.execPath, [join(ROOT, "scripts/generate-lexical-manifest.mjs"), "--check"],
      { stdio: "pipe" });
  });

  it("agrees with the lexer on every name of length 1 or 2", () => {
    const heads = expand(manifest.identifier.bare.head);
    const rests = expand(manifest.identifier.bare.rest);
    const corpus = [...heads, ...heads.flatMap((h) => rests.map((r) => h + r))];

    // The corpus is only evidence if it exercises both answers.
    expect(corpus.filter(isBare).length).toBeGreaterThan(0);
    expect(corpus.filter((n) => !isBare(n))).toEqual(expect.arrayContaining(["in", "as", "/"]));

    const disagreements = corpus.filter(
      (name) => isBare(name) !== lexesAs(name, ForgeLexer.IDENTIFIER_TOK));
    expect(disagreements).toEqual([]);
  });

  it("round-trips every reserved word through the quoted form", () => {
    for (const word of manifest.identifier.reserved) {
      expect(encodeName(word)).not.toBe(word);
      expect(readName(encodeName(word))).toBe(word);
    }
  });

  it("round-trips awkward names", () => {
    for (const name of AWKWARD_NAMES) {
      expect(readName(encodeName(name))).toBe(name);
    }
  });

  it("round-trips names over a character corpus", () => {
    const chars = Array.from({ length: 0x100 }, (_, i) => String.fromCharCode(i));
    for (const c of [...chars, "σ", "→", "😀"]) {
      expect(readName(encodeName(c))).toBe(c);
      expect(readName(encodeName("x" + c + "y"))).toBe("x" + c + "y");
    }
  });

  it("declares the names it cannot spell", () => {
    // The quoted form takes at least one character, so the empty name has no
    // spelling at all -- `` is two backquotes, not an empty identifier.
    expect(() => encodeName("")).toThrow();
    expect(lexesAs("``", ForgeLexer.QUOTED_IDENTIFIER_TOK)).toBe(false);
  });

  it("round-trips strings over a character corpus", () => {
    const chars = Array.from({ length: 0x100 }, (_, i) => String.fromCharCode(i));
    for (const c of [...chars, "σ", "→", "😀"]) {
      for (const s of [c, "x" + c + "y", c + c]) {
        const literal = encodeString(s);
        expect(lexesAs(literal, ForgeLexer.STRING_TOK)).toBe(true);
        expect(unquoteStringLiteral(literal)).toBe(s);
      }
    }
    expect(unquoteStringLiteral(encodeString(""))).toBe("");
  });

  it("states the string escapes the evaluator actually resolves", () => {
    const { delimiter, escape, escapeDecodes } = manifest.string;
    for (const [from, to] of Object.entries(escapeDecodes)) {
      expect(unquoteStringLiteral(delimiter + escape + from + delimiter)).toBe(to);
    }
    // Anything absent from the table stands for itself.
    for (const c of ["q", "z", "1", "'"]) {
      expect(escapeDecodes).not.toHaveProperty(c);
      expect(unquoteStringLiteral(delimiter + escape + c + delimiter)).toBe(c);
    }
  });

  it("covers every keyword the runtime helper knows about", () => {
    for (const word of FORGE_RESERVED_KEYWORDS) {
      expect(manifest.identifier.reserved).toContain(word);
    }
  });
});
