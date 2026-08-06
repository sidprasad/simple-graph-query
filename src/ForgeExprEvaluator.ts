import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import { ForgeVisitor } from "./forge-antlr/ForgeVisitor";
import {
  ExprContext,
  Expr1Context,
  Expr1_5Context,
  Expr2Context,
  Expr3Context,
  Expr4Context,
  Expr4_5Context,
  Expr5Context,
  Expr6Context,
  Expr7Context,
  Expr8Context,
  Expr9Context,
  Expr10Context,
  Expr11Context,
  Expr12Context,
  Expr13Context,
  Expr14Context,
  Expr15Context,
  Expr16Context,
  Expr17Context,
  Expr18Context,
  ExprListContext,
  NameContext,
  PredDeclContext,
  BlockContext,
  QualNameContext,
  QuantDeclListContext,
  NameListContext,
  QuantDeclContext,
} from "./forge-antlr/ForgeParser";
import { getIdentifierName } from "./forge-antlr/utils";
import { IAtom, IDataInstance, ITuple, IRelation } from "./types";
import {
  ForgeExprFreeVariableFinder,
  FreeVariables,
} from "./ForgeExprFreeVariableFinder";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import {
  detectNumericComparisonPattern,
  areAllNumericSets,
  generateOptimizedNumericCombinations,
} from "./NumericConstraintOptimizer";

///// DEFINING SOME USEFUL TYPES /////
export type SingleValue = string | number | boolean;
export type Tuple = SingleValue[];
export type EvalResult = SingleValue | Tuple[];

type Environment = {
  env: Record<string, EvalResult>;
  type: "quantDecl" | "predArgs";
};




///// HELPER FUNCTIONS /////
function isSingleValue(value: EvalResult): value is SingleValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isTupleArray(value: EvalResult): value is Tuple[] {
  return Array.isArray(value);
}

function isBoolean(value: EvalResult): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: EvalResult): value is number {
  return typeof value === "number";
}

function isSingletonNumberTuple(value: EvalResult): value is [[number]] {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    Array.isArray(value[0]) &&
    value[0].length === 1 &&
    typeof value[0][0] === "number"
  );
}

function extractNumber(val: EvalResult): number | undefined {
  if (isNumber(val)) return val;
  if (isSingletonNumberTuple(val)) return val[0][0];
  return undefined;
}

function isString(value: EvalResult): value is string {
  return typeof value === "string";
}

// Helper to create a string key from a tuple for fast lookup.
//
// The key is JSON.stringify because it is type-preserving: the atom 1 and the
// atom "1" must not collide (buildRelationCache coerces numeric-looking atoms
// to numbers). Measurement also showed V8's stringify outruns hand-rolled
// delimiter keys, so there is nothing to gain from a custom key function.
function tupleToKey(tuple: Tuple): string {
  return JSON.stringify(tuple);
}

// Canonical-key side-channel: relationKeys maps a RELATION VALUE (an outer
// Tuple[] array) to its tuples' canonical keys, index-aligned. Keys are
// computed at most once per relation value; set operations (union,
// intersection, difference, dedup, subset) then reuse them instead of
// re-serializing every tuple on every operation.
//
// This is keyed on the outer array -- NOT per tuple -- deliberately:
//  * Relation values are immutable-after-creation in this evaluator (every
//    operator returns a fresh array; nothing splices/pushes into a result it
//    has handed out), so an array's keys can never go stale.
//  * Live entries number in the dozens (base relations + recent
//    intermediates), so GC ephemeron processing stays trivially cheap. A
//    per-TUPLE WeakMap memo was measured to be catastrophically slower
//    (100k+ high-churn entries make major GCs ~10x more expensive).
//  * The WeakMap drops entries automatically when intermediate results die,
//    so this adds no leak, and nothing user-visible is attached to tuples.
const relationKeys = new WeakMap<Tuple[], string[]>();

// Only relation values at least this large get registered in relationKeys.
// Tiny relations (e.g. the singleton sets compared thousands of times inside
// quantifier loops) are cheaper to re-serialize than to churn through
// WeakMap.set; the side-channel exists to amortize keying of BULK relations.
const KEY_REGISTER_MIN = 16;

// Get the canonical keys for a relation value, computing (and, for bulk
// relations, registering) them on first use. First use costs one stringify
// per tuple (exactly what a single set operation used to cost); every later
// operation on the same registered relation value gets its keys for free.
function ensureKeys(tuples: Tuple[]): string[] {
  let keys = relationKeys.get(tuples);
  if (keys === undefined) {
    keys = tuples.map((t) => JSON.stringify(t));
    if (tuples.length >= KEY_REGISTER_MIN) {
      relationKeys.set(tuples, keys);
    }
  }
  return keys;
}

function areTuplesEqual(a: Tuple, b: Tuple): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}

function isTupleArraySubset(a: Tuple[], b: Tuple[]): boolean {
  // Tiny operands (e.g. the singleton comparisons quantifier loops make
  // thousands of times) can never be registered in relationKeys, so the key
  // side-channel is pure overhead for them -- compare directly, with the
  // short-circuit the direct path allows.
  if (a.length < KEY_REGISTER_MIN && b.length < KEY_REGISTER_MIN) {
    const bSet = new Set(b.map(tupleToKey));
    return a.every((tupleA) => bSet.has(tupleToKey(tupleA)));
  }
  // Optimize using Set for O(n) lookup instead of O(n²)
  const bSet = new Set(ensureKeys(b));
  const aKeys = ensureKeys(a);
  for (let i = 0; i < a.length; i++) {
    if (!bSet.has(aKeys[i])) {
      return false;
    }
  }
  return true;
}

export function areTupleArraysEqual(a: Tuple[], b: Tuple[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return isTupleArraySubset(a, b) && isTupleArraySubset(b, a);
}

// Deduplicate the concatenation of several tuple arrays (set semantics),
// reusing each part's registered keys when available and registering the
// result's keys so downstream operations get them for free.
function deduplicateConcat(parts: Tuple[][]): Tuple[] {
  const seen = new Set<string>();
  const result: Tuple[] = [];
  const resultKeys: string[] = [];
  for (const part of parts) {
    // Bulk parts go through ensureKeys so their keys are REGISTERED, not just
    // consumed -- otherwise a relation reaching dedup via union would be
    // re-serialized on every union until some other op registered it.
    // Arrays below KEY_REGISTER_MIN are never registered, so skip the WeakMap
    // machinery for them entirely -- this helper is called once per join
    // inside quantifier loops, where even the probe is measurable overhead.
    const partKeys = part.length >= KEY_REGISTER_MIN ? ensureKeys(part) : undefined;
    for (let i = 0; i < part.length; i++) {
      const key = partKeys !== undefined ? partKeys[i] : JSON.stringify(part[i]);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(part[i]);
        resultKeys.push(key);
      }
    }
  }
  if (result.length >= KEY_REGISTER_MIN) {
    relationKeys.set(result, resultKeys);
  }
  return result;
}

function deduplicateTuples(tuples: Tuple[]): Tuple[] {
  return deduplicateConcat([tuples]);
}

function getCombinations(arrays: Tuple[][]): Tuple[] {
  // first, turn each string[][] into a string[] by flattening
  const valueSets: SingleValue[][] = arrays.map((tuple) => tuple.flat());

  // Early exit for empty arrays
  if (valueSets.length === 0) return [[]];
  if (valueSets.some(arr => arr.length === 0)) return [];

  // Iterative approach for better performance on large cartesian products
  let result: Tuple[] = [[]];
  for (const valueSet of valueSets) {
    const newResult: Tuple[] = [];
    for (const existing of result) {
      for (const value of valueSet) {
        newResult.push([...existing, value]);
      }
    }
    result = newResult;
  }

  return result;
}

function transitiveClosure(pairs: Tuple[]): Tuple[] {
  if (pairs.length === 0) return [];

  // pairs should be a relation of arity 2 (error if this isn't the case)
  pairs.forEach((tuple) => {
    if (tuple.length !== 2) {
      throw new Error("transitive closure ^ expected a relation of arity 2");
    }
  });

  // build an adjacency list
  const graph = new Map<SingleValue, Set<SingleValue>>();
  for (const [from, to] of pairs) {
    if (!graph.has(from)) {
      graph.set(from, new Set());
    }
    graph.get(from)!.add(to);
  }

  // Use more efficient BFS with index-based queue to avoid O(n) shift() operations
  // NOTE: no dedup set is needed here -- within one `start`, the `visited`
  // check guarantees each `current` is emitted at most once, and pairs from
  // different starts differ in their first element. So we can emit real
  // tuples directly instead of round-tripping through JSON.stringify/parse.
  const result: Tuple[] = [];

  for (const start of graph.keys()) {
    const visited = new Set<SingleValue>();
    const queue: SingleValue[] = [...(graph.get(start) ?? [])];
    let queueIndex = 0; // Use index instead of shift() for O(1) access

    while (queueIndex < queue.length) {
      const current = queue[queueIndex++];
      if (visited.has(current)) continue;
      visited.add(current);

      result.push([start, current]);

      const neighbors = graph.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }
  }

  return result;
}

function bitwidthWraparound(value: number, bitwidth: number): number {
  const modulus = Math.pow(2, bitwidth); // total number of Int values
  const halfValue = Math.pow(2, bitwidth - 1); // halfway point

  // in general, applying the modulus restricts the value to [-modulus + 1, modulus - 1]
  // adding modulus and then applying the modulus again means we restrict the
  // value to [0, modulus - 1]
  let wrappedValue = ((value % modulus) + modulus) % modulus;

  // if the sign bit is set (wrappedValue >= halfValue), then the value should
  // be negative so we just subtract the modulus
  if (wrappedValue >= halfValue) {
    wrappedValue -= modulus;
  }
  return wrappedValue;
}

///// Forge builtin functions we support /////

// this is a list of forge builtin functions we currently support; add to this
// list as we support more

const SUPPORTED_BINARY_BUILTINS = ["add", "subtract", "multiply", "divide", "remainder"];
const SUPPORTED_UNARY_BUILTINS: string[] = ["abs", "sign", "floor", "ceil"];
const SUPPORTED_SET_BUILTINS: string[] = ["min", "max", "sum"];

export const SUPPORTED_BUILTINS = SUPPORTED_BINARY_BUILTINS.concat(
  SUPPORTED_UNARY_BUILTINS,
  SUPPORTED_SET_BUILTINS
);

/**
 * A non-fatal condition noticed while evaluating an expression.
 *
 * Diagnostics never change the value of an expression — they are advisory, and
 * consumers are expected to surface them to whoever wrote the query. Severity
 * is always `"warning"`: the evaluator sees a single instance, not a schema, so
 * it is not in a position to declare an unresolved name an error.
 */
export interface Diagnostic {
  kind: "unresolved-name";
  severity: "warning";
  /** The name that could not be resolved. */
  name: string;
  /** Human-readable message suitable for showing to a query author. */
  message: string;
  /** Closest name in the instance, when one is close enough to be worth offering. */
  suggestion?: string;
}

