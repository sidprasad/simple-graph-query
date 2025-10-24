import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";

// helper function to check if an evaluated result is equivalent to a given tuple
// array (when treated as a set of tuples)
function areEquivalentTupleArrays(result: any, expected: Tuple[]) {
  // check if result is a Tuple[]
  if (Array.isArray(result)) {
    const resultTuples = result as Tuple[];
    return areTupleArraysEqual(resultTuples, expected);
  }
  return false;
}

describe("Performance tests", () => {
  it("efficiently evaluates set operations with large result sets", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const startTime = performance.now();
    
    // Test set union
    const unionExpr = "Int + Int";
    const unionResult = evaluatorUtil.evaluateExpression(unionExpr);
    
    // Test set intersection
    const intersectionExpr = "Int & Int";
    const intersectionResult = evaluatorUtil.evaluateExpression(intersectionExpr);
    
    // Test set difference
    const differenceExpr = "Int - Int";
    const differenceResult = evaluatorUtil.evaluateExpression(differenceExpr);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete in reasonable time
    expect(elapsed).toBeLessThan(1000); // Less than 1 second
    
    // Verify results
    expect(Array.isArray(unionResult)).toBe(true);
    expect(Array.isArray(intersectionResult)).toBe(true);
    expect(Array.isArray(differenceResult)).toBe(true);
  });

  it("efficiently evaluates set comprehensions", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const startTime = performance.now();
    
    // This creates a cartesian product and filters
    const expr = "{i, j: Int | some Board6.board[i][j]}";
    const result = evaluatorUtil.evaluateExpression(expr);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete quickly with optimized operations
    expect(elapsed).toBeLessThan(500);
    
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

  it("efficiently handles repeated evaluations with caching", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // First evaluation
    const start1 = performance.now();
    const result1 = evaluatorUtil.evaluateExpression("Board6.board[0][0]");
    const time1 = performance.now() - start1;

    // Second evaluation (should benefit from any parsing/setup optimizations)
    const start2 = performance.now();
    const result2 = evaluatorUtil.evaluateExpression("Board6.board[0][0]");
    const time2 = performance.now() - start2;

    // Results should be the same
    expect(areEquivalentTupleArrays(result1, [["O0"]])).toBe(true);
    expect(areEquivalentTupleArrays(result2, [["O0"]])).toBe(true);
    
    // Both should be reasonably fast
    expect(time1).toBeLessThan(100);
    expect(time2).toBeLessThan(100);
  });

  it("efficiently handles complex expressions with joins", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const startTime = performance.now();
    
    // Test dot join which is a common operation
    const expr = "Board6.board.O";
    const result = evaluatorUtil.evaluateExpression(expr);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete quickly with optimized join
    expect(elapsed).toBeLessThan(100);
    expect(Array.isArray(result)).toBe(true);
  });
});
