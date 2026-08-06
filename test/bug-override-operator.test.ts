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

// `p ++ q` is relational override: q wins wherever the two start at the same
// atom. It used to throw "**NOT IMPLEMENTING FOR NOW**".
describe("sgq-evaluator — `++` override", () => {
  const ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());

  it("replaces the tuples that start where the right operand starts", () => {
    expect(
      tuples(ev.evaluateExpression("initialState ++ (Game0 -> Board3)"), [["Game0", "Board3"]])
    ).toBe(true);
    // Union keeps both; override is the whole point of the distinction.
    expect(
      tuples(ev.evaluateExpression("initialState + (Game0 -> Board3)"), [
        ["Game0", "Board0"],
        ["Game0", "Board3"],
      ])
    ).toBe(true);
  });

  it("drops every tuple sharing an overridden first atom, not just the matching one", () => {
    // Board2 has two entries in `board`; overriding at Board2 removes both.
    expect(ev.evaluateExpression("#(Board2 <: board)")).toBe(2);
    expect(ev.evaluateExpression("#board")).toBe(21);
    expect(ev.evaluateExpression("#(board ++ (Board2 -> 0 -> 0 -> X0))")).toBe(20);
    expect(
      tuples(ev.evaluateExpression("Board2 <: (board ++ (Board2 -> 0 -> 0 -> X0))"), [
        ["Board2", 0, 0, "X0"],
      ])
    ).toBe(true);
  });

  it("leaves untouched first atoms alone", () => {
    expect(
      tuples(ev.evaluateExpression("Board1 <: (board ++ (Board2 -> 0 -> 0 -> X0))"), [
        ["Board1", 1, 1, "X0"],
      ])
    ).toBe(true);
    expect(ev.evaluateExpression("#(next ++ (Game0 -> Board0 -> Board6))")).toBe(1);
  });

  it("treats the empty relation as the identity on both sides", () => {
    expect(tuples(ev.evaluateExpression("initialState ++ none"), [["Game0", "Board0"]])).toBe(true);
    expect(tuples(ev.evaluateExpression("none ++ initialState"), [["Game0", "Board0"]])).toBe(true);
    expect(tuples(ev.evaluateExpression("none ++ none"), [])).toBe(true);
    expect(tuples(ev.evaluateExpression("board ++ board"), ev.evaluateExpression("board") as Tuple[])).toBe(
      true
    );
  });

  it("is union on unary relations, where every tuple is its own first atom", () => {
    expect(tuples(ev.evaluateExpression("X0 ++ O0"), [["X0"], ["O0"]])).toBe(true);
    expect(tuples(ev.evaluateExpression("X0 ++ X0"), [["X0"]])).toBe(true);
    expect(tuples(ev.evaluateExpression("Player ++ Board0"), [["X0"], ["O0"], ["Board0"]])).toBe(
      true
    );
  });

  it("rejects operands of different arity", () => {
    expect(errorMessage(ev.evaluateExpression("initialState ++ Board0"))).toContain(
      "arity mismatch in relational override!"
    );
    expect(errorMessage(ev.evaluateExpression("board ++ initialState"))).toContain(
      "arity mismatch in relational override!"
    );
  });
});
