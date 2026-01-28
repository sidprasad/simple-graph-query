import { NameContext } from './ForgeParser';

/**
 * Extracts the identifier string from a NameContext.
 * Handles both regular identifiers and backtick-quoted identifiers (for reserved keywords).
 * 
 * Examples:
 *   - Regular: `myVar` -> "myVar"
 *   - Quoted: `` `set` `` -> "set"
 *   - Quoted with escape: `` `my\`name` `` -> "my`name"
 * 
 * @param ctx The NameContext to extract the identifier from
 * @returns The identifier string with backticks and escapes processed
 */
export function getIdentifierName(ctx: NameContext): string {
  // Try regular identifier first
  const identifierToken = ctx.IDENTIFIER_TOK();
  if (identifierToken) {
    return identifierToken.text;
  }

  // Try quoted identifier
  const quotedToken = ctx.QUOTED_IDENTIFIER_TOK();
  if (quotedToken) {
    const text = quotedToken.text;
    // Strip surrounding backticks and unescape internal backslash sequences
    return text
      .slice(1, -1)  // Remove surrounding backticks
      .replace(/\\(.)/g, '$1');  // Unescape: \` -> `, \\ -> \, etc.
  }

  // Fallback to text (shouldn't happen with valid grammar)
  return ctx.text;
}

/**
 * Quotes an identifier if it conflicts with a reserved keyword.
 * Use this when generating Forge expressions that might contain reserved words.
 * 
 * @param identifier The identifier to potentially quote
 * @param reservedKeywords Set of reserved keywords to check against
 * @returns The identifier, quoted with backticks if necessary
 */
export function quoteIfReserved(identifier: string, reservedKeywords: Set<string>): string {
  if (reservedKeywords.has(identifier)) {
    // Escape any backticks in the identifier and wrap in backticks
    return '`' + identifier.replace(/([`\\])/g, '\\$1') + '`';
  }
  return identifier;
}

/**
 * Set of all reserved keywords in Forge.
 * Use with quoteIfReserved() when generating Forge expressions.
 */
export const FORGE_RESERVED_KEYWORDS = new Set([
  'open', 'as', 'var', 'abstract', 'sig', 'extends', 'in',
  'lone', 'some', 'one', 'two', 'set', 'func', 'pfunc', 'disj',
  'wheat', 'pred', 'fun', 'assert', 'run', 'check', 'for', 'but',
  'exactly', 'none', 'univ', 'iden', 'is', 'sat', 'unsat', 'theorem',
  'forge_error', 'checked', 'test', 'expect', 'suite', 'all',
  'sufficient', 'necessary', 'consistent', 'inconsistent', 'with',
  'let', 'bind', 'or', 'xor', 'iff', 'implies', 'else', 'and',
  'until', 'release', 'since', 'triggered', 'not', 'always',
  'eventually', 'after', 'before', 'once', 'historically', 'this',
  'sexpr', 'inst', 'eval', 'example', 'ni', 'no', 'sum', 'Int', 'option'
]);
