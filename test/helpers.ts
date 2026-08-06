import { EvaluationResult } from "../src";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";

// `EvaluationResult` folds the error case into the same union as the value, and
// narrowing it takes four checks that are easy to get subtly wrong -- so it is
// written once here rather than in each test file.

export function evalError(result: EvaluationResult): Error | undefined {
  return result !== null &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    "error" in result
    ? result.error
    : undefined;
}

export function errorMessage(result: EvaluationResult): string | undefined {
  return evalError(result)?.message;
}

/** True when `result` is a tuple array equal to `expected` as a SET. */
export function tuples(result: EvaluationResult, expected: Tuple[]): boolean {
  return Array.isArray(result) && areTupleArraysEqual(result as Tuple[], expected);
}
