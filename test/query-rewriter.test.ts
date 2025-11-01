import { SimpleGraphQueryEvaluator } from "../src";
import { areTupleArraysEqual, Tuple } from "../src/ForgeExprEvaluator";
import { IDataInstance, IAtom, IRelation, ITuple, IType } from "../src/types";

// Helper to check if results are equivalent tuple arrays
function areEquivalentTupleArrays(result: any, expected: Tuple[]) {
  if (Array.isArray(result)) {
    const resultTuples = result as Tuple[];
    return areTupleArraysEqual(resultTuples, expected);
  }
  return false;
}

/**
 * Simple test data instance for rewriter tests.
 * Creates a small graph with a few atoms and relations.
 */
class SimpleTestDataInstance implements IDataInstance {
  private types: IType[];
  private relations: IRelation[];

  constructor() {
    // Create types with atoms
    this.types = [
      {
        id: "A",
        types: ["A", "object"],
        atoms: [
          { id: "A0", type: "A", label: "A0" },
          { id: "A1", type: "A", label: "A1" },
          { id: "A2", type: "A", label: "A2" },
        ],
        isBuiltin: false,
      },
      {
        id: "B",
        types: ["B", "object"],
        atoms: [
          { id: "B0", type: "B", label: "B0" },
          { id: "B1", type: "B", label: "B1" },
        ],
        isBuiltin: false,
      },
    ];

    // Create some test relations
    this.relations = [
      // Binary relation: next
      {
        id: "next",
        name: "next",
        types: ["A", "A"],
        tuples: [
          { atoms: ["A0", "A1"], types: ["A", "A"] },
          { atoms: ["A1", "A2"], types: ["A", "A"] },
        ],
      },
      // Binary relation: f (field)
      {
        id: "f",
        name: "f",
        types: ["A", "B"],
        tuples: [
          { atoms: ["A0", "B0"], types: ["A", "B"] },
          { atoms: ["A1", "B1"], types: ["A", "B"] },
          { atoms: ["A2", "B0"], types: ["A", "B"] },
        ],
      },
      // Binary relation: g (another field)
      {
        id: "g",
        name: "g",
        types: ["A", "B"],
        tuples: [
          { atoms: ["A0", "B1"], types: ["A", "B"] },
          { atoms: ["A1", "B0"], types: ["A", "B"] },
        ],
      },
      // Binary relation: r
      {
        id: "r",
        name: "r",
        types: ["A", "A"],
        tuples: [
          { atoms: ["A0", "A1"], types: ["A", "A"] },
          { atoms: ["A1", "A2"], types: ["A", "A"] },
          { atoms: ["A2", "A2"], types: ["A", "A"] }, // reflexive pair
        ],
      },
      // Unary relation: S (a set of atoms)
      {
        id: "S",
        name: "S",
        types: ["B"],
        tuples: [
          { atoms: ["B0"], types: ["B"] },
          { atoms: ["B1"], types: ["B"] },
        ],
      },
      // Binary relation: E (for closure tests)
      {
        id: "E",
        name: "E",
        types: ["A", "A"],
        tuples: [
          { atoms: ["A0", "A1"], types: ["A", "A"] },
          { atoms: ["A1", "A2"], types: ["A", "A"] },
          { atoms: ["A2", "A0"], types: ["A", "A"] }, // cycle to test mutual reachability
        ],
      },
    ];
  }

  getTypes(): readonly IType[] {
    return this.types;
  }

  getRelations(): readonly IRelation[] {
    return this.relations;
  }

  getAtoms(): readonly IAtom[] {
    // Collect all atoms from all types
    const atoms: IAtom[] = [];
    for (const type of this.types) {
      atoms.push(...type.atoms);
    }
    return atoms;
  }

  getAtomType(id: string): IType {
    // Find the type that contains the atom with the given id
    for (const type of this.types) {
      if (type.atoms.some(atom => atom.id === id)) {
        return type;
      }
    }
    throw new Error(`Atom with id ${id} not found`);
  }

  getBitwidth(): number {
    return 4;
  }

  getMaxSeq(): number {
    return 0;
  }
}

