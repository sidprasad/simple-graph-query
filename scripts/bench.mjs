// Evaluator micro-benchmark. Run with `npm run bench` (which compiles first),
// or directly once `dist/` is current:
//
//   node scripts/bench.mjs [nodes] [query-name]
//
// Every timing uses a FRESH evaluator, so the numbers show the cost of one
// query against an instance nothing has been cached for. That is the worst
// case for the per-relation caches and the honest one for a single selector.
//
// The instance is a synthetic graph: `nodes` Node atoms, three out-edges each,
// and a numeric `id` per node. Results depend on the machine and the Node
// version; compare runs on the same setup, not against recorded numbers.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SimpleGraphQueryEvaluator } = require("../dist/index.js");

function makeInstance(n, degree) {
  const nodes = [];
  const ints = [];
  const edge = [];
  const id = [];
  for (let i = 0; i < n; i++) {
    nodes.push({ _: "atom", id: `N${i}`, label: `N${i}`, type: "Node" });
    ints.push({ _: "atom", id: String(i), label: String(i), type: "Int" });
    id.push({ atoms: [`N${i}`, String(i)], types: ["Node", "Int"] });
    for (let d = 1; d <= degree; d++) {
      edge.push({ atoms: [`N${i}`, `N${(i * 7 + d * 13) % n}`], types: ["Node", "Node"] });
    }
  }
  const types = [
    { _: "type", id: "Node", types: ["Node"], atoms: nodes, meta: { builtin: false } },
    { _: "type", id: "Int", types: ["Int"], atoms: ints, meta: { builtin: true } },
  ];
  const relations = [
    { _: "relation", id: "Node<:edge", name: "edge", types: ["Node", "Node"], tuples: edge },
    { _: "relation", id: "Node<:id", name: "id", types: ["Node", "Int"], tuples: id },
  ];
  const atoms = nodes.concat(ints);
  return {
    getTypes: () => types,
    getRelations: () => relations,
    getAtoms: () => atoms,
    getAtomType: (atomId) => types.find((t) => t.atoms.some((a) => a.id === atomId)),
  };
}

const QUERIES = {
  join: "Node.edge",
  closure: "^edge",
  setops: "(edge + ~edge) - (edge & ~edge)",
  quant1: "all x: Node | some x.edge",
  quant1_name: "all x: Node | x.edge in Node",
  quant2_member: "{x, y: Node | x->y in edge}",
  quant2_numeric: "{x, y: Node | y.id = add[x.id, 1]}",
  reach: "{x: Node | some x.^edge}",
  reach_paren: "{x: Node | some x.(^edge)}",
};

function timeMs(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return [Number(process.hrtime.bigint() - start) / 1e6, value];
}

const nodeCount = Number(process.argv[2]) || 300;
const only = process.argv[3];
const RUNS = 3;

if (only !== undefined && !(only in QUERIES)) {
  console.error(`Unknown query '${only}'. Choose from: ${Object.keys(QUERIES).join(", ")}`);
  process.exit(1);
}

const instance = makeInstance(nodeCount, 3);
console.log(`${nodeCount} nodes, ${nodeCount * 3} edges, node ${process.version}; best of ${RUNS} (ms)`);

// The first parse in a process pays for deserializing the grammar.
{
  const evaluator = new SimpleGraphQueryEvaluator(instance);
  const [cold] = timeMs(() => evaluator.getExpressionParseTree("all x: Node | some x.edge"));
  const REPEATS = 200;
  const [warm] = timeMs(() => {
    for (let i = 0; i < REPEATS; i++) {
      evaluator.getExpressionParseTree(
        `{x, y: Node | x->y in edge${" and some y.edge".repeat(i % 5)}}`
      );
    }
  });
  console.log(`${"parse".padEnd(16)} first ${cold.toFixed(1)}, then ${(warm / REPEATS).toFixed(3)} per query`);
}

for (const [name, query] of Object.entries(QUERIES)) {
  if (only !== undefined && name !== only) continue;
  let best = Infinity;
  let result;
  for (let i = 0; i < RUNS; i++) {
    const evaluator = new SimpleGraphQueryEvaluator(instance);
    const [elapsed, value] = timeMs(() => evaluator.evaluateExpression(query));
    best = Math.min(best, elapsed);
    result = value;
  }
  const summary = Array.isArray(result)
    ? `${result.length} tuples`
    : result && result.error
      ? `ERROR ${result.error.message}`
      : String(result);
  console.log(`${name.padEnd(16)} ${best.toFixed(1).padStart(9)}   ${summary}`);
}
