import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";

import { TTTDataInstance } from "./tttdatainstance";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";







// helper function to check if an evaluated result is equivalent to a given tuple
// array (when treated as a set of tuples)
function areEquivalentTupleArrays(result: EvaluationResult, expected: Tuple[]) {
  // check if result is a Tuple[]
  if (Array.isArray(result)) {
    const resultTuples = result as Tuple[];
    return areTupleArraysEqual(resultTuples, expected);
  }
  return false;
}

describe("forge-expr-evaluator", () => {
  it("can evaluate a basic expression", () => {
    // tttDatum is being read from a JSON file. This is the DatumParsed<any>
    // object that is used in Sterling -- if one is using Sterling, they should
    // be able to pass in the DatumParsed<any> object from there directly into this
    // tool
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "add[1, 1]";
 // could choose a different index if we wanted to
    const result = evaluatorUtil.evaluateExpression(expr);

    expect(result).toBe(2);
  });

  it("can evaluate an instance-specific expression", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Board6.board[0][0]";

    const result = evaluatorUtil.evaluateExpression(expr);

    // expect(result).toEqual([["O0"]]);
    expect(areEquivalentTupleArrays(result, [["O0"]])).toBe(true);
  });

  it("can evaluate Int qualName", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Int";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(
      areEquivalentTupleArrays(result, [
        [-8],
        [-7],
        [-6],
        [-5],
        [-4],
        [-3],
        [-2],
        [-1],
        [0],
        [1],
        [2],
        [3],
        [4],
        [5],
        [6],
        [7],
      ])
    ).toBe(true);
  });

  it("can evaluate a set comprehension", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "{i, j: Int | some Board6.board[i][j]}";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(
      areEquivalentTupleArrays(result, [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [2, 0],
      ])
    ).toBe(true);
  });

  it("can evaluate cardinality on the result of a set comprehension", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "#{i, j: Int | some Board6.board[i][j]}";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(result).toBe(6);
  });

  it("can evaluate a set comprehension over a set that isn't just `Int`", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "{i: X0 + O0 | true}";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [["X0"], ["O0"]])).toBe(true);
  });

  it("can evaluate -> operation", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "X->O->X";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [["X0", "O0", "X0"]])).toBe(true);
  });

  it("can evaluate basic inter and intra-sig relations", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const expr1 = "Board in Board";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toEqual(true);

    const expr2 = "Board0 in Board";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toEqual(true);
  });

  it("can evaluate a reference to a sig", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Board0";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [["Board0"]])).toBe(true);
  });

  it("can perform truthy quantifications when specifying disjoint", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);


    const expr1 = "all disj i, j : Int | { not i = j }";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toEqual(true);

    const expr2 = "some disj i, j : Int | { i = j }";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toEqual(false);
  });


  it("can evaluate chained dot joins", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Game.next.Board1";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [["Board0"]])).toBe(true);
  });

  it("can evaluate a dot join when neither relation is a singleton", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Game.next.(Game.next)";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(
      areEquivalentTupleArrays(result, [
        ["Board0", "Board2"],
        ["Board1", "Board3"],
        ["Board2", "Board4"],
        ["Board3", "Board5"],
        ["Board4", "Board6"],
      ])
    ).toBe(true);
  });

  it("can evaluate a number", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "1";
    const result = evaluatorUtil.evaluateExpression(expr);

    expect(result).toEqual(1);
  });

  it("can evaluate basic boolean operations", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const expr1 = "false and false";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toEqual(false);

    const expr2 = "false and true";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toEqual(false);

    const expr3 = "true and false";
    const result3 = evaluatorUtil.evaluateExpression(expr3);
    expect(result3).toEqual(false);

    const expr4 = "true and true";
    const result4 = evaluatorUtil.evaluateExpression(expr4);
    expect(result4).toEqual(true);

    const expr5 = "false or false";
    const result5 = evaluatorUtil.evaluateExpression(expr5);
    expect(result5).toEqual(false);

    const expr6 = "false or true";
    const result6 = evaluatorUtil.evaluateExpression(expr6);
    expect(result6).toEqual(true);

    const expr7 = "true or false";
    const result7 = evaluatorUtil.evaluateExpression(expr7);
    expect(result7).toEqual(true);

    const expr8 = "true or true";
    const result8 = evaluatorUtil.evaluateExpression(expr8);
    expect(result8).toEqual(true);

    const expr9 = "false implies false";
    const result9 = evaluatorUtil.evaluateExpression(expr9);
    expect(result9).toEqual(true);

    const expr10 = "false implies true";
    const result10 = evaluatorUtil.evaluateExpression(expr10);
    expect(result10).toEqual(true);

    const expr11 = "true implies false";
    const result11 = evaluatorUtil.evaluateExpression(expr11);
    expect(result11).toEqual(false);

    const expr12 = "true implies true";
    const result12 = evaluatorUtil.evaluateExpression(expr12);
    expect(result12).toEqual(true);
  });


  it("can evaluate a transitive closure", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "^(Game0.next)";
 

    const result = evaluatorUtil.evaluateExpression(expr);
    expect(
      areEquivalentTupleArrays(result, [
        ["Board0", "Board1"],
        ["Board0", "Board2"],
        ["Board0", "Board3"],
        ["Board0", "Board4"],
        ["Board0", "Board5"],
        ["Board0", "Board6"],
        ["Board1", "Board2"],
        ["Board1", "Board3"],
        ["Board1", "Board4"],
        ["Board1", "Board5"],
        ["Board1", "Board6"],
        ["Board2", "Board3"],
        ["Board2", "Board4"],
        ["Board2", "Board5"],
        ["Board2", "Board6"],
        ["Board3", "Board4"],
        ["Board3", "Board5"],
        ["Board3", "Board6"],
        ["Board4", "Board5"],
        ["Board4", "Board6"],
        ["Board5", "Board6"],
      ])
    ).toBe(true);
  });

  it("errors if transitive closure is attempted on a relation of arity other than 2", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "^(Board6.board)"; // has arity 3


    const result = evaluatorUtil.evaluateExpression(expr);
    expect(result).toHaveProperty("error");
  });

  it("can evaluate a reflexive transitive closure", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "*(Game.next)";

    const result = evaluatorUtil.evaluateExpression(expr);
    expect(
      areEquivalentTupleArrays(result, [
        [-8, -8],
        [-7, -7],
        [-6, -6],
        [-5, -5],
        [-4, -4],
        [-3, -3],
        [-2, -2],
        [-1, -1],
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
        [6, 6],
        [7, 7],
        ["X0", "X0"],
        ["O0", "O0"],
        ["Board0", "Board0"],
        ["Board0", "Board1"],
        ["Board0", "Board2"],
        ["Board0", "Board3"],
        ["Board0", "Board4"],
        ["Board0", "Board5"],
        ["Board0", "Board6"],
        ["Board1", "Board1"],
        ["Board1", "Board2"],
        ["Board1", "Board3"],
        ["Board1", "Board4"],
        ["Board1", "Board5"],
        ["Board1", "Board6"],
        ["Board2", "Board2"],
        ["Board2", "Board3"],
        ["Board2", "Board4"],
        ["Board2", "Board5"],
        ["Board2", "Board6"],
        ["Board3", "Board3"],
        ["Board3", "Board4"],
        ["Board3", "Board5"],
        ["Board3", "Board6"],
        ["Board4", "Board4"],
        ["Board4", "Board5"],
        ["Board4", "Board6"],
        ["Board5", "Board5"],
        ["Board5", "Board6"],
        ["Board6", "Board6"],
        ["Game0", "Game0"],
      ])
    ).toBe(true);
  });

  it("errors if reflexive transitive closure is attempted on a relation of arity other than 2", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "*(Board6.board)"; // has arity 3


    const result = evaluatorUtil.evaluateExpression(expr);
    expect(result).toHaveProperty("error");
  });


  it("returns empty, not error for non-existent relation", () => {
 
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "NonExistentRelation";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [])).toBe(true);

  });

  
});
