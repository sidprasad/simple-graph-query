import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { CharStreams, CommonTokenStream, Token } from "antlr4ts";
import { ForgeLexer } from "../src/forge-antlr/ForgeLexer";
import { ForgeParser } from "../src/forge-antlr/ForgeParser";
import { getIdentifierName, FORGE_RESERVED_KEYWORDS } from "../src/forge-antlr/utils";
import { unquoteStringLiteral } from "../src/ForgeExprEvaluator";
import { ParseErrorListener } from "../src/errorListener";

// docs/sgq-language.json states the language as data so that downstream
// generators need not hand-copy it. A manifest nothing checks is just a second
// place for the rules to be wrong, so the encoders below are written from the
// manifest alone and run against the real lexer and parser.

const ROOT = join(__dirname, "..");

type CharClass = { ranges: { from: string; to: string }[]; chars: string[] };
type Quoted = {
  delimiter: string;
  escape: string;
  mustEscape: string[];
  escapeDecodes: Record<string, string>;
  minLength: number;
};
type TemplateItem =
  | { item: "operand"; level: number }
  | { item: "optional"; items: TemplateItem[] }
  | { item: "repeat" | "list" | "body" | "binders"; level: number }
  | { item: "name" | "constant" | "operator" | "part" };
type Construct = {
  id: string;
  precedence: number;
  fixity: string;
  evaluates: boolean;
  template: TemplateItem[];
  arity: { slots: (number | null)[] };
  associativity: "left" | "right" | null;
  operators: { id: string; spellings: string[] }[];
  parts: Record<string, string[]>;
};
const manifest: {
  sgqVersion: string;
  identifier: {
    bare: { head: CharClass; rest: CharClass; minLength: number };
    quoted: Quoted;
    reserved: string[];
  };
  string: Quoted;
  number: { digits: CharClass; decimalPoint: string };
  builtins: { binary: string[]; unary: string[]; set: string[] };
  constructs: Construct[];
} = JSON.parse(readFileSync(join(ROOT, "docs/sgq-language.json"), "utf8"));

// --------------------------------------------------------------------------
// A consumer of the manifest, written against nothing else.
// --------------------------------------------------------------------------

const inClass = (cc: CharClass, c: string) =>
  cc.chars.includes(c) || cc.ranges.some(({ from, to }) => c >= from && c <= to);

/** The level each operand slot descends to, in source order. `implies` puts its
    third operand inside an `optional`, so this has to descend. */
const operandsOf = (items: TemplateItem[]): number[] => items.flatMap((i) =>
  i.item === "operand" ? [i.level]
  : i.item === "optional" ? operandsOf(i.items)
  : []);

/** The level accepted inside the construct's delimiters, if it has any. */
const innerOf = (items: TemplateItem[]): number | null => {
  for (const i of items) {
    if (i.item === "optional") {
      const nested = innerOf(i.items);
      if (nested !== null) return nested;
    } else if (i.item !== "operand" && "level" in i) return i.level;
  }
  return null;
};

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
  ...cc.ranges.flatMap(({ from, to }) =>
    Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) =>
      String.fromCharCode(from.charCodeAt(0) + i))),
  ...cc.chars,
];

// --------------------------------------------------------------------------
// Grouping, as the parser sees it.
// --------------------------------------------------------------------------

/**
 * The parse tree of `src`, canonical modulo grouping: chains that just descend
 * a precedence level collapse, and parentheses vanish. Two spellings of the
 * same grouping therefore have the same shape, and only a real difference in
 * structure shows up.
 */
function shape(src: string): string | null {
  let tree;
  try {
    const lexer = new ForgeLexer(CharStreams.fromString(src));
    lexer.removeErrorListeners();
    lexer.addErrorListener(new ParseErrorListener());
    const parser = new ForgeParser(new CommonTokenStream(lexer));
    parser.removeErrorListeners();
    parser.addErrorListener(new ParseErrorListener());
    tree = parser.parseExpr();
  } catch {
    return null;
  }
  const render = (node: any): string => {
    if (node.childCount === undefined || node.childCount === 0) return node.text;
    if (node.childCount === 1) return render(node.getChild(0));
    const kids = Array.from({ length: node.childCount }, (_, i) => node.getChild(i));
    if (kids.length === 3 && kids[0].text === "(" && kids[2].text === ")") return render(kids[1]);
    return `(${kids.map(render).filter((s) => s !== "<EOF>").join(" ")})`;
  };
  return render(tree);
}

const parses = (src: string) => shape(src) !== null;

