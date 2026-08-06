import { SimpleGraphQueryEvaluator } from "../src";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";
import { RBTTDataInstance, TTTDataInstance } from "./testdatainstances";

function tuples(result: unknown, expected: Tuple[]) {
  return Array.isArray(result) && areTupleArraysEqual(result as Tuple[], expected);
}

// A backquoted name is an atom literal. The evaluator used to answer every one
// of them with the placeholder string "**UNIMPLEMENTED** Backquoted Name".
describe("sgq-evaluator — backquoted atom literals", () => {
  let ev: SimpleGraphQueryEvaluator;
  beforeEach(() => {
    ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());
  });

  it("evaluates to the singleton set holding that atom", () => {
    expect(tuples(ev.evaluateExpression("`Board0"), [["Board0"]])).toBe(true);
    expect(tuples(ev.evaluateExpression("`X0"), [["X0"]])).toBe(true);
    expect(tuples(ev.evaluateExpression("`Game0"), [["Game0"]])).toBe(true);
    expect(tuples(new SimpleGraphQueryEvaluator(new RBTTDataInstance()).evaluateExpression("`n6"), [
      ["n6"],
    ])).toBe(true);
  });

  it("agrees with the bare name where the bare name is an atom", () => {
    for (const atom of ["Board0", "X0", "O0", "Game0"]) {
      expect(ev.evaluateExpression("`" + atom)).toEqual(ev.evaluateExpression(atom));
    }
  });

  it("names only atoms, never the type or relation spelled the same way", () => {
    // Bare `Board` is the type (7 atoms); there is no atom called Board.
    expect(ev.evaluateExpression("#Board")).toBe(7);
    expect(tuples(ev.evaluateExpression("`Board"), [])).toBe(true);
    expect(ev.evaluateExpression("#board")).toBe(21);
    expect(tuples(ev.evaluateExpression("`board"), [])).toBe(true);
  });

  it("composes like any other set expression", () => {
    expect(tuples(ev.evaluateExpression("`Board1.board"), [[1, 1, "X0"]])).toBe(true);
    expect(ev.evaluateExpression("`X0 in Player")).toBe(true);
    expect(ev.evaluateExpression("`Board0 in Board")).toBe(true);
    expect(ev.evaluateExpression("#(`Board0 + Board1)")).toBe(2);
    expect(tuples(ev.evaluateExpression("Board - `Board0"), [
      ["Board1"],
      ["Board2"],
      ["Board3"],
      ["Board4"],
      ["Board5"],
      ["Board6"],
    ])).toBe(true);
  });

  it("warns and evaluates to the empty set when no atom answers to the name", () => {
    const { value, diagnostics } = ev.evaluateExpressionWithDiagnostics("`Board9");
    expect(tuples(value, [])).toBe(true);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe("unresolved-name");
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].name).toBe("Board9");
    // Same treatment an unresolved relation name gets, suggestion included.
    expect(diagnostics[0].message).toContain("Did you mean");
  });

  it("cannot be written twice in one expression -- the lexer takes the pair for a quoted identifier", () => {
    // `` `x` `` is also how a reserved word is escaped, so a second backquote
    // closes the first. This is a lexer-level clash, unreachable from the
    // evaluator; recorded here so the boundary is visible.
    const parseFailed = ev.evaluateExpression("`Board0 + `Board1");
    expect(parseFailed).toMatchObject({ error: expect.any(Error) });
    expect((parseFailed as { error: Error }).error.message).toContain("Error parsing expression");
  });
});