/**
 * Levenshtein distance, abandoned early once it provably exceeds `limit`.
 * Returns `limit + 1` in that case, which callers treat as "too far".
 */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1;
  }
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,        // deletion
        current[j - 1] + 1,     // insertion
        previous[j - 1] + cost  // substitution
      );
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) {
      return limit + 1; // no completion of this row can come back under the limit
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Strip the surrounding double quotes from a STRING_TOK and resolve its escape
 * sequences. The lexer rule is `'"' (~["\\] | '\\' .)* '"'`, so a backslash
 * always consumes exactly one following character.
 */
export function unquoteStringLiteral(text: string): string {
  const body = text.slice(1, -1);
  // Overwhelmingly the common case, and the only one worth optimizing: with no
  // backslash there is nothing to resolve, so skip the scan entirely.
  if (body.indexOf("\\") === -1) {
    return body;
  }
  let out = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "\\") {
      out += body[i];
      continue;
    }
    const escaped = body[++i];
    switch (escaped) {
      case "n": out += "\n"; break;
      case "t": out += "\t"; break;
      case "r": out += "\r"; break;
      case "0": out += "\0"; break;
      // `\"`, `\\`, and anything else stand for the character itself.
      default: out += escaped; break;
    }
  }
  return out;
}

/**
 * A recursive evaluator for Forge expressions.
 * This visitor walks the parse tree and prints the type of operation encountered.
 */
