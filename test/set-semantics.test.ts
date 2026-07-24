import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";
import { RBTTDataInstance } from "./testdatainstances";

// A relation/set result is a Tuple[]; compare as sets of tuples.
function sameSet(result: EvaluationResult, expected: Tuple[]) {
  if (Array.isArray(result)) {
    return areTupleArraysEqual(result as Tuple[], expected);
  }
  return false;
}

function ev(expr: string): EvaluationResult {
  return new SimpleGraphQueryEvaluator(new RBTTDataInstance()).evaluateExpression(expr);
}

describe("scalars and `none` as relations (Alloy/Forge set semantics)", () => {
  // ---- Fix 1: `none` is the empty relation, not the string "none" ----
  describe("`none` constant", () => {
    it("evaluates to the empty set", () => {
      expect(sameSet(ev("none"), [])).toBe(true);
    });

    it("is empty under multiplicity checks", () => {
      expect(ev("no none")).toBe(true);
      expect(ev("some none")).toBe(false);
    });

    it("has cardinality 0", () => {
      expect(ev("#none")).toBe(0);
    });

    it("is a union/difference identity and does not leak a `none` element", () => {
      // RBTreeNode + none == RBTreeNode
      const base = ev("RBTreeNode");
      expect(sameSet(ev("RBTreeNode + none"), base as Tuple[])).toBe(true);
      // no spurious ["none"] atom sneaks in
      expect(sameSet(ev("RBTreeNode & none"), [])).toBe(true);
      expect(sameSet(ev("none + none"), [])).toBe(true);
    });
  });

  // ---- Fix 2: a bare scalar is a singleton set ----
  describe("cardinality and multiplicity on scalars", () => {
    it("counts a scalar as a singleton", () => {
      expect(ev("#5")).toBe(1);
      expect(ev("#(add[1, 2])")).toBe(1);
    });

    it("treats a scalar as `some`/`one`/`lone`", () => {
      expect(ev("some 5")).toBe(true);
      expect(ev("one 5")).toBe(true);
      expect(ev("lone 5")).toBe(true);
      expect(ev("no 5")).toBe(false);
      expect(ev("two 5")).toBe(false);
    });

    it("works on scalars produced by arithmetic builtins", () => {
      expect(ev("some (add[2, 3])")).toBe(true);
      expect(ev("one (subtract[10, 4])")).toBe(true);
    });
  });

  // ---- Fix 3: union of equal scalars dedups ----
  describe("union of equal scalars", () => {
    it("collapses to a single element", () => {
      expect(sameSet(ev("1 + 1"), [[1]])).toBe(true);
      expect(ev("#(1 + 1)")).toBe(1);
      expect(sameSet(ev("add[1, 1] + add[1, 1]"), [[2]])).toBe(true);
    });

    it("still unions distinct scalars", () => {
      expect(sameSet(ev("1 + 2"), [[1], [2]])).toBe(true);
      expect(ev("#(1 + 2)")).toBe(2);
    });
  });
});
