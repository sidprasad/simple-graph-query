import { analyzeForgeExpression, IForgeSchema } from "../src";
import { IRelation, IType } from "../src/types";

function expectUnsat(expr: string) {
  const result = analyzeForgeExpression(expr);
  expect(result.status).toBe("unsat");
}

function expectTaut(expr: string) {
  const result = analyzeForgeExpression(expr);
  expect(result.status).toBe("tautology");
}

function expectUnknown(expr: string) {
  const result = analyzeForgeExpression(expr);
  expect(result.status).toBe("unknown");
}

function expectEmpty(expr: string) {
  const result = analyzeForgeExpression(expr);
  expect(result.status).toBe("empty");
}

// Minimal IForgeSchema for the tests below. Lattice:
//   Object
//   ├─ Player          (Pawn, Knight extend Player)
//   ├─ Move
//   └─ Color
// Relations:
//   parent : Player -> Player
//   move   : Player -> Move
//   color  : Object -> Color
function makeSchema(): IForgeSchema {
  const mkType = (id: string, lineage: string[]): IType => ({
    id,
    types: [id, ...lineage],
    atoms: [],
    isBuiltin: false,
  });
  const types: IType[] = [
    mkType("Object", []),
    mkType("Player", ["Object"]),
    mkType("Move", ["Object"]),
    mkType("Color", ["Object"]),
    mkType("Pawn", ["Player", "Object"]),
    mkType("Knight", ["Player", "Object"]),
  ];
  const mkRel = (name: string, cols: string[]): IRelation => ({
    id: name,
    name,
    types: cols,
    tuples: [],
  });
  const relations: IRelation[] = [
    mkRel("parent", ["Player", "Player"]),
    mkRel("move", ["Player", "Move"]),
    mkRel("color", ["Object", "Color"]),
  ];
  return {
    getTypes: () => types,
    getRelations: () => relations,
  };
}

function withSchema(expr: string) {
  return analyzeForgeExpression(expr, makeSchema());
}

describe("ForgeExprStaticAnalyzer — literal folding", () => {
  it("folds true / false constants", () => {
    expectTaut("true");
    expectUnsat("false");
  });

  it("folds numeric equality", () => {
    expectUnsat("1 = 2");
    expectTaut("1 = 1");
    expectTaut("3 = 3");
  });

  it("folds numeric ordering", () => {
    expectUnsat("1 < 1");
    expectUnsat("2 < 1");
    expectTaut("1 < 2");
    expectTaut("1 <= 1");
    expectTaut("2 >= 1");
    expectUnsat("1 > 1");
  });

  it("treats `none` as the empty set", () => {
    expectEmpty("none");
  });

  it("folds boolean equality", () => {
    expectUnsat("true = false");
    expectTaut("true = true");
  });
});

describe("ForgeExprStaticAnalyzer — boolean propagation", () => {
  it("short-circuits AND with false", () => {
    expectUnsat("false and true");
    expectUnsat("true and false");
    expectUnsat("(1 < 1) and (some Thing)");
  });

  it("short-circuits OR with true", () => {
    expectTaut("true or false");
    expectTaut("false or true");
    expectTaut("(1 = 1) or (some Thing)");
  });

  it("folds nested AND/OR with literals", () => {
    expectTaut("true and true");
    expectUnsat("false or false");
  });

  it("folds NEG over a known boolean", () => {
    expectTaut("not false");
    expectUnsat("not true");
    expectTaut("!(1 = 2)");
  });

  it("folds implication", () => {
    expectTaut("false => true");
    expectTaut("false => false");      // vacuous
    expectUnsat("true => false");
    expectTaut("true => true");
  });

  it("folds IFF and XOR with literals", () => {
    expectTaut("true iff true");
    expectUnsat("true iff false");
  });
});

describe("ForgeExprStaticAnalyzer — same-subtree contradictions", () => {
  it("rejects strict ordering of the same expression", () => {
    expectUnsat("Thing < Thing");
    expectUnsat("foo > foo");
  });

  it("accepts equality / weak ordering of the same expression", () => {
    expectTaut("Thing = Thing");
    expectTaut("foo <= foo");
    expectTaut("foo >= foo");
  });

  it("catches X and not X", () => {
    expectUnsat("(some Thing) and (not (some Thing))");
    expectUnsat("(not (some Thing)) and (some Thing)");
  });

  it("catches X or not X", () => {
    expectTaut("(some Thing) or (not (some Thing))");
  });

  it("treats X - X as empty", () => {
    expectUnsat("some (Thing - Thing)");
    expectTaut("no (Thing - Thing)");
    expectTaut("lone (Thing - Thing)");
    expectUnsat("one (Thing - Thing)");
  });

  it("treats X iff X as true", () => {
    expectTaut("(some Thing) iff (some Thing)");
  });
});