export class ForgeExprEvaluator
  extends AbstractParseTreeVisitor<EvalResult>
  implements ForgeVisitor<EvalResult> {
  private environmentStack: Environment[];
  private freeVariableFinder: ForgeExprFreeVariableFinder;
  private freeVariables: FreeVariables;
  // NOTE: strings will be of the format "<var-name>=<value>|..." sorted in
  // increasing lexicographic order of variable names
  private cachedResults: Map<
    ParseTree,
    Map<string, { result: EvalResult; diagnostics: Diagnostic[] }>
  > = new Map();

  private instanceData: IDataInstance;
  
  // Cache for relation lookups to avoid O(n) scans
  private relationCache: Map<string, Tuple[]> | null = null;
  
  // Index for relations: Map<relationName, Map<firstElement, Tuple[]>>
  // This allows O(1) lookup for patterns like atom.field
  private relationIndexCache: Map<string, Map<SingleValue, Tuple[]>> | null = null;

  // Diagnostics accumulated during the current evaluation, keyed by name so a
  // name referenced many times (e.g. inside a comprehension body) reports once.
  private diagnostics: Map<string, Diagnostic> = new Map();

  constructor(
    datum: IDataInstance,
  ) {
    super();
    this.instanceData = datum;

    this.environmentStack = [];
    this.freeVariableFinder = new ForgeExprFreeVariableFinder(
      datum
    );
    this.freeVariables = new Map();
  }

  /** Diagnostics recorded since the last `resetDiagnostics()`. */
  public getDiagnostics(): Diagnostic[] {
    return Array.from(this.diagnostics.values());
  }

  /** Clear diagnostics. Callers that reuse an evaluator must call this per evaluation. */
  public resetDiagnostics(): void {
    this.diagnostics.clear();
  }

  /**
   * Record a name that could not be resolved against this instance.
   *
   * This is deliberately a warning rather than an error. The instance format
   * carries only populated types and relations, so a sig with no atoms in this
   * instance is indistinguishable from a typo — and a sig can empty out between
   * frames of the same trace. Failing hard would break working selectors at
   * exactly the frames where a set happens to be empty.
   */
  private reportUnresolvedName(name: string): void {
    if (this.diagnostics.has(name)) {
      return;
    }
    const suggestion = this.suggestName(name);
    this.diagnostics.set(name, {
      kind: "unresolved-name",
      severity: "warning",
      name,
      message:
        `'${name}' does not name a type, relation, or atom in this instance; ` +
        `it evaluates to the empty set.` +
        (suggestion ? ` Did you mean '${suggestion}'?` : "") +
        ` If you meant the string "${name}", write it in double quotes.`,
      ...(suggestion !== undefined ? { suggestion } : {}),
    });
  }

  /** Closest name in this instance within a small edit distance, if any. */
  private suggestName(name: string): string | undefined {
    this.buildRelationCache();
    const candidates = new Set<string>();
    for (const t of this.instanceData.getTypes()) {
      candidates.add(t.id);
    }
    for (const relationName of this.relationCache!.keys()) {
      candidates.add(relationName);
    }
    for (const atom of this.instanceData.getAtoms()) {
      candidates.add(atom.id);
    }

    // Allow one edit for short names, two for longer ones. Without this bound
    // every unresolved name would get a nonsense suggestion.
    const maxDistance = name.length <= 4 ? 1 : 2;
    let best: string | undefined;
    let bestDistance = maxDistance + 1;
    for (const candidate of candidates) {
      if (Math.abs(candidate.length - name.length) >= bestDistance) {
        continue; // length alone rules it out
      }
      const distance = editDistance(name, candidate, bestDistance);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  // helper function to build relation cache and indexes
  private buildRelationCache(): void {
    if (this.relationCache !== null) {
      return; // already built
    }
    
    this.relationCache = new Map();
    this.relationIndexCache = new Map();
    const relations = this.instanceData.getRelations();

    for (const relation of relations) {
      // Convert numeric and boolean strings to their actual types, in a
      // single pass (one fresh tuple array per tuple, not one per coercion).
      // Numeric-vs-boolean order matches the old two-pass behavior: the two
      // predicates are disjoint (Number("true") is NaN), so checking numeric
      // first is equivalent.
      const relationAtoms: Tuple[] = relation.tuples.map((tuple: ITuple) =>
        tuple.atoms.map((value) => {
          if (this.isConvertibleToNumber(value)) return Number(value);
          if (this.isConvertibleToBoolean(value)) return this.convertToBoolean(value);
          return value;
        })
      );

      // Relation NAMES are not unique — only the qualified id (`Sig<:label`) is.
      // e.g. `open util/ordering[A]` and `open util/ordering[B]` both expose a field
      // named `Next` (`A/Ord<:Next` and `B/Ord<:Next`). A bare-name reference must
      // resolve to the UNION of every relation sharing that name; keying by name and
      // overwriting silently erases all but the last. https://github.com/sidprasad/simple-graph-query/issues/55
      const existing = this.relationCache.get(relation.name);
      this.relationCache.set(relation.name, existing ? existing.concat(relationAtoms) : relationAtoms);
    }

    // Build first-element indexes from the merged (union'd) tuples, so an index
    // never reflects only a subset of a name's relations.
    for (const [name, tuples] of this.relationCache.entries()) {
      const relationIndex = new Map<SingleValue, Tuple[]>();
      for (const tuple of tuples) {
        if (tuple.length > 0) {
          const key = tuple[0];
          if (!relationIndex.has(key)) {
            relationIndex.set(key, []);
          }
          relationIndex.get(key)!.push(tuple);
        }
      }
      this.relationIndexCache.set(name, relationIndex);
    }
  }

  //helper function
  private updateFreeVariables(freeVars: FreeVariables) {
    if (this.freeVariables.size === 0) {
      this.freeVariables = freeVars;
    }
    if (this.freeVariables.size === 0) {
      return; // nothing to do here
    }
    // merge the two maps
    for (const [contextNode, variables] of freeVars.entries()) {
      if (!this.freeVariables.has(contextNode)) {
        this.freeVariables.set(contextNode, new Set());
      }
      const existingVariables = this.freeVariables.get(contextNode)!;
      for (const variable of variables) {
        existingVariables.add(variable);
      }
    }
  }

  // helper function
  private constructFreeVariableKey(freeVarValues: Record<string, EvalResult>): string {
    const keys = Object.keys(freeVarValues);
    keys.sort(); // sort the keys to ensure consistent ordering
    // Use JSON.stringify for complex values to ensure proper serialization
    return keys.map((key) => {
      const value = freeVarValues[key];
      const valueStr = Array.isArray(value) ? JSON.stringify(value) : String(value);
      return `${key}=${valueStr}`;
    }).join("|");
  }

  // helper function to get the label for a value (used for @: operator)
  private getLabelForValue(value: SingleValue): SingleValue {
    // For primitive values (numbers, booleans), the label is the value itself converted to string
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value); // [SP: Labels are always strings, so convert numbers/booleans to strings]
    }

    // For string values, try to find the corresponding atom and return its label
    if (typeof value === "string") {
      let atom: IAtom | undefined = this.instanceData.getAtoms().find(
        (a) => a.id === value
      );

      if (atom) {
        // If the atom has a label field, return it; otherwise return the ID
        return atom.label !== undefined ? atom.label : atom.id;
      }
    }

    // Not an atom id. This is the normal case for a string literal — the label
    // of `"Black"` is just `Black` — so it is not worth reporting.
    return value;
  }

  // helper function to get the label as string (used for @: and @str: operators)
  private getLabelAsString(value: SingleValue): string {
    // Optimization: for primitive types, convert directly
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    const label = this.getLabelForValue(value);
    return String(label);
  }

  // helper function to get the label as boolean (used for @bool: operator)
  private getLabelAsBoolean(value: SingleValue): boolean {
    // Optimization: for boolean values, return directly
    if (typeof value === "boolean") {
      return value;
    }
    
    // Optimization: for number values, apply rule directly
    if (typeof value === "number") {
      return value !== 0;
    }
    
    const label = this.getLabelForValue(value);
    const labelStr = String(label).toLowerCase();
    
    // Convert string representations to boolean
    if (labelStr === 'true') return true;
    if (labelStr === 'false') return false;
    
    // For numbers: 0 is false, anything else is true
    const labelNum = Number(label);
    if (!isNaN(labelNum)) {
      return labelNum !== 0;
    }
    
    // For other strings: empty string is false, anything else is true
    return labelStr !== '';
  }

  // helper function to get the label as number (used for @num: operator)
  private getLabelAsNumber(value: SingleValue): number {
    // Optimization: if value is already a number, return it directly
    if (typeof value === "number") {
      return value;
    }
    
    const label = this.getLabelForValue(value);
    const labelNum = Number(label);
    
    if (isNaN(labelNum)) {
      throw new Error(`Cannot convert label "${label}" to number`);
    }
    
    return labelNum;
  }

  // Helper function to check if a value can be converted to a number
  private isConvertibleToNumber(value: SingleValue): boolean {
    if (typeof value === "number") {
      return true;
    }
    if (typeof value === "string") {
      return !isNaN(Number(value));
    }
    return false;
  }

  // Helper function to check if a value can be converted to a boolean
  private isConvertibleToBoolean(value: SingleValue): boolean {
    if (typeof value === "boolean") {
      return true;
    }
    if (typeof value === "string") {
      return (value === "true" || value === "#t" || value === "false" || value === "#f");
    }
    return false;
  }

  // Helper function to convert a value to boolean
  private convertToBoolean(value: SingleValue): boolean {
    if (typeof value === "boolean") {
      return value;
    }
    if (value === "true" || value === "#t") {
      return true;
    }
    if (value === "false" || value === "#f") {
      return false;
    }
    throw new Error(`Cannot convert ${value} to boolean`);
  }

  // Optimized dotJoin that can use pre-built relation indexes
  private dotJoin(left: EvalResult, right: EvalResult, rightRelationName?: string): EvalResult {
    const leftExpr = isSingleValue(left) ? [[left]] : left;
    const rightExpr = isSingleValue(right) ? [[right]] : right;

    // Try to use pre-built index if available
    let rightIndex: Map<SingleValue, Tuple[]> | undefined;
    if (rightRelationName && this.relationIndexCache) {
      rightIndex = this.relationIndexCache.get(rightRelationName);
    }
    
    // If no pre-built index, build one on the fly
    if (!rightIndex) {
      rightIndex = new Map<SingleValue, Tuple[]>();
      for (const rightTuple of rightExpr) {
        const key = rightTuple[0];
        if (!rightIndex.has(key)) {
          rightIndex.set(key, []);
        }
        rightIndex.get(key)!.push(rightTuple);
      }
    }

    const result: Tuple[] = [];
    for (const leftTuple of leftExpr) {
      const joinKey = leftTuple[leftTuple.length - 1];
      const matchingRightTuples = rightIndex.get(joinKey);
      if (matchingRightTuples) {
        for (const rightTuple of matchingRightTuples) {
          result.push([
            ...leftTuple.slice(0, leftTuple.length - 1),
            ...rightTuple.slice(1),
          ]);
        }
      }
    }

    if (result.some(tuple => tuple.length === 0)) {
      throw new Error("Join would create a relation of arity 0");
    }

    // Deduplicate results to ensure set semantics
    return deduplicateTuples(result);
  }

  // helper function
  private cacheResult(
    ctx: ParseTree,
    freeVarsKey: string,
    result: EvalResult,
    diagnosticsBefore: Set<string>
  ) {
    if (!this.cachedResults.has(ctx)) {
      this.cachedResults.set(ctx, new Map());
    }
    // Diagnostics raised while evaluating this subtree are cached with the
    // result. Without this, evaluating the same expression twice would report
    // an unresolved name only the first time, because the second call is a
    // cache hit and never reaches visitName.
    const diagnostics = Array.from(this.diagnostics.values()).filter(
      (d) => !diagnosticsBefore.has(d.name)
    );
    this.cachedResults.get(ctx)!.set(freeVarsKey, { result, diagnostics });
  }

  // helper function
  private getIden(): Tuple[] {
    const instanceTypes = this.instanceData.getTypes();
    const result: Tuple[] = [];
    // Track unique atom IDs to avoid duplicates
    const seenAtomIds = new Set<string>();
    
    for (const t of instanceTypes) {
      const typeAtoms = t.atoms;
      typeAtoms.forEach((atom: IAtom) => {
        // Skip if we've already seen this atom ID
        if (seenAtomIds.has(atom.id)) {
          return;
        }
        seenAtomIds.add(atom.id);
        
        let value: SingleValue = atom.id;
        // do some type conversions so we don't return a string if the value
        // is a number or boolean
        if (!isNaN(Number(value))) { // check if it's a number
          value = Number(value);
        } else if (value == "true" || value === "#t") {
          value = true;
        } else if (value == "false" || value === "#f") {
          value = false;
        }
        result.push([value, value]);
      });
    }
    return result;
  }

  // THIS SEEMS KINDA JANKY... IS THIS REALLY WHAT WE WANT??
  protected aggregateResult(aggregate: EvalResult, nextResult: EvalResult): EvalResult {
    if (isTupleArray(aggregate) && aggregate.length === 0) return nextResult; // Prioritize non-default values
    if (isTupleArray(nextResult) && nextResult.length === 0) return aggregate;
    if (isSingleValue(aggregate)) {
      if (isSingleValue(nextResult)) {
        return nextResult;
      } else {
        throw new Error("Expected nextResult to be a single value");
      }
    } else {
      if (isSingleValue(nextResult)) {
        return aggregate.concat([nextResult]);
      } else {
        return aggregate.concat(nextResult);
      }
    }
  }

  protected defaultResult(): EvalResult {
    //console.log('default result');
    return [];
  }

  visitPredDecl(ctx: PredDeclContext): EvalResult {
    //console.log('visiting pred');
    //console.log('ctx.block().text:', ctx.block().text);
    const visitResult = this.visit(ctx.block());
    return visitResult;
  }

  visitBlock(ctx: BlockContext): EvalResult {
    //console.log('visiting block');
    //console.log('ctx.text:', ctx.text);
    let result: boolean | undefined = undefined;
    for (const expr of ctx.expr()) {
      const exprResult = this.visit(expr);
      if (!isBoolean(exprResult)) {
        throw new Error("Each expr in a block must evaluate to a boolean!");
      }
      if (result === undefined) {
        result = exprResult;
      } else {
        // const resultBool = getBooleanValue(result);
        // const exprBool = getBooleanValue(exprResult);
        result = result && exprResult;
      }
    }
    //console.log('returning from block:', result);
    if (result === undefined) {
      throw new Error("Expected the block to be nonempty!");
    }
    return result;
  }

  visitExpr(ctx: ExprContext): EvalResult {
    //console.log('visiting expr: ', ctx.text);

    // fetch the free variables for this context node; if we don't have them,
    // we can compute them
    let exprFreeVars = this.freeVariables.get(ctx);
    if (exprFreeVars === undefined) {
      const allContextNodesFreeVars = this.freeVariableFinder.visit(ctx);
      this.updateFreeVariables(allContextNodesFreeVars);
      exprFreeVars = allContextNodesFreeVars.get(ctx);
    }

    // now, we need to get the values of all the free variables from the
    // environment (if any are missing in the environment, something is wrong)
    let foundAllVars = true;
    const freeVarValues: Record<string, EvalResult> = {};
    // we look backwards from the latest frame until we reach a predArgs frame
    // (can't go further back after that)
    for (const freeVar of exprFreeVars!) {
      for (let i = this.environmentStack.length - 1; i >= 0; i--) {
        const currEnv = this.environmentStack[i];
        if (currEnv.env[freeVar] !== undefined) {
          freeVarValues[freeVar] = currEnv.env[freeVar];
          break;
        }
        if (currEnv.type === "predArgs") {
          // can't go further back; free var not found so something is wrong
          foundAllVars = false;
        }
      }
    }

    // now, we need to construct the key for the free variable values
    const freeVarsKey = this.constructFreeVariableKey(freeVarValues);

    // check in the cache
    if (foundAllVars && this.cachedResults.has(ctx)) {
      const cached = this.cachedResults.get(ctx)!.get(freeVarsKey);
      if (cached !== undefined) {
        // cache hit! Replay the diagnostics this subtree produced, so a repeat
        // evaluation reports the same warnings as the first one.
        for (const diagnostic of cached.diagnostics) {
          if (!this.diagnostics.has(diagnostic.name)) {
            this.diagnostics.set(diagnostic.name, diagnostic);
          }
        }
        return cached.result;
      }
    }
    // Snapshot so we can attribute newly-raised diagnostics to this subtree.
    const diagnosticsBefore = new Set(this.diagnostics.keys());
    // cache miss! compute results and store the result in the cache before
    // returning. Store the result only for this context node (not for the
    // children) to manage the cache size

    // not in the cache; evaluate as usual
    let results: EvalResult | undefined = undefined;

    if (ctx.LET_TOK()) {
      results = [];
      results.push(["**UNIMPLEMENTED** Let Binding (`let x = ...`)"]);
    }
    if (ctx.BIND_TOK()) {
      throw new Error("**NOT IMPLEMENTING FOR NOW** Bind Expression");
    }
    if (ctx.quant()) {
      if (ctx.quantDeclList() === undefined) {
        throw new Error("Expected the quantifier to have a quantDeclList!");
      }

      const quantifierFreeVars = this.freeVariableFinder.visit(ctx);
      this.updateFreeVariables(quantifierFreeVars);

      const varQuantifiedSets = this.getQuantDeclListValues(
        ctx.quantDeclList()!
      );

      const isDisjoint = ctx.DISJ_TOK() !== undefined;

      // NOTE: this doesn't support the situation in which blockOrBar is a block
      // yet
      const blockOrBar = ctx.blockOrBar();
      if (blockOrBar === undefined) {
        throw new Error("expected to quantify over something!");
      }
      if (
        blockOrBar.BAR_TOK() === undefined ||
        blockOrBar.expr() === undefined
      ) {
        throw new Error(
          "Expected the quantifier to have a bar followed by an expr!"
        );
      }
      const barExpr = blockOrBar.expr()!;
      const varNames: string[] = [];
      const quantifiedSets: Tuple[][] = [];
      for (const varName in varQuantifiedSets) {
        varNames.push(varName);
        quantifiedSets.push(varQuantifiedSets[varName]);
      }
      
      // `sum <decls> | <intExpr>`: accumulate the numeric body over every
      // binding of the quantified variables. Unlike the boolean quantifiers
      // below, the body evaluates to a number, so this needs its own loop --
      // and it must not use the boolean numeric-comparison optimization, which
      // skips body evaluation entirely.
      if (ctx.quant()!.SUM_TOK()) {
        const sumCombinations = getCombinations(quantifiedSets);
        const sumEnv: Environment = { env: {}, type: "quantDecl" };
        this.environmentStack.push(sumEnv);

        let total = 0;
        for (const tuple of sumCombinations) {
          if (isDisjoint) {
            const seen = new Set();
            let tupleDisjoint = true;
            for (const val of tuple) {
              if (seen.has(val)) {
                tupleDisjoint = false;
                break;
              }
              seen.add(val);
            }
            if (!tupleDisjoint) {
              continue;
            }
          }
          for (let j = 0; j < varNames.length; j++) {
            sumEnv.env[varNames[j]] = tuple[j];
          }
          const bodyValue = this.visit(barExpr);
          const bodyNumber = extractNumber(bodyValue);
          if (bodyNumber === undefined) {
            this.environmentStack.pop();
            throw new Error(
              "Expected the expression after the bar in a `sum` to evaluate to a number!"
            );
          }
          total += bodyNumber;
        }

        this.environmentStack.pop();
        this.cacheResult(ctx, freeVarsKey, total, diagnosticsBefore);
        return total;
      }

      // Try to optimize numeric comparisons.
      //
      // The optimizer generates ONLY the bindings that satisfy the comparison
      // and marks each as true (skipping body evaluation). That is sound for
      // quantifiers whose result depends on the *satisfying* bindings --
      // `some`/`no`/`one`/`two`/`lone` (which count them) -- but NOT for `all`,
      // whose result depends on the existence of a *falsifying* binding. If we
      // discard the falsifying bindings, `all` never sees a counterexample and
      // returns `!foundFalse === true` unconditionally. So exclude `all`.
      let product: Tuple[];
      let useOptimizedPath = false;

      const isAllQuantifier = ctx.quant()!.ALL_TOK() !== undefined;
      if (!isDisjoint && !isAllQuantifier && varNames.length >= 2 && areAllNumericSets(quantifiedSets)) {
        // Try to detect and optimize numeric comparison patterns
        const pattern = detectNumericComparisonPattern(barExpr, varNames);
        if (pattern && pattern.type !== 'none') {
          // Use optimized combination generation
          product = generateOptimizedNumericCombinations(varNames, quantifiedSets, pattern);
          useOptimizedPath = true;
        } else {
          // Fall back to standard cartesian product
          product = getCombinations(quantifiedSets);
        }
      } else {
        // Fall back to standard cartesian product
        product = getCombinations(quantifiedSets);
      }

      const result: Tuple[] = [];

      let foundTrue = false;
      let foundFalse = false;

      // Optimize: create environment once and reuse it
      const quantDeclEnv: Environment = {
        env: {},
        type: "quantDecl",
      };
      this.environmentStack.push(quantDeclEnv);

      for (let i = 0; i < product.length; i++) {
        const tuple = product[i];
        if (isDisjoint) {
          // the elements of the tuple must be different
          let tupleDisjoint = true;
          const seen = new Set();
          for (const val of tuple) {
            if (seen.has(val)) {
              tupleDisjoint = false;
              break;
            }
            seen.add(val);
          }
          if (!tupleDisjoint) {
            continue;
          }
        }
        // Update environment values in place
        for (let j = 0; j < varNames.length; j++) {
          quantDeclEnv.env[varNames[j]] = tuple[j];
        }

        // If we used the optimized path, we can skip constraint evaluation
        // since the combinations already satisfy the constraint
        let barExprValue: boolean;
        if (useOptimizedPath) {
          barExprValue = true;
        } else {
          // now, we want to evaluate the barExpr
          const evalResult = this.visit(barExpr);
          if (!isBoolean(evalResult)) {
            throw new Error(
              "Expected the expression after the bar to be a boolean!"
            );
          }
          barExprValue = evalResult;
        }
        
        if (barExprValue) {
          result.push(tuple);
          foundTrue = true;
        } else {
          foundFalse = true;
        }

        // short-circuit if possible
        if (ctx.quant()!.ALL_TOK() && foundFalse) {
          this.environmentStack.pop();
          const value = false;
          this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
          return value;
        }
        if (ctx.quant()!.NO_TOK() && foundTrue) {
          this.environmentStack.pop();
          const value = false;
          this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
          return value;
        }
        if (ctx.quant()!.mult()) {
          const multExpr = ctx.quant()!.mult()!;
          if (multExpr.LONE_TOK() && result.length > 1) {
            this.environmentStack.pop();
            const value = false;
            this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
            return value;
          }
          if (multExpr.SOME_TOK() && foundTrue) {
            this.environmentStack.pop();
            const value = true;
            this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
            return value;
          }
          if (multExpr.ONE_TOK() && result.length > 1) {
            this.environmentStack.pop();
            const value = false;
            this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
            return value;
          }
          if (multExpr.TWO_TOK() && result.length > 2) {
            this.environmentStack.pop();
            const value = false;
            this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
            return value;
          }
        }
      }

      this.environmentStack.pop();

      if (ctx.quant()!.ALL_TOK()) {
        const value = !foundFalse;
        this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
        return value;
      } else if (ctx.quant()!.NO_TOK()) {
        const value = !foundTrue;
        this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
        return value;
      } else if (ctx.quant()!.mult()) {
        const multExpr = ctx.quant()!.mult()!;
        if (multExpr.LONE_TOK()) {
          const value = result.length <= 1;
          this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
          return value;
        } else if (multExpr.SOME_TOK()) {
          const value = foundTrue;
          this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
          return value;
        } else if (multExpr.ONE_TOK()) {
          const value = result.length === 1;
          this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
          return value;
        } else if (multExpr.TWO_TOK()) {
          const value = result.length === 2;
          this.cacheResult(ctx, freeVarsKey, value, diagnosticsBefore);
          return value;
        }
      }
      // NOTE: SUM_TOK is handled above (it returns a number, not a boolean),
      // before this boolean-quantifier result logic.
    }

    // TODO: fix this!
    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr:', childrenResults);
    if (results === undefined) {
      //console.log('returning childrenResults in expr:', childrenResults);
      this.cacheResult(ctx, freeVarsKey, childrenResults, diagnosticsBefore);
      return childrenResults;
    }
    if (isSingleValue(results)) {
      throw new Error("Expected results to be a tuple array");
    }
    if (isSingleValue(childrenResults)) {
      results.push([childrenResults]);
    } else {
      results = results.concat(childrenResults);
    }
    //console.log('results being returned in expr:', results);
    this.cacheResult(ctx, freeVarsKey, results, diagnosticsBefore);
    return results;
  }

  visitExpr1(ctx: Expr1Context): EvalResult {
    //console.log('visiting expr1:', ctx.text);

    if (ctx.OR_TOK()) {
      if (ctx.expr1_5() === undefined || ctx.expr1_5() === undefined) {
        throw new Error(
          "Expected the OR operator to have 2 operands of the right type!"
        );
      }
      const leftChildValue = this.visit(ctx.expr1()!);
      if (!isBoolean(leftChildValue)) {
        throw new Error("OR operator expected 2 boolean operands!");
      }
      if (leftChildValue) {
        // short circuit and return true if this is true
        return leftChildValue;
      }

      const rightChildValue = this.visit(ctx.expr1_5()!);
      if (!isBoolean(rightChildValue)) {
        throw new Error("OR operator expected 2 boolean operands!");
      }

      return rightChildValue;
    }

    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr1:', childrenResults);
    return childrenResults;
  }

  visitExpr1_5(ctx: Expr1_5Context): EvalResult {
    //console.log('visiting expr1_5:', ctx.text);

    if (ctx.XOR_TOK()) {
      if (ctx.expr1_5() === undefined || ctx.expr2() === undefined) {
        throw new Error(
          "Expected the XOR operator to have 2 operands of the right type!"
        );
      }
      const leftChildValue = this.visit(ctx.expr1_5()!);
      const rightChildValue = this.visit(ctx.expr2()!);

      if (!isBoolean(leftChildValue) || !isBoolean(rightChildValue)) {
        throw new Error("XOR operator expected 2 boolean operands!");
      }

      return leftChildValue !== rightChildValue;
    }

    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr1_5:', childrenResults);
    return childrenResults;
  }

  visitExpr2(ctx: Expr2Context): EvalResult {
    //console.log('visiting expr2:', ctx.text);

    if (ctx.IFF_TOK()) {
      if (ctx.expr2() === undefined || ctx.expr3() === undefined) {
        throw new Error(
          "Expected the IFF operator to have 2 operands of the right type!"
        );
      }
      const leftChildValue = this.visit(ctx.expr2()!);
      const rightChildValue = this.visit(ctx.expr3()!);

      if (!isBoolean(leftChildValue) || !isBoolean(rightChildValue)) {
        throw new Error("IFF operator expected 2 boolean operands!");
      }

      return leftChildValue === rightChildValue;
    }

    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr2:', childrenResults);
    return childrenResults;
  }

  visitExpr3(ctx: Expr3Context): EvalResult {
    //console.log('visiting expr3:', ctx.text);

    if (ctx.IMP_TOK()) {
      if (ctx.expr3() === undefined || ctx.expr4() === undefined) {
        throw new Error(
          "Expected the IMP operator to have 2 operands of the right type!"
        );
      }
      const leftChildValue = this.visit(ctx.expr4()!);
      if (!isBoolean(leftChildValue)) {
        throw new Error("IMP operator expected 2 boolean operands!");
      }
      const expr3Values = ctx.expr3() ?? [];
      const thenExpr = expr3Values[0];
      const elseExpr = expr3Values[1];

      if (ctx.ELSE_TOK()) {
        if (!thenExpr || !elseExpr) {
          throw new Error("Expected the ELSE operator to have 2 operands!");
        }
        const branchValue = this.visit(leftChildValue ? thenExpr : elseExpr);
        if (!isBoolean(branchValue)) {
          throw new Error("IMP operator expected 2 boolean operands!");
        }
        return branchValue;
      }

      if (!leftChildValue) {
        // short circuit if the antecedent is false
        return true;
      }

      if (!thenExpr) {
        throw new Error("Expected the IMP operator to have a consequent expression!");
      }
      const rightChildValue = this.visit(thenExpr);
      if (!isBoolean(rightChildValue)) {
        throw new Error("IMP operator expected 2 boolean operands!");
      }

      return rightChildValue;
    }

    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr3:', childrenResults);
    return childrenResults;
  }

  visitExpr4(ctx: Expr4Context): EvalResult {
    //console.log('visiting expr4:', ctx.text);

    if (ctx.AND_TOK()) {
      if (ctx.expr4() === undefined || ctx.expr4_5() === undefined) {
        throw new Error(
          "Expected the AND operator to have 2 operands of the right type!"
        );
      }
      const leftChildValue = this.visit(ctx.expr4()!);
      if (!isBoolean(leftChildValue)) {
        throw new Error("AND operator expected 2 boolean operands!");
      }
      if (!leftChildValue) {
        return leftChildValue; // short circuit if the first operand is false
      }

      const rightChildValue = this.visit(ctx.expr4_5()!);
      if (!isBoolean(rightChildValue)) {
        throw new Error("AND operator expected 2 boolean operands!");
      }

      return rightChildValue;
    }

    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr4:', childrenResults);
    return childrenResults;
  }

  visitExpr4_5(ctx: Expr4_5Context): EvalResult {
    //console.log('visiting expr4_5:', ctx.text);
    let results: EvalResult = [];

    if (ctx.UNTIL_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`until`)"]);
      // results = results.concat(this.visit(ctx.expr5()[0]));
      // TODO: get left child value (as per the line commented out line above)
      //       then get right child value by calling ctx.expr5()[1]
      //       then apply the UNTIL implementation

      // TODO: returning for now without going to children since this is just
      // unimplemented
      return results;
    }
    if (ctx.RELEASE_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`release`)"]);
      // results = results.concat(this.visit(ctx.expr5()[0]));
      // TODO: get left child value (as per the line commented out line above)
      //       then get right child value by calling ctx.expr5()[1]
      //       then apply the RELEASE implementation

      // TODO: returning for now without going to children since this is just
      // unimplemented
      return results;
    }
    if (ctx.SINCE_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`since`)"]);
      // results = results.concat(this.visit(ctx.expr5()[0]));
      // TODO: get left child value (as per the line commented out line above)
      //       then get right child value by calling ctx.expr5()[1]
      //       then apply the SINCE implementation

      // TODO: returning for now without going to children since this is just
      // unimplemented
      return results;
    }
    if (ctx.TRIGGERED_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`triggered`)"]);
      // results = results.concat(this.visit(ctx.expr5()[0]));
      // TODO: get left child value (as per the line commented out line above)
      //       then get right child value by calling ctx.expr5()[1]
      //       then apply the TRIGGERED implementation

      // TODO: returning for now without going to children since this is just
      // unimplemented
      return results;
    }

    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr4_5:', childrenResults);
    return childrenResults;
  }

  visitExpr5(ctx: Expr5Context): EvalResult {
    //console.log('visiting expr5:', ctx.text);
    let results: EvalResult = [];

    if (ctx.expr6()) {
      return this.visit(ctx.expr6()!);
    }

    if (ctx.expr5() === undefined) {
      throw new Error("Expected the temporal operator to have 1 operand!");
    }
    const childrenResults = this.visit(ctx.expr5()!);
    //console.log('childrenResults in expr5:', childrenResults);

    if (ctx.NEG_TOK()) {
      if (!isBoolean(childrenResults)) {
        throw new Error(
          "Expected the negation operator to have a boolean operand!"
        );
      }
      return !childrenResults;
    }
    if (ctx.ALWAYS_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`always`)"]);
      // TODO: implement the ALWAYS operation on the value in childrenResults
      //       and then return the result
      //       just returning results as is right now
      return results;
    }
    if (ctx.EVENTUALLY_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`eventually`)"]);
      // TODO: implement the EVENTUALLY operation on the value in childrenResults
      //       and then return the result
      //       just returning results as is right now
      return results;
    }
    if (ctx.AFTER_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`after`)"]);
      // TODO: implement the AFTER operation on the value in childrenResults
      //       and then return the result
      //       just returning results as is right now
      return results;
    }
    if (ctx.BEFORE_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`before`)"]);
      // TODO: implement the BEFORE operation on the value in childrenResults
      //       and then return the result
      //       just returning results as is right now
      return results;
    }
    if (ctx.ONCE_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`once`)"]);
      // TODO: implement the ONCE operation on the value in childrenResults
      //       and then return the result
      //       just returning results as is right now
      return results;
    }
    if (ctx.HISTORICALLY_TOK()) {
      results.push(["**UNIMPLEMENTED** Temporal Operator (`historically`)"]);
      // TODO: implement the HISTORICALLY operation on the value in childrenResults
      //       and then return the result
      //       just returning results as is right now
      return results;
    }

    //console.log('returning from the bottom:', childrenResults);
    return childrenResults;
  }

  visitExpr6(ctx: Expr6Context): EvalResult {
    //console.log('visiting expr6:', ctx.text);
    let results: EvalResult = [];

    let toNegate = false;
    let foundValue = false;

    if (ctx.NEG_TOK()) {
      toNegate = true;
    }
    if (ctx.compareOp()) {
      foundValue = true;
      if (ctx.expr6() === undefined || ctx.expr7() === undefined) {
        throw new Error("Expected the compareOp to have 2 operands!");
      }
      const leftChildValue = this.visit(ctx.expr6()!);
      const rightChildValue = this.visit(ctx.expr7()!);
      //console.log('left child value:', leftChildValue);
      //console.log('right child value:', rightChildValue);

      let leftNum = extractNumber(leftChildValue);
      let rightNum = extractNumber(rightChildValue);

      switch (ctx.compareOp()?.text) {
        case "=":
          if (isSingleValue(leftChildValue) && isSingleValue(rightChildValue)) {
            results = leftChildValue === rightChildValue;
          } else if (isSingleValue(leftChildValue) && isTupleArray(rightChildValue)) {
            if (
              rightChildValue.length === 1 &&
              rightChildValue[0].length === 1
            ) {
              results = leftChildValue === rightChildValue[0][0];
            } else {
              results = false;
            }
          } else if (isTupleArray(leftChildValue) && isSingleValue(rightChildValue)) {
            if (leftChildValue.length === 1 && leftChildValue[0].length === 1) {
              results = leftChildValue[0][0] === rightChildValue;
            } else {
              results = false;
            }
          } else if (isTupleArray(leftChildValue) && isTupleArray(rightChildValue)) {
            results = areTupleArraysEqual(leftChildValue, rightChildValue);
          } else {
            // NOTE: we should never actually get here
            throw new Error("unexpected error: equality operand is not a well defined forge value!");
          }
          break;
        case "<":
          if (leftNum === undefined || rightNum === undefined) {
            throw new Error(
              `Expected the < operator to have 2 number operands (number or [[number]]), got ${typeof leftChildValue} and ${typeof rightChildValue}!`
            );
          }
          results = leftNum < rightNum;
          break;
        case ">":
          if (leftNum === undefined || rightNum === undefined) {
            throw new Error(
              `Expected the > operator to have 2 number operands (number or [[number]]), got ${typeof leftChildValue} and ${typeof rightChildValue}!`
            );
          }
          results = leftNum > rightNum;


          break;
        // `=<` is the same token as `<=` (see LEQ_TOK), but the switch is on
        // source text, so both spellings need an arm.
        case "=<":
        case "<=":
          if (leftNum === undefined || rightNum === undefined) {
            throw new Error(
              `Expected the <= operator to have 2 number operands (number or [[number]]), got ${typeof leftChildValue} and ${typeof rightChildValue}!`
            );
          }
          results = leftNum <= rightNum;
          break;
        case ">=":

          if (leftNum === undefined || rightNum === undefined) {
            throw new Error(
              `Expected the >= operator to have 2 number operands (number or [[number]]), got ${typeof leftChildValue} and ${typeof rightChildValue}!`
            );
          }
          results = leftNum >= rightNum;
          break;
        case "in":
        case "ni": {
          // In Alloy/Forge everything is a relation, and a scalar is just a
          // singleton set. Lift any scalar operand to a singleton tuple so `in`
          // is uniformly subset:
          //   a in b     ({a} ⊆ {b})  -> equality when both are scalars
          //   a in {..}  ({a} ⊆ set)  -> membership
          //   {..} in b  (set ⊆ {b})  -> subset of a singleton
          // isTupleArraySubset already returns true for equal sets and for an
          // empty left-hand set, so a single subset check covers every case.
          const leftSet: Tuple[] = isSingleValue(leftChildValue)
            ? [[leftChildValue]]
            : leftChildValue;
          const rightSet: Tuple[] = isSingleValue(rightChildValue)
            ? [[rightChildValue]]
            : rightChildValue;
          // `a ni b` is reverse containment -- it means `b in a`, NOT `a not in b`.
          const [subset, superset] =
            ctx.compareOp()?.text === "ni" ? [rightSet, leftSet] : [leftSet, rightSet];
          results = isTupleArraySubset(subset, superset);
          break;
        }
        case "is":
          throw new Error("**NOT IMPLEMENTING FOR NOW** Type Check (`is`)");
        default:
          throw new Error(
            `Unexpected compare operator provided: ${ctx.compareOp()?.text}`
          );
      }
    }

    if (toNegate) {
      if (!isBoolean(results)) {
        throw new Error("Expected the negation operator to have a boolean operand!");
      }
      return !results;
    }

    if (foundValue) {
      //console.log('found value; returning:', results);
      return results;
    }

    return this.visitChildren(ctx);
  }

  visitExpr7(ctx: Expr7Context): EvalResult {
    //console.log('visiting expr7:', ctx.text);
    let results: EvalResult = [];

    const childrenResults = this.visit(ctx.expr8());
    //console.log('childrenResults:', childrenResults);

    if (ctx.SET_TOK()) {
      return childrenResults;
    }
    // For the multiplicity checks, a bare scalar (atom or int) is a singleton
    // set of size 1. A boolean is not a set, so it gets size -1 and every
    // multiplicity below is false (matching the previous behavior).
    if (
      ctx.ONE_TOK() ||
      ctx.TWO_TOK() ||
      ctx.NO_TOK() ||
      ctx.SOME_TOK() ||
      ctx.LONE_TOK()
    ) {
      const setSize = isTupleArray(childrenResults)
        ? childrenResults.length
        : isString(childrenResults) || isNumber(childrenResults)
          ? 1
          : -1;
      if (ctx.ONE_TOK()) {
        return setSize === 1;
      }
      if (ctx.TWO_TOK()) {
        return setSize === 2;
      }
      if (ctx.NO_TOK()) {
        return setSize === 0;
      }
      if (ctx.SOME_TOK()) {
        return setSize > 0;
      }
      if (ctx.LONE_TOK()) {
        return setSize === 0 || setSize === 1;
      }
    }

    return childrenResults;
  }

  visitExpr8(ctx: Expr8Context): EvalResult {
    //console.log('visiting expr8:', ctx.text);

    if (ctx.PLUS_TOK()) {
      const leftChildValue = this.visit(ctx.expr8()!);
      const rightChildValue = this.visit(ctx.expr10()!);

      // should only work if arities are the same
      if (isSingleValue(leftChildValue) && isSingleValue(rightChildValue)) {
        // Union has set semantics: two equal scalars collapse to one element.
        if (leftChildValue === rightChildValue) {
          return [[leftChildValue]];
        }
        return [[leftChildValue], [rightChildValue]];
      } else if (isSingleValue(leftChildValue) && isTupleArray(rightChildValue)) {
        if (rightChildValue.length === 0) {
          return leftChildValue;
        }
        if (rightChildValue[0].length === 1) {
          return deduplicateConcat([[[leftChildValue]], rightChildValue]);
        }
        throw new Error("arity mismatch in set union!");
      } else if (isTupleArray(leftChildValue) && isSingleValue(rightChildValue)) {
        if (leftChildValue.length === 0) {
          return rightChildValue;
        }
        if (leftChildValue[0].length === 1) {
          return deduplicateConcat([leftChildValue, [[rightChildValue]]]);
        }
        throw new Error("arity mismatch in set union!");
      } else if (isTupleArray(leftChildValue) && isTupleArray(rightChildValue)) {
        if (leftChildValue.length === 0 && rightChildValue.length === 0) {
          return [];
        }
        if (leftChildValue.length === 0) {
          return rightChildValue;
        }
        if (rightChildValue.length === 0) {
          return leftChildValue;
        }
        if (leftChildValue[0].length === rightChildValue[0].length) {
          return deduplicateConcat([leftChildValue, rightChildValue]);
        }
      } else {
        throw new Error("unexpected error: expressions added are not well defined!");
      }
    }
    if (ctx.MINUS_TOK()) {
      const leftChildValue = this.visit(ctx.expr8()!);
      const rightChildValue = this.visit(ctx.expr10()!);

      // should only work if arities are the same
      if (isSingleValue(leftChildValue) && isSingleValue(rightChildValue)) {
        if (leftChildValue === rightChildValue) {
          return [];
        }
        //console.log('returning leftChildValue:', leftChildValue);
        return leftChildValue;
      } else if (isSingleValue(leftChildValue) && isTupleArray(rightChildValue)) {
        if (rightChildValue.length === 0) {
          return leftChildValue;
        }
        if (rightChildValue[0].length === 1) {
          return rightChildValue.some((tuple) => tuple[0] === leftChildValue)
            ? []
            : leftChildValue;
        }
        throw new Error("arity mismatch in set difference!");
      } else if (isTupleArray(leftChildValue) && isSingleValue(rightChildValue)) {
        if (leftChildValue.length === 0) {
          return [];
        }
        if (leftChildValue[0].length === 1) {
          return leftChildValue.filter((tuple) => tuple[0] !== rightChildValue);
        }
        throw new Error("arity mismatch in set difference!");
      } else if (isTupleArray(leftChildValue) && isTupleArray(rightChildValue)) {
        if (leftChildValue.length === 0) {
          return [];
        }
        if (rightChildValue.length === 0) {
          return leftChildValue;
        }
        if (leftChildValue[0].length === rightChildValue[0].length) {
          // Optimize set difference using Set for O(n+m) instead of O(n*m),
          // reusing canonical keys instead of re-serializing each side.
          const rightSet = new Set(ensureKeys(rightChildValue));
          const leftKeys = ensureKeys(leftChildValue);
          const result: Tuple[] = [];
          const resultKeys: string[] = [];
          for (let i = 0; i < leftChildValue.length; i++) {
            if (!rightSet.has(leftKeys[i])) {
              result.push(leftChildValue[i]);
              resultKeys.push(leftKeys[i]);
            }
          }
          if (result.length >= KEY_REGISTER_MIN) {
            relationKeys.set(result, resultKeys);
          }
          return result;
        }
      } else {
        throw new Error("unexpected error: expressions subtracted are not well defined!");
      }
    }

    return this.visitChildren(ctx);
  }

  visitExpr9(ctx: Expr9Context): EvalResult {
    //console.log('visiting expr9:', ctx.text);
    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr9:', childrenResults);

    if (ctx.CARD_TOK()) {
      if (isTupleArray(childrenResults)) {
        return childrenResults.length;
      }
      // A scalar atom or int is a singleton set (cardinality 1). Booleans are
      // formulas, not sets, so they remain an error.
      if (isString(childrenResults) || isNumber(childrenResults)) {
        return 1;
      }
      throw new Error("The cardinal operator must be applied to a set of tuples!");
    }

    return childrenResults;
  }

  visitExpr10(ctx: Expr10Context): EvalResult {
    //console.log('visiting expr10:', ctx.text);
    let results: EvalResult = [];

    if (ctx.PPLUS_TOK()) {
      if (ctx.expr10() === undefined || ctx.expr11() === undefined) {
        throw new Error("Expected the pplus operator to have 2 operands of the right type!");
      }
      const leftChildValue = this.visit(ctx.expr10()!);
      const rightChildValue = this.visit(ctx.expr11()!);
      throw new Error("**NOT IMPLEMENTING FOR NOW** pplus (`++`)");
    }

    return this.visitChildren(ctx);
  }

  visitExpr11(ctx: Expr11Context): EvalResult {
    //console.log('visiting expr11:', ctx.text);

    if (ctx.AMP_TOK()) {
      if (ctx.expr11() === undefined || ctx.expr12() === undefined) {
        throw new Error("Expected the amp operator to have 2 operands of the right type!");
      }
      const leftChildValue = this.visit(ctx.expr11()!);
      const rightChildValue = this.visit(ctx.expr12()!);

      // should only work if arities are the same
      if (isSingleValue(leftChildValue) && isSingleValue(rightChildValue)) {
        return leftChildValue === rightChildValue ? leftChildValue : [];
      } else if (isSingleValue(leftChildValue) && isTupleArray(rightChildValue)) {
        if (rightChildValue.length === 0) {
          return [];
        }
        if (rightChildValue[0].length === 1) {
          return rightChildValue.some((tuple) => tuple[0] === leftChildValue)
            ? leftChildValue
            : [];
        }
        throw new Error("arity mismatch in set intersection!");
      } else if (isTupleArray(leftChildValue) && isSingleValue(rightChildValue)) {
        if (leftChildValue.length === 0) {
          return [];
        }
        if (leftChildValue[0].length === 1) {
          return leftChildValue.some((tuple) => tuple[0] === rightChildValue)
            ? rightChildValue
            : [];
        }
        throw new Error("arity mismatch in set intersection!");
      } else if (isTupleArray(leftChildValue) && isTupleArray(rightChildValue)) {
        if (leftChildValue.length === 0 || rightChildValue.length === 0) {
          return [];
        }
        if (leftChildValue[0].length === rightChildValue[0].length) {
          // Optimize set intersection using Set for O(n+m) instead of O(n*m),
          // reusing canonical keys instead of re-serializing each side.
          const rightSet = new Set(ensureKeys(rightChildValue));
          const leftKeys = ensureKeys(leftChildValue);
          const result: Tuple[] = [];
          const resultKeys: string[] = [];
          for (let i = 0; i < leftChildValue.length; i++) {
            if (rightSet.has(leftKeys[i])) {
              result.push(leftChildValue[i]);
              resultKeys.push(leftKeys[i]);
            }
          }
          if (result.length >= KEY_REGISTER_MIN) {
            relationKeys.set(result, resultKeys);
          }
          return result;
        }
      } else {
        throw new Error("unexpected error: expressions intersected are not well defined!");
      }
    }

    return this.visitChildren(ctx);
  }

  visitExpr12(ctx: Expr12Context): EvalResult {
    //console.log('visiting expr12:', ctx.text);

    if (ctx.arrowOp()) {
      if (ctx.expr12() === undefined || ctx.expr13() === undefined) {
        throw new Error("Expected the arrow operator to have 2 operands of the right type!");
      }
      // `A one -> lone B` constrains a field declaration; as an expression it
      // denotes nothing beyond the cross product, so evaluating it as one would
      // silently discard what the author wrote.
      const arrowOp = ctx.arrowOp()!;
      if (arrowOp.mult().length > 0 || arrowOp.SET_TOK().length > 0) {
        throw new Error(
          `Cannot evaluate the multiplicity annotations in '${arrowOp.text}': ` +
          "they are declaration and constraint syntax, not part of an expression. " +
          "Write a plain '->' for the cross product."
        );
      }
      const leftChildValue = this.visit(ctx.expr12()!);
      const rightChildValue = this.visit(ctx.expr13()!);

      // Ensure both values are tuple arrays
      const leftTuples = isSingleValue(leftChildValue) ? [[leftChildValue]] : leftChildValue;
      const rightTuples = isSingleValue(rightChildValue) ? [[rightChildValue]] : rightChildValue;

      if (!isTupleArray(leftTuples) || !isTupleArray(rightTuples)) {
        throw new Error("Arrow operator operands must be tuple arrays or single values");
      }

      // Compute the Cartesian product
      const result: Tuple[] = [];
      for (const leftTuple of leftTuples) {
        for (const rightTuple of rightTuples) {
          result.push([...leftTuple, ...rightTuple]);
        }
      }

      // Deduplicate the result
      return deduplicateTuples(result);
    }

    return this.visitChildren(ctx);
  }

  visitExpr13(ctx: Expr13Context): EvalResult {
    //console.log('visiting expr13:', ctx.text);
    let results: EvalResult = [];

    if (ctx.SUPT_TOK()) {
      if (ctx.expr13() === undefined || ctx.expr14() === undefined) {
        throw new Error(
          "Expected the supertype operator to have 2 operands of the right type!"
        );
      }
      const leftChildValue = this.visit(ctx.expr13()!);
      const rightChildValue = this.visit(ctx.expr14()!);
      throw new Error("**NOT IMPLEMENTING FOR NOW** Supertype Operator (`:>`)");
    }
    if (ctx.SUBT_TOK()) {
      if (ctx.expr13() === undefined || ctx.expr14() === undefined) {
        throw new Error(
          "Expected the subtype operator to have 2 operands of the right type!"
        );
      }
      const leftChildValue = this.visit(ctx.expr13()!);
      const rightChildValue = this.visit(ctx.expr14()!);
      throw new Error("**NOT IMPLEMENTING FOR NOW** Subtype Operator (`<:`)");
    }

    return this.visitChildren(ctx);
  }

  visitExpr14(ctx: Expr14Context): EvalResult {
    //console.log('visiting expr14:', ctx.text);
    let results: EvalResult = [];

    if (ctx.LEFT_SQUARE_TOK()) {
      const beforeBracesExpr = this.visit(ctx.expr14()!);
      const insideBracesExprs = this.visit(ctx.exprList()!);
      //console.log('beforeBracesExpr:', beforeBracesExpr);
      //console.log('insideBracesExprs:', insideBracesExprs);


      // support for some forge-native functions:
      if (isString(beforeBracesExpr)) {
        if (SUPPORTED_BINARY_BUILTINS.includes(beforeBracesExpr)) {
          return this.evaluateBinaryOperation(beforeBracesExpr, insideBracesExprs);
        }
        else if (SUPPORTED_UNARY_BUILTINS.includes(beforeBracesExpr)) {
          return this.evaluateUnaryOperation(beforeBracesExpr, insideBracesExprs);
        }
        else if (SUPPORTED_SET_BUILTINS.includes(beforeBracesExpr)) {
          return this.evaluateSetOperation(beforeBracesExpr, insideBracesExprs);
        }
      }

      // Box join: <expr-a>[<expr-b>] == <expr-b> . <expr-a>
      return this.dotJoin(insideBracesExprs, beforeBracesExpr);
    }

    return this.visitChildren(ctx);
  }

  visitExpr15(ctx: Expr15Context): EvalResult {
    //console.log('visiting expr15:', ctx.text);
    let results: EvalResult = [];

    if (ctx.DOT_TOK()) {
      if (ctx.expr15() === undefined || ctx.expr16() === undefined) {
        throw new Error("Expected the dot operator to have 2 operands of the right type!");
      }
      
      const beforeDotExpr = this.visit(ctx.expr15()!);
      const afterDotExpr = this.visit(ctx.expr16()!);
      
      // Try to extract the relation name if the right side is a simple identifier/relation name
      let rightRelationName: string | undefined;
      // Simple heuristic: check if it's a tuple array (likely a relation)
      // and if so, try to find which relation it matches
      if (isTupleArray(afterDotExpr) && this.relationCache) {
        // Check if this matches any cached relation
        for (const [relName, relTuples] of this.relationCache.entries()) {
          if (relTuples === afterDotExpr) {
            rightRelationName = relName;
            break;
          }
        }
      }

      return this.dotJoin(beforeDotExpr, afterDotExpr, rightRelationName);
    }

    if (ctx.LEFT_SQUARE_TOK()) {
      const beforeBracesName = this.visit(ctx.name()!);
      const insideBracesExprs = this.visit(ctx.exprList()!);
      results.push(["**UNIMPLEMENTED** _[_]"]);

      // TODO: we need to implement this using beforeBracesName and
      //       insideBracesExprs and then return the result
      //       just returning results here for now
      return results;
    }
    // return results.concat(this.visitChildren(ctx));
    return this.visitChildren(ctx);
  }

  visitExpr16(ctx: Expr16Context): EvalResult {
    //console.log('visiting expr16:', ctx.text);
    let results: EvalResult = [];

    if (ctx.PRIME_TOK()) {
      const leftChildValue = this.visit(ctx.expr16()!);
      results.push(["**UNIMPLEMENTED** Primed Expression _'"]);

      // TODO: we need to implement PRIME (') using leftChildValue and then return the result
      //       just returning results here for now
      return results;
    }

    return this.visitChildren(ctx);
  }

  visitExpr17(ctx: Expr17Context): EvalResult {
    //console.log('visiting expr17:', ctx.text);
    let results: EvalResult = [];

    // Handle label operators FIRST, before visitChildren
    if (ctx.GET_LABEL_TOK() || ctx.GET_LABEL_STR_TOK() || ctx.GET_LABEL_BOOL_TOK() || ctx.GET_LABEL_NUM_TOK()) {
      // Label operators - get label for value with specified type
      const innerExpr = ctx.expr17();
      if (!innerExpr) {
        throw new Error("Label operator requires an expression");
      }

      // Determine which type conversion to use
      let convertFunction: (value: SingleValue) => SingleValue;
      let operatorName: string;
      
      if (ctx.GET_LABEL_TOK()) {
        convertFunction = (value) => this.getLabelAsString(value);
        operatorName = "@:";
      } else if (ctx.GET_LABEL_STR_TOK()) {
        convertFunction = (value) => this.getLabelAsString(value);
        operatorName = "@str:";
      } else if (ctx.GET_LABEL_BOOL_TOK()) {
        convertFunction = (value) => this.getLabelAsBoolean(value);
        operatorName = "@bool:";
      } else if (ctx.GET_LABEL_NUM_TOK()) {
        convertFunction = (value) => this.getLabelAsNumber(value);
        operatorName = "@num:";
      } else {
        throw new Error("Unknown label operator");
      }

      const innerResult = this.visit(innerExpr);

      if (isSingleValue(innerResult)) {
        return convertFunction(innerResult);
      } else if (isTupleArray(innerResult)) {
        // For single-element tuple arrays, return the converted label of the element
        if (innerResult.length === 1 && innerResult[0].length === 1) {
          return convertFunction(innerResult[0][0]);
        }
        // Otherwise convert elementwise. An empty operand yields an empty
        // result — the operand evaluated fine, it just denotes nothing.
        return innerResult.map((tuple) =>
          tuple.map((value) => convertFunction(value))
        );
      }
      throw new Error(`${operatorName} operator can only be applied to single values or tuple arrays`);
    }

    const childrenResults = this.visitChildren(ctx);
    //console.log('visitChildren result for', ctx.text, ':', childrenResults);

    if (ctx.TILDE_TOK()) {
      // this flips the order of the elements in the tuples of a relation if
      // the relation has arity 2
      if (isTupleArray(childrenResults)) {
        // The transpose of the empty relation is the empty relation. Guarding
        // only on `length > 0` made `~<empty>` throw (e.g. `~(left - left)`),
        // even though `^`/`*` handle the empty relation fine.
        if (childrenResults.length === 0) {
          return [];
        }
        if (childrenResults[0].length === 2) {
          return childrenResults.map((tuple) => [tuple[1], tuple[0]]);
        }
      }
      throw new Error("expected the expression provided to ~ to have arity 2; bad arity received!");
    }
    if (ctx.EXP_TOK()) {
      if (isTupleArray(childrenResults)) {
        return transitiveClosure(childrenResults);
      }
      throw new Error("transitive closure ^ expected a relation of arity 2, not a singular value!");
    }
    if (ctx.STAR_TOK()) { // reflexive transitive closure
      if (isTupleArray(childrenResults)) {
        const transitiveClosureResult = transitiveClosure(childrenResults);
        const idenResult = this.getIden();
        // Dedup while preserving the original tuple objects (and their
        // memoized keys) -- avoids re-materializing every tuple via JSON.parse.
        return deduplicateTuples(idenResult.concat(transitiveClosureResult));
      }
    }

    return childrenResults;
  }

  // helper function to get a list of names from a nameList
  getNameListValues(ctx: NameListContext): string[] {
    if (ctx.COMMA_TOK()) {
      // there is a comma, so we need to get the value from the head of the list
      // and then move onto the tail after that
      const headValue = getIdentifierName(ctx.name());
      const tailValues = this.getNameListValues(ctx.nameList()!);
      return [headValue, ...tailValues];
    } else {
      // there is no comma so there is just a single name that we need to deal with here
      return [getIdentifierName(ctx.name())];
    }
  }

  // helper function to get the values each var is bound to in a single quantDecl
  getQuantDeclValues(ctx: QuantDeclContext): Record<string, Tuple[]> {
    // NOTE: **UNIMPLEMENTED**: discuss use of `disj` with Tim
    // const isDisjoint = quantDecl.DISJ_TOK() !== undefined;
    const nameList = ctx.nameList();
    const names = this.getNameListValues(nameList);
    // NOTE: **UNIMPLEMENTED**: discuss use of `set` with Tim
    const quantExpr = ctx.expr();
    let exprValue = this.visitExpr(quantExpr);
    if (isSingleValue(exprValue)) {
      exprValue = [[exprValue]];
    }
    const quantDeclValues: Record<string, Tuple[]> = {};
    for (const name of names) {
      quantDeclValues[name] = exprValue;
    }
    return quantDeclValues;
  }

  // helper function to get the values each var is bound to in a quantDeclList
  getQuantDeclListValues(ctx: QuantDeclListContext): Record<string, Tuple[]> {
    if (ctx.COMMA_TOK()) {
      // there is a comma, so we need to get the value from the head of the list
      // and then move onto the tail after that
      const head = ctx.quantDecl();
      const tail = ctx.quantDeclList();
      if (tail === undefined) {
        throw new Error("expected a quantDeclList after the comma");
      }
      const headValue = this.getQuantDeclValues(head);
      const tailValues = this.getQuantDeclListValues(tail);
      return { ...headValue, ...tailValues };
    } else {
      // there is no comma so there is just a single quantDecl that we need to
      // deal with here
      return this.getQuantDeclValues(ctx.quantDecl());
    }
  }

  visitExpr18(ctx: Expr18Context): EvalResult {
    // console.log('visiting expr18:', ctx.text);
    let results: EvalResult = [];

    if (ctx.const()) {
      const constant = ctx.const()!;
      if (constant.number() !== undefined) {
        const num = Number(constant.number()!.text);
        const value = constant.MINUS_TOK() !== undefined ? -num : num;
        // if the user mentions a constant that is outside the bitwidth, it
        // causes an error
        // const maxValue = Math.pow(2, this.bitwidth - 1) - 1;
        // const minValue = -1 * Math.pow(2, this.bitwidth - 1);
        // if (value > maxValue || value < minValue) {
        //   throw new Error(`Constant ${value} is outside the bitwidth of ${this.bitwidth}!`);
        // }
        return value;
      }
      // Handle none (the empty relation). Without this, `none` falls through to
      // the string-literal branch below and evaluates to the string "none",
      // which then pollutes every set operation it touches (e.g.
      // `S + none` gains a spurious `["none"]` element and `#none` throws).
      // The static analyzer already treats `none` as the empty set.
      if (constant.NONE_TOK() !== undefined) {
        return [];
      }
      // Handle iden (identity relation)
      if (constant.IDEN_TOK() !== undefined) {
        // The identity relation contains tuples (x, x) for every atom x in the universe
        const atoms = this.instanceData.getAtoms();
        const idenRelation: Tuple[] = [];
        
        for (const atom of atoms) {
          let atomValue: SingleValue = atom.id;
          // Convert numeric and boolean strings to their actual types
          if (this.isConvertibleToNumber(atomValue)) {
            atomValue = Number(atomValue);
          } else if (this.isConvertibleToBoolean(atomValue)) {
            atomValue = this.convertToBoolean(atomValue);
          }
          idenRelation.push([atomValue, atomValue]);
        }
        
        return idenRelation;
      }
      // Handle univ (universal relation - all atoms)
      if (constant.UNIV_TOK() !== undefined) {
        // The universal relation contains all atoms as unary tuples
        const atoms = this.instanceData.getAtoms();
        const univRelation: Tuple[] = [];
        
        for (const atom of atoms) {
          let atomValue: SingleValue = atom.id;
          // Convert numeric and boolean strings to their actual types
          if (this.isConvertibleToNumber(atomValue)) {
            atomValue = Number(atomValue);
          } else if (this.isConvertibleToBoolean(atomValue)) {
            atomValue = this.convertToBoolean(atomValue);
          }
          univRelation.push([atomValue]);
        }
        
        return univRelation;
      }
      // A double-quoted string literal. This is the ONLY way to write a string,
      // so `"Black"` is a string regardless of whether the instance happens to
      // contain a sig or atom named Black.
      if (constant.STRING_TOK() !== undefined) {
        return unquoteStringLiteral(constant.STRING_TOK()!.text);
      }
      // Handle boolean constants
      if (constant.text === 'true') {
        return true;
      }
      if (constant.text === 'false') {
        return false;
      }
      return `${constant.text}`;
    }
    if (ctx.qualName()) {
      return this.visitQualName(ctx.qualName()!);
    }
    if (ctx.AT_TOK()) {
      throw new Error("`@` operator is Alloy specific; it is not supported by Forge!");
    }
    if (ctx.BACKQUOTE_TOK()) {
      const name = this.visitChildren(ctx);
      results.push(["**UNIMPLEMENTED** Backquoted Name (`` `x` ``)"]);

      // TODO: implement this using name and then return the result
      return results;
    }
    if (ctx.THIS_TOK()) {
      throw new Error("`this` is Alloy specific; it is not supported by Forge!");
    }
    if (ctx.LEFT_CURLY_TOK()) {
      // first, we need to get the variables from the quantDeclList
      if (ctx.quantDeclList() === undefined) {
        throw new Error("expected a quantDeclList in the set comprehension!");
      }

      const quantifierFreeVars = this.freeVariableFinder.visit(ctx);
      this.updateFreeVariables(quantifierFreeVars);

      const varQuantifiedSets = this.getQuantDeclListValues(
        ctx.quantDeclList()!
      );

      // NOTE: this doesn't support the situation in which blockOrBar is a block
      // here (DISCUSS WITH Tim)
      const blockOrBar = ctx.blockOrBar();
      if (blockOrBar === undefined) {
        throw new Error("expected a blockOrBar in the set comprehension!");
      }
      if (
        blockOrBar.BAR_TOK() === undefined ||
        blockOrBar.expr() === undefined
      ) {
        throw new Error("expected a bar followed by an expr in the set comprehension!");
      }
      const barExpr = blockOrBar.expr()!;

      const varNames: string[] = [];
      const quantifiedSets: Tuple[][] = [];
      for (const varName in varQuantifiedSets) {
        varNames.push(varName);
        quantifiedSets.push(varQuantifiedSets[varName]);
      }
      
      // Try to optimize numeric comparisons (same optimization as in quantifiers)
      // Note: Set comprehensions don't support the 'disj' keyword, so we don't check for it here.
      // Quantifiers do support 'disj', so they check !isDisjoint before optimizing.
      let product: Tuple[];
      let useOptimizedPath = false;
      
      if (varNames.length >= 2 && areAllNumericSets(quantifiedSets)) {
        // Try to detect and optimize numeric comparison patterns
        const pattern = detectNumericComparisonPattern(barExpr, varNames);
        if (pattern && pattern.type !== 'none') {
          // Use optimized combination generation
          product = generateOptimizedNumericCombinations(varNames, quantifiedSets, pattern);
          useOptimizedPath = true;
        } else {
          // Fall back to standard cartesian product
          product = getCombinations(quantifiedSets);
        }
      } else {
        // Fall back to standard cartesian product
        product = getCombinations(quantifiedSets);
      }

      const result: Tuple[] = [];

      // Optimize: create environment once and reuse it
      const quantDeclEnv: Environment = {
        env: {},
        type: "quantDecl",
      };
      this.environmentStack.push(quantDeclEnv);

      for (let i = 0; i < product.length; i++) {
        const tuple = product[i];
        // Update environment values in place
        for (let j = 0; j < varNames.length; j++) {
          quantDeclEnv.env[varNames[j]] = tuple[j];
        }

        // If we used the optimized path, we can skip constraint evaluation
        // since the combinations already satisfy the constraint
        let barExprValue: boolean;
        if (useOptimizedPath) {
          barExprValue = true;
        } else {
          // now, we want to evaluate the barExpr
          const evalResult = this.visit(barExpr);
          if (!isBoolean(evalResult)) {
            throw new Error("Expected the expression after the bar to be a boolean value!");
          }
          barExprValue = evalResult;
        }
        
        if (barExprValue) {
          // will error if not boolean val, which we want
          result.push(tuple);
        }
      }

      this.environmentStack.pop();
      
      // Deduplicate results to ensure set semantics
      return deduplicateTuples(result);
    }
    if (ctx.LEFT_PAREN_TOK()) {
      // NOTE: we just return the result of evaluating the expr that is inside
      // the parentheses; need to do some testing to ensure that this is working
      // in a wide range of situations (worked fine on some initial tests)
      return this.visit(ctx.expr()!);
    }
    if (ctx.block()) {
      // NOTE: not sure if there are any situations in which we actually get here
      // (couldn't find any yet)
      return this.visitBlock(ctx.block()!);
    }
    if (ctx.sexpr()) {
      throw new Error("**NOT IMPLEMENTING FOR NOW** S-Expression");
    }

    return this.visitChildren(ctx);
  }

  visitExprList(ctx: ExprListContext): EvalResult {
    //console.log('visiting exprList:', ctx.text);
    let results: EvalResult = [];

    if (ctx.COMMA_TOK()) {
      const headValue = this.visit(ctx.expr());
      if (ctx.exprList() === undefined) {
        throw new Error("exprList with a comma must have a tail!");
      }
      const tailValues = this.visit(ctx.exprList()!);
      //console.log('headValue:', headValue);
      //console.log('tailValues:', tailValues);

      // this isn't necessarily correct; just trying to get something that would
      // work for things like add, subtract, predicate calls for now
      if (isSingleValue(headValue)) {
        results.push([headValue]);
      } else {
        results = headValue;
      }
      if (isTupleArray(tailValues)) {
        results = results.concat(tailValues);
      } else {
        results.push([tailValues]);
      }
      return results;
    }

    return this.visitChildren(ctx);
  }

  visitName(ctx: NameContext): EvalResult {
    // console.log('visiting name:', ctx.text);

    // if `true` or `false`, return the corresponding value
    const identifier = getIdentifierName(ctx);

    if (identifier === "true") {
      return true;
    }
    if (identifier === "false") {
      return false;
    }


    // need to look through the environment. we need to go through the environment
    // backwards from the latest frame, and we can keep going to the previous
    // frame until we encounter a predArgs frame. If we encounter a predArg
    // frame we can't go further back
    for (let i = this.environmentStack.length - 1; i >= 0; i--) {
      const currEnv = this.environmentStack[i];
      if (currEnv.env[identifier] !== undefined) {
        return currEnv.env[identifier];
      }

      if (currEnv.type === "predArgs") {
        break; // can't go further back
      }
    }

    let result: EvalResult | undefined = undefined;

    // check if this is a type
    const typeNames = this.instanceData.getTypes().map(
      (t) => t.id
    );
    if (typeNames.includes(identifier)) {
      const typeAtoms = this.instanceData.getTypes().find(t => t.id === identifier)?.atoms || [];
      // Deduplicate atoms by ID to handle data sources with duplicate entries
      const uniqueAtomIds = new Set<string>();
      const desiredValues: SingleValue[] = [];
      for (const atom of typeAtoms) {
        if (!uniqueAtomIds.has(atom.id)) {
          uniqueAtomIds.add(atom.id);
          desiredValues.push(atom.id);
        }
      }
      result = desiredValues.map((singleValue) => [singleValue]);
    }

    for (const typeObj of this.instanceData.getTypes()) {
      const atomIds = typeObj.atoms.map((atom: IAtom) => atom.id);
      if (atomIds.includes(identifier)) {
        result = [[identifier]];
        break;
      }
    }


    const instanceTypeIds = this.instanceData.getTypes().map(
      (t) => t.id
    );

    // check if this is a parent type
    // we will need some kind of tree-search approach to check this: for example, in the TTT
    // example, the query "Player" should return "((X0) (O0))", and we can figure this out
    // from the instance by looking at the fact that in the object for the X type, the
    // type field is an array with 2 values: 'X', and 'Player'.
    // Presumably, for a query like "Player", we will need to look through
    // all the types with Player as a parent, and then all the types with these types as
    // a parent (essentially a basic tree search) and use that to populate the result.
    const toSearch = [identifier];
    const visited = new Set<string>();

    while (toSearch.length > 0) {
      const currSearch = toSearch.pop();
      if (currSearch === undefined) {
        throw new Error("unexpected error: no identifier could be searched!");
      }
      if (visited.has(currSearch)) continue;
      visited.add(currSearch);

      for (const typeObj of this.instanceData.getTypes()) {
        // If currSearch is a parent of typeObj (i.e., typeObj.types includes currSearch)
        if (typeObj.id === currSearch) continue; // skip self
        if (typeObj.types && typeObj.types.includes(currSearch)) {
          if (result === undefined) result = [];
          for (const atom of typeObj.atoms) {
            result.push([atom.id]);
          }
          toSearch.push(typeObj.id);
        }
      }
    }

    // end of type search

    // check if it is a relation - use cache for faster lookups
    this.buildRelationCache();
    if (this.relationCache!.has(identifier)) {
      return this.relationCache!.get(identifier)!;
    }

    if (result !== undefined) {
      result = result.map((tuple) =>
        tuple.map((value) =>
          this.isConvertibleToNumber(value) ? Number(value) : value
        )
      );
      result = result.map((tuple) =>
        tuple.map((value) => this.isConvertibleToBoolean(value) ? this.convertToBoolean(value) : value)
      );
      return result;
    }

    // return identifier;
    if (SUPPORTED_BUILTINS.includes(identifier)) {
      return identifier;
    }

    // Nothing in this instance answers to this name. Report it and evaluate to
    // the empty relation rather than throwing: a selector is authored against a
    // model but run against instances that vary, and a sig that is empty in this
    // instance is absent from the instance data entirely. See
    // `reportUnresolvedName`.
    //
    // Note this is NOT how string literals are written — use `"..."`.
    this.reportUnresolvedName(identifier);
    return [];
  }

  visitQualName(ctx: QualNameContext): EvalResult {
    // NOTE: this currently only supports Int; doesn't support other branches
    // of the qualName nonterminal
    //console.log('visiting qualName:', ctx.text);

    // `sum` has its own token, so unlike the other builtins it never reaches
    // visitName -- without this, `sum[e]` box-joins a relation named `sum`,
    // which no instance has, and quietly yields the empty set.
    if (ctx.SUM_TOK()) {
      return "sum";
    }


    //// SP: Commented out this optimization for now///
    // if (ctx.INT_TOK()) {
    //   const intVals = this.instanceData.types.Int.atoms.map((atom: IAtom) => [Number(atom.id)]);
    //   return intVals;
    // }
    if (ctx.INT_TOK()) {
      // Find the type object for "Int" using getTypes()
      const intType = this.instanceData.getTypes().find(t => t.id === "Int");
      if (!intType) {
        throw new Error('Type "Int" not found in instance data');
      }
      // Deduplicate atoms by ID to handle data sources with duplicate entries
      const uniqueAtomIds = new Set<string>();
      const intVals: Tuple[] = [];
      for (const atom of intType.atoms) {
        if (!uniqueAtomIds.has(atom.id)) {
          uniqueAtomIds.add(atom.id);
          intVals.push([Number(atom.id)]);
        }
      }
      return intVals;
    }

    return this.visitChildren(ctx);
  }

  private evaluateBinaryOperation(
    operation: typeof SUPPORTED_BINARY_BUILTINS[number],
    args: EvalResult
  ): number {
    if (isSingleValue(args)) {
      throw new Error(`Expected 2 arguments for ${operation}`);
    }

    let arg1: number;
    if (Array.isArray(args[0])) {
      if (!isNumber(args[0][0])) {
        throw new Error(`Expected a number for the first argument of ${operation}`);
      }
      arg1 = args[0][0];
    } else {
      if (!isNumber(args[0])) {
        throw new Error(`Expected a number for the first argument of ${operation}`);
      }
      arg1 = args[0];
    }

    let arg2: number;
    if (Array.isArray(args[1])) {
      if (!isNumber(args[1][0])) {
        throw new Error(`Expected a number for the second argument of ${operation}`);
      }
      arg2 = args[1][0];
    } else {
      if (!isNumber(args[1])) {
        throw new Error(`Expected a number for the second argument of ${operation}`);
      }
      arg2 = args[1];
    }

    // Handle division by zero for divide and remainder
    if ((operation === "divide" || operation === "remainder") && arg2 === 0) {
      throw new Error("Division by zero is not allowed");
    }

    // Perform the operation
    let result: number;
    switch (operation) {
      case "add":
        result = arg1 + arg2;
        break;
      case "subtract":
        result = arg1 - arg2;
        break;
      case "multiply":
        result = arg1 * arg2;
        break;
      case "divide":
        result = arg1 / arg2; // Real (floating-point) division
        break;
      case "remainder":
        result = arg1 % arg2;
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
    return result;
  }

  private evaluateUnaryOperation(
    operation: typeof SUPPORTED_UNARY_BUILTINS[number],
    args: EvalResult
  ): number {



    const v = extractNumber(args);
    if (v === undefined) {
      throw new Error(`Expected 1 argument for ${operation} that evaluates to a number.`);
    }

    // Possible unary operations:
    //abs[]:   returns the absolute value of value
    //sign[]:  returns 1 if value is > 0, 0 if value is 0, and -1 if value is < 0
    //floor[]: rounds value down to the nearest integer
    //ceil[]:  rounds value up to the nearest integer

    if (operation === "abs") {
      return Math.abs(v);
    }
    else if (operation === "sign") {
      if (v > 0) {
        return 1;
      } else if (v < 0) {
        return -1;
      } else {
        return 0;
      }
    }
    else if (operation === "floor") {
      return Math.floor(v);
    }
    else if (operation === "ceil") {
      return Math.ceil(v);
    } else {
      throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  // Resolve one element of a set-builtin argument to a number. An integer can
  // reach here as a string -- atom ids are strings, and `@:` projects a label,
  // so `@:(x.value)` yields "12" rather than 12 -- so a string that names a
  // number is one, following the same convention as the `univ` branch.
  private setOperandAsNumber(
    operation: typeof SUPPORTED_SET_BUILTINS[number],
    value: SingleValue
  ): number {
    if (isNumber(value)) {
      return value;
    }
    if (isString(value) && this.isConvertibleToNumber(value)) {
      return Number(value);
    }
    throw new Error(
      `${operation} expects all elements to be numbers, got: ${JSON.stringify(value)}`
    );
  }

  private evaluateSetOperation(
    operation: typeof SUPPORTED_SET_BUILTINS[number],
    args: EvalResult
  ): number {
    // min, max and sum operate on a set of integers and return a single value.
    // The argument should be a set (tuple array of arity 1) of numbers

    let numbers: number[] = [];

    if (isSingleValue(args)) {
      numbers = [this.setOperandAsNumber(operation, args)];
    } else if (isTupleArray(args)) {
      // Extract numbers from the tuple array
      for (const tuple of args) {
        if (tuple.length !== 1) {
          throw new Error(`${operation} expects a set of arity 1 (single column)`);
        }
        numbers.push(this.setOperandAsNumber(operation, tuple[0]));
      }
    } else {
      throw new Error(`Expected a set of numbers for ${operation}`);
    }

    // The empty sum is 0. min and max of an empty set have no value at all,
    // so they still refuse it.
    if (operation === "sum") {
      return numbers.reduce((total, value) => total + value, 0);
    }

    if (numbers.length === 0) {
      throw new Error(`${operation} requires a non-empty set`);
    }

    if (operation === "min") {
      return Math.min(...numbers);
    } else if (operation === "max") {
      return Math.max(...numbers);
    } else {
      throw new Error(`Unsupported set operation: ${operation}`);
    }
  }
}

// Custom error for undefined names
export class NameNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NameNotFoundError";
  }
}
