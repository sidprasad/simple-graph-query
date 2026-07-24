import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";
import { RBTTDataInstance } from "./testdatainstances";

function ev(expr: string): EvaluationResult {
  return new SimpleGraphQueryEvaluator(new RBTTDataInstance()).evaluateExpression(expr);
}

function sameSet(result: EvaluationResult, expected: Tuple[]) {
  return Array.isArray(result) && areTupleArraysEqual(result as Tuple[], expected);
}

describe("numeric-comparison optimizer must not break `all`", () => {
  // The optimizer generates only the *satisfying* bindings of a comparison and
  // skips body evaluation. That is unsound for `all`, whose truth depends on the
  // existence of a *falsifying* binding. Over the set {1,2} every comparison
  // below has at least one violating ordered pair, so each `all` is false.
  it("all a,b: {1,2} | a <= b  => false (pair (2,1) violates)", () => {
    expect(ev("all a, b : (1 + 2) | a <= b")).toBe(false);
  });
  it("all a,b: {1,2} | a < b   => false", () => {
    expect(ev("all a, b : (1 + 2) | a < b")).toBe(false);
  });
  it("all a,b: {1,2} | a > b   => false", () => {
    expect(ev("all a, b : (1 + 2) | a > b")).toBe(false);
  });
  it("all a,b: {1,2} | a >= b  => false", () => {
    expect(ev("all a, b : (1 + 2) | a >= b")).toBe(false);
  });
  it("all a,b: {1,2} | a != b  => false (reflexive pairs violate)", () => {
    expect(ev("all a, b : (1 + 2) | a != b")).toBe(false);
  });

  it("still returns true when every binding genuinely satisfies", () => {
    // Singleton {5}: the only pair is (5,5), and 5 <= 5 holds.
    expect(ev("all a, b : (5) | a <= b")).toBe(true);
  });

  it("does not regress the sound quantifiers (they count satisfying bindings)", () => {
    expect(ev("some a, b : (1 + 2) | a < b")).toBe(true);
    expect(ev("no a, b : (1 + 2) | a < b")).toBe(false);
    expect(ev("one a, b : (1 + 2) | a < b")).toBe(true); // only (1,2)
    expect(ev("some a, b : (1 + 2) | a > b")).toBe(true); // (2,1)
  });

  it("optimized set comprehensions are unaffected (they collect satisfying tuples)", () => {
    expect(sameSet(ev("{ a, b : (1 + 2) | a < b }"), [[1, 2]])).toBe(true);
  });
});

describe("transpose (~) of an empty relation", () => {
  it("returns the empty relation instead of throwing", () => {
    // (left - left) is an empty arity-2 relation.
    expect(sameSet(ev("~(left - left)"), [])).toBe(true);
  });

  it("still transposes a non-empty binary relation", () => {
    // left contains (n0, n3); the transpose must contain (n3, n0).
    const result = ev("~left");
    expect(Array.isArray(result)).toBe(true);
    const tuples = result as Tuple[];
    expect(tuples.some((t) => t[0] === "n3" && t[1] === "n0")).toBe(true);
  });

  it("still rejects a non-empty relation whose arity is not 2", () => {
    // RBTreeNode is a unary set; ~ of it is an arity error.
    const result = ev("~RBTreeNode");
    expect((result as any)?.error).toBeDefined();
  });
});
