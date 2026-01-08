import { SimpleGraphQueryEvaluator } from "./index";
import { IAtom, IDataInstance } from "./types";

export type AtomSelectionExample = {
  atoms: Set<IAtom>;
  datum: IDataInstance;
};

export type AtomPair = readonly [IAtom, IAtom];

export type BinaryRelationExample = {
  pairs: Set<AtomPair>;
  datum: IDataInstance;
};

type ExpressionNode =
  | { kind: "identifier"; name: string }
  | { kind: "union" | "intersection" | "difference"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "join"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "closure"; child: ExpressionNode };

// A provenance tree that mirrors the synthesized expression and captures the
// evaluated result for each subexpression. Every node records the operator
// kind, the subexpression text, and the normalized result (or null if the
// expression does not evaluate in the given datum). Children follow the shape
// of the grammar: binary operators produce two children, closures produce one,
// and identifiers are leaves.
export type WhyNode = {
  kind: ExpressionNode["kind"];
  expression: string;
  result: Set<string> | null;
  children?: WhyNode[];
};

export class SelectorSynthesisError extends Error {}

function nodeToString(node: ExpressionNode): string {
  switch (node.kind) {
    case "identifier":
      return node.name;
    case "closure": {
      const inner = nodeToString(node.child);
      return `^${wrapForPrefix(inner)}`;
    }
    case "join": {
      const left = wrapForJoin(node.left);
      const right = wrapForJoin(node.right);
      return `${left}.${right}`;
    }
    case "union":
      return `(${nodeToString(node.left)} + ${nodeToString(node.right)})`;
    case "intersection":
      return `(${nodeToString(node.left)} & ${nodeToString(node.right)})`;
    case "difference":
      return `(${nodeToString(node.left)} - ${nodeToString(node.right)})`;
  }
}

function wrapForJoin(node: ExpressionNode): string {
  if (node.kind === "identifier" || node.kind === "closure") {
    return nodeToString(node);
  }
  return `(${nodeToString(node)})`;
}

function wrapForPrefix(expr: string): string {
  return expr.startsWith("(") && expr.endsWith(")") ? expr : `(${expr})`;
}

function normalizeUnaryResult(result: unknown): Set<string> | null {
  // We only consider unary tuple results or single string values as valid atom selections
  if (typeof result === "string") {
    return new Set([result]);
  }

  if (!Array.isArray(result)) {
    return null;
  }

  // Expect an array of tuples
  const tuples = result as unknown[];
  const ids = new Set<string>();

  for (const tuple of tuples) {
    if (!Array.isArray(tuple) || tuple.length !== 1) {
      return null;
    }
    const value = tuple[0];
    if (typeof value !== "string") {
      return null;
    }
    ids.add(value);
  }

  return ids;
}

function normalizeBinaryResult(result: unknown): Set<string> | null {
  if (!Array.isArray(result)) {
    return null;
  }

  const tuples = result as unknown[];
  const ids = new Set<string>();

  for (const tuple of tuples) {
    if (!Array.isArray(tuple) || tuple.length !== 2) {
      return null;
    }
    const [first, second] = tuple;
    if (typeof first !== "string" || typeof second !== "string") {
      return null;
    }
    ids.add(`${first}\u0000${second}`);
  }

  return ids;
}

function evaluateExpression(
  node: ExpressionNode,
  evaluator: SimpleGraphQueryEvaluator,
  normalizer: (result: unknown) => Set<string> | null,
): Set<string> | null {
  const expression = nodeToString(node);
  const result = evaluator.evaluateExpression(expression);

  return normalizer(result);
}

