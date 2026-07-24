import { SimpleGraphQueryEvaluator } from "../src";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";
import { TTTDataInstance, RBTTDataInstance } from "./testdatainstances";

function tuples(result: unknown, expected: Tuple[]) {
  return Array.isArray(result) && areTupleArraysEqual(result as Tuple[], expected);
}

function names(ev: SimpleGraphQueryEvaluator, expr: string): string[] {
  return ev.evaluateExpressionWithDiagnostics(expr).diagnostics.map((d) => d.name);
}

describe("sgq-evaluator.diagnostics", () => {
  let ev: SimpleGraphQueryEvaluator;
  beforeEach(() => {
    ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());
  });

  describe("shape", () => {
    it("reports kind, severity, name, and message", () => {
      const { diagnostics } = ev.evaluateExpressionWithDiagnostics("Playr");
      expect(diagnostics).toHaveLength(1);
      const [d] = diagnostics;
      expect(d.kind).toBe("unresolved-name");
      expect(d.severity).toBe("warning");
      expect(d.name).toBe("Playr");
      expect(typeof d.message).toBe("string");
      expect(d.message).toContain("Playr");
    });

    it("points at both plausible intents: a typo and a string literal", () => {
      const [d] = ev.evaluateExpressionWithDiagnostics("Playr").diagnostics;
      expect(d.message).toContain("Did you mean 'Player'?");
      expect(d.message).toContain('"Playr"');
      expect(d.message).toContain("empty set");
    });
  });

  describe("value semantics", () => {
    it("evaluates an unresolved name to the empty relation", () => {
      expect(tuples(ev.evaluateExpression("Playr"), [])).toBe(true);
    });

    it("never throws, whatever the position", () => {
      for (const expr of [
        "Playr",
        "Playr.foo",
        "Player.foo",
        "#Playr",
        "Playr + Player",
        "Playr & Player",
        "Playr - Player",
        "~Playr",
        "^Playr",
        "*Playr",
        "{x : Playr | true}",
        "all x : Playr | false",
        "@:(Playr)",
      ]) {
        expect(() => ev.evaluateExpression(expr)).not.toThrow();
      }
    });

    it("composes as the empty set in relational operations", () => {
      expect(tuples(ev.evaluateExpression("Playr + Player"), [["X0"], ["O0"]])).toBe(true);
      expect(tuples(ev.evaluateExpression("Playr & Player"), [])).toBe(true);
      expect(ev.evaluateExpression("#Playr")).toBe(0);
      expect(tuples(ev.evaluateExpression("{x : Playr | true}"), [])).toBe(true);
    });

    it("makes predicates vacuously true — the reason the warning matters", () => {
      // Each of these silently PASSES on a typo. The value is correct for an
      // empty set; only the diagnostic distinguishes it from a real result.
      expect(ev.evaluateExpression("no Playr")).toBe(true);
      expect(ev.evaluateExpression("Playr in Player")).toBe(true);
      expect(ev.evaluateExpression("all x : Playr | false")).toBe(true);
      for (const expr of ["no Playr", "Playr in Player", "all x : Playr | false"]) {
        expect(names(ev, expr)).toEqual(["Playr"]);
      }
    });

    it("makes existentials vacuously false", () => {
      expect(ev.evaluateExpression("some Playr")).toBe(false);
      expect(ev.evaluateExpression("some x : Playr | true")).toBe(false);
      expect(ev.evaluateExpression("Player in Playr")).toBe(false);
    });
  });

  describe("positions", () => {
    it("reports a name used as a set", () => {
      expect(names(ev, "Playr")).toEqual(["Playr"]);
    });

    it("reports a name used as a relation in a join", () => {
      expect(names(ev, "Player.parnt")).toEqual(["parnt"]);
    });

    it("reports both sides of a join when both are unresolved", () => {
      expect(names(ev, "Playr.foo").sort()).toEqual(["Playr", "foo"]);
    });

    it("reports a comprehension or quantifier domain", () => {
      expect(names(ev, "{x : Playr | true}")).toEqual(["Playr"]);
      expect(names(ev, "all x : Playr | true")).toEqual(["Playr"]);
      expect(names(ev, "some x : Playr | true")).toEqual(["Playr"]);
    });

    it("reports a name inside a quantifier body", () => {
      expect(names(ev, "all x : Player | x in Playr")).toEqual(["Playr"]);
    });

    it("reports names under unary operators", () => {
      expect(names(ev, "#Playr")).toEqual(["Playr"]);
      expect(names(ev, "~Playr")).toEqual(["Playr"]);
      expect(names(ev, "^Playr")).toEqual(["Playr"]);
      expect(names(ev, "@:(Playr)")).toEqual(["Playr"]);
    });

    it("reports qualified and dollar-containing names rather than throwing", () => {
      // These do not match the old label-like pattern, so they used to throw
      // NameNotFoundError. They now take the same path as every other name.
      expect(names(ev, "A/Ord")).toEqual(["A/Ord"]);
      expect(names(ev, "this$0")).toEqual(["this$0"]);
    });
  });

  describe("what is NOT reported", () => {
    it("stays silent for names that resolve", () => {
      for (const expr of ["Player", "X0", "univ", "iden", "none", "Int", "true", "false"]) {
        expect(names(ev, expr)).toEqual([]);
      }
    });

    it("stays silent for bound variables", () => {
      expect(names(ev, "{x : Player | x = x}")).toEqual([]);
      expect(names(ev, "all x : Player | some y : Player | x = y")).toEqual([]);
    });

    it("stays silent for builtins", () => {
      expect(names(ev, "add[1, 2]")).toEqual([]);
      expect(names(ev, "1 = 1")).toEqual([]);
    });

    it("stays silent for string literals", () => {
      expect(names(ev, '"Playr"')).toEqual([]);
      expect(names(ev, '"anything at all"')).toEqual([]);
    });

    it("stays silent when a resolved name is merely empty", () => {
      // `x.color` on a node with no colour is empty, but everything resolved.
      const rbt = new SimpleGraphQueryEvaluator(new RBTTDataInstance());
      expect(names(rbt, "@:(none)")).toEqual([]);
      expect(names(rbt, "{ x : RBTreeNode | @:(x.color) = \"purple\" }")).toEqual([]);
    });
  });

  describe("suggestions", () => {
    it("offers a close name from the instance", () => {
      const [d] = ev.evaluateExpressionWithDiagnostics("Playr").diagnostics;
      expect(d.suggestion).toBe("Player");
    });

    it("matches against relation names", () => {
      const rbt = new SimpleGraphQueryEvaluator(new RBTTDataInstance());
      const [d] = rbt.evaluateExpressionWithDiagnostics("colour").diagnostics;
      expect(d.suggestion).toBe("color");
    });

    it("matches against atom ids", () => {
      // No type or relation in this instance is close to `n17`, so a suggestion
      // here can only have come from the atom pool.
      const rbt = new SimpleGraphQueryEvaluator(new RBTTDataInstance());
      const [d] = rbt.evaluateExpressionWithDiagnostics("n17").diagnostics;
      expect(d.suggestion).toMatch(/^n\d+$/);
    });

    it("offers nothing when nothing is close", () => {
      const [d] = ev.evaluateExpressionWithDiagnostics("ZzzzQqqqWwww").diagnostics;
      expect(d.suggestion).toBeUndefined();
      expect(d.message).not.toContain("Did you mean");
    });

    it("holds short names to a tighter edit distance than long ones", () => {
      // With no bound, every short name would attract a nonsense suggestion.
      const short = ev.evaluateExpressionWithDiagnostics("Qw").diagnostics[0];
      expect(short.suggestion).toBeUndefined();
    });

    it("is deterministic across evaluators and repeat calls", () => {
      const a = new SimpleGraphQueryEvaluator(new TTTDataInstance());
      const b = new SimpleGraphQueryEvaluator(new TTTDataInstance());
      const first = a.evaluateExpressionWithDiagnostics("Playr").diagnostics[0].suggestion;
      const again = a.evaluateExpressionWithDiagnostics("Playr").diagnostics[0].suggestion;
      const other = b.evaluateExpressionWithDiagnostics("Playr").diagnostics[0].suggestion;
      expect(again).toBe(first);
      expect(other).toBe(first);
    });

    it("does not suggest the name itself", () => {
      const [d] = ev.evaluateExpressionWithDiagnostics("Playr").diagnostics;
      expect(d.suggestion).not.toBe("Playr");
    });
  });

  describe("accumulation", () => {
    it("reports each distinct unresolved name once", () => {
      expect(names(ev, "{p : Player | p in Playr or p in Playr}")).toEqual(["Playr"]);
      expect(names(ev, "Playr + Playr + Playr")).toEqual(["Playr"]);
    });

    it("reports several distinct names together", () => {
      expect(names(ev, "Foo + Bar").sort()).toEqual(["Bar", "Foo"]);
      expect(names(ev, "Foo + Bar + Baz").sort()).toEqual(["Bar", "Baz", "Foo"]);
    });

    it("does not leak between expressions on a reused evaluator", () => {
      expect(names(ev, "Playr")).toEqual(["Playr"]);
      expect(names(ev, "Player")).toEqual([]);
      expect(names(ev, "Foo")).toEqual(["Foo"]);
    });

    it("replays diagnostics on a repeat evaluation despite the result cache", () => {
      // Subexpression results are memoized across calls. Diagnostics are cached
      // with them; without that the second call would report nothing.
      const first = ev.evaluateExpressionWithDiagnostics("Playr");
      const second = ev.evaluateExpressionWithDiagnostics("Playr");
      const third = ev.evaluateExpressionWithDiagnostics("Playr");
      expect(second.diagnostics).toEqual(first.diagnostics);
      expect(third.diagnostics).toEqual(first.diagnostics);
    });

    it("replays diagnostics for a repeated compound expression", () => {
      const expr = "{p : Player | p in Playr}";
      expect(names(ev, expr)).toEqual(["Playr"]);
      expect(names(ev, expr)).toEqual(["Playr"]);
    });

    it("re-derives diagnostics after invalidate()", () => {
      expect(names(ev, "Playr")).toEqual(["Playr"]);
      ev.invalidate();
      expect(names(ev, "Playr")).toEqual(["Playr"]);
    });

    it("re-derives diagnostics against a swapped datum", () => {
      expect(names(ev, "RBTreeNode")).toEqual(["RBTreeNode"]);
      ev.datum = new RBTTDataInstance();
      // The same name resolves in the new instance, so the warning goes away.
      expect(names(ev, "RBTreeNode")).toEqual([]);
      expect(names(ev, "Player")).toEqual(["Player"]);
    });
  });

  describe("error paths", () => {
    const isError = (r: unknown) =>
      r !== null && typeof r === "object" && !Array.isArray(r) && "error" in (r as object);

    it("keeps diagnostics raised before an evaluation error", () => {
      // A failed evaluation discards the inner evaluator. Diagnostics must be
      // captured first — a query that has BOTH a typo and an unrelated failure
      // is exactly when the typo is most worth reporting.
      const { value, diagnostics } = ev.evaluateExpressionWithDiagnostics(
        "Playr + (Player.Player.Player)"
      );
      expect(isError(value)).toBe(true);
      expect(diagnostics.map((d) => d.name)).toEqual(["Playr"]);
    });

    it("reports no diagnostics for a parse error, since nothing was evaluated", () => {
      const { value, diagnostics } = ev.evaluateExpressionWithDiagnostics("Playr + (((");
      expect(isError(value)).toBe(true);
      expect(diagnostics).toEqual([]);
    });

    it("does not carry diagnostics from a failed call into the next one", () => {
      expect(
        ev.evaluateExpressionWithDiagnostics("Playr + (Player.Player.Player)").diagnostics
      ).toHaveLength(1);
      expect(ev.evaluateExpressionWithDiagnostics("Player").diagnostics).toEqual([]);
    });

    it("recovers and still reports on the call after a failure", () => {
      ev.evaluateExpressionWithDiagnostics("Playr + (Player.Player.Player)");
      expect(names(ev, "Foo")).toEqual(["Foo"]);
    });
  });

  describe("plain evaluateExpression", () => {
    it("returns the same value as the diagnostics-carrying form", () => {
      for (const expr of ["Playr", "no Playr", "#Playr", "Player + Playr"]) {
        expect(ev.evaluateExpression(expr)).toEqual(
          ev.evaluateExpressionWithDiagnostics(expr).value
        );
      }
    });
  });
});
