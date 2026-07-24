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
