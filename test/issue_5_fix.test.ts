import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "../test/tttdatainstance";

describe("== comparison typing fixes", () => {
  let datum: TTTDataInstance;
  let evaluator: SimpleGraphQueryEvaluator;

  beforeEach(() => {
    datum = new TTTDataInstance();
    evaluator = new SimpleGraphQueryEvaluator(datum);
  });

  describe("Issue: Label Comparison (==) typing support", () => {
    it("should parse string literals in quotes (was causing parse error)", () => {
      // Before: { x : RBTreeNode | x.color = "black" } led to a parse error
      expect(() => {
        evaluator.evaluateExpression('"black"');
      }).not.toThrow();
      
      expect(evaluator.evaluateExpression('"black"')).toBe("black");
      expect(evaluator.evaluateExpression('"red"')).toBe("red");
    });

    it("should support == comparison with string literals", () => {
      expect(evaluator.evaluateExpression('"black" == "black"')).toBe(true);
      expect(evaluator.evaluateExpression('"black" == "red"')).toBe(false);
    });

    it("should support == comparison with boolean literals (#t and #f)", () => {
      expect(evaluator.evaluateExpression('#t == #t')).toBe(true);
      expect(evaluator.evaluateExpression('#f == #f')).toBe(true);
      expect(evaluator.evaluateExpression('#t == #f')).toBe(false);
    });

    it("should support == comparison with number literals", () => {
      expect(evaluator.evaluateExpression('1 == 1')).toBe(true);
      expect(evaluator.evaluateExpression('2 == 3')).toBe(false);
    });

    it("should work in set comprehensions (the original problematic case)", () => {
      // This was the example from the issue: { x : RBTreeNode | x.color = "black" }
      // We don't have RBTreeNode in our test data, but we can test the pattern
      expect(() => {
        const result = evaluator.evaluateExpression('{ x : X | x == "red" }');
      }).not.toThrow();
    });

    it("should handle mixed boolean formats", () => {
      expect(evaluator.evaluateExpression('true == #t')).toBe(true);
      expect(evaluator.evaluateExpression('false == #f')).toBe(true);
    });
  });
});