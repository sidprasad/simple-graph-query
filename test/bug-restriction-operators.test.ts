import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";
import { errorMessage, tuples } from "./helpers";



// `<:` restricts a relation to the tuples starting in a set, `:>` to the ones
// ending in it. Both used to throw "**NOT IMPLEMENTING FOR NOW**".
describe("sgq-evaluator — `<:` and `:>` restriction", () => {
  const ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());

  it("restricts the domain with `<:`, keeping whole tuples", () => {
    expect(tuples(ev.evaluateExpression("Board1 <: board"), [["Board1", 1, 1, "X0"]])).toBe(true);
    expect(
      tuples(ev.evaluateExpression("Board2 <: board"), [
        ["Board2", 0, 2, "O0"],
        ["Board2", 1, 1, "X0"],
      ])
    ).toBe(true);
    // The join drops the column it matched on; the restriction keeps it.
    expect(tuples(ev.evaluateExpression("Board1.board"), [[1, 1, "X0"]])).toBe(true);
  });

  it("restricts the range with `:>`", () => {
    expect(
      tuples(ev.evaluateExpression("Board2 <: board :> X0"), [["Board2", 1, 1, "X0"]])
    ).toBe(true);
    expect(tuples(ev.evaluateExpression("initialState :> Board0"), [["Game0", "Board0"]])).toBe(
      true
    );
    expect(tuples(ev.evaluateExpression("initialState :> Board1"), [])).toBe(true);
  });

  it("partitions a relation over a set and its complement", () => {
    // Every board entry ends in a Player, so the two halves make up the whole.
    expect(ev.evaluateExpression("add[#(board :> X0), #(board :> O0)]")).toBe(21);
    expect(ev.evaluateExpression("#board")).toBe(21);
    expect(tuples(ev.evaluateExpression("(board :> Player) - board"), [])).toBe(true);
    expect(tuples(ev.evaluateExpression("board - (board :> Player)"), [])).toBe(true);
  });

  it("takes a set on either side, including a multi-element one", () => {
    expect(ev.evaluateExpression("#((Board1 + Board2) <: board)")).toBe(3);
    expect(ev.evaluateExpression("#(next :> (Board1 + Board2))")).toBe(2);
  });

  it("gives back nothing when either operand is empty", () => {
    expect(tuples(ev.evaluateExpression("none <: board"), [])).toBe(true);
    expect(tuples(ev.evaluateExpression("board :> none"), [])).toBe(true);
    expect(tuples(ev.evaluateExpression("none <: none"), [])).toBe(true);
  });

  it("treats a scalar relation as the singleton set it is", () => {
    expect(tuples(ev.evaluateExpression("Board1 <: Board1"), [["Board1"]])).toBe(true);
    expect(tuples(ev.evaluateExpression("Board1 <: Board2"), [])).toBe(true);
    expect(tuples(ev.evaluateExpression("Board <: Board1"), [["Board1"]])).toBe(true);
  });

  it("rejects a restricting set that is not unary", () => {
    expect(errorMessage(ev.evaluateExpression("board <: board"))).toContain(
      "The <: operator restricts by a set of arity 1, but its left operand has arity 4"
    );
    expect(errorMessage(ev.evaluateExpression("board :> board"))).toContain(
      "The :> operator restricts by a set of arity 1, but its right operand has arity 4"
    );
  });
});
