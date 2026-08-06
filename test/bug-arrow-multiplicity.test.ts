import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";
import { TTTDataInstance } from "./testdatainstances";

function errorMessage(result: EvaluationResult): string | undefined {
  return result !== null && typeof result === "object" && !Array.isArray(result) && "error" in result
    ? result.error.message
    : undefined;
}

function tuples(result: EvaluationResult, expected: Tuple[]) {
  return Array.isArray(result) && areTupleArraysEqual(result as Tuple[], expected);
}

// The grammar admits multiplicity annotations on `->` because field
// declarations use them. They are constraints, not operators: an annotated
// arrow has no value of its own, and the evaluator used to answer with the
// full cross product as if the annotations were not written.
describe("sgq-evaluator — arrows carrying multiplicity annotations", () => {
  const ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());

  it("rejects an annotated arrow instead of dropping the annotation", () => {
    for (const expr of [
      "Board one -> lone Player",
      "Board one -> Player",
      "Board -> lone Player",
      "Board set -> Player",
      "Board -> set Player",
      "Board some -> two Player",
    ]) {
      expect(errorMessage(ev.evaluateExpression(expr))).toContain(
        "they are declaration and constraint syntax, not part of an expression"
      );
    }
  });

  it("names the annotation it is refusing", () => {
    expect(errorMessage(ev.evaluateExpression("Board one -> lone Player"))).toContain(
      "Cannot evaluate the multiplicity annotations in 'one->lone'"
    );
    expect(errorMessage(ev.evaluateExpression("Board -> set Player"))).toContain(
      "Cannot evaluate the multiplicity annotations in '->set'"
    );
  });

  it("leaves the plain cross product alone", () => {
    expect(tuples(ev.evaluateExpression("X0 -> O0"), [["X0", "O0"]])).toBe(true);
    expect(
      tuples(ev.evaluateExpression("(X0 + O0) -> Board0"), [
        ["X0", "Board0"],
        ["O0", "Board0"],
      ])
    ).toBe(true);
    expect(tuples(ev.evaluateExpression("none -> Player"), [])).toBe(true);
  });

  it("keeps `one` and friends working as multiplicity tests", () => {
    expect(ev.evaluateExpression("one X0")).toBe(true);
    expect(ev.evaluateExpression("lone (Player - Player)")).toBe(true);
    expect(ev.evaluateExpression("some (X0 -> O0)")).toBe(true);
  });
});
