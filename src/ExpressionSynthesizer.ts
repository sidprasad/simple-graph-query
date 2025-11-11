import { SimpleGraphQueryEvaluator } from "./SimpleGraphQueryEvaluator";
import { SingleValue, Tuple } from "./ForgeExprEvaluator";
import { IDataInstance, IAtom } from "./types";

export type AtomReference = IAtom | string | number | boolean;

export type SynthesisStrategy = "covering" | "primitive" | "builtin" | "fallback";

export interface SynthesizedExpression {
  expression: string;
  strategy: SynthesisStrategy;
}

export interface SynthesizerOptions {
  evaluator?: SimpleGraphQueryEvaluator;
  maxClauseSize?: number;
}

type Feature = {
  expression: string;
  members: Set<SingleValue>;
};

type Clause = {
  features: Feature[];
  members: Set<SingleValue>;
};

type FeatureOption = {
  feature: Feature;
  excludedNegatives: Set<number>;
};

export class ExpressionSynthesizer {
  private evaluator: SimpleGraphQueryEvaluator;
  private datum: IDataInstance;
  private maxClauseSize: number;
  private featureCache: Feature[] | null = null;

  constructor(datum: IDataInstance, options: SynthesizerOptions = {}) {
    this.datum = datum;
    this.evaluator = options.evaluator ?? new SimpleGraphQueryEvaluator(datum);
    this.maxClauseSize = options.maxClauseSize ?? 3;
  }

  synthesizeExpression(atoms: AtomReference[]): string {
    return this.synthesize(atoms).expression;
  }

  synthesize(atoms: AtomReference[]): SynthesizedExpression {
    const normalizedTargets = this.normalizeTargetAtoms(atoms);

    if (normalizedTargets.length === 0) {
      return { expression: "none", strategy: "builtin" };
    }

    if (atoms.every((atom) => this.isPrimitiveReference(atom))) {
      return this.buildPrimitiveExpression(atoms);
    }

    const features = this.getFeatures();

    if (features.length === 0) {
      return this.buildFallbackExpression(atoms);
    }

    const positives = new Set(normalizedTargets);
    const universe = this.buildUniverse(features, normalizedTargets);
    const negatives: SingleValue[] = [];
    for (const value of universe) {
      if (!positives.has(value)) {
        negatives.push(value);
      }
    }

    const featuresByMember = this.indexFeaturesByMember(features);
    const clauses = this.generateClauses(positives, negatives, featuresByMember);

    if (clauses.length > 0) {
      const selected = this.selectClauses(positives, clauses);
      if (selected && selected.length > 0) {
        const expression = this.buildExpression(selected);
        if (expression) {
          return { expression, strategy: "covering" };
        }
      }
    }

    return this.buildFallbackExpression(atoms);
  }

  private buildExpression(clauses: Clause[]): string {
    const clauseExpressions = clauses.map((clause) => this.buildClauseExpression(clause));
    if (clauseExpressions.length === 1) {
      return clauseExpressions[0];
    }
    return clauseExpressions
      .map((expr) => (expr.includes("&") ? `(${expr})` : expr))
      .join(" + ");
  }

  private buildClauseExpression(clause: Clause): string {
    const parts = clause.features
      .map((feature) => feature.expression)
      .sort((a, b) => a.localeCompare(b));
    if (parts.length === 1) {
      return parts[0];
    }
    return parts.join(" & ");
  }

  private selectClauses(positives: Set<SingleValue>, clauses: Clause[]): Clause[] | null {
    const uncovered = new Set(positives);
    const selected: Clause[] = [];
    const available = clauses.slice();

    while (uncovered.size > 0) {
      let bestClause: Clause | null = null;
      let bestCoverage = 0;

      for (const clause of available) {
        let coverage = 0;
        for (const value of clause.members) {
          if (uncovered.has(value)) {
            coverage++;
          }
        }
        if (coverage === 0) {
          continue;
        }
        if (
          bestClause === null ||
          coverage > bestCoverage ||
          (coverage === bestCoverage && this.compareClauses(clause, bestClause) < 0)
        ) {
          bestClause = clause;
          bestCoverage = coverage;
        }
      }

      if (!bestClause) {
        return null;
      }

      selected.push(bestClause);
      for (const value of bestClause.members) {
        uncovered.delete(value);
      }
      const index = available.indexOf(bestClause);
      if (index >= 0) {
        available.splice(index, 1);
      }
    }

    return selected;
  }

  private compareClauses(a: Clause, b: Clause): number {
    if (a.features.length !== b.features.length) {
      return a.features.length - b.features.length;
    }
    const exprA = this.buildClauseExpression(a);
    const exprB = this.buildClauseExpression(b);
    return exprA.localeCompare(exprB);
  }

