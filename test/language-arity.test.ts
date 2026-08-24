import { readFileSync } from "fs";
import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";

// docs/sgq-language.json says how wide each construct's result is and how wide
// its operands have to be. Neither the grammar nor `kinds` says it, so the
// manifest states it — and this file keeps the statement honest by running an
// expression per rule and measuring the tuples that come back.
//
// The check applies the manifest's own rule to the declared operand widths and
// compares the result against the engine's, so a wrong rule fails here rather
// than being restated in the expectation.
//
// TTT relation widths: Board 1, initialState 2, next 3, board 4.

const manifest = JSON.parse(readFileSync("docs/sgq-language.json", "utf8"));
const ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());

type Witness = { expr: string; slots?: number[]; binders?: number };

/** One expression per rule, keyed by operator id (or construct id when the
    construct has no operators of its own). `slots` are the widths of the
    operands as written. */
const WITNESS: Record<string, Witness> = {
  any: { expr: "set next", slots: [3] },
  union: { expr: "initialState + initialState", slots: [2, 2] },
  difference: { expr: "next - board.univ", slots: [3, 3] },
  intersection: { expr: "next & next", slots: [3, 3] },
  override: { expr: "next ++ next", slots: [3, 3] },
  product: { expr: "initialState -> next", slots: [2, 3] },
  domainRestriction: { expr: "univ <: next", slots: [1, 3] },
  rangeRestriction: { expr: "next :> univ", slots: [3, 1] },
  join: { expr: "next . board", slots: [3, 4] },
  application: { expr: "board[Board1][1]", slots: [4, 1, 1] },
  transpose: { expr: "~initialState", slots: [2] },
  transitiveClosure: { expr: "^initialState", slots: [2] },
  reflexiveTransitiveClosure: { expr: "*initialState", slots: [2] },
  universe: { expr: "univ" },
  identity: { expr: "iden" },
  atomLiteral: { expr: "`Board0`" },
  comprehension: { expr: "{b, c : Board | some b}", binders: 2 },
  grouping: { expr: "(next)", slots: [3] },
};

/** Rules whose result cannot be measured, and why. Listed rather than skipped
    silently: an empty relation has no width, so a witness cannot show one. */
const UNMEASURABLE: Record<string, string> = {
  emptySet: "`none` has no tuples, so it has no observable width",
};

/** A witness that breaks a declared operand requirement, so the requirement is
    shown to be enforced rather than merely declared. */
const VIOLATION: Record<string, string> = {
  domainRestriction: "next <: next",
  rangeRestriction: "next :> next",
  transpose: "~next",
  transitiveClosure: "^next",
  reflexiveTransitiveClosure: "*next",
};

function widthFor(rule: unknown, w: Witness): number {
  const slots = w.slots ?? [];
  if (typeof rule === "number") return rule;
  if (rule === "sum") return slots[0] + slots[1];
  if (rule === "join") return slots[0] + slots[1] - 2;
  if (rule === "boxJoin") return slots.reduce((acc, s) => acc + s - 2);
  if (rule === "binders") return w.binders!;
  if (typeof rule === "string" && rule.startsWith("slot")) return slots[Number(rule.slice(4))];
  throw new Error(`no width for arity rule ${JSON.stringify(rule)}`);
}

type Measured = { widths: number[] } | { error: string };

function measure(expr: string): Measured {
  let r: unknown;
  try {
    r = ev.evaluateExpression(expr);
  } catch (err) {
    return { error: String(err) };
  }
  if (r !== null && typeof r === "object" && !Array.isArray(r) && "error" in (r as object)) {
    return { error: String((r as { error: Error }).error.message) };
  }
  if (!Array.isArray(r)) return { error: `not a relation: ${JSON.stringify(r)}` };
  return { widths: [...new Set(r.map((t: any) => (Array.isArray(t) ? t.length : 1)))] };
}

/** Every rule the engine runs and that produces a relation, keyed the way
    WITNESS is: by operator id, or by construct id when there is no operator. */
const rules: { id: string; where: string; arity: any }[] = manifest.constructs
  .filter((c: any) => c.evaluates)
  .flatMap((c: any) =>
    c.operators.length
      ? c.operators.filter((o: any) => o.evaluates).map((o: any) => ({ id: o.id, where: `${c.id}.${o.id}`, arity: o.arity }))
      : [{ id: c.id, where: c.id, arity: c.arity }])
  .filter((r: any) => r.arity.yields !== null);

test("every rule that yields a relation yields the width the manifest computes", () => {
  const wrong: string[] = [];
  for (const { id, where, arity } of rules) {
    const w = WITNESS[id];
    if (!w) continue;
    const m = measure(w.expr);
    if ("error" in m) {
      wrong.push(`${where}: '${w.expr}' did not evaluate — ${m.error}`);
      continue;
    }
    const want = widthFor(arity.yields, w);
    if (m.widths.length !== 1 || m.widths[0] !== want) {
      wrong.push(`${where}: '${w.expr}' gave widths {${m.widths}}, ` +
        `manifest rule '${arity.yields}' over [${w.slots ?? []}] says ${want}`);
    }
  }
  expect(wrong).toEqual([]);
});

test("every rule that yields a relation has a witness or a stated reason", () => {
  const missing = rules
    .filter((r) => !WITNESS[r.id] && !UNMEASURABLE[r.id])
    .map((r) => r.where);
  expect(missing).toEqual([]);
});

test("every declared operand width is one the engine enforces", () => {
  const unenforced: string[] = [];
  for (const { id, where, arity } of rules) {
    if (!arity.slots.some((s: number | null) => s !== null)) continue;
    const bad = VIOLATION[id];
    if (!bad) {
      unenforced.push(`${where}: declares operand widths ${JSON.stringify(arity.slots)} with no violating witness`);
      continue;
    }
    const m = measure(bad);
    if (!("error" in m)) {
      unenforced.push(`${where}: '${bad}' breaks the declared widths ${JSON.stringify(arity.slots)} and evaluated anyway`);
    }
  }
  expect(unenforced).toEqual([]);
});

test("no witness names a rule the manifest no longer has", () => {
  const ids = new Set(rules.map((r) => r.id));
  const stray = [...Object.keys(WITNESS), ...Object.keys(UNMEASURABLE), ...Object.keys(VIOLATION)]
    .filter((id) => !ids.has(id));
  expect(stray).toEqual([]);
});
