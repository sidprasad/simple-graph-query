import { CharStreams, CommonTokenStream } from "antlr4ts";
import { ForgeLexer } from "../src/forge-antlr/ForgeLexer";
import { ForgeParser } from "../src/forge-antlr/ForgeParser";
import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";

function parse(input: string, rule: (p: ForgeParser) => unknown): boolean {
  const lexer = new ForgeLexer(CharStreams.fromString(input));
  const parser = new ForgeParser(new CommonTokenStream(lexer));
  parser.removeErrorListeners();
  lexer.removeErrorListeners();
  let failed = false;
  parser.addErrorListener({ syntaxError: () => { failed = true; } });
  lexer.addErrorListener({ syntaxError: () => { failed = true; } });
  rule(parser);
  return !failed;
}

const parsesAsImport = (s: string) => parse(s, (p) => p.importDecl());

describe("grammar.STRING_TOK", () => {
  // `FILE_PATH_TOK` was renamed to `STRING_TOK` and added to the `const` rule so
  // it is reachable from expressions. It is the SAME token, so the decls that
  // used it before must keep working — two rules with identical patterns would
  // tie, and ANTLR resolves ties by declaration order, silently orphaning one.
  describe("still serves its original decl positions", () => {
    it("parses a quoted path in an import decl", () => {
      expect(parsesAsImport('open "util/ordering"')).toBe(true);
      expect(parsesAsImport('open "a/b/c.frg"')).toBe(true);
      expect(parsesAsImport('open "util/ordering" as ord')).toBe(true);
    });

    it("still parses the unquoted import form", () => {
      expect(parsesAsImport("open util")).toBe(true);
      expect(parsesAsImport("open util[A]")).toBe(true);
    });
  });

  describe("is reachable from expression position", () => {
    const parsesAsExpr = (s: string) => parse(s, (p) => p.parseExpr());

    it("accepts a bare literal as a whole expression", () => {
      expect(parsesAsExpr('"Black"')).toBe(true);
      expect(parsesAsExpr('""')).toBe(true);
    });

    it("accepts a literal wherever a const may appear", () => {
      expect(parsesAsExpr('"a" = "b"')).toBe(true);
      expect(parsesAsExpr('"a" + "b"')).toBe(true);
      expect(parsesAsExpr('{x : Player | @:x = "red"}')).toBe(true);
      expect(parsesAsExpr('#("a")')).toBe(true);
      expect(parsesAsExpr('~("a" -> "b")')).toBe(true);
    });

    it("does not require whitespace around neighbouring operators", () => {
      const ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());
      expect(ev.evaluateExpression('"a"+"b"')).toEqual([["a"], ["b"]]);
      expect(ev.evaluateExpression('@:X0="red"')).toBe(true);
      expect(ev.evaluateExpression('("a")="a"')).toBe(true);
    });
  });

  describe("malformed literals are parse errors, not crashes", () => {
    let ev: SimpleGraphQueryEvaluator;
    beforeEach(() => {
      ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());
    });

    const isError = (r: unknown) =>
      r !== null && typeof r === "object" && !Array.isArray(r) && "error" in (r as object);

    it("rejects an unterminated literal", () => {
      for (const expr of ['"', '"a', '"abc', '"a" + "b']) {
        expect(() => ev.evaluateExpression(expr)).not.toThrow();
        expect(isError(ev.evaluateExpression(expr))).toBe(true);
      }
    });

    it("rejects a literal whose closing quote is escaped away", () => {
      // `"a\"` -- the backslash escapes the quote, so the literal never closes.
      expect(isError(ev.evaluateExpression('"a\\"'))).toBe(true);
    });

    it("rejects juxtaposed literals with no operator", () => {
      expect(isError(ev.evaluateExpression('"a" "b"'))).toBe(true);
      expect(isError(ev.evaluateExpression('""""'))).toBe(true);
    });

    it("accepts a long literal", () => {
      const long = "x".repeat(2000);
      expect(ev.evaluateExpression(`"${long}"`)).toBe(long);
    });
  });
});

