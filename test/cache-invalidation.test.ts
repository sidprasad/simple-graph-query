import { SimpleGraphQueryEvaluator } from "../src";
import { IDataInstance, IAtom, IRelation, ITuple, IType } from "../src/types";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";

// Minimal mutable IDataInstance for testing in-place mutation behavior.
class MutableInstance implements IDataInstance {
  constructor(
    private types: IType[],
    private relations: IRelation[],
    private atoms: IAtom[],
  ) {}
  getTypes() { return this.types; }
  getRelations() { return this.relations; }
  getAtoms() { return this.atoms; }
  getAtomType(id: string): IType {
    for (const t of this.types) {
      if (t.atoms.some(a => a.id === id)) return t;
    }
    throw new Error(`atom ${id} not found`);
  }

  // Mutate a relation's tuples in place.
  setRelationTuples(name: string, tuples: ITuple[]): void {
    const rel = this.relations.find(r => r.name === name);
    if (!rel) throw new Error(`relation ${name} not found`);
    rel.tuples = tuples;
  }
}

function makeInstance(edges: [string, string][]): MutableInstance {
  const atomIds = Array.from(new Set(edges.flat()));
  const atoms: IAtom[] = atomIds.map(id => ({ id, type: "Node", label: id }));
  const nodeType: IType = {
    id: "Node",
    types: ["Node"],
    atoms,
    isBuiltin: false,
  };
  const edgeTuples: ITuple[] = edges.map(([a, b]) => ({
    atoms: [a, b],
    types: ["Node", "Node"],
  }));
  const edgeRelation: IRelation = {
    id: "edge",
    name: "edge",
    types: ["Node", "Node"],
    tuples: edgeTuples,
  };
  return new MutableInstance([nodeType], [edgeRelation], atoms);
}

function asTuples(result: unknown): Tuple[] {
  return Array.isArray(result) ? (result as Tuple[]) : [];
}

describe("Cache invalidation contract", () => {
  it("invalidate() picks up in-place mutations of the datum", () => {
    const datum = makeInstance([["a", "b"]]);
    const evalUtil = new SimpleGraphQueryEvaluator(datum);

    // Prime the cache.
    const before = evalUtil.evaluateExpression("edge");
    expect(areTupleArraysEqual(asTuples(before), [["a", "b"]])).toBe(true);

    // Mutate the datum in place.
    datum.setRelationTuples("edge", [
      { atoms: ["a", "b"], types: ["Node", "Node"] },
      { atoms: ["b", "c"], types: ["Node", "Node"] },
    ]);

    // Without invalidation, the cached result reflects the old data.
    // (This is documented in the JSDoc for SimpleGraphQueryEvaluator.)
    const stale = evalUtil.evaluateExpression("edge");
    expect(areTupleArraysEqual(asTuples(stale), [["a", "b"]])).toBe(true);

    // After invalidate(), the next evaluation picks up the new tuples.
    evalUtil.invalidate();
    const fresh = evalUtil.evaluateExpression("edge");
    expect(
      areTupleArraysEqual(asTuples(fresh), [
        ["a", "b"],
        ["b", "c"],
      ])
    ).toBe(true);
  });

  it("reassigning datum to a new reference invalidates implicitly", () => {
    const a = makeInstance([["a", "b"]]);
    const b = makeInstance([["x", "y"]]);
    const evalUtil = new SimpleGraphQueryEvaluator(a);

    const first = evalUtil.evaluateExpression("edge");
    expect(areTupleArraysEqual(asTuples(first), [["a", "b"]])).toBe(true);

    evalUtil.datum = b;
    const second = evalUtil.evaluateExpression("edge");
    expect(areTupleArraysEqual(asTuples(second), [["x", "y"]])).toBe(true);
  });
});