describe("ForgeExprStaticAnalyzer — multiplicity over the empty set", () => {
  it("flags some/one/two over none", () => {
    expectUnsat("some none");
    expectUnsat("one none");
    expectUnsat("two none");
  });

  it("treats no/lone over none as true", () => {
    expectTaut("no none");
    expectTaut("lone none");
  });

  it("propagates emptiness through intersection", () => {
    expectUnsat("some (none & Thing)");
    expectUnsat("some (Thing & none)");
    expectTaut("no (none & Thing)");
  });
});

describe("ForgeExprStaticAnalyzer — always-empty propagation", () => {
  it("propagates emptiness through set ops", () => {
    expectEmpty("Thing - Thing");
    expectEmpty("none & Thing");
    expectEmpty("Thing & none");
    expectEmpty("none + none");
  });

  it("propagates emptiness through dot join (either side)", () => {
    expectEmpty("none.field");
    expectEmpty("Thing.none");
    expectEmpty("a.b.none");
    expectEmpty("(none.field).other");
  });

  it("propagates emptiness through box join", () => {
    expectEmpty("none[a]");
    expectEmpty("f[none]");
    expectEmpty("f[a, none, b]");
  });

  it("propagates emptiness through Cartesian product", () => {
    expectEmpty("none -> Thing");
    expectEmpty("Thing -> none");
    expectEmpty("none -> none");
  });

  it("propagates emptiness through transpose and ^", () => {
    expectEmpty("~none");
    expectEmpty("^none");
    expectEmpty("~(Thing - Thing)");
    expectEmpty("^(Thing - Thing)");
  });

  it("does NOT call *none empty (it equals iden)", () => {
    expectUnknown("*none");
  });

  it("folds #empty to 0 (not empty)", () => {
    // #none yields the integer 0, which is neither empty nor a literal bool
    expectUnknown("#none");
    // But comparisons against it can still fold
    expectTaut("#none = 0");
    expectUnsat("#none > 0");
    expectUnsat("#(Thing - Thing) > 0");
  });

  it("handles set comprehensions with a statically-false body", () => {
    expectEmpty("{x : Thing | false}");
    expectEmpty("{x : Thing | 1 = 2}");
    expectEmpty("{x : Thing | (some y) and (not (some y))}");
  });

  it("handles set comprehensions over an empty domain", () => {
    expectEmpty("{x : none | true}");
    expectEmpty("{x : Thing - Thing | true}");
  });
});

describe("ForgeExprStaticAnalyzer — disjoint intersections", () => {
  it("catches X & (Y - X) and the symmetric case", () => {
    expectEmpty("Thing & (Other - Thing)");
    expectEmpty("(Other - Thing) & Thing");
  });

  it("catches X & (Y - Z - X) via the minus chain", () => {
    expectEmpty("Thing & (A - B - Thing)");
    expectEmpty("Thing & ((A - Thing) - B)");
    expectEmpty("(A - B - Thing) & Thing");
  });

  it("catches X & (Y + Z - X)", () => {
    expectEmpty("Thing & (A + B - Thing)");
  });

  it("catches distinct numeric singletons", () => {
    expectEmpty("1 & 2");
    expectEmpty("0 & 5");
    // Same value stays non-empty
    expectUnknown("1 & 1");        // sameSubtree returns the value, kind=num
  });

  it("does NOT misfire on overlapping or unrelated subtractions", () => {
    // (Thing - Other) keeps Thing-elements, so intersection with Thing
    // is NOT necessarily empty.
    expectUnknown("(Thing - Other) & Thing");
    // Different identifier on the subtrahend
    expectUnknown("Thing & (A - Other)");
  });
});

describe("ForgeExprStaticAnalyzer — block conjunction", () => {
  it("folds a block with any false conjunct to unsat", () => {
    expectUnsat("{ 1 = 2 }");
    expectUnsat("{ true; false }");
    expectUnsat("{ 1 = 1; 1 = 2 }");
    expectUnsat("{ some Thing; 1 < 1 }");
  });

  it("folds a block of all literal-trues to tautology", () => {
    expectTaut("{ true }");
    expectTaut("{ 1 = 1; true }");
    expectTaut("{ 1 < 2; 2 < 3; true }");
  });

  it("returns unknown when no conjunct is statically decidable", () => {
    expectUnknown("{ some Thing; some Other }");
  });
});

