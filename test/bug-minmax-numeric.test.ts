import { SimpleGraphQueryEvaluator } from "../src";
import { RBTTDataInstance, TTTDataInstance } from "./testdatainstances";
import { errorMessage } from "./helpers";


// `min`/`max` used to demand elements that were already JS numbers, so any set
// whose integers arrived as strings -- atom ids, and every `@:` label
// projection -- was rejected as non-numeric.
describe("sgq-evaluator — `min`/`max` over numbers written as strings", () => {
  const rbt = new SimpleGraphQueryEvaluator(new RBTTDataInstance());
  const ttt = new SimpleGraphQueryEvaluator(new TTTDataInstance());

  it("resolves label projections, whose values are strings", () => {
    // The tree's keys are Int atoms; @: projects their labels: 3 5 7 10 12 15 18.
    expect(rbt.evaluateExpression("min[@:(RBTreeNode.value)]")).toBe(3);
    expect(rbt.evaluateExpression("max[@:(RBTreeNode.value)]")).toBe(18);
    expect(rbt.evaluateExpression("min[@:(int)]")).toBe(3);
    expect(rbt.evaluateExpression("max[@:(int)]")).toBe(18);
  });

  it("resolves string literals", () => {
    expect(ttt.evaluateExpression('min["3" + "5"]')).toBe(3);
    expect(ttt.evaluateExpression('max["3" + "5"]')).toBe(5);
    expect(ttt.evaluateExpression('min["-4"]')).toBe(-4);
  });

  it("still evaluates sets that were already numeric", () => {
    expect(ttt.evaluateExpression("min[Int]")).toBe(-8);
    expect(ttt.evaluateExpression("max[Int]")).toBe(7);
    expect(ttt.evaluateExpression("min[1 + 2]")).toBe(1);
    expect(ttt.evaluateExpression("max[3]")).toBe(3);
  });

  it("rejects elements that name no number, quoting the offender", () => {
    expect(errorMessage(ttt.evaluateExpression("min[Board]"))).toContain(
      'min expects all elements to be numbers, got: "Board0"'
    );
    expect(errorMessage(ttt.evaluateExpression("max[X0]"))).toContain(
      'max expects all elements to be numbers, got: "X0"'
    );
    expect(errorMessage(ttt.evaluateExpression("min[true]"))).toContain(
      "min expects all elements to be numbers, got: true"
    );
  });

  it("keeps rejecting empty sets and sets of the wrong arity", () => {
    expect(errorMessage(ttt.evaluateExpression("min[none]"))).toContain(
      "min requires a non-empty set"
    );
    expect(errorMessage(ttt.evaluateExpression("max[none]"))).toContain(
      "max requires a non-empty set"
    );
    expect(errorMessage(ttt.evaluateExpression("min[board]"))).toContain(
      "min expects a set of arity 1 (single column)"
    );
  });
});
