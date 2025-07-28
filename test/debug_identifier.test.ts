import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "../test/tttdatainstance";

describe("Debugging unknown identifier handling", () => {
  let datum: TTTDataInstance;
  let evaluator: SimpleGraphQueryEvaluator;

  beforeEach(() => {
    datum = new TTTDataInstance();
    evaluator = new SimpleGraphQueryEvaluator(datum);
  });

  it("should debug unknown identifier resolution", () => {
    console.log("\n=== Debugging unknown identifier handling ===");
    
    // Test 1: Simple unknown identifier
    try {
      const result1 = evaluator.evaluateExpression('unknown');
      console.log("unknown:", result1);
    } catch (e: any) {
      console.log("unknown error:", e.message);
      console.log("error type:", e.constructor.name);
    }
    
    // Test 2: Unknown identifier in == comparison
    try {
      const result2 = evaluator.evaluateExpression('unknown == unknown');
      console.log("unknown == unknown:", result2);
    } catch (e: any) {
      console.log("unknown == unknown error:", e.message);
      console.log("error type:", e.constructor.name);
    }
    
    // Test 3: Check what expressions look like at the AST level
    try {
      const result3 = evaluator.evaluateExpression('X == unknown');
      console.log("X == unknown:", result3);
    } catch (e: any) {
      console.log("X == unknown error:", e.message);
      console.log("error type:", e.constructor.name);
    }
    
    expect(true).toBe(true);
  });
});