describe("ForgeExprStaticAnalyzer — quantifier folding", () => {
  it("folds quantifiers over an empty domain", () => {
    expectUnsat("some x : none | true");
    expectUnsat("one x : none | true");
    expectUnsat("two x : none | true");
    expectTaut("all x : none | true");
    expectTaut("no x : none | true");
    expectTaut("lone x : none | true");
  });

  it("folds quantifiers over a derived empty domain", () => {
    expectUnsat("some x : (Thing - Thing) | true");
    expectTaut("all x : (Thing - Thing) | (1 = 2)");
  });

  it("folds quantifiers with a statically-false body", () => {
    expectUnsat("some x : Thing | false");
    expectUnsat("some x : Thing | 1 = 2");
    expectUnsat("one x : Thing | false");
    expectTaut("no x : Thing | false");
    expectTaut("lone x : Thing | false");
  });

  it("folds `all x | true` regardless of domain", () => {
    expectTaut("all x : Thing | true");
    expectTaut("all x : Thing | 1 = 1");
  });

  it("returns unknown when nothing is decidable", () => {
    expectUnknown("some x : Thing | some y");
    expectUnknown("all x : Thing | some x");
  });
});

describe("ForgeExprStaticAnalyzer — same-subtree boolean shortcuts", () => {
  it("X and X → X", () => {
    expectTaut("true and true");
    expectUnknown("(some Thing) and (some Thing)");
  });

  it("X or X → X", () => {
    expectTaut("true or true");
    expectUnsat("false or false");
  });

  it("X xor X → false", () => {
    expectUnsat("(some Thing) xor (some Thing)");
    expectUnsat("true xor true");
  });

  it("X iff not X → false", () => {
    expectUnsat("(some Thing) iff (not (some Thing))");
    expectUnsat("(not (some Thing)) iff (some Thing)");
  });
});

describe("ForgeExprStaticAnalyzer — MINUS subset patterns", () => {
  it("(X & Y) - X → empty", () => {
    expectEmpty("(Thing & Other) - Thing");
    expectEmpty("(Other & Thing) - Thing");
  });

  it("X - (X + Y) → empty", () => {
    expectEmpty("Thing - (Thing + Other)");
    expectEmpty("Thing - (Other + Thing)");
    expectEmpty("Thing - (Thing + Other + More)");
  });

  it("does NOT misfire on non-subset cases", () => {
    expectUnknown("(Thing + Other) - Thing");   // Other might remain
    expectUnknown("Thing - (Other - Thing)");   // depends on Other
  });

  it("folds numeric subtraction of literals", () => {
    expectTaut("(2 - 1) = 1");
    expectTaut("(5 - 5) = 0");
  });
});

describe("ForgeExprStaticAnalyzer — PLUS / set union with empty", () => {
  it("X + none → X (propagates X's analysis)", () => {
    // none + none was already empty
    expectEmpty("none + none");
    // none + (X - X)  →  (X - X)  →  empty
    expectEmpty("none + (Thing - Thing)");
    expectEmpty("(Thing - Thing) + none");
  });

  it("folds numeric addition", () => {
    expectTaut("(1 + 2) = 3");
    expectUnsat("(1 + 2) = 4");
  });
});

describe("ForgeExprStaticAnalyzer — singleton-vs-empty comparisons", () => {
  it("singleton = none and none = singleton → false", () => {
    expectUnsat("1 = none");
    expectUnsat("none = 1");
    expectUnsat("true = none");
  });

  it("singleton in none → false", () => {
    expectUnsat("1 in none");
    expectUnsat("true in none");
  });

  it("none ni singleton → false", () => {
    expectUnsat("none ni 1");
  });
});

describe("ForgeExprStaticAnalyzer — schema-aware: type disjointness", () => {
  it("flags intersection of disjoint types as empty", () => {
    expect(withSchema("Player & Move").status).toBe("empty");
    expect(withSchema("Player & Color").status).toBe("empty");
    expect(withSchema("Move & Color").status).toBe("empty");
  });

  it("does not misfire on subtype intersections", () => {
    // Pawn ⊆ Player, so the intersection is not statically empty.
    expect(withSchema("Pawn & Player").status).toBe("unknown");
    expect(withSchema("Player & Pawn").status).toBe("unknown");
  });

  it("does nothing without a schema", () => {
    expectUnknown("Player & Move");
  });
});

describe("ForgeExprStaticAnalyzer — schema-aware: subtype `in` tautologies", () => {
  it("folds A in B when A is a subtype of B", () => {
    expect(withSchema("Pawn in Player").status).toBe("tautology");
    expect(withSchema("Knight in Object").status).toBe("tautology");
    expect(withSchema("Pawn in Object").status).toBe("tautology");
  });

  it("uses `ni` symmetrically", () => {
    expect(withSchema("Player ni Pawn").status).toBe("tautology");
    expect(withSchema("Object ni Knight").status).toBe("tautology");
  });

  it("does not falsely declare non-subtype in relations", () => {
    expect(withSchema("Player in Pawn").status).toBe("unknown");
    expect(withSchema("Player in Move").status).toBe("unknown");
  });
});

