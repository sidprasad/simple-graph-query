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
import { IAtom, IDataInstance, ITuple, IRelation } from "./types";
import { isArray } from "lodash";
import {
  ForgeExprFreeVariableFinder,
  FreeVariables,
} from "./ForgeExprFreeVariableFinder";
import { ParseTree } from "antlr4ts/tree/ParseTree";

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

function areTuplesEqual(a: Tuple, b: Tuple): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}

function isTupleArraySubset(a: Tuple[], b: Tuple[]): boolean {
  return a.every((tupleA) =>
    b.some((tupleB) => areTuplesEqual(tupleA, tupleB))
  );
}

export function areTupleArraysEqual(a: Tuple[], b: Tuple[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return isTupleArraySubset(a, b) && isTupleArraySubset(b, a);
}

function deduplicateTuples(tuples: Tuple[]): Tuple[] {
  const result: Tuple[] = [];
  for (const tuple of tuples) {
    if (!result.some((existing) => areTuplesEqual(existing, tuple))) {
      result.push(tuple);
    }
  }
  return result;
}

function getCombinations(arrays: Tuple[][]): Tuple[] {
  // first, turn each string[][] into a string[] by flattening
  const valueSets: SingleValue[][] = arrays.map((tuple) => tuple.flat());

  // now, recursively compute the cartesian product
  function cartesianProduct(arrays: SingleValue[][]): Tuple[] {
    if (arrays.length === 0) return [[]];
    const [first, ...rest] = arrays;
    const restProduct = cartesianProduct(rest);
    return first.flatMap((value) =>
      restProduct.map((product) => [value, ...product])
    );
  }

  return cartesianProduct(valueSets);
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

  // perform BFS from each node to get the transitive closure
  // NOTE: we use Set<string> instead of Set<[SingleValue, SingleValue]> since
  // TS would compute equality over the object's reference instead of the value
  // when the value is an array
  const transitiveClosure = new Set<string>();
  for (const start of graph.keys()) {
    const visited = new Set<SingleValue>();
    const queue: SingleValue[] = [...(graph.get(start) ?? [])];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      transitiveClosure.add(JSON.stringify([start, current]));

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

  // convert the result back to a Tuple[] and return
  return Array.from(transitiveClosure).map((pair) => JSON.parse(pair));
}

function dotJoin(left: EvalResult, right: EvalResult): EvalResult {
  const leftExpr = isSingleValue(left) ? [[left]] : left;
  const rightExpr = isSingleValue(right) ? [[right]] : right;

  const result: Tuple[] = [];
  leftExpr.forEach((leftTuple) => {
    rightExpr.forEach((rightTuple) => {
      if (leftTuple[leftTuple.length - 1] === rightTuple[0]) {
        result.push([
          ...leftTuple.slice(0, leftTuple.length - 1),
          ...rightTuple.slice(1),
        ]);
      }
    });
  });

  if (result.some(tuple => tuple.length === 0)) {
    throw new Error("Join would create a relation of arity 0");
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
const SUPPORTED_UNARY_BUILTINS: string[] = ["abs", "sign"];

export const SUPPORTED_BUILTINS = SUPPORTED_BINARY_BUILTINS.concat(
  SUPPORTED_UNARY_BUILTINS
);

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
  private cachedResults: Map<ParseTree, Map<string, EvalResult>> = new Map();

  private instanceData: IDataInstance;

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
    return keys.map((key) => `${key}=${freeVarValues[key]}`).join("|");
  }

  // helper function to get the label for a value (used for @: operator)
  private getLabelForValue(value: SingleValue): SingleValue {
    // For primitive values (numbers, booleans), the label is the value itself
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    
    // For string values, try to find the corresponding atom and return its label
    if (typeof value === "string") {
      // Search through all types and atoms to find the matching atom ID
      for (const type of this.instanceData.getTypes()) {
        for (const atom of type.atoms) {
          if (atom.id === value) {
            // If the atom has a label field, return it; otherwise return the ID
            return atom.label !== undefined ? atom.label : atom.id;
          }
        }
      }
      // If no atom found, the value itself is the label (for string literals)
      return value;
    }
    
    // Fallback: return the value itself
    return value;
  }

  // helper function
  private cacheResult(ctx: ParseTree, freeVarsKey: string, result: EvalResult) {
    if (!this.cachedResults.has(ctx)) {
      this.cachedResults.set(ctx, new Map());
    }
    this.cachedResults.get(ctx)!.set(freeVarsKey, result);
  }

  // helper function
  private getIden(): Tuple[] {
    const instanceTypes = this.instanceData.getTypes();
    const result: Tuple[] = [];
    for (const t of instanceTypes) {
      const typeAtoms = t.atoms;
      typeAtoms.forEach((atom : IAtom) => {
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
      if (this.cachedResults.get(ctx)!.has(freeVarsKey)) {
        // cache hit!
        // console.log('cache hit for ctx:', ctx.text);
        // console.log('freeVarsKey:', freeVarsKey);
        // console.log('cachedResults:', this.cachedResults.get(ctx));
        return this.cachedResults.get(ctx)!.get(freeVarsKey)!;
      }
    }
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
      const product: Tuple[] = getCombinations(quantifiedSets);

      const result: Tuple[] = [];

      let foundTrue = false;
      let foundFalse = false;

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
        const quantDeclEnv: Environment = {
          env: {},
          type: "quantDecl",
        };
        for (let j = 0; j < varNames.length; j++) {
          const varName = varNames[j];
          const varValue = tuple[j];
          quantDeclEnv.env[varName] = varValue;
        }

        this.environmentStack.push(quantDeclEnv);

        // now, we want to evaluate the barExpr
        const barExprValue = this.visit(barExpr);
        if (!isBoolean(barExprValue)) {
          throw new Error(
            "Expected the expression after the bar to be a boolean!"
          );
        }
        if (barExprValue) {
          result.push(tuple);
          foundTrue = true;
        } else {
          foundFalse = true;
        }

        this.environmentStack.pop();

        // short-circuit if possible
        if (ctx.quant()!.ALL_TOK() && foundFalse) {
          const value = false;
          this.cacheResult(ctx, freeVarsKey, value);
          return value;
        }
        if (ctx.quant()!.NO_TOK() && foundTrue) {
          const value = false;
          this.cacheResult(ctx, freeVarsKey, value);
          return value;
        }
        if (ctx.quant()!.mult()) {
          const multExpr = ctx.quant()!.mult()!;
          if (multExpr.LONE_TOK() && result.length > 1) {
            const value = false;
            this.cacheResult(ctx, freeVarsKey, value);
            return value;
          }
          if (multExpr.SOME_TOK() && foundTrue) {
            const value = true;
            this.cacheResult(ctx, freeVarsKey, value);
            return value;
          }
          if (multExpr.ONE_TOK() && result.length > 1) {
            const value = false;
            this.cacheResult(ctx, freeVarsKey, value);
            return value;
          }
        }
      }

      if (ctx.quant()!.ALL_TOK()) {
        const value = !foundFalse;
        this.cacheResult(ctx, freeVarsKey, value);
        return value;
      } else if (ctx.quant()!.NO_TOK()) {
        const value = !foundTrue;
        this.cacheResult(ctx, freeVarsKey, value);
        return value;
      } else if (ctx.quant()!.mult()) {
        const multExpr = ctx.quant()!.mult()!;
        if (multExpr.LONE_TOK()) {
          const value = result.length <= 1;
          this.cacheResult(ctx, freeVarsKey, value);
          return value;
        } else if (multExpr.SOME_TOK()) {
          const value = foundTrue;
          this.cacheResult(ctx, freeVarsKey, value);
          return value;
        } else if (multExpr.ONE_TOK()) {
          const value = result.length === 1;
          this.cacheResult(ctx, freeVarsKey, value);
          return value;
        } else if (multExpr.TWO_TOK()) {
          throw new Error("**NOT IMPLEMENTING FOR NOW** Two (`two`)");
        }
      }
      // TODO: don't have support for SUM_TOK yet
    }

    // TODO: fix this!
    const childrenResults = this.visitChildren(ctx);
    //console.log('childrenResults in expr:', childrenResults);
    if (results === undefined) {
      //console.log('returning childrenResults in expr:', childrenResults);
      this.cacheResult(ctx, freeVarsKey, childrenResults);
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
    this.cacheResult(ctx, freeVarsKey, results);
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
      if (!leftChildValue) {
        // short circuit if the antecedent is false
        return true;
      }

      const rightChildValue = this.visit(ctx.expr3()![0]);
      // TODO: add support for ELSE_TOK over here
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
          // this should be true if the left value is equal to the right value,
          // or a subset of it
          if (isTupleArray(leftChildValue) && isTupleArray(rightChildValue)) {
            if (areTupleArraysEqual(leftChildValue, rightChildValue)) {
              results = true;
            } else {
              // check if left is subset of right
              results = isTupleArraySubset(leftChildValue, rightChildValue);
            }
          } else if (isTupleArray(rightChildValue)) {
            results = rightChildValue.some(
              (tuple) => tuple.length === 1 && tuple[0] === leftChildValue
            );
          } else {
            // left is a tuple array but right is a single value, so false
            results = false;
          }
          break;
        case "is":
          throw new Error("**NOT IMPLEMENTING FOR NOW** Type Check (`is`)");
        case "ni":
          results.push(["**UNIMPLEMENTED** Set Non-Membership (`ni`)"]);
          // TODO: implement this using leftValue and rightValue
          //       for now, just returning over here. what we need to do instead
          //       is to implement this, set the value of results to what we get
          //       from this, and then call break (so that we can negate before
          //       returning the final value, if required)
          return results;
          break; // redundant, but it won't be once we implement the TODO above
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
      throw new Error("**NOT IMPLEMENTING FOR NOW** Set (`set`)");
    }
    if (ctx.ONE_TOK()) {
      return isTupleArray(childrenResults) && childrenResults.length === 1;
    }
    if (ctx.TWO_TOK()) {
      throw new Error("**NOT IMPLEMENTING FOR NOW** Two (`two`)");
    }
    if (ctx.NO_TOK()) {
      return isTupleArray(childrenResults) && childrenResults.length === 0;
    }
    if (ctx.SOME_TOK()) {
      return isTupleArray(childrenResults) && childrenResults.length > 0;
    }
    if (ctx.LONE_TOK()) {
      return isTupleArray(childrenResults) && childrenResults.length <= 1;
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
        return [[leftChildValue], [rightChildValue]];
      } else if (isSingleValue(leftChildValue) && isTupleArray(rightChildValue)) {
        if (rightChildValue.length === 0) {
          return leftChildValue;
        }
        if (rightChildValue[0].length === 1) {
          return deduplicateTuples([[leftChildValue], ...rightChildValue]);
        }
        throw new Error("arity mismatch in set union!");
      } else if (isTupleArray(leftChildValue) && isSingleValue(rightChildValue)) {
        if (leftChildValue.length === 0) {
          return rightChildValue;
        }
        if (leftChildValue[0].length === 1) {
          return deduplicateTuples([...leftChildValue, [rightChildValue]]);
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
          return deduplicateTuples([...leftChildValue, ...rightChildValue]);
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
          return leftChildValue.filter(
            (tuple) => !rightChildValue.some((rightTuple) => areTuplesEqual(tuple, rightTuple)));
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
      if (!isTupleArray(childrenResults)) {
        throw new Error("The cardinal operator must be applied to a set of tuples!");
      }
      return childrenResults.length;
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
          return leftChildValue.filter((tuple) =>
            rightChildValue.some((rightTuple) => areTuplesEqual(tuple, rightTuple))
          );
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
      }

        // Box join: <expr-a>[<expr-b>] == <expr-b> . <expr-a>
      return dotJoin(insideBracesExprs, beforeBracesExpr);
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
      // console.log('beforeExpr:', beforeDotExpr);
      // console.log('afterExpr:', afterDotExpr);

      return dotJoin(beforeDotExpr, afterDotExpr);
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

    // Handle @: operator FIRST, before visitChildren
    if (ctx.GET_LABEL_TOK()) {
      // @: operator - get label for value
      // For @: operator, we need to handle unknown identifiers specially
      const innerExpr = ctx.expr17();
      if (!innerExpr) {
        throw new Error("@: operator requires an expression");
      }
      
      try {
        const innerResult = this.visit(innerExpr);
        
        // Special case: if result is empty array, it means unknown identifier, so use the text
        if (isTupleArray(innerResult) && innerResult.length === 0) {
          return innerExpr.text;
        }
        
        if (isSingleValue(innerResult)) {
          return this.getLabelForValue(innerResult);
        } else if (isTupleArray(innerResult)) {
          // For single-element tuple arrays, return the label of the element
          if (innerResult.length === 1 && innerResult[0].length === 1) {
            return this.getLabelForValue(innerResult[0][0]);
          }
          // For multi-element cases, apply getLabelForValue to each tuple element
          return innerResult.map((tuple) => 
            tuple.map((value) => this.getLabelForValue(value))
          );
        }
        throw new Error("@: operator can only be applied to single values or tuple arrays");
      } catch (error) {
        // If evaluation fails due to unknown identifier, use the text as the label
        if (error instanceof NameNotFoundError) {
          // Extract the identifier from the inner expression
          // The inner expression might be "(black)" so we need to get the actual identifier
          let identifierText = innerExpr.text;
          if (identifierText.startsWith('(') && identifierText.endsWith(')')) {
            identifierText = identifierText.slice(1, -1);
          }
          return identifierText;
        }
        throw error;
      }
    }

    const childrenResults = this.visitChildren(ctx);
    //console.log('visitChildren result for', ctx.text, ':', childrenResults);

    if (ctx.TILDE_TOK()) {
      // this flips the order of the elements in the tuples of a relation if
      // the relation has arity 2
      if (isTupleArray(childrenResults) && childrenResults.length > 0 && childrenResults[0].length === 2) {
        return childrenResults.map((tuple) => [tuple[1], tuple[0]]);
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
        return deduplicateTuples([...idenResult, ...transitiveClosureResult]);
      }
    }

    return childrenResults;
  }

  // helper function to get a list of names from a nameList
  getNameListValues(ctx: NameListContext): string[] {
    if (ctx.COMMA_TOK()) {
      // there is a comma, so we need to get the value from the head of the list
      // and then move onto the tail after that
      const headValue = ctx.name().text;
      const tailValues = this.getNameListValues(ctx.nameList()!);
      return [headValue, ...tailValues];
    } else {
      // there is no comma so there is just a single name that we need to deal with here
      return [ctx.name().text];
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
      const product: Tuple[] = getCombinations(quantifiedSets);

      const result: Tuple[] = [];

      for (let i = 0; i < product.length; i++) {
        const tuple = product[i];
        const quantDeclEnv: Environment = {
          env: {},
          type: "quantDecl",
        };
        for (let j = 0; j < varNames.length; j++) {
          const varName = varNames[j];
          const varValue = tuple[j];
          quantDeclEnv.env[varName] = varValue;
        }

        this.environmentStack.push(quantDeclEnv);

        // now, we want to evaluate the barExpr
        const barExprValue = this.visit(barExpr);
        if (!isBoolean(barExprValue)) {
          throw new Error("Expected the expression after the bar to be a boolean value!");
        }
        if (barExprValue) {
          // will error if not boolean val, which we want
          result.push(tuple);
        }

        this.environmentStack.pop();
      }

      return result;
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
    const identifier = ctx.IDENTIFIER_TOK().text;

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
      const desiredValues: SingleValue[] = typeAtoms.map(
        (atom: IAtom) => atom.id
      );
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

    // defining 3 helper functions here; not for use elsewhere
    const isConvertibleToNumber = (value: SingleValue) => {
      if (typeof value === "number") {
        return true;
      }
      if (typeof value === "string") {
        return !isNaN(Number(value));
      }
      return false;
    };

    const isConvertibleToBoolean = (value: SingleValue) => {
      if (typeof value === "boolean") {
        return true;
      }
      if (typeof value === "string") {
        return (value === "true" || value === "#t" || value === "false" || value === "#f");
      }
      return false;
    };

    const convertToBoolean = (value: SingleValue) => {
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
    };
    // end of 3 helper functions

    // check if it is a relation
    const relations = this.instanceData.getRelations();
    for (const relation of relations) {
      if (relation.name === identifier) {
        let relationAtoms: Tuple[] = relation.tuples.map((tuple: ITuple) => tuple.atoms);

        relationAtoms = relationAtoms.map((tuple) =>
          tuple.map((value) =>
            isConvertibleToNumber(value) ? Number(value) : value
          )
        );
        relationAtoms = relationAtoms.map((tuple) =>
          tuple.map((value) => isConvertibleToBoolean(value) ? convertToBoolean(value) : value)
        );
        return relationAtoms;
      }
    }

    if (result !== undefined) {
      result = result.map((tuple) =>
        tuple.map((value) =>
          isConvertibleToNumber(value) ? Number(value) : value
        )
      );
      result = result.map((tuple) =>
        tuple.map((value) => isConvertibleToBoolean(value) ? convertToBoolean(value) : value)
      );
      return result;
    }

    // return identifier;
    if ( SUPPORTED_BUILTINS.includes(identifier)) {
      return identifier;
    }
    
    throw new NameNotFoundError(`bad name ${identifier} referenced!`);
  }

  visitQualName(ctx: QualNameContext): EvalResult {
    // NOTE: this currently only supports Int; doesn't support other branches
    // of the qualName nonterminal
    //console.log('visiting qualName:', ctx.text);


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
      const intVals = intType.atoms.map((atom: IAtom) => [Number(atom.id)]);
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
    if (isArray(args[0])) {
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
    if (isArray(args[1])) {
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
        result = Math.floor(arg1 / arg2); // Integer division
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



    if (!isSingleValue(args) || !isNumber(args)) {
      throw new Error(`Expected 1 argument for ${operation} that evaluates to a number.`);
    }

    let v = args;

    // Possible unary operations:
    //abs[]: returns the absolute value of value
    //sign[]: returns 1 if value is > 0, 0 if value is 0, and -1 if value is < 0

    if (operation === "abs") {
      let res = Math.abs(v);
      // Now adjust to the bitwidth
      return res;
    }
    else if (operation === "sign") {
      if (v > 0) {
        return 1;
      } else if (v < 0) {
        return -1;
      } else {
        return 0;
      }
    } else {
      throw new Error(`Unsupported operation: ${operation}`);
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