  private generateClauses(
    positives: Set<SingleValue>,
    negatives: SingleValue[],
    featuresByMember: Map<SingleValue, Feature[]>
  ): Clause[] {
    const negativeIndex = new Map<SingleValue, number>();
    negatives.forEach((value, index) => negativeIndex.set(value, index));
    const clauses = new Map<string, Clause>();

    for (const positive of positives) {
      const featureList = featuresByMember.get(positive);
      if (!featureList || featureList.length === 0) {
        continue;
      }

      const options: FeatureOption[] = featureList.map((feature) => ({
        feature,
        excludedNegatives: this.computeExcludedNegatives(feature, negativeIndex),
      }));

      const combos = this.findMinimalCoveringCombos(options, negatives.length);

      for (const combo of combos) {
        const members = this.intersectMembers(combo);
        if (members.size === 0) {
          continue;
        }
        const filteredMembers = new Set<SingleValue>();
        for (const value of members) {
          if (positives.has(value)) {
            filteredMembers.add(value);
          }
        }
        if (filteredMembers.size === 0) {
          continue;
        }
        const key = this.membersKey(filteredMembers);
        const existing = clauses.get(key);
        if (!existing || combo.length < existing.features.length) {
          clauses.set(key, { features: combo, members: filteredMembers });
        }
      }
    }

    return Array.from(clauses.values()).sort((a, b) => this.compareClauses(a, b));
  }

  private computeExcludedNegatives(
    feature: Feature,
    negativeIndex: Map<SingleValue, number>
  ): Set<number> {
    const excluded = new Set<number>();
    for (const [value, index] of negativeIndex.entries()) {
      if (!feature.members.has(value)) {
        excluded.add(index);
      }
    }
    return excluded;
  }

  private findMinimalCoveringCombos(options: FeatureOption[], negativeCount: number): Feature[][] {
    if (options.length === 0) {
      return [];
    }

    const combos: Feature[][] = [];
    const filteredOptions = negativeCount === 0
      ? options
      : options.filter((option) => option.excludedNegatives.size > 0);

    const maxSize = Math.min(this.maxClauseSize, filteredOptions.length);

    for (let size = 1; size <= maxSize; size++) {
      const results: FeatureOption[][] = [];
      this.enumerateCoveringCombos(filteredOptions, size, 0, [], new Set<number>(), negativeCount, results);
      if (results.length > 0) {
        for (const result of results) {
          combos.push(result.map((option) => option.feature));
        }
        return combos;
      }
    }

    if (negativeCount === 0) {
      const fallback: Feature[][] = [];
      const limit = Math.min(this.maxClauseSize, options.length);
      for (let size = 1; size <= limit; size++) {
        const basicResults: FeatureOption[][] = [];
        this.enumerateBasicCombos(options, size, 0, [], basicResults);
        if (basicResults.length > 0) {
          for (const result of basicResults) {
            fallback.push(result.map((option) => option.feature));
          }
          break;
        }
      }
      return fallback;
    }

    return [];
  }

  private enumerateCoveringCombos(
    options: FeatureOption[],
    targetSize: number,
    startIndex: number,
    current: FeatureOption[],
    covered: Set<number>,
    negativeCount: number,
    results: FeatureOption[][]
  ): void {
    if (current.length === targetSize) {
      if (covered.size === negativeCount) {
        results.push([...current]);
      }
      return;
    }

    const remaining = targetSize - current.length;
    for (let index = startIndex; index <= options.length - remaining; index++) {
      const option = options[index];
      const nextCovered = new Set(covered);
      for (const value of option.excludedNegatives) {
        nextCovered.add(value);
      }
      current.push(option);
      this.enumerateCoveringCombos(
        options,
        targetSize,
        index + 1,
        current,
        nextCovered,
        negativeCount,
        results
      );
      current.pop();
    }
  }

  private enumerateBasicCombos(
    options: FeatureOption[],
    targetSize: number,
    startIndex: number,
    current: FeatureOption[],
    results: FeatureOption[][]
  ): void {
    if (current.length === targetSize) {
      results.push([...current]);
      return;
    }

    const remaining = targetSize - current.length;
    for (let index = startIndex; index <= options.length - remaining; index++) {
      current.push(options[index]);
      this.enumerateBasicCombos(options, targetSize, index + 1, current, results);
      current.pop();
    }
  }

