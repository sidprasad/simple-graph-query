import {
  SimpleGraphQueryEvaluator,
  ErrorResult,
  EvaluationResult,
  NameNotFoundError,
  ParseError,
} from "../src";
import { TTTDataInstance } from "./testdatainstances";

function isErrorResult(result: EvaluationResult): result is ErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    !Array.isArray(result) &&
    (result as ErrorResult).error instanceof Error
  );
}

describe("sgq-evaluator error types", () => {
  it("re-exports NameNotFoundError and ParseError as values (not just types)", () => {
    expect(typeof NameNotFoundError).toBe("function");
    expect(typeof ParseError).toBe("function");
    expect(new NameNotFoundError("x")).toBeInstanceOf(Error);
    expect(new ParseError("x", 1, 2)).toBeInstanceOf(Error);
  });

  it("returns ErrorResult with a typed ParseError for a syntactically invalid expression", () => {
    const datum = new TTTDataInstance();
    const evaluator = new SimpleGraphQueryEvaluator(datum);

    // Unmatched brace — guaranteed syntactic failure.
    const result = evaluator.evaluateExpression("{x : Player |");

    expect(isErrorResult(result)).toBe(true);
    if (isErrorResult(result)) {
      expect(result.error).toBeInstanceOf(ParseError);
      const parseError = result.error as ParseError;
      expect(parseError.line).toBeGreaterThanOrEqual(1);
      expect(typeof parseError.charPositionInLine).toBe("number");
    }
  });

  it("preserves the original Error instance in ErrorResult.error (no re-wrapping)", () => {
    // An arity mismatch throws a plain Error inside the evaluator. Previously
    // that was re-wrapped as `new Error("Error evaluating expression...")`,
    // which lost the original instance. The policy move requires preserving
    // the instance so spytial-core can do `instanceof` checks on typed errors.
    const datum = new TTTDataInstance();
    const evaluator = new SimpleGraphQueryEvaluator(datum);

    const result = evaluator.evaluateExpression("*(Board6.board)"); // arity 3

    expect(isErrorResult(result)).toBe(true);
    if (isErrorResult(result)) {
      expect(result.error).toBeInstanceOf(Error);
      // The message should originate from the evaluator, not a generic wrapper.
      expect(result.error.message).not.toMatch(/^Error evaluating expression/);
    }
  });

  it("still treats alphanumeric unknown identifiers as label literals (regression)", () => {
    // The label-like fallback at ForgeExprEvaluator.ts:2161 must remain.
    // Only non-matching identifiers (none reachable via the grammar today)
    // would raise NameNotFoundError.
    const datum = new TTTDataInstance();
    const evaluator = new SimpleGraphQueryEvaluator(datum);

    const result = evaluator.evaluateExpression("NonExistentRelation");

    expect(result).toBe("NonExistentRelation");
  });
});
