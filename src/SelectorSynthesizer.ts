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

// Expression AST nodes for the synthesis grammar
// This is a subset of the full Forge expression language, focused on
// relational and set operations useful for selector synthesis.
export type ExpressionNode =
  // Basic expressions
  | { kind: "identifier"; name: string }
  // Set operations
  | { kind: "union" | "intersection" | "difference"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "join"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "closure"; child: ExpressionNode }           // ^expr (transitive closure)
  | { kind: "reflexive-closure"; child: ExpressionNode } // *expr (reflexive-transitive closure)
  | { kind: "transpose"; child: ExpressionNode }         // ~expr (transpose/inverse)
  // Set comprehension (set builder notation)
  | { kind: "comprehension"; varName: string; domain: ExpressionNode; body: ExpressionNode }
  // Quantified expressions (return boolean, but can be used to filter)
  | { kind: "all" | "some" | "no" | "one" | "lone"; varName: string; domain: ExpressionNode; body: ExpressionNode }
  // Logical operators
  | { kind: "and" | "or" | "implies" | "iff"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "not"; child: ExpressionNode }
  // Relational comparison (returns boolean)
  | { kind: "in" | "eq" | "neq"; left: ExpressionNode; right: ExpressionNode }
  // Numeric comparison
  | { kind: "lt" | "gt" | "lte" | "gte"; left: ExpressionNode; right: ExpressionNode }
  // Box join (e[args])
  | { kind: "box-join"; base: ExpressionNode; args: ExpressionNode[] };

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
    // Unary relational operators
    case "closure": {
      const inner = nodeToString(node.child);
      return `^${wrapForPrefix(inner)}`;
    }
    case "reflexive-closure": {
      const inner = nodeToString(node.child);
      return `*${wrapForPrefix(inner)}`;
    }
    case "transpose": {
      const inner = nodeToString(node.child);
      return `~${wrapForPrefix(inner)}`;
    }
    // Binary relational operators
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
    // Set comprehension
    case "comprehension":
      return `{${node.varName}: ${nodeToString(node.domain)} | ${nodeToString(node.body)}}`;
    // Quantified expressions
    case "all":
      return `(all ${node.varName}: ${nodeToString(node.domain)} | ${nodeToString(node.body)})`;
    case "some":
      return `(some ${node.varName}: ${nodeToString(node.domain)} | ${nodeToString(node.body)})`;
    case "no":
      return `(no ${node.varName}: ${nodeToString(node.domain)} | ${nodeToString(node.body)})`;
    case "one":
      return `(one ${node.varName}: ${nodeToString(node.domain)} | ${nodeToString(node.body)})`;
    case "lone":
      return `(lone ${node.varName}: ${nodeToString(node.domain)} | ${nodeToString(node.body)})`;
    // Logical operators
    case "and":
      return `(${nodeToString(node.left)} and ${nodeToString(node.right)})`;
    case "or":
      return `(${nodeToString(node.left)} or ${nodeToString(node.right)})`;
    case "implies":
      return `(${nodeToString(node.left)} => ${nodeToString(node.right)})`;
    case "iff":
      return `(${nodeToString(node.left)} <=> ${nodeToString(node.right)})`;
    case "not":
      return `!${wrapForPrefix(nodeToString(node.child))}`;
    // Relational comparison
    case "in":
      return `(${nodeToString(node.left)} in ${nodeToString(node.right)})`;
    case "eq":
      return `(${nodeToString(node.left)} = ${nodeToString(node.right)})`;
    case "neq":
      return `(${nodeToString(node.left)} != ${nodeToString(node.right)})`;
    // Numeric comparison
    case "lt":
      return `(${nodeToString(node.left)} < ${nodeToString(node.right)})`;
    case "gt":
      return `(${nodeToString(node.left)} > ${nodeToString(node.right)})`;
    case "lte":
      return `(${nodeToString(node.left)} <= ${nodeToString(node.right)})`;
    case "gte":
      return `(${nodeToString(node.left)} >= ${nodeToString(node.right)})`;
    // Box join
    case "box-join":
      return `${nodeToString(node.base)}[${node.args.map(nodeToString).join(", ")}]`;
  }
}

