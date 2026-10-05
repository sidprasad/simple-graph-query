import { readFileSync } from "fs";
import { analyzeForgeExpression, SimpleGraphQueryEvaluator } from "../src";
import { IDataInstance, IAtom, IType } from "../src/types";
import { errorMessage, tuples } from "./helpers";

const atoms: IAtom[] = [
  { id: "z", type: "Person", label: "Alice" },
  { id: "a", type: "Person", label: "Bob" },
  { id: "b", type: "Person", label: "Bob" },
];
const person: IType = { id: "Person", types: ["Person"], atoms, isBuiltin: false };
const datum: IDataInstance = {
  getAtoms: () => atoms,
  getTypes: () => [person],
  getRelations: () => [],
  getAtomType: () => person,
};
const ev = new SimpleGraphQueryEvaluator(datum);

describe("lexCompare", () => {
  it.each([
    ['"apple", "banana"', -1],
    ['"banana", "apple"', 1],
    ['"apple", "apple"', 0],
    ['"", ""', 0],
    ['"", "a"', -1],
    ['"a", "aa"', -1],
    ['"aa", "a"', 1],
    ['"A", "a"', -1],
    ['"10", "2"', -1],
    ['" a", "a"', -1],
    ['"a\\nb", "a\\tb"', 1],
    ['"é", "é"', 1], // No normalization: composed vs decomposed.
    ['"😀", "\uE000"', -1], // UTF-16 order differs from code-point order.
  ])("compares %s using JavaScript string ordering", (args, expected) => {
    expect(ev.evaluateExpression(`lexCompare[${args}]`)).toBe(expected);
    expect(analyzeForgeExpression(`lexCompare[${args}] = ${expected}`).status).toBe("tautology");
    expect(analyzeForgeExpression(`lexCompare[${args}] != ${expected}`).status).toBe("unsat");
  });

  it("accepts singleton unary relations and preserves equality of arguments", () => {
    expect(ev.evaluateExpression('lexCompare["a" + none, "b" + none]')).toBe(-1);
    expect(ev.evaluateExpression('lexCompare["a" + "a", "a"]')).toBe(0);
    expect(ev.evaluateExpression("lexCompare[a, a]")).toBe(0);
  });

  it("compares IDs and only extracts labels when explicitly requested", () => {
    expect(ev.evaluateExpression("lexCompare[z, a]")).toBe(1);
    expect(ev.evaluateExpression("lexCompare[@:z, @:a]")).toBe(-1);
    expect(ev.evaluateExpression("lexCompare[@str:a, @str:b]")).toBe(0);
    expect(tuples(ev.evaluateExpression("{x, y: Person | lexCompare[@:x, @:y] < 0}"), [
      ["z", "a"], ["z", "b"],
    ])).toBe(true);
  });

  it.each([
    'lexCompare["a"]',
    'lexCompare["a", "b", "c"]',
    'lexCompare["a" + "b"]', // One argument must not flatten into two.
  ])("rejects the wrong argument count: %s", (expr) => {
    expect(errorMessage(ev.evaluateExpression(expr))).toContain("exactly 2 arguments");
    expect(analyzeForgeExpression(expr).status).toBe("ill-typed");
  });

  it.each([
    'none', '"a" + "b"', '"a" -> "b"', '1', 'true', '1 + none', 'false + none',
  ])("rejects non-singleton string operands: %s", (arg) => {
    expect(errorMessage(ev.evaluateExpression(`lexCompare[${arg}, "b"]`))).toContain("argument 1");
    expect(errorMessage(ev.evaluateExpression(`lexCompare["a", ${arg}]`))).toContain("argument 2");
  });

  it("does not shift an empty argument into the other argument's values", () => {
    expect(errorMessage(ev.evaluateExpression('lexCompare[none, "a" + "b"]'))).toContain("argument 1");
    expect(errorMessage(ev.evaluateExpression('lexCompare["a" + "b", none]'))).toContain("argument 1");
  });

  it("keeps infix ordering numeric", () => {
    expect(errorMessage(ev.evaluateExpression('"a" < "b"'))).toContain("2 number operands");
    expect(ev.evaluateExpression('lexCompare["a", "b"] < 0')).toBe(true);
  });

  it("recognizes parenthesized and literal callees in static analysis", () => {
    for (const callee of ['(lexCompare)', '((lexCompare))', '"lexCompare"']) {
      const expr = `${callee}["a", "b"] < 0`;
      expect(ev.evaluateExpression(expr)).toBe(true);
      expect(analyzeForgeExpression(expr).status).toBe("tautology");
      expect(analyzeForgeExpression(`${callee}[none, "b"]`).status).toBe("ill-typed");
    }
  });

  it("keeps label comparisons data-dependent and recognizes the builtin name", () => {
    const result = analyzeForgeExpression('{x, y: Person | lexCompare[@:x, @:y] < 0}', datum);
    expect(result.status).toBe("unknown");
    expect(result.unresolvedNames).toBeUndefined();
    expect(analyzeForgeExpression('lexCompare[none, "a"]').status).toBe("ill-typed");
    expect(analyzeForgeExpression('lexCompare[1, "a"]').status).toBe("ill-typed");
  });

  it("allows schema entities to shadow the builtin", () => {
    const shadow: IAtom = { id: "lexCompare", type: "Person", label: "Comparator" };
    const shadowDatum: IDataInstance = {
      ...datum,
      getAtoms: () => [...atoms, shadow],
      getTypes: () => [{ ...person, atoms: [...atoms, shadow] }],
    };
    const shadowEv = new SimpleGraphQueryEvaluator(shadowDatum);
    // Box join against the atom yields the empty relation, rather than a call.
    expect(shadowEv.evaluateExpression('lexCompare["a", "b"]')).toEqual([]);
    const shadowType: IType = { ...person, id: "lexCompare", types: ["lexCompare"] };
    const schemaShadow: IDataInstance = { ...datum, getTypes: () => [shadowType] };
    expect(analyzeForgeExpression('lexCompare["a", "b"] < 0', schemaShadow).status).toBe("unknown");
  });

  it("publishes the builtin in the generated language manifest", () => {
    const manifest = JSON.parse(readFileSync("docs/sgq-language.json", "utf8"));
    expect(manifest.builtins.binary).toContain("lexCompare");
  });
});
