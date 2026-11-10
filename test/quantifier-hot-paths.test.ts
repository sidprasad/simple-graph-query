import { SimpleGraphQueryEvaluator } from "../src";
import { IAtom, IDataInstance, IRelation, IType } from "../src/types";
import { Tuple } from "../src/ForgeExprEvaluator";
import { tuples } from "./helpers";

// Regression tests for the caches on the quantifier hot path: membership
// Sets, join indexes, name resolution, and closed-subexpression values. Each
// checks a result that would be wrong if a cache were keyed or shared badly.

/**
 * A graph on N0..N(n-1) with a `next` cycle, an `edge` relation, and a numeric
 * `id`. n is kept above the bulk-relation threshold (16) so the per-relation
 * caches are actually exercised.
 */
function graph(n: number, edges: [number, number][]): IDataInstance {
  const nodeAtoms: IAtom[] = [];
  const intAtoms: IAtom[] = [];
  for (let i = 0; i < n; i++) {
    nodeAtoms.push({ _: "atom", id: `N${i}`, label: `N${i}`, type: "Node" } as IAtom);
    intAtoms.push({ _: "atom", id: String(i), label: String(i), type: "Int" } as IAtom);
  }
  const types = [
    { _: "type", id: "Node", types: ["Node"], atoms: nodeAtoms, meta: { builtin: false } },
    { _: "type", id: "Int", types: ["Int"], atoms: intAtoms, meta: { builtin: true } },
  ] as unknown as IType[];
  const relations = [
    {
      _: "relation", id: "Node<:edge", name: "edge", types: ["Node", "Node"],
      tuples: edges.map(([a, b]) => ({ atoms: [`N${a}`, `N${b}`], types: ["Node", "Node"] })),
    },
    {
      _: "relation", id: "Node<:next", name: "next", types: ["Node", "Node"],
      tuples: nodeAtoms.map((_, i) => ({ atoms: [`N${i}`, `N${(i + 1) % n}`], types: ["Node", "Node"] })),
    },
    {
      _: "relation", id: "Node<:id", name: "id", types: ["Node", "Int"],
      tuples: nodeAtoms.map((_, i) => ({ atoms: [`N${i}`, String(i)], types: ["Node", "Int"] })),
    },
  ] as unknown as IRelation[];
  return {
    getTypes: () => types,
    getRelations: () => relations,
    getAtoms: () => [...nodeAtoms, ...intAtoms],
    getAtomType: (id: string) => types.find((t) => t.atoms.some((a) => a.id === id))!,
  };
}

const N = 20;
// A chain N0 -> N1 -> ... -> N19, so reachability differs for every node.
const chain: [number, number][] = Array.from({ length: N - 1 }, (_, i) => [i, i + 1]);
const node = (i: number) => `N${i}`;

