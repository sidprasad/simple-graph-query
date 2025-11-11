import { SimpleGraphQueryEvaluator, EvaluationResult } from "./SimpleGraphQueryEvaluator";
import { Tuple, areTupleArraysEqual, SingleValue } from "./ForgeExprEvaluator";
import { IDataInstance, IAtom } from "./types";

export type AtomReference = IAtom | string | number | boolean;

export type SynthesisStrategy =
  | "relation"
  | "type"
  | "builtin"
  | "combination"
  | "fallback";

export interface SynthesizedExpression {
  expression: string;
  strategy: SynthesisStrategy;
}

export interface SynthesizerOptions {
  evaluator?: SimpleGraphQueryEvaluator;
  maxDepth?: number;
  maxCombinations?: number;
}

type BaseExpression = {
  expression: string;
  strategy: SynthesisStrategy;
};

type QueueEntry = {
  expression: string;
  depth: number;
};

export class ExpressionSynthesizer {
  private evaluator: SimpleGraphQueryEvaluator;
  private datum: IDataInstance;
  private maxDepth: number;
  private maxCombinations: number;
  private evaluationCache: Map<string, Tuple[] | null> = new Map();
  private baseExpressionCache: BaseExpression[] | null = null;

  constructor(datum: IDataInstance, options: SynthesizerOptions = {}) {
    this.datum = datum;
    this.evaluator = options.evaluator ?? new SimpleGraphQueryEvaluator(datum);
    this.maxDepth = options.maxDepth ?? 2;
    this.maxCombinations = options.maxCombinations ?? 500;
  }

  synthesizeExpression(atoms: AtomReference[]): string {
    return this.synthesize(atoms).expression;
  }

  synthesize(atoms: AtomReference[]): SynthesizedExpression {
    const targetTuples = this.normalizeTargetAtoms(atoms);

    if (targetTuples.length === 0) {
      return { expression: "none", strategy: "builtin" };
    }

    const baseExpressions = this.getBaseExpressions();
    const visited = new Set<string>();
    const queue: QueueEntry[] = [];

    for (const candidate of baseExpressions) {
      visited.add(candidate.expression);
      const evaluation = this.evaluateCandidate(candidate.expression);
      if (evaluation !== null) {
        if (areTupleArraysEqual(evaluation, targetTuples)) {
          return { expression: candidate.expression, strategy: candidate.strategy };
        }
        queue.push({ expression: candidate.expression, depth: 0 });
      }
    }

    const operations: Array<{ symbol: string; commutative: boolean }> = [
      { symbol: "&", commutative: true },
      { symbol: "+", commutative: true },
      { symbol: "-", commutative: false },
    ];

    let generated = 0;

    while (queue.length > 0 && generated < this.maxCombinations) {
      const current = queue.shift()!;
      if (current.depth >= this.maxDepth) {
        continue;
      }

      for (const base of baseExpressions) {
        for (const op of operations) {
          const combinedExpression = this.combineExpressions(
            current.expression,
            base.expression,
            op.symbol,
            op.commutative
          );

          if (visited.has(combinedExpression)) {
            continue;
          }
          visited.add(combinedExpression);

          const evaluation = this.evaluateCandidate(combinedExpression);
          if (evaluation === null) {
            continue;
          }

          generated++;

          if (areTupleArraysEqual(evaluation, targetTuples)) {
            return { expression: combinedExpression, strategy: "combination" };
          }

          queue.push({ expression: combinedExpression, depth: current.depth + 1 });

          if (generated >= this.maxCombinations) {
            break;
          }
        }
        if (generated >= this.maxCombinations) {
          break;
        }
      }
    }

    return this.buildFallbackExpression(atoms);
  }

  private buildFallbackExpression(atoms: AtomReference[]): SynthesizedExpression {
    if (atoms.length === 0) {
      return { expression: "none", strategy: "fallback" };
    }

    const seen = new Set<string>();
    const tokens: string[] = [];

    for (const atom of atoms) {
      const token = this.formatAtomReference(atom);
      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }

    const expression = tokens.length === 1 ? tokens[0] : tokens.join(" + ");
    return { expression, strategy: "fallback" };
  }

  private formatAtomReference(atom: AtomReference): string {
    if (typeof atom === "number" || typeof atom === "boolean") {
      return String(atom);
    }

    if (typeof atom === "string") {
      return atom;
    }

    return atom.id;
  }

