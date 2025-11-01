import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ForgeParser, ExprContext, PredDeclContext } from './forge-antlr/ForgeParser';
import { ForgeLexer } from './forge-antlr/ForgeLexer';
import { ForgeListenerImpl } from './forge-antlr/ForgeListenerImpl';
import { ParseTreeWalker } from 'antlr4ts/tree/ParseTreeWalker';
import { EvalResult, ForgeExprEvaluator, NameNotFoundError } from './ForgeExprEvaluator';
import { IDataInstance, IAtom, IRelation, ITuple, IType } from './types';
import { ParseErrorListener } from './errorListener';
import { QueryRewriter } from './QueryRewriter';

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
  private rewriter: QueryRewriter = new QueryRewriter();
  private enableRewrites: boolean = true;

  constructor(datum: IDataInstance, options?: { enableRewrites?: boolean }) {
    this.datum = datum;
    this.enableRewrites = options?.enableRewrites ?? true;
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

    // Apply rewrites if enabled
    let expressionToEvaluate = forgeExpr;
    if (this.enableRewrites) {
      const rewriteResult = this.rewriter.rewrite(forgeExpr);
      if (rewriteResult.rewritten) {
        expressionToEvaluate = rewriteResult.expression;
      }
    }

    // Check cache first using the expression to evaluate (after rewriting)
    let tree: ExprContext;
    if (this.parseTreeCache.has(expressionToEvaluate)) {
      tree = this.parseTreeCache.get(expressionToEvaluate)!;
    } else {
      try {    // now, we can actually evaluate the expression
        const parsedTree = this.getExpressionParseTree(expressionToEvaluate);
        tree = parsedTree instanceof ExprContext ? parsedTree : parsedTree.getChild(0) as ExprContext;
        // Cache the parsed tree
        this.parseTreeCache.set(expressionToEvaluate, tree);
      }
      catch (e) {
        // if we can't parse the expression, we return an error
        return {
          error: new Error(`Error parsing expression "${expressionToEvaluate}"`)
        };
      }
    }

    const evaluator = new ForgeExprEvaluator(this.datum);

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
          error: new Error(`Error evaluating expression "${expressionToEvaluate}": ${errorMessage}`),
          stackTrace: stackTrace
        };
      }
      return {
        error: new Error(`Error evaluating expression "${expressionToEvaluate}"`)
      };
    }
  }
}