describe("quantifier hot-path caches", () => {
  let evaluator: SimpleGraphQueryEvaluator;
  beforeEach(() => {
    evaluator = new SimpleGraphQueryEvaluator(graph(N, chain));
  });

  it("membership in a bulk relation is tested per binding", () => {
    const result = evaluator.evaluateExpression("{x, y: Node | x->y in edge}");
    expect(tuples(result, chain.map(([a, b]) => [node(a), node(b)]))).toBe(true);
  });

  it("subset against a bulk relation distinguishes bindings", () => {
    // Only the last node of the chain has no outgoing edge.
    const result = evaluator.evaluateExpression("{x: Node | x.edge in Node and some x.edge}");
    expect(tuples(result, chain.map(([a]) => [node(a)]))).toBe(true);
  });

  it("a closed closure under a quantifier is joined per binding", () => {
    const expected: Tuple[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) expected.push([node(i), node(j)]);
    }
    expect(tuples(evaluator.evaluateExpression("{x, y: Node | y in x.^edge}"), expected)).toBe(true);
    // Parenthesized and unparenthesized forms take different cache paths.
    expect(tuples(evaluator.evaluateExpression("{x, y: Node | y in x.(^edge)}"), expected)).toBe(true);
  });

  it("a closed union under a quantifier is joined per binding", () => {
    // Without parentheses `x.edge + ~edge` is `(x.edge) + (~edge)`, where only
    // `~edge` is closed; with them the closed part is the whole union.
    const neighbours = evaluator.evaluateExpression("{x, y: Node | y in x.(edge + ~edge)}");
    const expected: Tuple[] = [];
    for (const [a, b] of chain) {
      expected.push([node(a), node(b)], [node(b), node(a)]);
    }
    expect(tuples(neighbours, expected)).toBe(true);
  });

  it("a node that mentions a bound variable is not treated as closed", () => {
    const result = evaluator.evaluateExpression("{x: Node | some x.edge & x.next}");
    expect(tuples(result, chain.map(([a]) => [node(a)]))).toBe(true);
    const none = evaluator.evaluateExpression("{x: Node | some x.edge & x.~next}");
    expect(tuples(none, [])).toBe(true);
  });

  it("a comprehension whose domain mentions an outer variable is not closed", () => {
    // The inner comprehension's value depends on y through its domain only.
    const result = evaluator.evaluateExpression(
      "{y: Node | some {x: y.edge | x in Node}}"
    );
    expect(tuples(result, chain.map(([a]) => [node(a)]))).toBe(true);
    const nested = evaluator.evaluateExpression(
      "{y: Node | #{x: y.^edge | x in Node} = 2}"
    );
    expect(tuples(nested, [[node(N - 3)]])).toBe(true);
  });

  it("a variable that shadows nothing still resolves through the environment", () => {
    // `Node` is resolved once and reused; `x` must not be.
    const result = evaluator.evaluateExpression("{x: Node | x in Node and x.id = 3}");
    expect(tuples(result, [[node(3)]])).toBe(true);
  });

  it("repeated evaluation returns the same values", () => {
    const queries = [
      "^edge",
      "{x: Node | some x.^edge}",
      "Node.edge",
      "edge.Node",
      "(edge + next) - (edge & next)",
      "all x: Node | x.next in Node",
      "add[#Node, 1]",
    ];
    const first = queries.map((q) => evaluator.evaluateExpression(q));
    const second = queries.map((q) => evaluator.evaluateExpression(q));
    const fresh = queries.map((q) =>
      new SimpleGraphQueryEvaluator(graph(N, chain)).evaluateExpression(q)
    );
    for (let i = 0; i < queries.length; i++) {
      for (const other of [second[i], fresh[i]]) {
        if (Array.isArray(first[i])) {
          expect(tuples(other, first[i] as Tuple[])).toBe(true);
        } else {
          expect(other).toEqual(first[i]);
        }
      }
    }
  });

  it("argument lists do not mutate the relation they are built from", () => {
    const before = evaluator.evaluateExpression("Node") as Tuple[];
    const size = before.length;
    // Head is a relation value, tail is a single value.
    evaluator.evaluateExpression("add[Node, 1]");
    evaluator.evaluateExpression("add[edge, 1]");
    expect((evaluator.evaluateExpression("Node") as Tuple[]).length).toBe(size);
    expect((evaluator.evaluateExpression("edge") as Tuple[]).length).toBe(chain.length);
    expect(evaluator.evaluateExpression("#Node")).toBe(N);
  });

  it("an unresolved name warns on every evaluation, cached or not", () => {
    for (let i = 0; i < 3; i++) {
      const { value, diagnostics } = evaluator.evaluateExpressionWithDiagnostics(
        "{x: Node | x in Nodee + Node}"
      );
      expect(Array.isArray(value) && value.length).toBe(N);
      expect(diagnostics.map((d) => d.name)).toEqual(["Nodee"]);
    }
    // A different query naming the same unresolved name warns as well.
    const { diagnostics } = evaluator.evaluateExpressionWithDiagnostics("some Nodee.edge");
    expect(diagnostics.map((d) => d.name)).toEqual(["Nodee"]);
  });

  it("swapping the datum discards cached names and closed values", () => {
    expect((evaluator.evaluateExpression("{x: Node | some x.^edge}") as Tuple[]).length).toBe(N - 1);
    evaluator.datum = graph(N, [[0, 1]]);
    expect(tuples(evaluator.evaluateExpression("{x: Node | some x.^edge}"), [[node(0)]])).toBe(true);
    expect(tuples(evaluator.evaluateExpression("^edge"), [[node(0), node(1)]])).toBe(true);
  });
});

// A bound variable may share its name with a type or relation. The evaluator
// reads the variable, so the caches must treat it as one too.
describe("bound variables that shadow instance names", () => {
  let evaluator: SimpleGraphQueryEvaluator;
  beforeEach(() => {
    evaluator = new SimpleGraphQueryEvaluator(graph(N, chain));
  });
  const withOutgoingEdge: Tuple[] = chain.map(([a]) => [node(a)]);

  it("a comprehension variable named after a type", () => {
    for (const query of [
      "{Node: Node | some Node.edge}",
      "{Node: Node | (some Node.edge)}",
    ]) {
      expect(tuples(evaluator.evaluateExpression(query), withOutgoingEdge)).toBe(true);
    }
  });

  it("a comprehension variable named after a relation", () => {
    for (const query of [
      "{next: Node | some next.edge}",
      "{next: Node | (some next.edge)}",
      "{next: Node | some next.^edge}",
    ]) {
      expect(tuples(evaluator.evaluateExpression(query), withOutgoingEdge)).toBe(true);
    }
  });

  it("a quantifier variable named after a type", () => {
    // False for the last node of the chain, so not true of all of them.
    expect(evaluator.evaluateExpression("all Node: Node | (some Node.edge)")).toBe(false);
    expect(evaluator.evaluateExpression("some Node: Node | (no Node.edge)")).toBe(true);
    expect(evaluator.evaluateExpression("one Node: Node | (no Node.edge)")).toBe(true);
  });

  it("the binder's own domain still refers to the instance name", () => {
    // `Node` after the colon is the type; only the body sees the variable.
    const result = evaluator.evaluateExpression("{Node: Node | Node in Node}");
    expect(Array.isArray(result) && result.length).toBe(N);
  });

  it("the name means the instance again outside the binder", () => {
    const result = evaluator.evaluateExpression(
      "{x: Node | (some Node: Node | Node = x) and x in Node and some x.edge}"
    );
    expect(tuples(result, withOutgoingEdge)).toBe(true);
    expect(evaluator.evaluateExpression("#Node")).toBe(N);
  });

  it("an inner binder shadowing a name leaves closed siblings reusable", () => {
    const result = evaluator.evaluateExpression(
      "{x: Node | (some edge: Node | edge = x) and some x.^edge}"
    );
    expect(tuples(result, withOutgoingEdge)).toBe(true);
  });
});