  private intersectMembers(features: Feature[]): Set<SingleValue> {
    if (features.length === 0) {
      return new Set();
    }

    let result = new Set<SingleValue>(features[0].members);
    for (let index = 1; index < features.length; index++) {
      const next = new Set<SingleValue>();
      for (const value of features[index].members) {
        if (result.has(value)) {
          next.add(value);
        }
      }
      result = next;
      if (result.size === 0) {
        break;
      }
    }

    return result;
  }

  private indexFeaturesByMember(features: Feature[]): Map<SingleValue, Feature[]> {
    const index = new Map<SingleValue, Feature[]>();
    for (const feature of features) {
      for (const value of feature.members) {
        const list = index.get(value);
        if (list) {
          list.push(feature);
        } else {
          index.set(value, [feature]);
        }
      }
    }
    for (const list of index.values()) {
      list.sort((a, b) => a.expression.localeCompare(b.expression));
    }
    return index;
  }

  private buildUniverse(features: Feature[], targets: SingleValue[]): Set<SingleValue> {
    const universe = new Set<SingleValue>();
    for (const atom of this.datum.getAtoms()) {
      universe.add(this.normalizeSingleValue(atom.id));
    }
    for (const feature of features) {
      for (const value of feature.members) {
        universe.add(value);
      }
    }
    for (const value of targets) {
      universe.add(value);
    }
    return universe;
  }

  private getFeatures(): Feature[] {
    if (this.featureCache) {
      return this.featureCache;
    }

    const featureMap = new Map<string, Feature>();
    const candidates: string[] = ["none", "univ"];

    for (const relation of this.datum.getRelations()) {
      if (relation.types.length === 1) {
        candidates.push(relation.name);
      }
    }

    for (const type of this.datum.getTypes()) {
      candidates.push(type.id);
    }

    for (const expression of candidates) {
      const members = this.evaluateUnaryExpression(expression);
      if (!members) {
        continue;
      }
      const key = this.membersKey(members);
      if (!featureMap.has(key)) {
        featureMap.set(key, {
          expression,
          members,
        });
      }
    }

    const features = Array.from(featureMap.values()).sort((a, b) =>
      a.expression.localeCompare(b.expression)
    );

    this.featureCache = features;
    return features;
  }

  private evaluateUnaryExpression(expression: string): Set<SingleValue> | null {
    const evaluation = this.evaluator.evaluateExpression(expression);
    if (!Array.isArray(evaluation)) {
      return null;
    }

    const tuples = evaluation as Tuple[];
    const members = new Set<SingleValue>();

    for (const tuple of tuples) {
      if (!Array.isArray(tuple) || tuple.length !== 1) {
        return null;
      }
      const normalized = this.normalizeEvaluationValue(tuple[0]);
      members.add(normalized);
    }

    return members;
  }

  private normalizeTargetAtoms(atoms: AtomReference[]): SingleValue[] {
    const seen = new Set<string>();
    const result: SingleValue[] = [];

    for (const atom of atoms) {
      const value = this.normalizeAtomReference(atom);
      const key = this.valueKey(value);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(value);
      }
    }

    return result;
  }

  private normalizeAtomReference(atom: AtomReference): SingleValue {
    if (typeof atom === "object" && atom !== null && "id" in atom) {
      return this.normalizeSingleValue(atom.id);
    }
    return this.normalizeSingleValue(atom as SingleValue);
  }

  private normalizeSingleValue(value: SingleValue): SingleValue {
    if (typeof value === "string") {
      if (value === "true" || value === "#t") {
        return true;
      }
      if (value === "false" || value === "#f") {
        return false;
      }
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }
    return value;
  }

  private normalizeEvaluationValue(value: SingleValue): SingleValue {
    return this.normalizeSingleValue(value);
  }

  private membersKey(members: Set<SingleValue>): string {
    const values = Array.from(members).map((value) => this.valueKey(value));
    values.sort();
    return values.join("|");
  }

  private valueKey(value: SingleValue): string {
    return `${typeof value}:${String(value)}`;
  }

  private isPrimitiveReference(atom: AtomReference): boolean {
    return typeof atom === "string" || typeof atom === "number" || typeof atom === "boolean";
  }

  private buildPrimitiveExpression(atoms: AtomReference[]): SynthesizedExpression {
    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const atom of atoms) {
      const token = String(atom);
      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }
    const expression = tokens.length === 1 ? tokens[0] : tokens.join(" + ");
    return { expression, strategy: "primitive" };
  }

  private buildFallbackExpression(atoms: AtomReference[]): SynthesizedExpression {
    const seen = new Set<string>();
    const tokens: string[] = [];

    for (const atom of atoms) {
      const token = this.formatAtomReference(atom);
      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }

    if (tokens.length === 0) {
      return { expression: "none", strategy: "builtin" };
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
}
