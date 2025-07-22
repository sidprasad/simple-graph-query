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


    try {    // now, we can actually evaluate the expression
      var tree = this.getExpressionParseTree(forgeExpr);
    }
    catch (e) {
      // if we can't parse the expression, we return an error
      return {
        error: new Error(`Error parsing expression "${forgeExpr}"`)
      };
    }

    const evaluator = new ForgeExprEvaluator(this.datum);

    try {

      let result: EvalResult | undefined = evaluator.visit(tree instanceof ExprContext ? tree : tree.getChild(0));

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
