import { readFileSync } from "fs";
import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";

// docs/sgq-language.json says what each construct and operator YIELDS. Nothing
// in the grammar says it and `EvalResult` is a union that does not say which
// arm came back, so the manifest states it — and this file is what keeps the
// statement honest, by running an expression per operator and looking at what
// the evaluator actually returns.
//
// The observation is sharp for `boolean` and `string`. It is sharp for
// `relation` and `number` only because every witness below is chosen so the two
// cannot be confused: the evaluator collapses a singleton relation to a bare
// scalar, so a relation witness must return more than one tuple. A witness that
// cannot be written that way is a witness this file must not use.

const manifest = JSON.parse(readFileSync("docs/sgq-language.json", "utf8"));
const ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());

/** One expression per operator, keyed by the manifest's operator id. */
const WITNESS: Record<string, string> = {
  // quantifiers: the aggregator is the one that yields a number
  all: "all b : Board | some b", no: "no b : Board | no b",
  some: "some b : Board | some b", lone: "lone b : Board | no b",
  one: "one b : Board | no b", two: "two b : Board | no b",
  sum: "sum b : Board | 1",
  // connectives
  or: "some Board or no Board", xor: "some Board xor no Board",
  iff: "some Board iff some Board", implies: "some Board implies some Board",
  and: "some Board and some Board", not: "not (no Board)",
  // comparisons
  subset: "Board in Board", equal: "Board = Board", contains: "Board ni Board",
  lessThan: "#Board < #univ", greaterThan: "#univ > #Board",
  atMost: "#Board <= #univ", atLeast: "#univ >= #Board",
  // set algebra — every witness returns more than one tuple
  union: "Board + Player", difference: "univ - Player",
  intersection: "univ & Board", override: "Board ++ Player",
  product: "Board -> Board", domainRestriction: "univ <: next",
  rangeRestriction: "next :> univ", join: "univ . next",
  cardinality: "#Board",
  // unary prefixes
  transpose: "~initialState", transitiveClosure: "^initialState",
  reflexiveTransitiveClosure: "*initialState",
  label: "@:`Board0`", labelString: "@str:`Board0`",
  labelBoolean: "@bool:`Board0`", labelNumber: "@num:`0`",
  // multiplicity tests
  empty: "no (univ - univ)", nonEmpty: "some Board", atMostOne: "lone (univ - univ)",
  exactlyOne: "one X", exactlyTwo: "two Player", any: "set Board",
  // atoms
  emptySet: "univ - univ", universe: "univ", identity: "iden",
  atomLiteral: "`Board0` + `Board1`",
};

type Observed = "relation" | "number" | "boolean" | "string" | "error";

function observe(expr: string): { kind: Observed; detail: string } {
  let r: unknown;
  try {
    r = ev.evaluateExpression(expr);
  } catch (err) {
    return { kind: "error", detail: String(err) };
  }
  if (r !== null && typeof r === "object" && !Array.isArray(r) && "error" in (r as object)) {
    return { kind: "error", detail: String((r as { error: Error }).error.message) };
  }
  if (Array.isArray(r)) return { kind: "relation", detail: JSON.stringify(r).slice(0, 60) };
  if (typeof r === "boolean") return { kind: "boolean", detail: String(r) };
  if (typeof r === "number") return { kind: "number", detail: String(r) };
  if (typeof r === "string") return { kind: "string", detail: r };
  return { kind: "error", detail: `unclassifiable result ${JSON.stringify(r)}` };
}

/** Operators whose kind the manifest states and the engine can be asked about. */
const checkable = manifest.constructs
  .flatMap((c: any) => c.operators.map((o: any) => ({ construct: c.id, ...o })))
  .filter((o: any) => o.evaluates && o.kinds.yields !== null);

test("every operator with a witness yields the kind the manifest declares", () => {
  const wrong: string[] = [];
  for (const op of checkable) {
    const expr = WITNESS[op.id];
    if (!expr) continue;
    const { kind, detail } = observe(expr);
    // `operand` says the construct hands its operand back, so any kind at all
    // is consistent with it; all this can check there is that it runs.
    const ok = op.kinds.yields === "operand" || op.kinds.yields === "any"
      ? kind !== "error"
      : kind === op.kinds.yields;
    if (!ok) {
      wrong.push(`${op.construct}.${op.id}: '${expr}' yielded ${kind} (${detail}), manifest says ${op.kinds.yields}`);
    }
  }
  expect(wrong).toEqual([]);
});

test("every operator the engine runs has a witness", () => {
  const missing = checkable.filter((o: any) => !WITNESS[o.id]).map((o: any) => `${o.construct}.${o.id}`);
  expect(missing).toEqual([]);
});

test("no witness names an operator the manifest no longer has", () => {
  const ids = new Set(manifest.constructs.flatMap((c: any) => c.operators.map((o: any) => o.id)));
  expect(Object.keys(WITNESS).filter((id) => !ids.has(id))).toEqual([]);
});
