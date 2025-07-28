import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "../test/tttdatainstance";

describe("Understanding simplified behavior", () => {
  let datum: TTTDataInstance;
  let evaluator: SimpleGraphQueryEvaluator;

  beforeEach(() => {
    datum = new TTTDataInstance();
    evaluator = new SimpleGraphQueryEvaluator(datum);
  });

  it("should show how unknown identifiers work as labels", () => {
    console.log("\n=== Testing simplified approach ===");
    
    // Test unknown identifier directly
    try {
      const result1 = evaluator.evaluateExpression('black');
      console.log("black:", result1);
    } catch (e: any) {
      console.log("black error:", e.message);
    }
    
    // Test == comparison with unknown identifiers
    try {
      const result2 = evaluator.evaluateExpression('black == black');
      console.log("black == black:", result2);
    } catch (e: any) {
      console.log("black == black error:", e.message);
    }
    
    // Test == comparison between known and unknown 
    try {
      const result3 = evaluator.evaluateExpression('X == black');
      console.log("X == black:", result3);
    } catch (e: any) {
      console.log("X == black error:", e.message);
    }
    
    // Test different unknown identifiers
    try {
      const result4 = evaluator.evaluateExpression('red == blue');
      console.log("red == blue:", result4);
    } catch (e: any) {
      console.log("red == blue error:", e.message);
    }
    
    // Test the problematic case from the issue
    try {
      const result5 = evaluator.evaluateExpression('{ x : X | x == black }');
      console.log("{ x : X | x == black }:", result5);
    } catch (e: any) {
      console.log("{ x : X | x == black } error:", e.message);
    }
    
    expect(true).toBe(true); // Just to make the test pass
  });
});