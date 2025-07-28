import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "../test/tttdatainstance";

describe("@: comparison typing fixes", () => {
  let datum: TTTDataInstance;
  let evaluator: SimpleGraphQueryEvaluator;

  beforeEach(() => {
    datum = new TTTDataInstance();
    evaluator = new SimpleGraphQueryEvaluator(datum);
  });

  describe("Issue: Label Comparison (@:) typing support", () => {
    it("should support @: operator with unquoted label identifiers", () => {
      // The main issue was that unquoted identifiers like 'black' should work in label comparisons
      // Unknown identifiers by themselves return empty arrays (for backward compatibility)
      expect(() => {
        evaluator.evaluateExpression('black');
      }).not.toThrow();
      
      expect(evaluator.evaluateExpression('black')).toEqual([]);
      expect(evaluator.evaluateExpression('red')).toEqual([]);
    });

    it("should support @: comparison with label identifiers", () => {
      expect(evaluator.evaluateExpression('@:(black) = @:(black)')).toBe(true);
      expect(evaluator.evaluateExpression('@:(black) = @:(red)')).toBe(false);
    });

    it("should support @: comparison with number literals", () => {
      expect(evaluator.evaluateExpression('@:(1) = @:(1)')).toBe(true);
      expect(evaluator.evaluateExpression('@:(2) = @:(3)')).toBe(false);
    });

    it("should work in set comprehensions (the original problematic case)", () => {
      // This was the example from the issue: { x : RBTreeNode | @:(x.color) = black }
      // We don't have RBTreeNode in our test data, but we can test the pattern
      expect(() => {
        const result = evaluator.evaluateExpression('{ x : X | @:(x) = @:(black) }');
      }).not.toThrow();
    });

    it("should handle mixed label formats", () => {
      expect(evaluator.evaluateExpression('@:(true) = @:(true)')).toBe(true);
      expect(evaluator.evaluateExpression('@:(false) = @:(false)')).toBe(true);
    });
  });
});