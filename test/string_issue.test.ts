import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "../test/tttdatainstance";

describe("string comparison issue", () => {
  let datum: TTTDataInstance;
  let evaluator: SimpleGraphQueryEvaluator;

  beforeEach(() => {
    datum = new TTTDataInstance();
    evaluator = new SimpleGraphQueryEvaluator(datum);
  });

  it("should handle string literals in quotes with == operator", () => {
    // This currently fails due to parse error
    expect(() => {
      const result = evaluator.evaluateExpression('"red" == "red"');
    }).not.toThrow();
  });

  it("should handle string literals in quotes with = operator", () => {
    // This currently fails due to parse error  
    expect(() => {
      const result = evaluator.evaluateExpression('"red" = "red"');
    }).not.toThrow();
  });

  it("should allow comparison with boolean literals", () => {
    // These should work according to the requirement
    expect(evaluator.evaluateExpression('#t == #t')).toBe(true);
    expect(evaluator.evaluateExpression('#f == #f')).toBe(true);
    expect(evaluator.evaluateExpression('true == true')).toBe(true);
    expect(evaluator.evaluateExpression('false == false')).toBe(true);
    expect(evaluator.evaluateExpression('#t == #f')).toBe(false);
  });

  it("should allow comparison with number literals", () => {
    // These should work according to the requirement
    expect(evaluator.evaluateExpression('1 == 1')).toBe(true);
    expect(evaluator.evaluateExpression('2 == 3')).toBe(false);
    expect(evaluator.evaluateExpression('0 == 0')).toBe(true);
  });

  it("should work in set comprehensions with string literals", () => {
    // This is the actual use case from the issue description
    expect(() => {
      const result = evaluator.evaluateExpression('{ x : X | x == "red" }');
    }).not.toThrow();
  });
});