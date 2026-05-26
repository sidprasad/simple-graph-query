import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ForgeParser, ExprContext, PredDeclContext } from './forge-antlr/ForgeParser';
import { ForgeLexer } from './forge-antlr/ForgeLexer';
import { ForgeListenerImpl } from './forge-antlr/ForgeListenerImpl';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';
import { EvalResult, ForgeExprEvaluator, NameNotFoundError } from './ForgeExprEvaluator';
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
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new ForgeParser(tokenStream);
  parser.buildParseTree = true;
  parser.removeErrorListeners();
  parser.addErrorListener(new ParseErrorListener());
  return parser;
}

export class SimpleGraphQueryEvaluator {

  datum: IDataInstance;
  forgeListener : ForgeListenerImpl = new ForgeListenerImpl();
  walker : ParseTreeWalker = new ParseTreeWalker();
  // Cache for parsed expressions to avoid re-parsing the same expression
  private parseTreeCache: Map<string, ExprContext> = new Map();

  // Cached inner evaluator. Reused across evaluateExpression calls so its
  // relation cache / relation index / subexpression cache survive between
  // calls. Invalidated when the `datum` reference changes — consumers that
  // mutate the underlying data are expected to construct a new
  // SimpleGraphQueryEvaluator (or reassign `this.datum`) to signal that.
  private cachedEvaluator: ForgeExprEvaluator | null = null;
  private cachedEvaluatorDatum: IDataInstance | null = null;

  constructor(datum: IDataInstance) {
    this.datum = datum;
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

    try {

      let result: EvalResult | undefined = evaluator.visit(tree);

      // ensure we're visiting an ExprContext
      return result;
    } catch (error) {
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
