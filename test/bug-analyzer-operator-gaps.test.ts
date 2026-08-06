import { analyzeForgeExpression, IForgeSchema } from "../src";
import { IRelation, IType } from "../src/types";

function status(expr: string): string {
  return analyzeForgeExpression(expr).status;
}

function reason(expr: string): string {
  const r = analyzeForgeExpression(expr);
  return "reason" in r ? r.reason : "";
}

// Arity is only knowable from a schema, so the ill-typed branches below need
// one. `unary` is a set of arity 1, `pair` a relation of arity 2.
function makeSchema(): IForgeSchema {
  const types: IType[] = [
    { id: "Node", types: ["Node"], atoms: [], isBuiltin: false },
  ];
  const relations: IRelation[] = [
    { id: "pair", name: "pair", types: ["Node", "Node"], tuples: [] },
    { id: "triple", name: "triple", types: ["Node", "Node", "Node"], tuples: [] },
  ];
  return { getTypes: () => types, getRelations: () => relations };
}

function schemaStatus(expr: string): string {
  return analyzeForgeExpression(expr, makeSchema()).status;
}

function schemaReason(expr: string): string {
  const r = analyzeForgeExpression(expr, makeSchema());
  return "reason" in r ? r.reason : "";
}

// The analyzer and the evaluator walk the same grammar, but the operators
// implemented on this branch were added only to the evaluator. The analyzer had
// no `visitExpr10` (`++`) and no `visitExpr13` (`<:` / `:>`), so those nodes fell
// through to `aggregateResult`, which takes the FIRST non-unknown child as the
// value of the whole expression. That is not a missing answer -- it is a
// confident wrong one, from a function exported as public API.
describe("ForgeExprStaticAnalyzer — operators that reached only the evaluator", () => {
  describe("`++` override", () => {
    it("does not mistake the left operand for the whole expression", () => {
      // `none ++ Board0` is Board0. Folding to the left operand said "empty",
      // and every boolean built on top of it inherited the mistake.
      expect(status("none ++ Board0")).not.toBe("empty");
      expect(status("some (none ++ Board0)")).not.toBe("unsat");
      expect(status("no (none ++ Board0)")).not.toBe("tautology");
      expect(status("(none ++ Board0) = none")).not.toBe("tautology");
    });

    it("keeps empty as the identity on both sides", () => {
      // `p ++ none` is p and `none ++ q` is q, so emptiness passes through
      // rather than being absorbed.
      expect(status("none ++ none")).toBe("empty");
      expect(status("some (none ++ none)")).toBe("unsat");
      expect(status("no ((Thing - Thing) ++ (Thing - Thing))")).toBe("tautology");
    });

    it("folds `X ++ X` to X, since every tuple overrides itself", () => {
      expect(status("no ((Thing - Thing) ++ (Thing - Thing))")).toBe("tautology");
      expect(status("Thing ++ Thing")).toBe("unknown");
    });

    it("stays conservative when neither side is known", () => {
      expect(status("Thing ++ Other")).toBe("unknown");
      expect(status("some (Thing ++ Other)")).toBe("unknown");
    });

    it("reports mismatched arities as malformed, as the evaluator does", () => {
      expect(schemaStatus("pair ++ Node")).toBe("ill-typed");
      expect(schemaStatus("Node ++ pair")).toBe("ill-typed");
      expect(schemaStatus("pair ++ triple")).toBe("ill-typed");
      expect(schemaReason("pair ++ Node")).toContain(
        "arity mismatch in '++': left has arity 2, right has arity 1"
      );
    });

    it("keeps the shared arity when the two sides agree", () => {
      // Override never widens or narrows a relation, so the arity survives and
      // an arity-sensitive comparison downstream can still be checked.
      expect(schemaStatus("(pair ++ pair) in Node")).toBe("ill-typed");
      expect(schemaStatus("(pair ++ pair) in triple")).toBe("ill-typed");
      // But arity is all that survives. `pair ++ pair` really is `pair`, so the
      // containment below happens to hold -- the analyzer just has no sound way
      // to reach it, and declining beats guessing. Column types are an upper
      // bound, and a bound never proves containment.
      expect(schemaStatus("(pair ++ pair) in pair")).toBe("unknown");
    });
  });

  describe("`<:` and `:>` restriction", () => {
    it("is empty when either operand is empty", () => {
      // A restriction is a subset of the relation, and restricting by nothing
      // keeps nothing -- so either side being empty settles it.
      expect(status("none <: none")).toBe("empty");
      expect(status("none :> none")).toBe("empty");
      expect(status("some (none <: none)")).toBe("unsat");
      expect(status("no (none :> none)")).toBe("tautology");
    });

    it("stays conservative when the relation is not known to be empty", () => {
      expect(status("Thing <: Other")).toBe("unknown");
      expect(status("Thing :> Other")).toBe("unknown");
    });

    it("reports a restrictor that is not a set of arity 1 as malformed", () => {
      expect(schemaStatus("pair <: pair")).toBe("ill-typed");
      expect(schemaStatus("pair :> pair")).toBe("ill-typed");
      expect(schemaReason("pair <: pair")).toContain(
        "the '<:' operator restricts by a set of arity 1, but its left operand has arity 2"
      );
      expect(schemaReason("pair :> pair")).toContain(
        "the ':>' operator restricts by a set of arity 1, but its right operand has arity 2"
      );
    });

    it("keeps the relation's arity, since restriction drops whole tuples", () => {
      expect(schemaStatus("(Node <: pair) in Node")).toBe("ill-typed");
      expect(schemaStatus("(pair :> Node) in Node")).toBe("ill-typed");
    });

    it("will not call a restriction empty when the evaluator would raise", () => {
      // `pair <: none` restricts by `pair`, which the evaluator rejects before
      // it ever looks at the relation. "Provably empty" would be a claim about
      // an expression that has no value at all.
      expect(schemaStatus("pair <: none")).toBe("ill-typed");
      expect(status("initialState <: none")).toBe("unknown");
      // An empty restrictor, though, cannot fail that check.
      expect(status("none <: initialState")).toBe("empty");
    });
  });

  describe("multiplicity-annotated arrows", () => {
    it("reports them as malformed rather than folding them as a cross product", () => {
      // The evaluator refuses these outright. The analyzer used to fold them as
      // a plain `->`, so it answered for an expression that cannot evaluate.
      expect(status("none one -> lone Player")).toBe("ill-typed");
      expect(status("Thing set -> Other")).toBe("ill-typed");
      expect(status("Thing -> set Other")).toBe("ill-typed");
      expect(status("Thing some -> two Other")).toBe("ill-typed");
    });

    it("names the annotation it is refusing", () => {
      expect(reason("none one -> lone Player")).toContain("one->lone");
      expect(reason("Thing -> set Other")).toContain("->set");
      expect(reason("none one -> lone Player")).toContain(
        "declaration and constraint syntax"
      );
    });

    it("propagates out of any surrounding expression", () => {
      // Malformed anywhere means malformed everywhere -- the evaluator throws on
      // the whole expression, not just the subterm.
      expect(status("some (Thing one -> lone Other)")).toBe("ill-typed");
      expect(status("#(Thing one -> lone Other) = 0")).toBe("ill-typed");
    });

    it("leaves a plain arrow alone", () => {
      expect(status("none -> Thing")).toBe("empty");
      expect(status("none -> none")).toBe("empty");
      expect(status("Thing -> Other")).toBe("unknown");
    });
  });

  describe("`sum` over the empty set", () => {
    it("does not call it empty -- a builtin returns a number, not a set", () => {
      // Box join propagates "empty argument, empty result". That rule describes
      // a JOIN. `sum` only borrows the syntax, and `sum[none]` is 0.
      expect(status("sum[none]")).not.toBe("empty");
      expect(status("sum[none] = 0")).toBe("tautology");
      expect(status("some sum[none]")).not.toBe("unsat");
      expect(status("sum[Thing - Thing] = 0")).toBe("tautology");
    });

    it("does not claim min/max of the empty set is empty either", () => {
      // These are errors at evaluation, not empty sets. `unknown` is the honest
      // verdict; `empty` would be a claim the evaluator contradicts.
      expect(status("min[none]")).not.toBe("empty");
      expect(status("max[none]")).not.toBe("empty");
    });

    it("still propagates empty through a real relational box join", () => {
      expect(status("Thing[none]")).toBe("empty");
      expect(status("none[Thing]")).toBe("empty");
    });
  });
});
