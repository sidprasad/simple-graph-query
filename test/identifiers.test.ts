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
    const expr = '{ x : RBTreeNode | @:(x.color) = "black" }';
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
    const expr1 = '{y : Color | @:y = "Black"}';
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(areEquivalentTupleArrays(result1, [["atom3"]])).toBe(true);

    // Test with "Red" (uppercase first letter)
    const expr2 = '{y : Color | @:y = "Red"}';
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(areEquivalentTupleArrays(result2, [["atom6"]])).toBe(true);

    // Test that lowercase doesn't match (case-sensitive comparison)
    const expr3 = '{y : Color | @:y = "black"}';
    const result3 = evaluatorUtil.evaluateExpression(expr3);
    expect(areEquivalentTupleArrays(result3, [])).toBe(true);
  });

  it("does not let instance names capture string literals", () => {
    // `None` is a type id in this instance, so the bare name `None` used to
    // resolve to that type's atoms rather than to the string "None". A quoted
    // literal always means the string, whatever the instance happens to contain.
    const evaluatorUtil = new SimpleGraphQueryEvaluator(new LabelTestDataInstance());

    expect(evaluatorUtil.evaluateExpression('"None"')).toBe("None");
    expect(areEquivalentTupleArrays(
      evaluatorUtil.evaluateExpression('{y : Color | @:y = "None"}'), []
    )).toBe(true);

    // Labels that are not valid identifiers are now expressible at all.
    expect(evaluatorUtil.evaluateExpression('"dark blue"')).toBe("dark blue");
    expect(evaluatorUtil.evaluateExpression('"#FF0000"')).toBe("#FF0000");
    expect(evaluatorUtil.evaluateExpression('"say \\"hi\\""')).toBe('say "hi"');
  });

  it("propagates emptiness through label operators instead of substituting source text", () => {
    // A label operator evaluates its operand first; an operand that legitimately
    // evaluates to the empty set must yield the empty set, not the operand's
    // source text. Previously `@:(none)` returned the string "none" and
    // `@:(n0.colour)` returned the string "n0.colour".
    const evaluatorUtil = new SimpleGraphQueryEvaluator(new RBTTDataInstance());

    for (const op of ["@:", "@str:", "@num:", "@bool:"]) {
      // `none` is the empty relation
      expect(areEquivalentTupleArrays(evaluatorUtil.evaluateExpression(`${op}(none)`), [])).toBe(true);
      // a join that matches nothing (no `colour` field on RBTreeNode)
      expect(areEquivalentTupleArrays(evaluatorUtil.evaluateExpression(`${op}(n0.colour)`), [])).toBe(true);
    }

    // a non-empty operand still resolves to its label
    expect(evaluatorUtil.evaluateExpression("@:(n0.color)")).toBe("black");
  });

});
