import { ANTLRErrorListener, Recognizer, RecognitionException } from "antlr4ts";

export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public charPositionInLine: number,
    public offendingSymbol?: unknown,
    public recognitionException?: RecognitionException,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export class ParseErrorListener implements ANTLRErrorListener<any> {
  syntaxError(
    recognizer: Recognizer<any, any>,
    offendingSymbol: any,
    line: number,
    charPositionInLine: number,
    msg: string,
    e: RecognitionException | undefined
  ) {
    throw new ParseError(
      `Parse error at ${line}:${charPositionInLine}: ${msg}`,
      line,
      charPositionInLine,
      offendingSymbol,
      e,
    );
  }
}
