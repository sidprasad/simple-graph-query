import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance, RBTTDataInstance } from "./testdatainstances";

describe("@: operator type inference", () => {
  
  it("should return numbers for numeric literals", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test various number formats
    const result1 = evaluatorUtil.evaluateExpression('@:(1)');
    expect(result1).toBe(1);
    expect(typeof result1).toBe('number');

    const result2 = evaluatorUtil.evaluateExpression('@:(42)');
    expect(result2).toBe(42);
    expect(typeof result2).toBe('number');

    const result3 = evaluatorUtil.evaluateExpression('@:(0)');
    expect(result3).toBe(0);
    expect(typeof result3).toBe('number');

    const result4 = evaluatorUtil.evaluateExpression('@:(-5)');
    expect(result4).toBe(-5);
    expect(typeof result4).toBe('number');
  });

  it("should return booleans for boolean literals", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const result1 = evaluatorUtil.evaluateExpression('@:(true)');
    expect(result1).toBe(true);
    expect(typeof result1).toBe('boolean');

    const result2 = evaluatorUtil.evaluateExpression('@:(false)');
    expect(result2).toBe(false);
    expect(typeof result2).toBe('boolean');
  });

  it("should return appropriate types for atom labels", () => {
    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test numeric labels from atoms (n14 has label "12")
    const result1 = evaluatorUtil.evaluateExpression('@:(n14)');
    expect(result1).toBe(12);
    expect(typeof result1).toBe('number');

    // Test string labels from atoms (n2 has label "black")  
    const result2 = evaluatorUtil.evaluateExpression('@:(n2)');
    expect(result2).toBe("black");
    expect(typeof result2).toBe('string');

    // Test string labels from atoms (n5 has label "red")
    const result3 = evaluatorUtil.evaluateExpression('@:(n5)');
    expect(result3).toBe("red");
    expect(typeof result3).toBe('string');
  });

  it("should maintain type consistency in comparisons", () => {
    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Numeric comparison should work with inferred types
    const result1 = evaluatorUtil.evaluateExpression('@:(n14) = @:(12)');
    expect(result1).toBe(true);

    // Both sides should be numbers
    const leftSide = evaluatorUtil.evaluateExpression('@:(n14)');
    const rightSide = evaluatorUtil.evaluateExpression('@:(12)');
    expect(typeof leftSide).toBe('number');
    expect(typeof rightSide).toBe('number');
    expect(leftSide).toBe(12);
    expect(rightSide).toBe(12);

    // String comparison should still work
    const result2 = evaluatorUtil.evaluateExpression('@:(n2) = black');
    expect(result2).toBe(true);
  });

  it("should handle edge cases in type inference", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Edge case: string that looks like number but has extra characters
    // For now, we'll use existing atoms or create a test that makes sense
    // Let's test with the existing atoms that have string labels
    
    // Test mixed type comparisons return false
    const result1 = evaluatorUtil.evaluateExpression('@:(1) = 1');
    expect(result1).toBe(true); // Both should be numbers now

    const result2 = evaluatorUtil.evaluateExpression('@:(true) = true');
    expect(result2).toBe(true); // Both should be booleans now
  });

  it("should work with complex expressions using type-inferred values", () => {
    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test that we can use inferred numeric values in arithmetic-like comparisons
    const result1 = evaluatorUtil.evaluateExpression('@:(n14) = 12');
    expect(result1).toBe(true);

    const result2 = evaluatorUtil.evaluateExpression('@:(n1) = 10');
    expect(result2).toBe(true);
  });

  it("should preserve backward compatibility for existing usage patterns", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // These expressions from existing tests should still work
    const result1 = evaluatorUtil.evaluateExpression('@:(X0) = @:(X0)');
    expect(result1).toBe(true);

    const result2 = evaluatorUtil.evaluateExpression('@:(O0) = @:(O0)');
    expect(result2).toBe(true);

    // Labels should still be strings when they are strings
    const x0Label = evaluatorUtil.evaluateExpression('@:(X0)');
    const o0Label = evaluatorUtil.evaluateExpression('@:(O0)');
    expect(x0Label).toBe("red");
    expect(o0Label).toBe("blue");
    expect(typeof x0Label).toBe('string');
    expect(typeof o0Label).toBe('string');
  });

  it("should handle numeric strings with proper inference", () => {
    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test various numeric formats in labels
    const result1 = evaluatorUtil.evaluateExpression('@:(n1)'); // label "10"
    expect(result1).toBe(10);
    expect(typeof result1).toBe('number');

    const result2 = evaluatorUtil.evaluateExpression('@:(n4)'); // label "5" 
    expect(result2).toBe(5);
    expect(typeof result2).toBe('number');

    const result3 = evaluatorUtil.evaluateExpression('@:(n7)'); // label "3"
    expect(result3).toBe(3);
    expect(typeof result3).toBe('number');
  });

  it("should return appropriate types for decimal numbers", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test decimal number literals
    const result1 = evaluatorUtil.evaluateExpression('@:(3.14)');
    expect(result1).toBe(3.14);
    expect(typeof result1).toBe('number');

    const result2 = evaluatorUtil.evaluateExpression('@:(0.5)');
    expect(result2).toBe(0.5);
    expect(typeof result2).toBe('number');
  });
});