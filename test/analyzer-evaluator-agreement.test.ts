import { analyzeForgeExpression, EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";

// The analyzer and the evaluator are two visitors over the same grammar. The
// analyzer answers without the data ("this is always true", "this is always the
// empty set"); the evaluator answers with it. Nothing structural forces them to
// agree, and they are otherwise tested in separate files against separate
// expectations -- which is exactly how `++`, `<:`, `:>`, annotated arrows and
// `sum[none]` all shipped with the analyzer contradicting the evaluator.
//
// This file is the missing link. It does not encode what any single expression
// means; it encodes the CONTRACT between the two, over a generated corpus:
//
//   analyzer says tautology  ->  evaluator returns true
//   analyzer says unsat      ->  evaluator returns false
//   analyzer says empty      ->  evaluator returns the empty set
//   evaluator throws         ->  analyzer must not have claimed any of those
//
// `unknown` and `ill-typed` constrain nothing: they are the analyzer declining
// to answer, which is always allowed. Adding an operator to one visitor and not
// the other now fails here.

const ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());

type Outcome =
  | { kind: "value"; value: EvaluationResult }
  | { kind: "error"; message: string };

function evaluate(expr: string): Outcome {
  try {
    const r = ev.evaluateExpression(expr);
    if (r !== null && typeof r === "object" && !Array.isArray(r) && "error" in r) {
      return { kind: "error", message: (r as { error: Error }).error.message };
    }
    return { kind: "value", value: r };
  } catch (err) {
    return { kind: "error", message: String(err) };
  }
}

// Operands chosen to span the shapes the analyzer reasons about: provably
// empty, singleton scalar, unary set, and relations of arity 2 and 4.
const OPERANDS = [
  "none",
  "X0",
  "Board0",
  "Player",
  "Board",
  "(Board - Board)",
  "initialState",
  "board",
];

const SET_OPS = ["+", "-", "&", "++", "->", "<:", ":>"];
const COMPARE_OPS = ["in", "ni", "="];
const MULTIPLICITIES = ["some", "no", "one", "lone"];

function corpus(): string[] {
  const exprs: string[] = [];
  for (const a of OPERANDS) {
    for (const b of OPERANDS) {
      for (const op of SET_OPS) {
        const set = `(${a}) ${op} (${b})`;
        exprs.push(set);
        // A set expression only reaches a verdict through something boolean,
        // so wrap it too -- that is where a wrong `empty` turns into a wrong
        // `unsat` and starts pruning real queries.
        for (const m of MULTIPLICITIES) exprs.push(`${m} (${set})`);
        exprs.push(`#(${set}) = 0`);
      }
      for (const op of COMPARE_OPS) {
        exprs.push(`(${a}) ${op} (${b})`);
        exprs.push(`not ((${a}) ${op} (${b}))`);
      }
    }
  }
  // The builtins, whose box-join syntax the analyzer must not read as a join.
  for (const arg of ["none", "Int", "1 + 2", "(Board - Board)"]) {
    for (const fn of ["sum", "min", "max"]) {
      exprs.push(`${fn}[${arg}]`);
      exprs.push(`${fn}[${arg}] = 0`);
      exprs.push(`some ${fn}[${arg}]`);
    }
  }
  // Multiplicity-annotated arrows: the evaluator refuses these, so the analyzer
  // must not answer for them either.
  for (const arrow of ["one ->", "-> lone", "one -> lone", "set ->", "-> set"]) {
    exprs.push(`Board ${arrow} Player`);
    exprs.push(`some (Board ${arrow} Player)`);
    exprs.push(`none ${arrow} Player`);
  }
  return exprs;
}

function isEmptySet(value: EvaluationResult): boolean {
  return Array.isArray(value) && value.length === 0;
}

describe("analyzer and evaluator agree", () => {
  const exprs = corpus();

  it("covers a corpus wide enough to be worth running", () => {
    expect(exprs.length).toBeGreaterThan(1000);
  });

  it("never claims tautology, unsat or empty against what the evaluator computes", () => {
    const violations: string[] = [];

    for (const expr of exprs) {
      const verdict = analyzeForgeExpression(expr);
      // The analyzer declining to answer is always sound.
      if (verdict.status === "unknown" || verdict.status === "ill-typed") continue;

      const outcome = evaluate(expr);

      if (outcome.kind === "error") {
        // A confident verdict about an expression that does not evaluate is a
        // claim the evaluator cannot back. `unknown`/`ill-typed` were let
        // through above; anything else is a contradiction.
        violations.push(
          `${expr}\n    analyzer=${verdict.status}, evaluator threw: ${outcome.message.slice(0, 90)}`
        );
        continue;
      }

      const expected =
        verdict.status === "tautology"
          ? true
          : verdict.status === "unsat"
            ? false
            : "empty-set";
      const actual = outcome.value;
      const agrees =
        expected === "empty-set" ? isEmptySet(actual) : actual === expected;

      if (!agrees) {
        violations.push(
          `${expr}\n    analyzer=${verdict.status}, evaluator=${JSON.stringify(actual)?.slice(0, 90)}`
        );
      }
    }

    // Print every violation rather than only the first -- a divergence in a
    // shared visitor usually shows up across a whole family of expressions, and
    // the family is the diagnosis.
    expect(violations.join("\n  ")).toBe("");
  });
});
