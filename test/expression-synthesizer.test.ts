import { ExpressionSynthesizer, SimpleGraphQueryEvaluator, Tuple, areTupleArraysEqual } from "../src";
import { LabelTestDataInstance } from "./testdatainstances";
import { IDataInstance, IAtom } from "../src/types";

describe("ExpressionSynthesizer", () => {
  function normalizeAtoms(atoms: readonly IAtom[]): Tuple[] {
    const seen = new Set<string>();
    const result: Tuple[] = [];
    for (const atom of atoms) {
      const tuple: Tuple = [atom.id];
      const key = JSON.stringify(tuple);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(tuple);
      }
    }
    return result;
  }

  function evaluateExpression(expression: string, datum: IDataInstance): Tuple[] {
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    const evaluation = evaluator.evaluateExpression(expression);
    if (!Array.isArray(evaluation)) {
      throw new Error(`Expression ${expression} did not evaluate to a tuple set`);
    }
    return evaluation as Tuple[];
  }

  it("returns a type when the atoms match exactly", () => {
    const datum = new LabelTestDataInstance();
    const nodeType = datum.getTypes().find((t) => t.id === "Node");
    expect(nodeType).toBeDefined();

    const synthesizer = new ExpressionSynthesizer(datum);
    const result = synthesizer.synthesize(nodeType!.atoms);

    expect(result.strategy).toBe("type");
    expect(result.expression).toBe("Node");

    const evaluation = evaluateExpression(result.expression, datum);
    expect(areTupleArraysEqual(evaluation, normalizeAtoms(nodeType!.atoms))).toBe(true);
  });

  it("combines existing relations with set operations before falling back", () => {
    const datum = new LabelTestDataInstance();
    const colorType = datum.getTypes().find((t) => t.id === "Color");
    const noneType = datum.getTypes().find((t) => t.id === "None");

    expect(colorType).toBeDefined();
    expect(noneType).toBeDefined();

    const synthesizer = new ExpressionSynthesizer(datum);
    const atoms = [...colorType!.atoms, ...noneType!.atoms];
    const result = synthesizer.synthesize(atoms);

    expect(result.strategy).toBe("combination");
    expect(result.expression).toBe("Color + None");

    const evaluation = evaluateExpression(result.expression, datum);
    expect(areTupleArraysEqual(evaluation, normalizeAtoms(atoms))).toBe(true);
  });

  it("falls back to explicit atom references when needed", () => {
    const datum = new LabelTestDataInstance();
    const nodeType = datum.getTypes().find((t) => t.id === "Node");
    expect(nodeType).toBeDefined();

    const subset = nodeType!.atoms.slice(0, 2);
    const synthesizer = new ExpressionSynthesizer(datum);
    const result = synthesizer.synthesize(subset);

    expect(result.strategy).toBe("fallback");
    for (const atom of subset) {
      expect(result.expression).toContain(atom.id);
    }

    const evaluation = evaluateExpression(result.expression, datum);
    expect(areTupleArraysEqual(evaluation, normalizeAtoms(subset))).toBe(true);
  });

  it("recognizes the empty set", () => {
    const datum = new LabelTestDataInstance();
    const synthesizer = new ExpressionSynthesizer(datum);

    const result = synthesizer.synthesize([]);

    expect(result.expression).toBe("none");
    expect(result.strategy).toBe("builtin");
  });
});
