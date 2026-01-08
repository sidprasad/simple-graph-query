import { synthesizeSelector, synthesizeBinaryRelation, SelectorSynthesisError } from "../src";
import { IDataInstance, IAtom, IType, IRelation } from "../src/types";
import { SimpleGraphQueryEvaluator } from "../src";

type RelationlessInstanceConfig = {
  typeId: string;
  atomIds: string[];
  subtypeAssignments?: Record<string, string[]>; // subtype -> atom ids
};

class RelationlessInstance implements IDataInstance {
  private _types: IType[];

  constructor(config: RelationlessInstanceConfig) {
    const rootType: IType = {
      id: config.typeId,
      types: [config.typeId],
      atoms: config.atomIds.map((id) => ({ id, type: config.typeId, label: id })),
      isBuiltin: false,
    };

    this._types = [rootType];

    if (config.subtypeAssignments) {
      for (const [subtype, atoms] of Object.entries(config.subtypeAssignments)) {
        this._types.push({
          id: subtype,
          types: [subtype, config.typeId],
          atoms: atoms.map((id) => ({ id, type: subtype, label: id })),
          isBuiltin: false,
        });
      }
    }
  }

  getAtomType(id: string): IType {
    const match = this._types.find((type) => type.atoms.some((atom) => atom.id === id));
    if (!match) {
      throw new Error(`Missing atom ${id}`);
    }
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

type RelationInstanceConfig = {
  nodeIds: string[];
  rootIds: string[];
  relationName: string;
  edges: Array<[string, string]>;
};

class RelationInstance implements IDataInstance {
  private _types: IType[];
  private _relations: IRelation[];

  constructor(config: RelationInstanceConfig) {
    const nodeType: IType = {
      id: "Node",
      types: ["Node"],
      atoms: config.nodeIds.map((id) => ({ id, type: "Node", label: id })),
      isBuiltin: false,
    };

    const rootType: IType = {
      id: "Root",
      types: ["Root", "Node"],
      atoms: config.rootIds.map((id) => ({ id, type: "Root", label: id })),
      isBuiltin: false,
    };

    this._types = [nodeType, rootType];

    this._relations = [
      {
        id: config.relationName,
        name: config.relationName,
        types: ["Node", "Node"],
        tuples: config.edges.map(([from, to]) => ({ atoms: [from, to], types: ["Node", "Node"] })),
      },
    ];
  }

  getAtomType(id: string): IType {
    const match = this._types.find((type) => type.atoms.some((atom) => atom.id === id));
    if (!match) {
      throw new Error(`Missing atom ${id}`);
    }
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
  const atomMap = new Map(instance.getAtoms().map((a) => [a.id, a] as const));
  return new Set(ids.map((id) => {
    const atom = atomMap.get(id);
    if (!atom) {
      throw new Error(`Missing atom ${id} in instance`);
    }
    return atom;
  }));
}

function evaluationToSet(result: unknown): Set<string> {
  if (!Array.isArray(result)) {
    throw new Error("Expected evaluation result to be an array");
  }
  const collected = new Set<string>();
  for (const tuple of result) {
    if (!Array.isArray(tuple) || tuple.length !== 1) {
      throw new Error("Expected unary tuple results");
    }
    const value = tuple[0];
    // Accept both strings and numbers (integers are returned as numbers)
    if (typeof value === "string") {
      collected.add(value);
    } else if (typeof value === "number") {
      collected.add(String(value));
    } else {
      throw new Error("Expected string or number in unary tuple");
    }
  }
  return collected;
}

function evaluationToPairSet(result: unknown): Set<string> {
  if (!Array.isArray(result)) {
    throw new Error("Expected evaluation result to be an array");
  }
  const collected = new Set<string>();
  for (const tuple of result) {
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 2 ||
      typeof tuple[0] !== "string" ||
      typeof tuple[1] !== "string"
    ) {
      throw new Error("Expected binary tuple results");
    }
    collected.add(`${tuple[0]}\u0000${tuple[1]}`);
  }
  return collected;
}

function toPairSet(pairs: Array<[string, string]>, instance: IDataInstance): Set<readonly [IAtom, IAtom]> {
  const atomMap = new Map(instance.getAtoms().map((a) => [a.id, a] as const));
  const collected: Array<readonly [IAtom, IAtom]> = pairs.map(([left, right]) => {
    const leftAtom = atomMap.get(left);
    const rightAtom = atomMap.get(right);
    if (!leftAtom || !rightAtom) {
      throw new Error(`Missing atom pair (${left}, ${right}) in instance`);
    }
    return [leftAtom, rightAtom];
  });
  return new Set(collected);
}

describe("selector synthesis", () => {
  it("produces a shared type expression", () => {
    const datumA = new RelationlessInstance({ typeId: "Thing", atomIds: ["a1", "a2"] });
    const datumB = new RelationlessInstance({ typeId: "Thing", atomIds: ["b1"] });

    const selector = synthesizeSelector([
      { atoms: toAtomSet(["a1", "a2"], datumA), datum: datumA },
      { atoms: toAtomSet(["b1"], datumB), datum: datumB },
    ]);

    expect(selector).toBe("Thing");

    const evalA = new SimpleGraphQueryEvaluator(datumA).evaluateExpression(selector);
    const evalB = new SimpleGraphQueryEvaluator(datumB).evaluateExpression(selector);

    expect(evaluationToSet(evalA)).toEqual(new Set(["a1", "a2"]));
    expect(evaluationToSet(evalB)).toEqual(new Set(["b1"]));
  });

  it("unions multiple identifiers to satisfy all examples", () => {
    const datumA = new RelationlessInstance({
      typeId: "Thing",
      atomIds: ["x1", "y1", "z1"],
      subtypeAssignments: {
        Alpha: ["x1"],
        Beta: ["y1"],
        Gamma: ["z1"],
      },
    });

    const datumB = new RelationlessInstance({
      typeId: "Thing",
      atomIds: ["x2", "y2", "z2"],
      subtypeAssignments: {
        Alpha: ["x2"],
        Beta: ["y2"],
        Gamma: ["z2"],
      },
    });

    const selector = synthesizeSelector([
      { atoms: toAtomSet(["x1", "z1"], datumA), datum: datumA },
      { atoms: toAtomSet(["x2", "z2"], datumB), datum: datumB },
    ]);

    const evaluatorA = new SimpleGraphQueryEvaluator(datumA);
    const evaluatorB = new SimpleGraphQueryEvaluator(datumB);

    const resultA = evaluatorA.evaluateExpression(selector);
    const resultB = evaluatorB.evaluateExpression(selector);

    expect(evaluationToSet(resultA)).toEqual(new Set(["x1", "z1"]));
    expect(evaluationToSet(resultB)).toEqual(new Set(["x2", "z2"]));
  });

  it("composes joins and transitive closure to reach descendants", () => {
    const datumA = new RelationInstance({
      nodeIds: ["n1", "n2", "n3", "n4"],
      rootIds: ["n1"],
      relationName: "edge",
      edges: [
        ["n1", "n2"],
        ["n2", "n3"],
      ],
    });

    const datumB = new RelationInstance({
      nodeIds: ["a", "b", "c", "d", "e"],
      rootIds: ["a"],
      relationName: "edge",
      edges: [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
      ],
    });

    const selector = synthesizeSelector([
      { atoms: toAtomSet(["n2", "n3"], datumA), datum: datumA },
      { atoms: toAtomSet(["b", "c", "d"], datumB), datum: datumB },
    ]);

    const resultA = new SimpleGraphQueryEvaluator(datumA).evaluateExpression(selector);
    const resultB = new SimpleGraphQueryEvaluator(datumB).evaluateExpression(selector);

    expect(evaluationToSet(resultA)).toEqual(new Set(["n2", "n3"]));
    expect(evaluationToSet(resultB)).toEqual(new Set(["b", "c", "d"]));
  });

  it("fails when no shared selectors exist", () => {
    const datumA = new RelationlessInstance({ typeId: "Thing", atomIds: ["a"] });
    const datumB = new RelationlessInstance({ typeId: "Other", atomIds: ["b", "c"] });

    expect(() => synthesizeSelector([
      { atoms: toAtomSet(["a"], datumA), datum: datumA },
      { atoms: toAtomSet(["b"], datumB), datum: datumB },
    ])).toThrow(SelectorSynthesisError);
  });

  it("handles repeated data instances in selector examples", () => {
    const datum = new RelationlessInstance({ typeId: "Thing", atomIds: ["a1", "a2"] });

    const selector = synthesizeSelector([
      { atoms: toAtomSet(["a1", "a2"], datum), datum },
      { atoms: toAtomSet(["a1", "a2"], datum), datum },
    ]);

    expect(selector).toBe("Thing");

    const result = new SimpleGraphQueryEvaluator(datum).evaluateExpression(selector);
    expect(evaluationToSet(result)).toEqual(new Set(["a1", "a2"]));
  });
});

describe("binary relation synthesis", () => {
  it("produces a shared binary relation expression", () => {
    const datumA = new RelationInstance({
      nodeIds: ["a1", "a2", "a3"],
      rootIds: ["a1"],
      relationName: "edge",
      edges: [
        ["a1", "a2"],
        ["a2", "a3"],
      ],
    });

    const datumB = new RelationInstance({
      nodeIds: ["b1", "b2"],
      rootIds: ["b1"],
      relationName: "edge",
      edges: [["b1", "b2"]],
    });

    const relation = synthesizeBinaryRelation([
      { pairs: toPairSet([["a1", "a2"], ["a2", "a3"]], datumA), datum: datumA },
      { pairs: toPairSet([["b1", "b2"]], datumB), datum: datumB },
    ]);

    expect(relation).toBe("edge");

    const evalA = new SimpleGraphQueryEvaluator(datumA).evaluateExpression(relation);
    const evalB = new SimpleGraphQueryEvaluator(datumB).evaluateExpression(relation);

    expect(evaluationToPairSet(evalA)).toEqual(
      new Set(["a1\u0000a2", "a2\u0000a3"]),
    );
    expect(evaluationToPairSet(evalB)).toEqual(new Set(["b1\u0000b2"]));
  });

  it("joins binary relations to reach two-hop connections", () => {
    const datumA = new RelationInstance({
      nodeIds: ["n1", "n2", "n3", "n4"],
      rootIds: ["n1"],
      relationName: "edge",
      edges: [
        ["n1", "n2"],
        ["n2", "n3"],
        ["n3", "n4"],
      ],
    });

    const datumB = new RelationInstance({
      nodeIds: ["x1", "x2", "x3"],
      rootIds: ["x1"],
      relationName: "edge",
      edges: [
        ["x1", "x2"],
        ["x2", "x3"],
      ],
    });

    const relation = synthesizeBinaryRelation([
      { pairs: toPairSet([["n1", "n3"], ["n2", "n4"]], datumA), datum: datumA },
      { pairs: toPairSet([["x1", "x3"]], datumB), datum: datumB },
    ]);

    expect(relation).toBe("edge.edge");

    const evalA = new SimpleGraphQueryEvaluator(datumA).evaluateExpression(relation);
    const evalB = new SimpleGraphQueryEvaluator(datumB).evaluateExpression(relation);

    expect(evaluationToPairSet(evalA)).toEqual(
      new Set(["n1\u0000n3", "n2\u0000n4"]),
    );
    expect(evaluationToPairSet(evalB)).toEqual(new Set(["x1\u0000x3"]));
  });

  it("synthesizes Type.relation joins for selecting relation range values", () => {
    // Create an instance like the BST example: Node type with a 'key' relation to Int
    // When selecting the integer values {5, 6, 7}, should synthesize "Node.key"
    // The Int type has MORE atoms than what's selected, so Int alone won't work
    class NodeKeyInstance implements IDataInstance {
      private _types: IType[];
      private _relations: IRelation[];

      constructor(
        nodeIds: string[],
        keyValues: Array<[string, string]>,
        allIntValues: string[],
      ) {
        const intType: IType = {
          id: "Int",
          types: ["Int"],
          atoms: allIntValues.map((id) => ({
            id,
            type: "Int",
            label: id,
          })),
          isBuiltin: true,
        };

        const nodeType: IType = {
          id: "Node",
          types: ["Node"],
          atoms: nodeIds.map((id) => ({ id, type: "Node", label: id })),
          isBuiltin: false,
        };

        this._types = [intType, nodeType];

        this._relations = [
          {
            id: "key",
            name: "key",
            types: ["Node", "Int"],
            tuples: keyValues.map(([node, val]) => ({
              atoms: [node, val],
              types: ["Node", "Int"],
            })),
          },
        ];
      }

      getAtomType(id: string): IType {
        const match = this._types.find((type) =>
          type.atoms.some((atom) => atom.id === id),
        );
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

    // Int type has values 0-7, but only 5,6,7 are used as keys
    const datum = new NodeKeyInstance(
      ["Node0", "Node1", "Node2", "Node3", "Node4"],
      [
        ["Node0", "7"],
        ["Node1", "7"],
        ["Node2", "6"],
        ["Node3", "6"],
        ["Node4", "5"],
      ],
      ["0", "1", "2", "3", "4", "5", "6", "7"], // All available integers
    );

    // Select just the key values: {5, 6, 7} - this is a subset of Int
    const selector = synthesizeSelector([
      { atoms: toAtomSet(["5", "6", "7"], datum), datum },
    ]);

    // Should synthesize Node.key (or equivalent) rather than a complex expression
    expect(selector).toBe("Node.key");

    const result = new SimpleGraphQueryEvaluator(datum).evaluateExpression(selector);
    expect(evaluationToSet(result)).toEqual(new Set(["5", "6", "7"]));
  });

  it("synthesizes relation.Type joins for selecting relation domain values", () => {
    // Test the inverse direction: key.Int to get all nodes that have a key
    // (projecting domain by joining with range type)
    class NodeKeyInstance implements IDataInstance {
      private _types: IType[];
      private _relations: IRelation[];

      constructor(
        nodeIds: string[],
        keyValues: Array<[string, string]>,
        allIntValues: string[],
      ) {
        const intType: IType = {
          id: "Int",
          types: ["Int"],
          atoms: allIntValues.map((id) => ({
            id,
            type: "Int",
            label: id,
          })),
          isBuiltin: true,
        };

        const nodeType: IType = {
          id: "Node",
          types: ["Node"],
          atoms: nodeIds.map((id) => ({ id, type: "Node", label: id })),
          isBuiltin: false,
        };

        this._types = [intType, nodeType];

        this._relations = [
          {
            id: "key",
            name: "key",
            types: ["Node", "Int"],
            tuples: keyValues.map(([node, val]) => ({
              atoms: [node, val],
              types: ["Node", "Int"],
            })),
          },
        ];
      }

      getAtomType(id: string): IType {
        const match = this._types.find((type) =>
          type.atoms.some((atom) => atom.id === id),
        );
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

    // Only Node0, Node1, Node2 have keys - Node3, Node4 don't
    const datum = new NodeKeyInstance(
      ["Node0", "Node1", "Node2", "Node3", "Node4"],
      [
        ["Node0", "7"],
        ["Node1", "6"],
        ["Node2", "5"],
      ],
      ["0", "1", "2", "3", "4", "5", "6", "7"],
    );

    // Select nodes that have keys: {Node0, Node1, Node2}
    const selector = synthesizeSelector([
      { atoms: toAtomSet(["Node0", "Node1", "Node2"], datum), datum },
    ]);

    // Should synthesize key.Int (nodes that have a key in Int)
    expect(selector).toBe("key.Int");

    const result = new SimpleGraphQueryEvaluator(datum).evaluateExpression(selector);
    expect(evaluationToSet(result)).toEqual(new Set(["Node0", "Node1", "Node2"]));
  });

  it("handles repeated data instances in relation examples", () => {
    const datum = new RelationInstance({
      nodeIds: ["a1", "a2", "a3"],
      rootIds: ["a1"],
      relationName: "edge",
      edges: [
        ["a1", "a2"],
        ["a2", "a3"],
      ],
    });

    const relation = synthesizeBinaryRelation([
      { pairs: toPairSet([["a1", "a2"], ["a2", "a3"]], datum), datum },
      { pairs: toPairSet([["a1", "a2"], ["a2", "a3"]], datum), datum },
    ]);

    expect(relation).toBe("edge");

    const result = new SimpleGraphQueryEvaluator(datum).evaluateExpression(relation);
    expect(evaluationToPairSet(result)).toEqual(
      new Set(["a1\u0000a2", "a2\u0000a3"]),
    );
  });

  it("synthesizes ~relation (transpose) for inverse edges", () => {
    const datum = new RelationInstance({
      nodeIds: ["n1", "n2", "n3"],
      rootIds: [],
      relationName: "edge",
      edges: [
        ["n1", "n2"],
        ["n2", "n3"],
      ],
    });

    // Select reverse edges: who points TO each node
    const relation = synthesizeBinaryRelation([
      { pairs: toPairSet([["n2", "n1"], ["n3", "n2"]], datum), datum },
    ]);

    expect(relation).toBe("~(edge)");

    const result = new SimpleGraphQueryEvaluator(datum).evaluateExpression(relation);
    expect(evaluationToPairSet(result)).toEqual(
      new Set(["n2\u0000n1", "n3\u0000n2"]),
    );
  });

  it("synthesizes *relation (reflexive-transitive closure)", () => {
    const datum = new RelationInstance({
      nodeIds: ["n1", "n2", "n3"],
      rootIds: ["n1"],
      relationName: "edge",
      edges: [
        ["n1", "n2"],
        ["n2", "n3"],
      ],
    });

    // Select all nodes reachable from n1 INCLUDING n1 itself
    const selector = synthesizeSelector([
      { atoms: toAtomSet(["n1", "n2", "n3"], datum), datum },
    ]);

    // Should use reflexive-transitive closure
    const result = new SimpleGraphQueryEvaluator(datum).evaluateExpression(selector);
    expect(evaluationToSet(result)).toEqual(new Set(["n1", "n2", "n3"]));
  });
});