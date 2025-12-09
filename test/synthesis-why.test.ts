import {
  synthesizeBinaryRelationWithWhy,
  synthesizeSelectorWithWhy,
} from "../src";
import { IDataInstance, IAtom, IType, IRelation } from "../src/types";

class RelationlessInstance implements IDataInstance {
  private _types: IType[];

  constructor(typeId: string, atomIds: string[]) {
    this._types = [
      {
        id: typeId,
        types: [typeId],
        atoms: atomIds.map((id) => ({ id, type: typeId, label: id })),
        isBuiltin: false,
      },
    ];
  }

  getAtomType(id: string): IType {
    const match = this._types.find((t) => t.atoms.some((a) => a.id === id));
    if (!match) throw new Error(`Missing atom ${id}`);
    return match;
  }

  getTypes(): readonly IType[] {
    return this._types;
  }

  getAtoms(): readonly IAtom[] {
    return this._types.flatMap((t) => t.atoms);
  }

  getRelations(): readonly IRelation[] {
    return [];
  }
}

class RelationInstance implements IDataInstance {
  private _types: IType[];
  private _relations: IRelation[];

  constructor(nodeIds: string[], relationName: string, edges: Array<[string, string]>) {
    const nodeType: IType = {
      id: "Node",
      types: ["Node"],
      atoms: nodeIds.map((id) => ({ id, type: "Node", label: id })),
      isBuiltin: false,
    };

    this._types = [nodeType];
    this._relations = [
      {
        id: relationName,
        name: relationName,
        types: ["Node", "Node"],
        tuples: edges.map(([from, to]) => ({ atoms: [from, to], types: ["Node", "Node"] })),
      },
    ];
  }

  getAtomType(id: string): IType {
    const match = this._types.find((t) => t.atoms.some((a) => a.id === id));
    if (!match) throw new Error(`Missing atom ${id}`);
    return match;
  }

  getTypes(): readonly IType[] {
    return this._types;
  }

  getAtoms(): readonly IAtom[] {
    return this._types.flatMap((t) => t.atoms);
  }

  getRelations(): readonly IRelation[] {
    return this._relations;
  }
}

function toAtomSet(ids: string[], instance: IDataInstance): Set<IAtom> {
  const atomMap = new Map(instance.getAtoms().map((atom) => [atom.id, atom] as const));
  return new Set(ids.map((id) => {
    const atom = atomMap.get(id);
    if (!atom) throw new Error(`Missing atom ${id}`);
    return atom;
  }));
}

function toPairSet(pairs: Array<[string, string]>, instance: IDataInstance): Set<readonly [IAtom, IAtom]> {
  const atomMap = new Map(instance.getAtoms().map((atom) => [atom.id, atom] as const));
  return new Set(
    pairs.map(([left, right]) => {
      const leftAtom = atomMap.get(left);
      const rightAtom = atomMap.get(right);
      if (!leftAtom || !rightAtom) throw new Error(`Missing atoms ${left}, ${right}`);
      return [leftAtom, rightAtom] as const;
    }),
  );
}

function expectSet(result: Set<string> | null, expected: string[]) {
  expect(result).not.toBeNull();
  expect(result).toEqual(new Set(expected));
}

describe("synthesis explanations", () => {
  it("returns a why-tree for synthesized selectors", () => {
    const datumA = new RelationlessInstance("Thing", ["a1", "a2"]);
    const datumB = new RelationlessInstance("Thing", ["b1"]);

    const synthesis = synthesizeSelectorWithWhy([
      { atoms: toAtomSet(["a1", "a2"], datumA), datum: datumA },
      { atoms: toAtomSet(["b1"], datumB), datum: datumB },
    ]);

    expect(synthesis.expression).toBe("Thing");
    expect(synthesis.examples).toHaveLength(2);

    for (const example of synthesis.examples) {
      expectSet(example.result, Array.from(example.target));
      expect(example.why.kind).toBe("identifier");
      expect(example.why.expression).toBe("Thing");
      expect(example.why.children).toBeUndefined();
    }
  });

  it("captures operator structure for binary relation synthesis", () => {
    const datumA = new RelationInstance(
      ["n1", "n2", "n3", "n4"],
      "edge",
      [
        ["n1", "n2"],
        ["n2", "n3"],
        ["n3", "n4"],
      ],
    );
    const datumB = new RelationInstance(
      ["x1", "x2", "x3"],
      "edge",
      [
        ["x1", "x2"],
        ["x2", "x3"],
      ],
    );

    const synthesis = synthesizeBinaryRelationWithWhy([
      { pairs: toPairSet([["n1", "n3"], ["n2", "n4"]], datumA), datum: datumA },
      { pairs: toPairSet([["x1", "x3"]], datumB), datum: datumB },
    ]);

    expect(synthesis.expression).toBe("edge.edge");
    expect(synthesis.examples).toHaveLength(2);

    for (const example of synthesis.examples) {
      expectSet(example.result, Array.from(example.target));
      expect(example.why.kind).toBe("join");
      expect(example.why.children).toHaveLength(2);
      const [left, right] = example.why.children ?? [];
      expect(left?.expression).toBe("edge");
      expect(right?.expression).toBe("edge");
    }
  });
});
