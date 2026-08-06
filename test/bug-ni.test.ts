import { SimpleGraphQueryEvaluator } from "../src";
import { RBTTDataInstance, TTTDataInstance } from "./testdatainstances";

// `ni` is Forge's reverse containment: `a ni b` holds exactly when `b in a`.
// It is NOT the negation of `in` -- for two overlapping-but-unequal sets both
// `a in b` and `a ni b` are false.
describe("sgq-evaluator — `ni` is reverse containment", () => {
  let ttt: SimpleGraphQueryEvaluator;
  beforeEach(() => {
    ttt = new SimpleGraphQueryEvaluator(new TTTDataInstance());
  });

  it("reads as equality between two scalars", () => {
    expect(ttt.evaluateExpression("1 ni 1")).toBe(true);
    expect(ttt.evaluateExpression("1 ni 2")).toBe(false);
    expect(ttt.evaluateExpression("X0 ni X0")).toBe(true);
    expect(ttt.evaluateExpression("X0 ni O0")).toBe(false);
  });

  it("holds when a set is given one of its own elements", () => {
    expect(ttt.evaluateExpression("Board ni Board0")).toBe(true);
    expect(ttt.evaluateExpression("Player ni X0")).toBe(true);
    expect(ttt.evaluateExpression("Board ni X0")).toBe(false);
  });

  it("fails when a scalar is given a larger set", () => {
    expect(ttt.evaluateExpression("Board0 ni Board")).toBe(false);
    expect(ttt.evaluateExpression("X0 ni Player")).toBe(false);
    // ...unless that set is a subset of the singleton.
    expect(ttt.evaluateExpression("X0 ni (X0 + X0)")).toBe(true);
    expect(ttt.evaluateExpression("X0 ni none")).toBe(true);
  });

  it("is subset the other way round between two sets", () => {
    expect(ttt.evaluateExpression("Player ni (X0 + O0)")).toBe(true);
    expect(ttt.evaluateExpression("(X0 + O0) ni Player")).toBe(true);
    expect(ttt.evaluateExpression("Player ni X")).toBe(true);
    expect(ttt.evaluateExpression("X ni Player")).toBe(false);
    expect(ttt.evaluateExpression("Board ni (Board0 + X0)")).toBe(false);
  });

  it("is not the negation of `in`: overlapping sets fail both ways", () => {
    // {X0, Board0} and {O0, Board0} share Board0, so neither contains the
    // other -- `in` and `ni` are both false. Under the old `!in` reading one
    // of them would have been true.
    expect(ttt.evaluateExpression("(X0 + Board0) in (O0 + Board0)")).toBe(false);
    expect(ttt.evaluateExpression("(X0 + Board0) ni (O0 + Board0)")).toBe(false);
  });

  it("keeps working under `not`", () => {
    expect(ttt.evaluateExpression("Board not ni Board0")).toBe(false);
    expect(ttt.evaluateExpression("Board0 not ni Board")).toBe(true);
  });

  it("agrees with the swapped `in` on every pair, in every instance", () => {
    const cases: [SimpleGraphQueryEvaluator, string[]][] = [
      [
        new SimpleGraphQueryEvaluator(new TTTDataInstance()),
        ["none", "X0", "Board0", "Player", "X", "Board", "X0 + O0", "Board0 + X0", "Game0.initialState"],
      ],
      [
        new SimpleGraphQueryEvaluator(new RBTTDataInstance()),
        ["none", "n6", "n9", "RBTreeNode", "int", "n6 + n9", "n6.left", "n6.color"],
      ],
    ];
    for (const [ev, exprs] of cases) {
      for (const a of exprs) {
        for (const b of exprs) {
          const ni = ev.evaluateExpression(`(${a}) ni (${b})`);
          const swapped = ev.evaluateExpression(`(${b}) in (${a})`);
          expect(typeof ni).toBe("boolean");
          expect({ a, b, ni }).toEqual({ a, b, ni: swapped });
        }
      }
    }
  });
});