describe("Query Rewriter", () => {
  let datum: SimpleTestDataInstance;

  beforeEach(() => {
    datum = new SimpleTestDataInstance();
  });

  describe("Pattern A: Field equality to direct relation", () => {
    it("should rewrite {a,b | a.f = b} to f", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      // Original comprehension
      const original = "{a, b: univ | a.f = b}";
      const result1 = evaluator.evaluateExpression(original);
      
      // Direct relation
      const direct = "f";
      const result2 = evaluator.evaluateExpression(direct);
      
      // Results should be equivalent
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });

    it("should handle commutative case {a,b | b = a.f}", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | b = a.f}";
      const result1 = evaluator.evaluateExpression(original);
      
      const direct = "f";
      const result2 = evaluator.evaluateExpression(direct);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });
  });

  describe("Pattern C: Membership in a join", () => {
    it("should rewrite {a,b | b in a.f} to f", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | b in a.f}";
      const result1 = evaluator.evaluateExpression(original);
      
      const direct = "f";
      const result2 = evaluator.evaluateExpression(direct);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });

    it("should rewrite {a,b | a->b in r} to r", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | a->b in r}";
      const result1 = evaluator.evaluateExpression(original);
      
      const direct = "r";
      const result2 = evaluator.evaluateExpression(direct);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });
  });

  describe("Pattern D: Membership with guard on second component", () => {
    it("should rewrite {a,b | a->b in r and b in S} to r & (univ -> S)", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | a->b in r and b in S}";
      const result1 = evaluator.evaluateExpression(original);
      
      const optimized = "r & (univ -> S)";
      const result2 = evaluator.evaluateExpression(optimized);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });

    it("should handle reversed order {a,b | b in S and a->b in r}", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | b in S and a->b in r}";
      const result1 = evaluator.evaluateExpression(original);
      
      const optimized = "r & (univ -> S)";
      const result2 = evaluator.evaluateExpression(optimized);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });
  });

  describe("Pattern E: Mutual reachability via closure", () => {
    it("should rewrite {a,b | a->b in ^E and b->a in ^E} to (^E) & ~(^E)", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | a->b in ^E and b->a in ^E}";
      const result1 = evaluator.evaluateExpression(original);
      
      const optimized = "(^E) & ~(^E)";
      const result2 = evaluator.evaluateExpression(optimized);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });

    it("should handle reversed order {a,b | b->a in ^E and a->b in ^E}", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | b->a in ^E and a->b in ^E}";
      const result1 = evaluator.evaluateExpression(original);
      
      const optimized = "(^E) & ~(^E)";
      const result2 = evaluator.evaluateExpression(optimized);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });
  });

  describe("Pattern F: Nonreflexive pairs", () => {
    it.skip("should rewrite {a,b | a!=b and a->b in r} to r - iden (requires iden support)", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | a!=b and a->b in r}";
      const result1 = evaluator.evaluateExpression(original);
      
      const optimized = "r - iden";
      const result2 = evaluator.evaluateExpression(optimized);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });

    it.skip("should handle reversed order {a,b | a->b in r and a!=b} (requires iden support)", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | a->b in r and a!=b}";
      const result1 = evaluator.evaluateExpression(original);
      
      const optimized = "r - iden";
      const result2 = evaluator.evaluateExpression(optimized);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });

    it.skip("should handle 'not a = b' form (requires iden support)", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      const original = "{a, b: univ | not a = b and a->b in r}";
      const result1 = evaluator.evaluateExpression(original);
      
      const optimized = "r - iden";
      const result2 = evaluator.evaluateExpression(optimized);
      
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
    });
  });

  describe("Rewriter can be disabled", () => {
    it.skip("should not rewrite when disabled (requires iden support for test data)", () => {
      const evaluatorWithRewrites = new SimpleGraphQueryEvaluator(datum, { enableRewrites: true });
      const evaluatorWithoutRewrites = new SimpleGraphQueryEvaluator(datum, { enableRewrites: false });
      
      const expr = "{a, b: univ | a->b in r}";
      
      const result1 = evaluatorWithRewrites.evaluateExpression(expr);
      const result2 = evaluatorWithoutRewrites.evaluateExpression(expr);
      
      // Both should produce the same result
      expect(areEquivalentTupleArrays(result1, result2 as Tuple[])).toBe(true);
      
      // And both should match the direct relation
      const direct = evaluatorWithRewrites.evaluateExpression("r");
      expect(areEquivalentTupleArrays(result1, direct as Tuple[])).toBe(true);
    });
  });

  describe("Non-matching patterns should not be rewritten", () => {
    it("should not rewrite complex comprehensions that don't match patterns", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      // This doesn't match any pattern
      const expr = "{a, b: univ | some c: univ | a.f = c and c.g = b}";
      const result = evaluator.evaluateExpression(expr);
      
      // Should not throw an error and should return valid result
      expect(Array.isArray(result)).toBe(true);
    });

    it("should handle comprehensions with three variables", () => {
      const evaluator = new SimpleGraphQueryEvaluator(datum);
      
      // Three variables - doesn't match any pattern (all patterns are binary)
      const expr = "{a, b, c: univ | a.f = b and b.g = c}";
      const result = evaluator.evaluateExpression(expr);
      
      // Should not throw an error
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
