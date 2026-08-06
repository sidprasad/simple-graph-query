import { analyzeForgeExpression, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";
import { errorMessage, tuples } from "./helpers";


// `=<` is Forge's second spelling of `<=`. The lexer folds the two into one
// token, so nothing but the evaluator's and analyzer's text dispatch can tell
// them apart -- and neither is allowed to.
describe("sgq-evaluator — `=<` is `<=`", () => {
  let ev: SimpleGraphQueryEvaluator;
  beforeEach(() => {
    ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());
  });

  it("evaluates `=<` instead of rejecting it as an unknown operator", () => {
    expect(ev.evaluateExpression("1 =< 2")).toBe(true);
    expect(ev.evaluateExpression("1 =< 1")).toBe(true);
    expect(ev.evaluateExpression("2 =< 1")).toBe(false);
    expect(ev.evaluateExpression("0 =< 7")).toBe(true);
  });

  it("agrees with `<=` on every pair", () => {
    for (const left of [-2, -1, 0, 1, 5]) {
      for (const right of [-2, 0, 1, 7]) {
        expect(ev.evaluateExpression(`${left} =< ${right}`)).toBe(
          ev.evaluateExpression(`${left} <= ${right}`)
        );
      }
    }
  });

  it("works wherever `<=` works", () => {
    expect(ev.evaluateExpression("#Board =< 7")).toBe(true);
    expect(ev.evaluateExpression("not (1 =< 0)")).toBe(true);
    expect(tuples(ev.evaluateExpression("{i : Int | i =< -6}"), [[-8], [-7], [-6]])).toBe(true);
    expect(ev.evaluateExpression("all i : Int | i =< 7")).toBe(true);
  });

  it("rejects non-numeric operands the way `<=` does", () => {
    expect(errorMessage(ev.evaluateExpression("Board =< 1"))).toContain("number operands");
    expect(errorMessage(ev.evaluateExpression("Board <= 1"))).toContain("number operands");
  });

  it("folds in the static analyzer like `<=`", () => {
    expect(analyzeForgeExpression("1 =< 2").status).toBe("tautology");
    expect(analyzeForgeExpression("1 =< 1").status).toBe("tautology");
    expect(analyzeForgeExpression("2 =< 1").status).toBe("unsat");
    expect(analyzeForgeExpression("Thing =< Thing").status).toBe("tautology");
  });
});
