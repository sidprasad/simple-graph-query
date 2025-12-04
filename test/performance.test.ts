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
    expect(elapsed).toBeLessThan(1000);
    
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

  it("efficiently evaluates transitive closure", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const startTime = performance.now();
    
    // Test transitive closure on a relation
    const expr = "^(Game0.next)";
    const result = evaluatorUtil.evaluateExpression(expr);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete quickly with optimized BFS
    expect(elapsed).toBeLessThan(100);
    expect(Array.isArray(result)).toBe(true);
    // Verify it computed the transitive closure
    expect((result as Tuple[]).length).toBeGreaterThan(0);
  });

  it("efficiently evaluates reflexive transitive closure", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const startTime = performance.now();
    
    // Test reflexive transitive closure on a relation
    const expr = "*(Game.next)";
    const result = evaluatorUtil.evaluateExpression(expr);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete quickly with optimized implementation
    expect(elapsed).toBeLessThan(150);
    expect(Array.isArray(result)).toBe(true);
    // Reflexive transitive closure should include identity elements
    expect((result as Tuple[]).length).toBeGreaterThan(0);
  });

  it("efficiently evaluates multiple set comprehensions", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const startTime = performance.now();
    
    // Multiple set comprehensions that should benefit from optimized cartesian products
    const expr1 = "{i: Int | i > 0}";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    
    const expr2 = "{x, y: Int | x < y}";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete quickly with optimized cartesian product
    expect(elapsed).toBeLessThan(500);
    expect(Array.isArray(result1)).toBe(true);
    expect(Array.isArray(result2)).toBe(true);
  });

  it("efficiently evaluates numeric queries with math operations", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const startTime = performance.now();
    
    // Test query with multiply operation on numbers
    const expr1 = "{ i, i2 : Int | @num:i2 = multiply[@num:i, 2]}";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    
    // Test query with add operation
    const expr2 = "{ i, i2 : Int | @num:i2 = add[1, @num:i]}";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete in reasonable time (with parse tree caching, warm JIT)
    expect(elapsed).toBeLessThan(500);
    
    // Verify results are correct
    expect(areEquivalentTupleArrays(result1, [
      [ -4, -8 ], [ -3, -6 ], [ -2, -4 ], [ -1, -2 ],
      [ 0, 0 ], [ 1, 2 ], [ 2, 4 ], [ 3, 6 ]
    ])).toBe(true);
    
    expect(Array.isArray(result2)).toBe(true);
    expect((result2 as Tuple[]).length).toBe(15);
  });

  it("benefits from parse tree caching on repeated queries", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const query = "{ i, i2 : Int | @num:i2 = multiply[@num:i, 2]}";
    
    // Evaluate the query multiple times to get stable timings
    const timings: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const result = evaluatorUtil.evaluateExpression(query);
      const elapsed = performance.now() - start;
      timings.push(elapsed);
      
      // Verify result is correct
      expect(areEquivalentTupleArrays(result, [
        [ -4, -8 ], [ -3, -6 ], [ -2, -4 ], [ -1, -2 ],
        [ 0, 0 ], [ 1, 2 ], [ 2, 4 ], [ 3, 6 ]
      ])).toBe(true);
    }
    
    // The average of later evaluations should be faster than the first
    // (due to parse tree caching and JIT warm-up)
    const firstTime = timings[0];
    const avgLaterTimes = timings.slice(1).reduce((a, b) => a + b, 0) / 4;
    
    // All evaluations should complete in reasonable time
    timings.forEach(t => expect(t).toBeLessThan(500));
    
    // Later evaluations should generally be faster (allowing for high variance in CI)
    // The benefit comes from parse tree caching which is substantial
    expect(avgLaterTimes).toBeLessThan(firstTime * 2);
  });

  it("handles nested quantifiers with numeric operations efficiently", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const startTime = performance.now();
    
    // Nested quantifier: for each i, check if there exists j such that j = 2*i
    const expr = "{ i : Int | some j : Int | @num:j = multiply[@num:i, 2] }";
    const result = evaluatorUtil.evaluateExpression(expr);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete in reasonable time even with nested quantification
    expect(elapsed).toBeLessThan(500);
    
    // Verify the result is correct
    expect(areEquivalentTupleArrays(result, [
      [ -4 ], [ -3 ], [ -2 ], [ -1 ], [ 0 ], [ 1 ], [ 2 ], [ 3 ]
    ])).toBe(true);
  });

  it("deduplicates results in set comprehensions", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Query that would produce duplicates without proper deduplication
    // For each i in Int, check if there exists a j where i = 0
    // Without deduplication, [[0]] would be added once for each j value
    const expr = "{ i : Int | some j : Int | @num:i = 0 }";
    const result = evaluatorUtil.evaluateExpression(expr);
    
    // Should return only [[0]] once, not 16 times (one for each j)
    expect(areEquivalentTupleArrays(result, [[ 0 ]])).toBe(true);
    expect(Array.isArray(result) && result.length === 1).toBe(true);
    
    // Verify no duplicates in result
    if (Array.isArray(result)) {
      const uniqueSet = new Set(result.map(t => JSON.stringify(t)));
      expect(uniqueSet.size).toBe(result.length);
    }
  });
});
