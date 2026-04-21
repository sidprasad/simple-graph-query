import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ForgeParser, ExprContext, PredDeclContext } from './forge-antlr/ForgeParser';
import { ForgeLexer } from './forge-antlr/ForgeLexer';
import { ForgeListenerImpl } from './forge-antlr/ForgeListenerImpl';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';
import { EvalResult, ForgeExprEvaluator } from './ForgeExprEvaluator';
import { IDataInstance, IAtom, IRelation, ITuple, IType } from './types';
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

  constructor(datum: IDataInstance) {
    this.datum = datum;
  }


  getExpressionParseTree(forgeExpr: string) {
    const parser = createForgeParser(forgeExpr);
    return parser.parseExpr();
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
        // Preserve the original error instance so callers can do
        // `result.error instanceof ParseError`.
        if (e instanceof Error) {
          return { error: e, stackTrace: e.stack };
        }
        return { error: new Error(`Error parsing expression "${forgeExpr}"`) };
      }
    }

    const evaluator = new ForgeExprEvaluator(this.datum);

    try {

      let result: EvalResult | undefined = evaluator.visit(tree);

      // ensure we're visiting an ExprContext
      return result;
    } catch (error) {
      // Preserve the original error instance so callers (notably spytial-core)
      // can do `result.error instanceof NameNotFoundError` and apply their own
      // policy (silent empty vs. surface-as-error). This evaluator is a pure
      // engine; policy lives one layer up.
      if (error instanceof Error) {
        return { error, stackTrace: error.stack };
      }
      return {
        error: new Error(`Error evaluating expression "${forgeExpr}"`)
      };
    }
  }
}

export { NameNotFoundError } from './ForgeExprEvaluator';
export { ParseError, ParseErrorListener } from './errorListener';

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
