import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ForgeParser, ExprContext, PredDeclContext } from './forge-antlr/ForgeParser';
import { ForgeLexer } from './forge-antlr/ForgeLexer';
import { ForgeListenerImpl } from './forge-antlr/ForgeListenerImpl';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';
import { EvalResult, ForgeExprEvaluator, NameNotFoundError } from './ForgeExprEvaluator';
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
  // Maximum number of cached evaluation results per evaluator instance
  private maxCacheSize: number;

  constructor(datum: IDataInstance, maxCacheSize: number = 1000) {
    this.datum = datum;
    this.maxCacheSize = maxCacheSize;
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

    const evaluator = new ForgeExprEvaluator(this.datum, this.maxCacheSize);

    try {

      let result: EvalResult | undefined = evaluator.visit(tree);

      // ensure we're visiting an ExprContext
      return result;
    } catch (error) {
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