function wrapForJoin(node: ExpressionNode): string {
  // Identifiers and prefix unary operators don't need wrapping
  if (
    node.kind === "identifier" ||
    node.kind === "closure" ||
    node.kind === "reflexive-closure" ||
    node.kind === "transpose" ||
    node.kind === "box-join"
  ) {
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
    // Accept strings or numbers (integers are often returned as numbers)
    if (typeof value === "string") {
      ids.add(value);
    } else if (typeof value === "number") {
      ids.add(String(value));
    } else {
      return null;
    }
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
    // Accept strings or numbers for both elements
    const firstStr = typeof first === "string" ? first : typeof first === "number" ? String(first) : null;
    const secondStr = typeof second === "string" ? second : typeof second === "number" ? String(second) : null;
    if (firstStr === null || secondStr === null) {
      return null;
    }
    ids.add(`${firstStr}\u0000${secondStr}`);
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

// Build semantically meaningful join candidates based on type-relation compatibility.
// For a relation with types [T1, T2, ...], we generate joins like T1.relation
// which projects the relation to its range. This helps synthesize expressions
// like "Node.key" when selecting integer values that are keys of nodes.
function buildSemanticJoinCandidates(datums: IDataInstance[]): ExpressionNode[] {
  const candidates: ExpressionNode[] = [];
  const seenExpressions = new Set<string>();

  // Get relations and types that exist across all datums
  const sharedRelationNames = new Set<string>();
  const sharedTypeIds = new Set<string>();

  if (datums.length === 0) return candidates;

  // Initialize with first datum
  const firstDatum = datums[0];
  firstDatum.getRelations().forEach((r) => sharedRelationNames.add(r.name));
  firstDatum.getTypes().forEach((t) => sharedTypeIds.add(t.id));

  // Intersect with remaining datums
  for (let i = 1; i < datums.length; i++) {
    const datum = datums[i];
    const datumRelations = new Set(datum.getRelations().map((r) => r.name));
    const datumTypes = new Set(datum.getTypes().map((t) => t.id));

    for (const name of sharedRelationNames) {
      if (!datumRelations.has(name)) sharedRelationNames.delete(name);
    }
    for (const id of sharedTypeIds) {
      if (!datumTypes.has(id)) sharedTypeIds.delete(id);
    }
  }

  // For each shared relation, check if its domain type is also shared
  // and create Type.relation join candidates
  for (const relationName of sharedRelationNames) {
    // Get the relation's type signature from the first datum (should be consistent)
    const relation = firstDatum.getRelations().find((r) => r.name === relationName);
    if (!relation || relation.types.length < 2) continue;

    const domainType = relation.types[0];

    // Check if the domain type (or a compatible type) is available
    // We look for types in the hierarchy that could be the domain
    for (const typeId of sharedTypeIds) {
      const typeObj = firstDatum.getTypes().find((t) => t.id === typeId);
      if (!typeObj) continue;

      // Check if this type is compatible with the relation's domain
      // Either the type itself matches, or it's in the type hierarchy
      const isCompatible =
        typeId === domainType ||
        typeObj.types.includes(domainType) ||
        // Also check if the domain type is a subtype of this type
        firstDatum.getTypes().find((t) => t.id === domainType)?.types.includes(typeId);

      if (isCompatible) {
        const joinNode: ExpressionNode = {
          kind: "join",
          left: { kind: "identifier", name: typeId },
          right: { kind: "identifier", name: relationName },
        };
        const exprString = nodeToString(joinNode);
        if (!seenExpressions.has(exprString)) {
          seenExpressions.add(exprString);
          candidates.push(joinNode);
        }
      }
    }
  }

  // Also add relation.Type joins for inverse projections (getting domain values)
  for (const relationName of sharedRelationNames) {
    const relation = firstDatum.getRelations().find((r) => r.name === relationName);
    if (!relation || relation.types.length < 2) continue;

    const rangeType = relation.types[relation.types.length - 1];

    for (const typeId of sharedTypeIds) {
      const typeObj = firstDatum.getTypes().find((t) => t.id === typeId);
      if (!typeObj) continue;

      const isCompatible =
        typeId === rangeType ||
        typeObj.types.includes(rangeType) ||
        firstDatum.getTypes().find((t) => t.id === rangeType)?.types.includes(typeId);

      if (isCompatible) {
        const joinNode: ExpressionNode = {
          kind: "join",
          left: { kind: "identifier", name: relationName },
          right: { kind: "identifier", name: typeId },
        };
        const exprString = nodeToString(joinNode);
        if (!seenExpressions.has(exprString)) {
          seenExpressions.add(exprString);
          candidates.push(joinNode);
        }
      }
    }
  }

  return candidates;
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

  // Check base identifiers first
  for (const node of baseNodes) {
    if (matchesTargets(node, evaluatedExamples, normalizer)) {
      return node;
    }
  }

  // Check semantic join candidates early - these are type-aware joins like Node.key
  // that are likely to be what the user wants when selecting relation ranges/domains
  const semanticJoins = buildSemanticJoinCandidates(datums);
  for (const node of semanticJoins) {
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

  // Mark semantic joins as already visited so we don't re-check them
  for (const node of semanticJoins) {
    visited.add(nodeToString(node));
  }

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

    // Unary relational expansions
    enqueue({ kind: "closure", child: current.node }, current.depth + 1);
    enqueue({ kind: "reflexive-closure", child: current.node }, current.depth + 1);
    enqueue({ kind: "transpose", child: current.node }, current.depth + 1);

    for (const other of combinationPool) {
      const leftKey = nodeToString(current.node);
      const rightKey = nodeToString(other);

      // Set operations (commutative, so canonicalize order)
      const [unionLeft, unionRight] = leftKey < rightKey ? [current.node, other] : [other, current.node];
      enqueue({ kind: "union", left: unionLeft, right: unionRight }, current.depth + 1);

      const [interLeft, interRight] = leftKey < rightKey ? [current.node, other] : [other, current.node];
      enqueue({ kind: "intersection", left: interLeft, right: interRight }, current.depth + 1);

      // Difference is not commutative
      enqueue({ kind: "difference", left: current.node, right: other }, current.depth + 1);
      if (leftKey !== rightKey) {
        enqueue({ kind: "difference", left: other, right: current.node }, current.depth + 1);
      }

      // Join is not commutative
      enqueue({ kind: "join", left: current.node, right: other }, current.depth + 1);
      enqueue({ kind: "join", left: other, right: current.node }, current.depth + 1);
    }

    // Generate set comprehensions: {v: domain | body}
    // For each type, try comprehensions with simple membership conditions
    // This allows synthesizing expressions like {n: Node | n.key in SomeSet}
    if (current.depth + 2 <= maxDepth) {
      for (const domainNode of combinationPool) {
        // Only use types as comprehension domains
        if (domainNode.kind !== "identifier") continue;
        const domainName = domainNode.name;
        const classification = classifyIdentifier(domainName, datums);
        if (classification !== "type") continue;

        const varName = "v"; // Use a simple variable name

        // Try: {v: Domain | v in current.node}
        const varNode: ExpressionNode = { kind: "identifier", name: varName };
        enqueue(
          {
            kind: "comprehension",
            varName,
            domain: domainNode,
            body: { kind: "in", left: varNode, right: current.node },
          },
          current.depth + 2,
        );

        // Try: {v: Domain | v.relation in SomeSet} for relations
        for (const relNode of combinationPool) {
          if (relNode.kind !== "identifier") continue;
          if (classifyIdentifier(relNode.name, datums) !== "relation") continue;

          const joinExpr: ExpressionNode = {
            kind: "join",
            left: varNode,
            right: relNode,
          };

          // {v: Domain | v.relation in current.node}
          enqueue(
            {
              kind: "comprehension",
              varName,
              domain: domainNode,
              body: { kind: "in", left: joinExpr, right: current.node },
            },
            current.depth + 2,
          );
        }
      }
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
    // Leaves
    case "identifier":
      return base;
    // Unary operators
    case "closure":
    case "reflexive-closure":
    case "transpose":
    case "not":
      return { ...base, children: [buildWhyNode(node.child, evaluator, normalizer)] };
    // Binary operators
    case "join":
    case "union":
    case "intersection":
    case "difference":
    case "and":
    case "or":
    case "implies":
    case "iff":
    case "in":
    case "eq":
    case "neq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      return {
        ...base,
        children: [
          buildWhyNode(node.left, evaluator, normalizer),
          buildWhyNode(node.right, evaluator, normalizer),
        ],
      };
    // Quantified and comprehension expressions
    case "all":
    case "some":
    case "no":
    case "one":
    case "lone":
    case "comprehension":
      return {
        ...base,
        children: [
          buildWhyNode(node.domain, evaluator, normalizer),
          buildWhyNode(node.body, evaluator, normalizer),
        ],
      };
    // Box join
    case "box-join":
      return {
        ...base,
        children: [
          buildWhyNode(node.base, evaluator, normalizer),
          ...node.args.map((arg) => buildWhyNode(arg, evaluator, normalizer)),
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
