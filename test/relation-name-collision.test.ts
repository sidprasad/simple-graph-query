import { SimpleGraphQueryEvaluator } from "../src";
import { IDataInstance, IAtom, IRelation, IType } from "../src/types";

// Regression for https://github.com/sidprasad/simple-graph-query/issues/55
//
// Relation NAMES are not unique — only the qualified id (`Sig<:label`) is.
// Alloy's `open util/ordering[A]` + `open util/ordering[B]` produces two fields
// both named `Next` (`A/Ord<:Next`, `B/Ord<:Next`). A bare-name reference must
// resolve to the UNION of both, not silently drop one.
const data = {
  atoms: [
    { id: "A0", type: "A", label: "A0", type_hierarchy: ["A", "univ"] },
    { id: "A1", type: "A", label: "A1", type_hierarchy: ["A", "univ"] },
    { id: "B0", type: "B", label: "B0", type_hierarchy: ["B", "univ"] },
    { id: "B1", type: "B", label: "B1", type_hierarchy: ["B", "univ"] },
  ],
  relations: [
    {
      id: "A/Ord<:Next",
      name: "Next",
      types: ["A", "A"],
      tuples: [{ atoms: ["A0", "A1"], types: ["A", "A"] }],
    },
    {
      id: "B/Ord<:Next",
      name: "Next",
      types: ["B", "B"],
      tuples: [{ atoms: ["B0", "B1"], types: ["B", "B"] }],
    },
  ],
  types: [
    {
      _: "type",
      id: "A",
      types: ["A", "univ"],
      atoms: [
        { _: "atom", id: "A0", type: "A" },
        { _: "atom", id: "A1", type: "A" },
      ],
      meta: { builtin: false },
    },
    {
      _: "type",
      id: "B",
      types: ["B", "univ"],
      atoms: [
        { _: "atom", id: "B0", type: "B" },
        { _: "atom", id: "B1", type: "B" },
      ],
      meta: { builtin: false },
    },
  ],
};

class TestDataInstance implements IDataInstance {
  constructor(private _data: any) {}
  getTypes(): IType[] {
    return this._data.types as IType[];
  }
  getRelations(): IRelation[] {
    return this._data.relations as IRelation[];
  }
  getAtoms(): IAtom[] {
    return this._data.atoms as IAtom[];
  }
  getAtomType(id: string): IType {
    for (const type of this.getTypes()) {
      if (type.atoms.some((atom) => atom.id === id)) return type;
    }
    throw new Error(`Atom with id ${id} not found`);
  }
}

describe("Relation name collision (issue #55)", () => {
  it("unions tuples of all relations sharing a name instead of erasing", () => {
    const datum = new TestDataInstance(data);
    const evaluator = new SimpleGraphQueryEvaluator(datum);

    const result = evaluator.evaluateExpression("Next");
    expect(Array.isArray(result)).toBe(true);

    const tuples = (result as any[]).map((t) => t.map(String).join("->")).sort();
    // Both orderings must survive — pre-fix this returned only one pair.
    expect(tuples).toEqual(["A0->A1", "B0->B1"]);
  });

  it("keeps the join index consistent with the union'd relation", () => {
    const datum = new TestDataInstance(data);
    const evaluator = new SimpleGraphQueryEvaluator(datum);

    // A0.Next and B0.Next both rely on the first-element index; both must resolve.
    expect((evaluator.evaluateExpression("A0.Next") as any[]).map(String)).toEqual(["A1"]);
    expect((evaluator.evaluateExpression("B0.Next") as any[]).map(String)).toEqual(["B1"]);
  });
});