function intersectNames(datums: IDataInstance[]): Set<string> {
  const identifierSets = datums.map((datum) => {
    const typeIds = datum.getTypes().map((t) => t.id);
    const relationNames = datum.getRelations().map((r) => r.name);
    return new Set([...typeIds, ...relationNames]);
  });

  if (identifierSets.length === 0) {
    return new Set();
  }

  const [first, ...rest] = identifierSets;
  const intersection = new Set<string>();
  for (const id of first) {
    if (rest.every((set) => set.has(id))) {
      intersection.add(id);
    }
  }
  return intersection;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function classifyIdentifier(name: string, datums: IDataInstance[]): "relation" | "type" | "builtin" | "other" {
  if (name === "univ" || name === "iden") {
    return "builtin";
  }

  for (const datum of datums) {
    if (datum.getRelations().some((relation) => relation.name === name)) {
      return "relation";
    }
    if (datum.getTypes().some((type) => type.id === name)) {
      return "type";
    }
  }

  return "other";
}

function buildBaseNodes(datums: IDataInstance[]): ExpressionNode[] {
  const baseNames = intersectNames(datums);
  // Always include standard top-level identifiers when present in the language
  ["univ", "iden"].forEach((builtin) => baseNames.add(builtin));
  const orderedNames = Array.from(baseNames).sort((left, right) => {
    const priority: Record<ReturnType<typeof classifyIdentifier>, number> = {
      relation: 0,
      type: 1,
      builtin: 2,
      other: 3,
    };
    const leftPriority = priority[classifyIdentifier(left, datums)];
    const rightPriority = priority[classifyIdentifier(right, datums)];
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.localeCompare(right);
  });

  return orderedNames.map((name) => ({ kind: "identifier", name } as const));
}

type SynthesisExample = { datum: IDataInstance; target: Set<string> };
type EvaluatedExample = SynthesisExample & { evaluator: SimpleGraphQueryEvaluator };

function getOrCreateEvaluator(
  datum: IDataInstance,
  cache: Map<IDataInstance, SimpleGraphQueryEvaluator>,
): SimpleGraphQueryEvaluator {
  const existing = cache.get(datum);
  if (existing) {
    return existing;
  }
  const evaluator = new SimpleGraphQueryEvaluator(datum);
  cache.set(datum, evaluator);
  return evaluator;
}

function matchesTargets(
  node: ExpressionNode,
  examples: EvaluatedExample[],
  normalizer: (result: unknown) => Set<string> | null,
): boolean {
  for (const example of examples) {
    const result = evaluateExpression(node, example.evaluator, normalizer);
    if (!result) return false;
    if (!setsEqual(result, example.target)) {
      return false;
    }
  }
  return true;
}

function synthesizeExpressionNode(
  examples: SynthesisExample[],
  normalizer: (result: unknown) => Set<string> | null,
  maxDepth = 3,
): ExpressionNode {
  // Enumerative, CEGIS-style search: we BFS over the expression grammar (identifiers, set ops, joins, closure),
  // checking each candidate against *all* examples before allowing it to generate children. Early rejection of
  // incorrect hypotheses keeps the frontier small (FOIL-esque pruning), while depth-bounding curbs blowup.
  if (examples.length === 0) {
    throw new SelectorSynthesisError("No examples provided for synthesis");
  }

  const evaluatorCache = new Map<IDataInstance, SimpleGraphQueryEvaluator>();
  const evaluatedExamples: EvaluatedExample[] = examples.map((example) => ({
    ...example,
    evaluator: getOrCreateEvaluator(example.datum, evaluatorCache),
  }));
  const datums = evaluatedExamples.map((example) => example.datum);

  const baseNodes = buildBaseNodes(datums);
  if (baseNodes.length === 0) {
    throw new SelectorSynthesisError("No shared identifiers available across provided data instances");
  }

  for (const node of baseNodes) {
    if (matchesTargets(node, evaluatedExamples, normalizer)) {
      return node;
    }
  }

  type WorkItem = { node: ExpressionNode; depth: number };
  const queue: WorkItem[] = [];
  const queued = new Set<string>();
  const visited = new Set<string>();
  const combinationPool: ExpressionNode[] = [...baseNodes];

  const enqueue = (node: ExpressionNode, depth: number) => {
    const key = nodeToString(node);
    if (visited.has(key) || queued.has(key)) return;
    queue.push({ node, depth });
    queued.add(key);
  };

  baseNodes.forEach((node) => enqueue(node, 0));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = nodeToString(current.node);
    queued.delete(key);

    if (visited.has(key)) {
      continue;
    }
    visited.add(key);

    if (matchesTargets(current.node, evaluatedExamples, normalizer)) {
      return current.node;
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    // Unary expansions
    enqueue({ kind: "closure", child: current.node }, current.depth + 1);

    for (const other of combinationPool) {
      const leftKey = nodeToString(current.node);
      const rightKey = nodeToString(other);

      const [unionLeft, unionRight] = leftKey < rightKey ? [current.node, other] : [other, current.node];
      enqueue({ kind: "union", left: unionLeft, right: unionRight }, current.depth + 1);

      const [interLeft, interRight] = leftKey < rightKey ? [current.node, other] : [other, current.node];
      enqueue({ kind: "intersection", left: interLeft, right: interRight }, current.depth + 1);

      enqueue({ kind: "join", left: current.node, right: other }, current.depth + 1);
      enqueue({ kind: "join", left: other, right: current.node }, current.depth + 1);
    }
  }

  throw new SelectorSynthesisError("Unable to synthesize an expression matching all examples");
}

export function synthesizeSelector(examples: AtomSelectionExample[], maxDepth = 3): string {
  const synthesisExamples: SynthesisExample[] = examples.map((example) => ({
    datum: example.datum,
    target: new Set(Array.from(example.atoms).map((atom) => atom.id)),
  }));

  const node = synthesizeExpressionNode(synthesisExamples, normalizeUnaryResult, maxDepth);
  return nodeToString(node);
}

export function synthesizeBinaryRelation(
  examples: BinaryRelationExample[],
  maxDepth = 3,
): string {
  const synthesisExamples: SynthesisExample[] = examples.map((example) => {
    const encodedPairs = new Set(
      Array.from(example.pairs).map(([left, right]) => `${left.id}\u0000${right.id}`),
    );
    return { datum: example.datum, target: encodedPairs };
  });

  const node = synthesizeExpressionNode(synthesisExamples, normalizeBinaryResult, maxDepth);
  return nodeToString(node);
}

function buildWhyNode(
  node: ExpressionNode,
  evaluator: SimpleGraphQueryEvaluator,
  normalizer: (result: unknown) => Set<string> | null,
): WhyNode {
  const result = evaluateExpression(node, evaluator, normalizer);
  const base: WhyNode = {
    kind: node.kind,
    expression: nodeToString(node),
    result,
  };

  switch (node.kind) {
    case "identifier":
      return base;
    case "closure":
      return { ...base, children: [buildWhyNode(node.child, evaluator, normalizer)] };
    case "join":
    case "union":
    case "intersection":
    case "difference":
      return {
        ...base,
        children: [
          buildWhyNode(node.left, evaluator, normalizer),
          buildWhyNode(node.right, evaluator, normalizer),
        ],
      };
    default:
      return base;
  }
}

export type SynthesisWhyExample = {
  datum: IDataInstance;
  target: Set<string>;
  result: Set<string> | null;
  why: WhyNode;
};

export type SynthesisWhy = {
  expression: string;
  examples: SynthesisWhyExample[];
};

export function synthesizeSelectorWithWhy(
  examples: AtomSelectionExample[],
  maxDepth = 3,
): SynthesisWhy {
  const synthesisExamples: SynthesisExample[] = examples.map((example) => ({
    datum: example.datum,
    target: new Set(Array.from(example.atoms).map((atom) => atom.id)),
  }));

  const node = synthesizeExpressionNode(synthesisExamples, normalizeUnaryResult, maxDepth);
  const expression = nodeToString(node);

  const evaluatorCache = new Map<IDataInstance, SimpleGraphQueryEvaluator>();
  const explanationExamples: SynthesisWhyExample[] = synthesisExamples.map((example) => {
    const evaluator = getOrCreateEvaluator(example.datum, evaluatorCache);
    return {
      datum: example.datum,
      target: example.target,
      result: evaluateExpression(node, evaluator, normalizeUnaryResult),
      why: buildWhyNode(node, evaluator, normalizeUnaryResult),
    };
  });

  return { expression, examples: explanationExamples };
}

export function synthesizeBinaryRelationWithWhy(
  examples: BinaryRelationExample[],
  maxDepth = 3,
): SynthesisWhy {
  const synthesisExamples: SynthesisExample[] = examples.map((example) => {
    const encodedPairs = new Set(
      Array.from(example.pairs).map(([left, right]) => `${left.id}\u0000${right.id}`),
    );
    return { datum: example.datum, target: encodedPairs };
  });

  const node = synthesizeExpressionNode(synthesisExamples, normalizeBinaryResult, maxDepth);
  const expression = nodeToString(node);

  const evaluatorCache = new Map<IDataInstance, SimpleGraphQueryEvaluator>();
  const explanationExamples: SynthesisWhyExample[] = synthesisExamples.map((example) => {
    const evaluator = getOrCreateEvaluator(example.datum, evaluatorCache);
    return {
      datum: example.datum,
      target: example.target,
      result: evaluateExpression(node, evaluator, normalizeBinaryResult),
      why: buildWhyNode(node, evaluator, normalizeBinaryResult),
    };
  });

  return { expression, examples: explanationExamples };
}