  private getBaseExpressions(): BaseExpression[] {
    if (this.baseExpressionCache) {
      return this.baseExpressionCache;
    }

    const expressions: BaseExpression[] = [];

    expressions.push({ expression: "none", strategy: "builtin" });
    expressions.push({ expression: "univ", strategy: "builtin" });

    const relationNames = new Set<string>();
    for (const relation of this.datum.getRelations()) {
      if (relation.types.length === 1) {
        relationNames.add(relation.name);
      }
    }

    for (const relationName of Array.from(relationNames).sort()) {
      expressions.push({ expression: relationName, strategy: "relation" });
    }

    const typeNames = new Set<string>();
    for (const type of this.datum.getTypes()) {
      typeNames.add(type.id);
    }

    for (const typeName of Array.from(typeNames).sort()) {
      expressions.push({ expression: typeName, strategy: "type" });
    }

    this.baseExpressionCache = expressions;
    return expressions;
  }

  private combineExpressions(
    left: string,
    right: string,
    operator: string,
    commutative: boolean
  ): string {
    let normalizedLeft = left;
    let normalizedRight = right;

    if (commutative) {
      const leftKey = this.expressionKey(normalizedLeft);
      const rightKey = this.expressionKey(normalizedRight);
      if (rightKey < leftKey) {
        normalizedLeft = right;
        normalizedRight = left;
      }
    }

    const leftExpr = this.wrapIfNeeded(normalizedLeft);
    const rightExpr = this.wrapIfNeeded(normalizedRight);
    return `${leftExpr} ${operator} ${rightExpr}`;
  }

  private wrapIfNeeded(expression: string): string {
    if (this.needsParentheses(expression)) {
      return `(${expression})`;
    }
    return expression;
  }

  private needsParentheses(expression: string): boolean {
    return expression.includes(" + ") || expression.includes(" - ") || expression.includes(" & ");
  }

  private expressionKey(expression: string): string {
    return expression.replace(/\s+/g, "").replace(/[()]/g, "");
  }

  private normalizeTargetAtoms(atoms: AtomReference[]): Tuple[] {
    const seen = new Set<string>();
    const tuples: Tuple[] = [];

    for (const atom of atoms) {
      const value = this.normalizeSingleValue(atom);
      const tuple: Tuple = [value];
      const key = JSON.stringify(tuple);
      if (!seen.has(key)) {
        seen.add(key);
        tuples.push(tuple);
      }
    }

    return tuples;
  }

  private normalizeSingleValue(atom: AtomReference): SingleValue {
    let value: SingleValue;
    if (typeof atom === "object" && "id" in atom) {
      value = atom.id;
    } else {
      value = atom as SingleValue;
    }

    if (typeof value === "string") {
      if (value === "true" || value === "#t") {
        return true;
      }
      if (value === "false" || value === "#f") {
        return false;
      }
      const numericValue = Number(value);
      if (!Number.isNaN(numericValue)) {
        return numericValue;
      }
    }

    return value;
  }

  private evaluateCandidate(expression: string): Tuple[] | null {
    if (this.evaluationCache.has(expression)) {
      return this.evaluationCache.get(expression)!;
    }

    const evaluation: EvaluationResult = this.evaluator.evaluateExpression(expression);

    if (Array.isArray(evaluation)) {
      if (evaluation.length === 0) {
        const emptyResult: Tuple[] = [];
        this.evaluationCache.set(expression, emptyResult);
        return emptyResult;
      }

      if (evaluation.every((item) => Array.isArray(item))) {
        const tuples = (evaluation as Tuple[]).map((tuple) =>
          tuple.map((value) => this.normalizeEvaluationValue(value)) as Tuple
        );
        this.evaluationCache.set(expression, tuples);
        return tuples;
      }
    }

    this.evaluationCache.set(expression, null);
    return null;
  }

  private normalizeEvaluationValue(value: SingleValue): SingleValue {
    if (typeof value === "string") {
      if (value === "true" || value === "#t") {
        return true;
      }
      if (value === "false" || value === "#f") {
        return false;
      }
      const numericValue = Number(value);
      if (!Number.isNaN(numericValue)) {
        return numericValue;
      }
    }
    return value;
  }
}