describe("ForgeExprStaticAnalyzer — schema-aware: join column-type mismatch", () => {
  it("flags dot join where boundary types are disjoint", () => {
    // parent : Player -> Player; Color disjoint from Player.
    expect(withSchema("Color.parent").status).toBe("empty");
    expect(withSchema("Move.parent").status).toBe("empty");
    // Color used on the right: parent ends in Player; Color is disjoint, so
    // joining `Player.color` would actually be OK (Player <: Object, and color
    // takes Object), so this should NOT misfire.
  });

  it("does not misfire on compatible joins", () => {
    // Player ⊆ Object, so Player.color is fine. `typed` surfaces as unknown.
    expect(withSchema("Player.color").status).not.toBe("empty");
    expect(withSchema("Player.color").status).not.toBe("ill-typed");
    // Pawn is a Player; Pawn.parent is fine (parent's first column is Player).
    expect(withSchema("Pawn.parent").status).not.toBe("empty");
    expect(withSchema("Pawn.parent").status).not.toBe("ill-typed");
  });

  it("flags arity-0 dot join (unary join unary)", () => {
    expect(withSchema("Player.Move").status).toBe("ill-typed");
  });
});

describe("ForgeExprStaticAnalyzer — schema-aware: arity mismatches", () => {
  it("flags `=` between operands of different arity", () => {
    expect(withSchema("Player = parent").status).toBe("ill-typed");
    expect(withSchema("parent = Player").status).toBe("ill-typed");
  });

  it("flags `in` / `ni` between operands of different arity", () => {
    expect(withSchema("Player in parent").status).toBe("ill-typed");
    expect(withSchema("parent ni Player").status).toBe("ill-typed");
  });

  it("flags set ops between operands of different arity", () => {
    expect(withSchema("Player + parent").status).toBe("ill-typed");
    expect(withSchema("Player - parent").status).toBe("ill-typed");
    expect(withSchema("Player & parent").status).toBe("ill-typed");
  });

  it("does not flag matching-arity ops", () => {
    expect(withSchema("Player + Move").status).toBe("unknown");
    expect(withSchema("parent + move").status).toBe("unknown");
  });

  it("bubbles ill-typed up through wrappers", () => {
    expect(withSchema("not (Player = parent)").status).toBe("ill-typed");
    expect(withSchema("some (Player + parent)").status).toBe("ill-typed");
  });
});

describe("ForgeExprStaticAnalyzer — reserved schema names at binders", () => {
  it("flags a comprehension that binds a schema type name as ill-typed", () => {
    // Under the schema, `Player` is a type name and cannot be reused as a
    // quantified variable. Surfaces as a clear ill-typed verdict at the binder.
    expect(withSchema("{Player : Move | some Player}").status).toBe("ill-typed");
  });

  it("flags a comprehension that binds a schema relation name as ill-typed", () => {
    expect(withSchema("{parent : Move | some parent}").status).toBe("ill-typed");
  });

  it("permits comprehensions that bind fresh names", () => {
    // `p` is not a schema name → no policy violation.
    expect(withSchema("{p : Move | some p}").status).toBe("unknown");
    // And the body still gets folded with schema info: `some (Player & Move)`
    // uses schema Player here (no shadowing), so this is empty.
    expect(withSchema("{p : Move | some (Player & Move)}").status).toBe("empty");
  });

  it("bubbles ill-typed up through nested comprehensions", () => {
    expect(withSchema("{x : Move | some {Player : Move | some Player}}").status)
      .toBe("ill-typed");
  });

  it("flags quantifiers that bind schema names as ill-typed", () => {
    expect(withSchema("all Player : Move | some Player").status).toBe("ill-typed");
    expect(withSchema("some parent : Move | some parent").status).toBe("ill-typed");
  });

  it("permits quantifiers that bind fresh names", () => {
    expect(withSchema("all p : Move | some p").status).toBe("unknown");
  });

  it("does not enforce the policy when no schema is supplied", () => {
    // Without a schema, the analyzer has no notion of which names are reserved.
    expect(analyzeForgeExpression("{Player : Move | some Player}").status).toBe("unknown");
  });
});

describe("ForgeExprStaticAnalyzer — conservative cases", () => {
  it("returns unknown for data-dependent expressions", () => {
    expectUnknown("Thing");
    expectUnknown("some Thing");
    expectUnknown("Thing.field");
    expectUnknown("Thing = Other");        // different identifiers
    expectUnknown("#Thing > 0");
  });

  it("returns unknown for data-dependent quantifiers", () => {
    expectUnknown("all x : Thing | some x");
    // `some x : Thing | true` *would* be tautology if we knew Thing is
    // non-empty, but we can't tell statically — so unknown is correct.
    expectUnknown("some x : Thing | true");
  });

  it("returns unknown when a parse error occurs", () => {
    expectUnknown("(((");
    expectUnknown("");
  });
});
