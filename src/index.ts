import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ForgeParser, ExprContext, PredDeclContext } from './forge-antlr/ForgeParser';
import { ForgeLexer } from './forge-antlr/ForgeLexer';
import { ForgeListenerImpl } from './forge-antlr/ForgeListenerImpl';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';
import { Diagnostic, EvalResult, ForgeExprEvaluator, NameNotFoundError } from './ForgeExprEvaluator';
import { ForgeExprStaticAnalyzer, StaticAnalysis } from './ForgeExprStaticAnalyzer';
import { IDataInstance, IForgeSchema, IAtom, IRelation, ITuple, IType } from './types';
import { ParseErrorListener } from './errorListener';

export type ErrorResult = {
  error: Error;
  stackTrace?: string;
}
export type EvaluationResult = EvalResult | ErrorResult;

function createForgeParser(input: string): ForgeParser {
  const inputStream = CharStreams.fromString(input);
  const lexer = new ForgeLexer(inputStream);
  // Without a throwing listener on the LEXER, an unlexable character (e.g. a
  // stray `'`, which is no longer a token now that primes are gone) is
  // reported to the console and silently skipped, and the query evaluates as
  // if it were never there. Reject it like any other syntax error instead.
  lexer.removeErrorListeners();
  lexer.addErrorListener(new ParseErrorListener());
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new ForgeParser(tokenStream);
  parser.buildParseTree = true;
  parser.removeErrorListeners();
  parser.addErrorListener(new ParseErrorListener());
  return parser;
}

/**
 * Evaluates Forge expressions against an `IDataInstance`.
 *
 * ## Caching contract (important for correctness)
 *
 * For performance, this class caches an inner evaluator (with its relation
 * index and subexpression cache) across `evaluateExpression` calls. The
 * cache is invalidated when the `datum` field is reassigned to a different
 * reference, but **not** when the underlying `IDataInstance` is mutated in
 * place (e.g. adding/removing atoms or tuples on the same object).
 *
 * If you mutate the underlying data in place, you **must** call
 * {@link invalidate} (or reassign `datum` to a new object) before the next
 * `evaluateExpression` call. Otherwise queries may return stale results.
 *
 * Recommended patterns:
 *  - Treat `IDataInstance` as immutable; create a new instance on data
 *    changes and construct a new `SimpleGraphQueryEvaluator` (or assign to
 *    `.datum`).
 *  - Or, if you mutate in place, call `invalidate()` after each mutation
 *    batch.
 */
export class SimpleGraphQueryEvaluator {

  /**
   * The data instance evaluated against. Reassigning this field is a
   * supported invalidation signal — the inner evaluator cache is rebuilt
   * on the next `evaluateExpression` call. **In-place mutation of the
   * existing object is NOT detected**; call {@link invalidate} in that
   * case.
   */
  datum: IDataInstance;
  forgeListener : ForgeListenerImpl = new ForgeListenerImpl();
  walker : ParseTreeWalker = new ParseTreeWalker();
  // Cache for parsed expressions to avoid re-parsing the same expression
  private parseTreeCache: Map<string, ExprContext> = new Map();

  // Cached inner evaluator. Reused across evaluateExpression calls so its
  // relation cache / relation index / subexpression cache survive between
  // calls. Invalidated when the `datum` reference changes, or explicitly
  // via `invalidate()`. NOT invalidated by in-place mutation of the
  // underlying IDataInstance -- callers must signal that themselves.
  private cachedEvaluator: ForgeExprEvaluator | null = null;
  private cachedEvaluatorDatum: IDataInstance | null = null;

  // Diagnostics from the most recent evaluateExpression call. Kept here rather
  // than read back off the evaluator, because a failed evaluation discards the
  // evaluator — and a query that warns and *then* errors is exactly when the
  // warning is most worth keeping.
  private lastDiagnostics: Diagnostic[] = [];

  constructor(datum: IDataInstance) {
    this.datum = datum;
  }

  /**
   * Discard the cached inner evaluator (and its relation index /
   * subexpression cache). Call this after mutating the underlying
   * `IDataInstance` in place, so the next `evaluateExpression` sees the
   * updated data.
   *
   * Cheap: just nulls a couple of references. The caches rebuild lazily
   * on the next query.
   */
  invalidate(): void {
    this.cachedEvaluator = null;
    this.cachedEvaluatorDatum = null;
  }


  getExpressionParseTree(forgeExpr: string) {
    const parser = createForgeParser(forgeExpr);
    const tree = parser.parseExpr();

    // TODO: Is this wrong?
    if (!tree || tree.childCount === 0) {
      throw new Error(`Parse error in ${forgeExpr}`);
    }

    //////// This is empty on parse error? //TODO//////
    return tree;
  }



