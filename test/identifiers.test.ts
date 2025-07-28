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
    const expr = "{ x : RBTreeNode | @:(x.color) = black }";

    const result = evaluatorUtil.evaluateExpression(expr);

    // And this should be the set of all black nodes
    //expect(result).toBe(2);
  });

  
});
