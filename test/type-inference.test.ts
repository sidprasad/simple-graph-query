import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance, RBTTDataInstance } from "./testdatainstances";

describe("@: operator with string-first approach", () => {
  
  it("should return strings by default for all literals", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test that @: returns strings by default (addressing @sidprasad's concern)
    const result1 = evaluatorUtil.evaluateExpression('@:(1)');
    expect(result1).toBe("1");
    expect(typeof result1).toBe('string');

    const result2 = evaluatorUtil.evaluateExpression('@:(42)');
    expect(result2).toBe("42");
    expect(typeof result2).toBe('string');

    const result3 = evaluatorUtil.evaluateExpression('@:(true)');
    expect(result3).toBe("true");
    expect(typeof result3).toBe('string');

    const result4 = evaluatorUtil.evaluateExpression('@:(false)');
    expect(result4).toBe("false");
    expect(typeof result4).toBe('string');
  });

  it("should return string labels from atoms by default", () => {
    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test that atom labels are returned as strings by default (new behavior)
    const result1 = evaluatorUtil.evaluateExpression('@:(n14)');
    expect(result1).toBe("12");
    expect(typeof result1).toBe('string');

    // Test string labels from atoms (unchanged behavior)
    const result2 = evaluatorUtil.evaluateExpression('@:(n2)');
    expect(result2).toBe("black");
    expect(typeof result2).toBe('string');

    const result3 = evaluatorUtil.evaluateExpression('@:(n5)');
    expect(result3).toBe("red");
    expect(typeof result3).toBe('string');
  });

  it("should maintain string consistency in default comparisons", () => {
    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // String comparison should work as before (both return strings now)
    const result1 = evaluatorUtil.evaluateExpression('@:(n14) = @:(12)');
    expect(result1).toBe(true);

    // Both sides should be strings now
    const leftSide = evaluatorUtil.evaluateExpression('@:(n14)');
    const rightSide = evaluatorUtil.evaluateExpression('@:(12)');
    expect(typeof leftSide).toBe('string');
    expect(typeof rightSide).toBe('string');
    expect(leftSide).toBe("12");
    expect(rightSide).toBe("12");

    // String comparison should still work
    const result2 = evaluatorUtil.evaluateExpression('@:(n2) = black');
    expect(result2).toBe(true);
  });

  it("should demonstrate that strings are the default behavior", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Default behavior returns strings, preventing unexpected type coercion
    const result1 = evaluatorUtil.evaluateExpression('@:(1) = 1');
    expect(result1).toBe(false); // "1" != 1 (good - prevents unexpected matches)

    const result2 = evaluatorUtil.evaluateExpression('@:(true) = true');
    expect(result2).toBe(false); // "true" != true (good - prevents unexpected matches)

    // But string-to-string comparisons still work
    const result3 = evaluatorUtil.evaluateExpression('@:(1) = @:(1)');
    expect(result3).toBe(true); // "1" == "1"
  });

  it("should preserve backward compatibility for existing usage patterns", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // These expressions from existing tests should still work
    const result1 = evaluatorUtil.evaluateExpression('@:(X0) = @:(X0)');
    expect(result1).toBe(true);

    const result2 = evaluatorUtil.evaluateExpression('@:(O0) = @:(O0)');
    expect(result2).toBe(true);

    // Labels should still be strings (unchanged behavior)
    const x0Label = evaluatorUtil.evaluateExpression('@:(X0)');
    const o0Label = evaluatorUtil.evaluateExpression('@:(O0)');
    expect(x0Label).toBe("red");
    expect(o0Label).toBe("blue");
    expect(typeof x0Label).toBe('string');
    expect(typeof o0Label).toBe('string');
  });

  it("should return string labels by default for numeric atom labels", () => {
    const datum = new RBTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test various numeric formats in labels - now returns strings by default
    const result1 = evaluatorUtil.evaluateExpression('@:(n1)'); // label "10"
    expect(result1).toBe("10");
    expect(typeof result1).toBe('string');

    const result2 = evaluatorUtil.evaluateExpression('@:(n4)'); // label "5" 
    expect(result2).toBe("5");
    expect(typeof result2).toBe('string');

    const result3 = evaluatorUtil.evaluateExpression('@:(n7)'); // label "3"
    expect(result3).toBe("3");
    expect(typeof result3).toBe('string');
  });

  it("should return strings by default for decimal number literals", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test decimal number literals - now return strings by default
    const result1 = evaluatorUtil.evaluateExpression('@:(3.14)');
    expect(result1).toBe("3.14");
    expect(typeof result1).toBe('string');

    const result2 = evaluatorUtil.evaluateExpression('@:(0.5)');
    expect(result2).toBe("0.5");
    expect(typeof result2).toBe('string');
  });

  it("should return numeric values for decimal number literals with @num:", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test decimal number literals with @num: - returns numbers
    const result1 = evaluatorUtil.evaluateExpression('@num:(3.14)');
    expect(result1).toBe(3.14);
    expect(typeof result1).toBe('number');

    const result2 = evaluatorUtil.evaluateExpression('@num:(0.5)');
    expect(result2).toBe(0.5);
    expect(typeof result2).toBe('number');

    const result3 = evaluatorUtil.evaluateExpression('@num:(42.0)');
    expect(result3).toBe(42.0);
    expect(typeof result3).toBe('number');
  });

  it("should support decimal numbers in arithmetic operations", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test decimal arithmetic
    const result1 = evaluatorUtil.evaluateExpression('add[@num:(3.14), @num:(2.86)]');
    expect(result1).toBe(6);

    const result2 = evaluatorUtil.evaluateExpression('multiply[@num:(0.5), @num:(4.0)]');
    expect(result2).toBe(2);
  });
});