  /**
   * Evaluate `forgeExpr` and return both its value and any diagnostics raised
   * along the way.
   *
   * Diagnostics are advisory and never change the value — today the only kind
   * is an unresolved name, which evaluates to the empty set. Consumers should
   * surface them to whoever authored the query; see {@link Diagnostic}.
   *
   * Note that an unresolved name is a warning rather than an error on purpose.
   * An instance carries only populated types and relations, so a sig that is
   * empty here looks exactly like a typo, and a sig can empty out between
   * frames of one trace. Deciding which it is needs context this library does
   * not have.
   */
  evaluateExpressionWithDiagnostics(
    forgeExpr: string
  ): { value: EvaluationResult; diagnostics: Diagnostic[] } {
    const value = this.evaluateExpression(forgeExpr);
    return { value, diagnostics: this.lastDiagnostics };
  }

  evaluateExpression(forgeExpr: string): EvaluationResult {

    // Check cache first
    let tree: ExprContext;
    if (this.parseTreeCache.has(forgeExpr)) {
      tree = this.parseTreeCache.get(forgeExpr)!;
    } else {
      try {    // now, we can actually evaluate the expression
        const parsedTree = this.getExpressionParseTree(forgeExpr);
        tree = parsedTree instanceof ExprContext ? parsedTree : parsedTree.getChild(0) as ExprContext;
        // Cache the parsed tree
        this.parseTreeCache.set(forgeExpr, tree);
      }
      catch (e) {
        // if we can't parse the expression, we return an error
        this.lastDiagnostics = []; // nothing was evaluated
        return {
          error: new Error(`Error parsing expression "${forgeExpr}"`)
        };
      }
    }

    // Reuse the inner evaluator across calls. Rebuild only when the datum
    // reference has changed (the contract: callers signal "data changed"
    // by swapping the datum reference, not by mutating it in place).
    if (this.cachedEvaluator === null || this.cachedEvaluatorDatum !== this.datum) {
      this.cachedEvaluator = new ForgeExprEvaluator(this.datum);
      this.cachedEvaluatorDatum = this.datum;
    }
    const evaluator = this.cachedEvaluator;
    // Diagnostics describe this evaluation, not the whole life of the reused
    // evaluator, so clear whatever the previous call left behind.
    evaluator.resetDiagnostics();

    try {

      let result: EvalResult | undefined = evaluator.visit(tree);

      this.lastDiagnostics = evaluator.getDiagnostics();
      // ensure we're visiting an ExprContext
      return result;
    } catch (error) {
      // Capture diagnostics BEFORE discarding the evaluator. A query that
      // warns about an unresolved name and then fails for an unrelated reason
      // should still surface the warning.
      this.lastDiagnostics = evaluator.getDiagnostics();

      // The visit threw mid-traversal, so the evaluator's transient state
      // (environment stack) may be inconsistent. Discard the cached
      // evaluator so the next call rebuilds from a clean slate. The
      // relation cache will be rebuilt lazily on first use, which is the
      // same as the pre-change behavior.
      this.cachedEvaluator = null;
      this.cachedEvaluatorDatum = null;

      if (error instanceof NameNotFoundError) {
        // Return an empty EvalResult for undefined names
        let emptyResult: EvalResult = [];
        return emptyResult;
      }
      if (error instanceof Error) {
        const stackTrace = error.stack;
        const errorMessage = error.message;
        return {
          error: new Error(`Error evaluating expression "${forgeExpr}": ${errorMessage}`),
          stackTrace: stackTrace
        };
      }
      return {
        error: new Error(`Error evaluating expression "${forgeExpr}"`)
      };
    }
  }
}

/**
 * Run a static analysis on a Forge expression.
 *
 * Returns `unsat` when the expression provably reduces to `false`, `empty`
 * when it provably reduces to the empty set, `tautology` when it provably
 * reduces to `true`, `ill-typed` for static type errors (e.g. arity
 * mismatch), and `unknown` otherwise (including parse errors).
 *
 * When `schema` is provided, the analyzer also uses the type lattice and
 * relation declarations to detect type-disjoint intersections, subtype
 * tautologies in `in`, join column-type mismatches, and arity errors.
 * Disjointness uses a closed-world rule (A ∩ B = ∅ iff no type in the
 * lattice has both A and B in its lineage).
 */
export function analyzeForgeExpression(
  forgeExpr: string,
  schema?: IForgeSchema,
): StaticAnalysis {
  try {
    const parser = createForgeParser(forgeExpr);
    const tree = parser.parseExpr();
    if (!tree || tree.childCount === 0) {
      return { status: "unknown" };
    }
    return new ForgeExprStaticAnalyzer(schema).analyze(tree);
  } catch {
    return { status: "unknown" };
  }
}

export { ForgeExprStaticAnalyzer, StaticAnalysis };
export type { IForgeSchema };
export type { Diagnostic };

export {
  synthesizeSelector,
  synthesizeBinaryRelation,
  synthesizeBinaryRelationWithWhy,
  synthesizeSelectorWithWhy,
  AtomSelectionExample,
  BinaryRelationExample,
  SelectorSynthesisError,
  SynthesisWhy,
  SynthesisWhyExample,
  WhyNode,
} from './SelectorSynthesizer';

// Utilities for handling reserved keyword identifiers
export {
  getIdentifierName,
  quoteIfReserved,
  FORGE_RESERVED_KEYWORDS,
} from './forge-antlr/utils';