describe("grammar.STRING_TOK.lexer-interaction", () => {
  let ev: SimpleGraphQueryEvaluator;
  beforeEach(() => {
    ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());
  });

  describe("a literal shields syntax the lexer would otherwise act on", () => {
    it("keeps comment markers as data", () => {
      // STRING_TOK is declared before the comment rules and matches greedily
      // from the opening quote, so a marker inside one is never a comment.
      expect(ev.evaluateExpression('"a // b"')).toBe("a // b");
      expect(ev.evaluateExpression('"a -- b"')).toBe("a -- b");
      expect(ev.evaluateExpression('"/* x */"')).toBe("/* x */");
      expect(ev.evaluateExpression('"#lang forge"')).toBe("#lang forge");
    });

    it("keeps unbalanced comment markers as data", () => {
      expect(ev.evaluateExpression('"a /* b"')).toBe("a /* b");
      expect(ev.evaluateExpression('"a */ b"')).toBe("a */ b");
    });

    it("keeps an apostrophe as data", () => {
      // `'` is not a token at all (primes left the language); outside a
      // string literal it is a lexer error, inside one it is just a character.
      expect(ev.evaluateExpression("\"it's\"")).toBe("it's");
      expect(ev.evaluateExpression("\"x'\"")).toBe("x'");
    });

    it("keeps a backtick as data rather than opening a quoted identifier", () => {
      expect(ev.evaluateExpression('"`backtick`"')).toBe("`backtick`");
    });

    it("keeps query syntax as data", () => {
      expect(ev.evaluateExpression('"{x : Player | true}"')).toBe("{x : Player | true}");
      expect(ev.evaluateExpression('"@:(x.color)"')).toBe("@:(x.color)");
      expect(ev.evaluateExpression('"a -> b"')).toBe("a -> b");
      expect(ev.evaluateExpression('"a & b + c"')).toBe("a & b + c");
    });

    it("spans a literal newline", () => {
      expect(ev.evaluateExpression('"line1\nline2"')).toBe("line1\nline2");
    });
  });

  describe("comments outside a literal still work", () => {
    it("ignores a trailing comment after a literal", () => {
      expect(ev.evaluateExpression('"a" // trailing comment')).toBe("a");
      expect(ev.evaluateExpression('"a" -- trailing comment')).toBe("a");
    });

    it("ignores a block comment between literals", () => {
      expect(ev.evaluateExpression('"a" /* mid */ + "b"')).toEqual([["a"], ["b"]]);
    });

    it("treats // with no space as an identifier, not a comment", () => {
      // Pre-existing and independent of string literals: `/` is a valid
      // IDENTIFIER_TOK character so that qualified names like `util/ordering`
      // lex. For `//x` the identifier and comment rules tie at three
      // characters, and the identifier rule is declared first, so it wins. With
      // a space the comment rule matches longer and wins instead.
      expect(ev.evaluateExpressionWithDiagnostics("//x").diagnostics.map((d) => d.name))
        .toEqual(["//x"]);
      expect(ev.evaluateExpression('"a" // x')).toBe("a");
    });
  });

  describe("quotes inside quotes", () => {
    it("holds an escaped empty literal", () => {
      expect(ev.evaluateExpression('"\\"\\""')).toBe('""');
    });

    it("holds a literal containing an escaped literal", () => {
      expect(ev.evaluateExpression('"@:(x.color) = \\"black\\""')).toBe(
        '@:(x.color) = "black"'
      );
    });

    it("holds two levels of escaping", () => {
      // Source:  "nested \"a \\\" b\" done"
      expect(ev.evaluateExpression('"nested \\"a \\\\\\" b\\" done"')).toBe(
        'nested "a \\" b" done'
      );
    });

    it("round-trips a whole query held as a literal", () => {
      // This is the shape a YAML spec produces: a selector string that itself
      // contains a string literal.
      const inner = '{p : Player | @:p = "red"}';
      const asLiteral = '"' + inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

      expect(ev.evaluateExpression(asLiteral)).toBe(inner);
      // ...and the recovered text is still a working query.
      expect(ev.evaluateExpression(inner)).toEqual([["X0"]]);
    });
  });
});
