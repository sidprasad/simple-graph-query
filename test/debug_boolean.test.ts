import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "../test/tttdatainstance";

describe("Testing boolean operations", () => {
  let datum: TTTDataInstance;
  let evaluator: SimpleGraphQueryEvaluator;

  beforeEach(() => {
    datum = new TTTDataInstance();
    evaluator = new SimpleGraphQueryEvaluator(datum);
  });

  it("should debug boolean evaluation", () => {
    console.log("\n=== Testing boolean operations ===");
    
    // Test individual boolean values
    try {
      const result1 = evaluator.evaluateExpression('true');
      console.log("true:", result1, typeof result1);
      console.log("is boolean:", typeof result1 === 'boolean');
    } catch (e: any) {
      console.log("true error:", e.message);
    }
    
    try {
      const result2 = evaluator.evaluateExpression('false');
      console.log("false:", result2, typeof result2);
    } catch (e: any) {
      console.log("false error:", e.message);
    }
    
    // Test the problematic boolean operation
    try {
      const result3 = evaluator.evaluateExpression('false and false');
      console.log("false and false:", result3);
    } catch (e: any) {
      console.log("false and false error:", e.message);
    }
    
    // Test other identifiers to understand the pattern
    try {
      const result4 = evaluator.evaluateExpression('Player');
      console.log("Player:", result4);
    } catch (e: any) {
      console.log("Player error:", e.message);
    }
    
    expect(true).toBe(true);
  });
});