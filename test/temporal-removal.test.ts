import {
  SimpleGraphQueryEvaluator,
  analyzeForgeExpression,
  FORGE_RESERVED_KEYWORDS,
  quoteIfReserved,
} from "../src";
import { RBTTDataInstance } from "./testdatainstances";
import { evalError } from "./helpers";

// Temporal operators were removed from the language wholesale (grammar,
// lexer, evaluator, analyzer). This file pins what "removed" means:
//
//   1. Temporal operator *syntax* is a parse error, not an UNIMPLEMENTED
//      sentinel smuggled inside a normal-looking result.
//   2. The former keywords are ordinary identifiers now — usable as data
//      names, and subject to the usual unresolved-name diagnostic otherwise.
//   3. The reserved-keyword list agrees, so expression generators no longer
//      backquote these words (a backquoted name means an atom literal, which
//      would change the meaning).

const TEMPORAL_KEYWORDS = [
  "always",
  "eventually",
  "after",
  "before",
  "once",
  "historically",
  "until",
  "release",
  "since",
  "triggered",
];

function ev(expr: string) {
  return new SimpleGraphQueryEvaluator(new RBTTDataInstance()).evaluateExpression(expr);
}

describe("temporal operators are no longer part of the language", () => {
  describe("operator syntax is a parse error", () => {
    it.each([
      "always some RBTreeNode",
      "eventually no RBTreeNode",
      "after some RBTreeNode",
      "before some RBTreeNode",
      "once some RBTreeNode",
      "historically some RBTreeNode",
      "some RBTreeNode until no RBTreeNode",
      "some RBTreeNode release no RBTreeNode",
      "some RBTreeNode since no RBTreeNode",
      "some RBTreeNode triggered no RBTreeNode",
    ])("%s", (expr) => {
      expect(evalError(ev(expr))).toBeDefined();
    });

    it("prime (') is rejected outright, not silently dropped", () => {
      // Before the lexer listener was wired up, the unlexable `'` was skipped
      // with a console warning and `RBTreeNode'` evaluated as `RBTreeNode`.
      expect(evalError(ev("RBTreeNode'"))).toBeDefined();
    });

    it("the analyzer treats temporal syntax as unparseable, i.e. unknown", () => {
      expect(analyzeForgeExpression("always some RBTreeNode").status).toBe("unknown");
    });
  });

  describe("former keywords are ordinary identifiers", () => {
    it.each(TEMPORAL_KEYWORDS)(
      "'%s' resolves like any other name (empty set + unresolved-name warning here)",
      (word) => {
        const evaluator = new SimpleGraphQueryEvaluator(new RBTTDataInstance());
        const { value, diagnostics } = evaluator.evaluateExpressionWithDiagnostics(word);
        expect(value).toEqual([]);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({ kind: "unresolved-name", name: word });
      }
    );

    it("a former keyword works unquoted in expression position", () => {
      // `until` parses as a plain name; set operators accept it like any
      // other (empty) relation.
      expect(ev("no until")).toBe(true);
      expect(ev("RBTreeNode - after")).toEqual(ev("RBTreeNode"));
    });
  });

  describe("reserved-keyword list agrees with the lexer", () => {
    it.each(TEMPORAL_KEYWORDS)("'%s' is not reserved", (word) => {
      expect(FORGE_RESERVED_KEYWORDS.has(word)).toBe(false);
      expect(quoteIfReserved(word, FORGE_RESERVED_KEYWORDS)).toBe(word);
    });

    it("still-reserved words are untouched", () => {
      // Spot-check that the trim didn't take out live keywords.
      for (const word of ["some", "no", "in", "sum", "let", "not", "and"]) {
        expect(FORGE_RESERVED_KEYWORDS.has(word)).toBe(true);
      }
    });
  });
});
