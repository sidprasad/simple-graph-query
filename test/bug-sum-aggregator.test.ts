import { SimpleGraphQueryEvaluator } from "../src";
import { RBTTDataInstance, TTTDataInstance } from "./testdatainstances";
import { errorMessage } from "./helpers";


// `sum` has its own lexer token, so `sum[e]` used to miss the builtin dispatch
// in box-join position and join against a relation named `sum` instead -- an
// empty set, reported as no error at all.
describe("sgq-evaluator — `sum[e]` aggregates", () => {
  const ttt = new SimpleGraphQueryEvaluator(new TTTDataInstance());
  const rbt = new SimpleGraphQueryEvaluator(new RBTTDataInstance());

  it("adds up a set of integers", () => {
    expect(ttt.evaluateExpression("sum[Int]")).toBe(-8); // -8 .. 7
    expect(ttt.evaluateExpression("sum[1 + 2 + 3]")).toBe(6);
    expect(ttt.evaluateExpression("sum[3]")).toBe(3);
  });

  it("counts each element once, like every other set", () => {
    expect(ttt.evaluateExpression("sum[1 + 1]")).toBe(1);
  });

  it("resolves integers that arrive as strings", () => {
    // 3 + 5 + 7 + 10 + 12 + 15 + 18
    expect(rbt.evaluateExpression("sum[@:(RBTreeNode.value)]")).toBe(70);
    expect(ttt.evaluateExpression('sum["3" + "5"]')).toBe(8);
  });

  it("sums the empty set to 0, where min and max have no answer", () => {
    expect(ttt.evaluateExpression("sum[none]")).toBe(0);
    expect(ttt.evaluateExpression("sum[Player - Player]")).toBe(0);
    expect(errorMessage(ttt.evaluateExpression("min[none]"))).toContain(
      "min requires a non-empty set"
    );
  });

  it("rejects the same arguments min and max reject", () => {
    expect(errorMessage(ttt.evaluateExpression("sum[Board]"))).toContain(
      'sum expects all elements to be numbers, got: "Board0"'
    );
    expect(errorMessage(ttt.evaluateExpression("sum[board]"))).toContain(
      "sum expects a set of arity 1 (single column)"
    );
  });

  it("leaves the `sum x : S | e` quantifier alone", () => {
    expect(ttt.evaluateExpression("sum i : Int | i")).toBe(-8);
    expect(ttt.evaluateExpression("sum i : (1 + 2 + 3) | i")).toBe(6);
    expect(ttt.evaluateExpression("sum i : Int | 1")).toBe(16);
    // The aggregator and the quantifier nest without confusing each other.
    expect(ttt.evaluateExpression("sum i : (1 + 2) | sum[i + 3]")).toBe(9);
  });

  it("names the builtin outside box-join position, as `min` and `max` do", () => {
    // Bare `sum` is not a set; it evaluates to the builtin's name, which is
    // what every other builtin has always done.
    expect(ttt.evaluateExpression("sum")).toBe("sum");
    expect(ttt.evaluateExpression("min")).toBe("min");
    // And, like them, it is not reported as an unresolved name.
    expect(ttt.evaluateExpressionWithDiagnostics("sum").diagnostics).toEqual([]);
    expect(ttt.evaluateExpressionWithDiagnostics("min").diagnostics).toEqual([]);
  });
});
