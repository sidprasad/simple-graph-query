import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";

import { RBTTDataInstance, LabelTestDataInstance } from "./testdatainstances";
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

describe("sgq-evaluator.identifiers  ", () => {
  it("can run comparisons on labels when they are strings.", () => {

    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test that the expression returns all RBTreeNodes where the color is black
    const expr = "{ x : RBTreeNode | @:(x.color) = black }";
    const result = evaluatorUtil.evaluateExpression(expr);

    // This should be the set of all black nodes (5 nodes: n6, n9, n13, n15, n0)
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(5);
      // Check that the returned nodes are the expected ones
      const nodeIds = result.map(tuple => tuple[0]).sort();
      expect(nodeIds).toEqual(['n0', 'n13', 'n15', 'n6', 'n9']);
    }
  });


  it("can run comparisons on labels when they are numbers.", () => {

    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const expr = "{ x : RBTreeNode | @:(x.value) = @:(12) }";
    const result = evaluatorUtil.evaluateExpression(expr);


    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(1);
      const nodeIds = result.map(tuple => tuple[0]).sort();
      expect(nodeIds[0]).toEqual('n13');
    }
  });

  it("can run comparisons on labels with mixed-case identifiers (issue fix)", () => {
    // This test verifies the fix for the label extraction issue
    // where "{y : Color | @:y = Black}" was returning empty
    const datum = new LabelTestDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test with "Black" (uppercase first letter)
    const expr1 = "{y : Color | @:y = Black}";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(areEquivalentTupleArrays(result1, [["atom3"]])).toBe(true);

    // Test with "Red" (uppercase first letter)
    const expr2 = "{y : Color | @:y = Red}";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(areEquivalentTupleArrays(result2, [["atom6"]])).toBe(true);

    // Test that lowercase doesn't match (case-sensitive comparison)
    const expr3 = "{y : Color | @:y = black}";
    const result3 = evaluatorUtil.evaluateExpression(expr3);
    expect(areEquivalentTupleArrays(result3, [])).toBe(true);
  });


});
