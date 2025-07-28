import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "../test/tttdatainstance";

describe("debug string and boolean comparisons", () => {
  let datum: TTTDataInstance;
  let evaluator: SimpleGraphQueryEvaluator;

  beforeEach(() => {
    datum = new TTTDataInstance();
    evaluator = new SimpleGraphQueryEvaluator(datum);
  });

  it("debug different expressions", () => {
    const testCases = [
      '"red"',
      '"red" == "red"', 
      '"red" = "red"',
      '#t',
      '#f', 
      '#t == #t',
      '#f == #f',
      'true',
      'false',
      'true == true',
      'false == false',
      '1',
      '1 == 1',
    ];

    testCases.forEach(expr => {
      try {
        const result = evaluator.evaluateExpression(expr);
        console.log(`"${expr}" -> ${JSON.stringify(result)}`);
      } catch (error) {
        console.log(`"${expr}" -> ERROR: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });
});