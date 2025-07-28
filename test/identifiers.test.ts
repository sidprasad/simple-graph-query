import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";

import { RBTTDataInstance } from "./testdatainstances";
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
  it("can run comparisons on labels", () => {
   
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

  
});