/** How the manifest says to write this construct, with `a`/`b` as operands. */
function template(c: Construct): string | null {
  const op = c.operators[0]?.spellings[0];
  if (!op) return null;
  const operands = operandsOf(c.template);
  if (c.fixity === "infix" && operands.length === 2) return `a ${op} b`;
  if (c.fixity === "prefix" && operands.length === 1) return `${op} a`;
  return null;
}

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
    execFileSync(process.execPath, [join(ROOT, "scripts/generate-language-manifest.mjs"), "--check"],
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

describe("the construct table", () => {
  const constructs = manifest.constructs;
  const operandBearing = constructs.filter((c) => template(c) !== null);

  it("gives every operator at least one spelling that parses", () => {
    expect(operandBearing.length).toBeGreaterThan(10);
    for (const c of constructs) {
      for (const op of c.operators) {
        expect(op.spellings.length).toBeGreaterThan(0);
        for (const spelling of op.spellings) {
          const src = c.fixity === "infix" ? `a ${spelling} b`
            : c.fixity === "prefix" ? `${spelling} a`
            : null;
          if (src) expect({ [src]: parses(src) }).toEqual({ [src]: true });
        }
      }
    }
  });

  it("associates the way it says it does", () => {
    const infix = constructs.filter((c) => c.associativity !== null && c.fixity === "infix");
    expect(infix.length).toBeGreaterThan(5);
    for (const c of infix) {
      const op = c.operators[0].spellings[0];
      const flat = `a ${op} b ${op} c`;
      const left = `(a ${op} b) ${op} c`;
      const right = `a ${op} (b ${op} c)`;
      // Chaining has to be legal at all, or the claim is vacuous.
      expect({ [flat]: parses(flat) }).toEqual({ [flat]: true });
      expect(shape(left)).not.toBe(shape(right));
      expect({ [c.id]: shape(flat) })
        .toEqual({ [c.id]: shape(c.associativity === "left" ? left : right) });
    }
  });

  it("recovers every operand slot the arity table declares", () => {
    // Two routes to the same fact: this walks the template, the arity table
    // counts the alternative's cascade words. `implies` is the case that bites
    // -- its else-branch operand sits inside an `optional`.
    for (const c of constructs) {
      expect({ [c.id]: operandsOf(c.template).length })
        .toEqual({ [c.id]: c.arity.slots.length });
    }
  });

  it("predicts exactly which operands need parentheses", () => {
    // The template gives the level each slot descends to, so a subexpression
    // fits without parentheses iff its own precedence is at least that level.
    const disagreements: string[] = [];
    for (const outer of constructs) {
      const operands = operandsOf(outer.template);
      if (outer.fixity !== "infix" || operands.length !== 2) continue;
      const op = outer.operators[0].spellings[0];
      for (const inner of operandBearing) {
        const sub = template(inner)!;
        for (const [slot, level] of operands.entries()) {
          const bare = slot === 0 ? `${sub} ${op} b` : `a ${op} ${sub}`;
          const parenthesized = slot === 0 ? `(${sub}) ${op} b` : `a ${op} (${sub})`;
          const fits = inner.precedence >= level;
          const agrees = fits
            ? shape(bare) === shape(parenthesized)
            : shape(bare) !== shape(parenthesized);
          if (!agrees) {
            disagreements.push(
              `${outer.id} slot ${slot} (needs >= ${level}) with ${inner.id} (${inner.precedence}): ` +
              `predicted ${fits ? "fits" : "needs parens"} -- ${JSON.stringify(bare)}`);
          }
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("records the cardinality level that `+` skips", () => {
    // The one place a flat precedence number would mislead: expr8 takes its
    // right operand at expr10, so `a + #b` is a parse error while `#a + b` is
    // not. A regression here means the template's levels have collapsed to
    // neighbours.
    const union = constructs.find((c) => c.id === "unionDifference")!;
    const card = constructs.find((c) => c.id === "cardinality")!;
    expect(operandsOf(union.template)[1]).toBeGreaterThan(card.precedence);
    expect(parses("a + #b")).toBe(false);
    expect(parses("a + (#b)")).toBe(true);
    expect(parses("#a + b")).toBe(true);
  });

  it("accepts an expression at the stated inner level inside its delimiters", () => {
    // `some x: A | x in b` is a level-0 expression -- the loosest the language
    // has -- so it needs parentheses anywhere except a slot that accepts 0.
    const body = "some x : A | x in b";
    const delimited = constructs.filter((c) => c.parts.open && c.parts.close);
    expect(delimited.length).toBeGreaterThan(3);
    for (const c of delimited) {
      const operands = operandsOf(c.template);
      const level = innerOf(c.template) ?? operands[operands.length - 1];
      expect({ [c.id]: level }).toEqual({ [c.id]: 0 });
      const [open, close] = [c.parts.open[0], c.parts.close[0]];
      // Some brackets follow a receiver (`r[...]`) and some do not; the
      // manifest does not say which, so either spelling counts.
      const bare = `${open}${body}${close}`;
      const applied = `r ${open}${body}${close}`;
      expect({ [c.id]: parses(bare) || parses(applied) }).toEqual({ [c.id]: true });
    }
  });

  it("lists builtins that are callable through the application construct", () => {
    const app = constructs.find((c) => c.id === "application")!;
    const [open, close, sep] = [app.parts.open[0], app.parts.close[0], app.parts.separator[0]];
    const all = manifest.builtins;
    expect(all.binary.length + all.unary.length + all.set.length).toBeGreaterThan(5);
    for (const name of all.binary) expect(parses(`${name}${open}1${sep} 2${close}`)).toBe(true);
    for (const name of all.unary) expect(parses(`${name}${open}1${close}`)).toBe(true);
    for (const name of all.set) expect(parses(`${name}${open}r${close}`)).toBe(true);
  });

  it("writes numbers the way the grammar reads them", () => {
    const digits = expand(manifest.number.digits);
    expect(digits).toContain("7");
    const negation = constructs.find((c) => c.id === "constant")!.parts.negation[0];
    for (const d of digits) {
      expect(parses(d)).toBe(true);
      expect(parses(`${negation}${d}`)).toBe(true);
      expect(parses(`${d}${manifest.number.decimalPoint}${d}`)).toBe(true);
    }
  });
});
