import { ExprContext } from "./forge-antlr/ForgeParser";
import { Tuple, SingleValue } from "./ForgeExprEvaluator";

/**
 * Analyzes set comprehension constraints to detect simple numeric comparison patterns
 * that can be optimized by generating only valid combinations instead of filtering.
 */

export interface NumericConstraintPattern {
  type: 'less_than' | 'greater_than' | 'less_equal' | 'greater_equal' | 'not_equal' | 'none';
  leftVar: string;
  rightVar: string;
}

/**
 * Detects if a constraint expression is a simple numeric comparison between two variables.
 * Currently detects patterns like: a < b, a > b, a <= b, a >= b, a != b
 * 
 * Note: Uses string matching on expression text which is simple but may miss expressions
 * with extra whitespace or parentheses. This is intentionally conservative - we prefer
 * to fall back to the standard approach rather than risk incorrect optimization.
 * 
 * @param constraintExpr The constraint expression to analyze
 * @param varNames The variable names in scope
 * @returns Pattern info if detected, null otherwise
 */
export function detectNumericComparisonPattern(
  constraintExpr: ExprContext,
  varNames: string[]
): NumericConstraintPattern | null {
  // Parse the expression text to look for simple comparison patterns
  const exprText = constraintExpr.text;
  
  // Check if this is a simple binary comparison between two variables
  // Pattern: <varName1><compareOp><varName2> (no whitespace in text representation)
  // Note: The AST text property concatenates tokens without whitespace
  
  // Try to extract comparison operator and operands
  for (const leftVar of varNames) {
    for (const rightVar of varNames) {
      if (leftVar === rightVar) continue;
      
      // Check for different comparison operators (whitespace already removed in text)
      if (exprText === `${leftVar}<${rightVar}`) {
        return { type: 'less_than', leftVar, rightVar };
      }
      if (exprText === `${leftVar}>${rightVar}`) {
        return { type: 'greater_than', leftVar, rightVar };
      }
      if (exprText === `${leftVar}<=${rightVar}`) {
        return { type: 'less_equal', leftVar, rightVar };
      }
      if (exprText === `${leftVar}>=${rightVar}`) {
        return { type: 'greater_equal', leftVar, rightVar };
      }
      if (exprText === `${leftVar}!=${rightVar}`) {
        return { type: 'not_equal', leftVar, rightVar };
      }
      // Also check for negated equality: not a = b
      if (exprText === `not${leftVar}=${rightVar}`) {
        return { type: 'not_equal', leftVar, rightVar };
      }
    }
  }
  
  return null;
}

/**
 * Checks if all values in the sets are numbers (or tuples containing single numbers).
 * This is required for numeric comparison optimization to be applicable.
 */
export function areAllNumericSets(sets: Tuple[][]): boolean {
  for (const set of sets) {
    for (const tuple of set) {
      if (tuple.length !== 1) return false;
      if (typeof tuple[0] !== 'number') return false;
    }
  }
  return true;
}

/**
 * Extracts numbers from tuples that contain single numbers.
 * Precondition: This should only be called after areAllNumericSets validation.
 */
function extractNumbers(tuples: Tuple[]): number[] {
  return tuples.map(t => {
    // Safe to cast because areAllNumericSets guarantees single-number tuples
    return t[0] as number;
  });
}

/**
 * Generates optimized combinations for numeric comparison constraints.
 * Instead of generating all combinations and filtering, generates only valid ones.
 * 
 * @param varNames Variable names in order
 * @param quantifiedSets The sets each variable ranges over
 * @param pattern The detected numeric comparison pattern
 * @returns Only the tuples that satisfy the constraint
 */
export function generateOptimizedNumericCombinations(
  varNames: string[],
  quantifiedSets: Tuple[][],
  pattern: NumericConstraintPattern
): Tuple[] {
  // Map variable names to their indices and value sets
  const varIndexMap = new Map<string, number>();
  varNames.forEach((name, idx) => {
    varIndexMap.set(name, idx);
  });
  
  const leftIdx = varIndexMap.get(pattern.leftVar);
  const rightIdx = varIndexMap.get(pattern.rightVar);
  
  if (leftIdx === undefined || rightIdx === undefined) {
    // Pattern variables don't match our variable set - this shouldn't happen
    // if detectNumericComparisonPattern is working correctly, but return null
    // to signal that optimization cannot be applied (caller will fall back)
    throw new Error(
      `Internal error: Pattern variables ${pattern.leftVar}, ${pattern.rightVar} not found in variable list`
    );
  }
  
  // Extract numeric values
  const leftNumbers = extractNumbers(quantifiedSets[leftIdx]);
  const rightNumbers = extractNumbers(quantifiedSets[rightIdx]);
  
  // For other variables, we still need all combinations
  const otherVars: number[] = [];
  const otherSets: number[][] = [];
  for (let i = 0; i < varNames.length; i++) {
    if (i !== leftIdx && i !== rightIdx) {
      otherVars.push(i);
      otherSets.push(extractNumbers(quantifiedSets[i]));
    }
  }
  
  const result: Tuple[] = [];
  
  // Generate combinations based on the comparison type
  const generatePairs = (compareFunc: (a: number, b: number) => boolean) => {
    for (const leftVal of leftNumbers) {
      for (const rightVal of rightNumbers) {
        if (compareFunc(leftVal, rightVal)) {
          // This pair satisfies the constraint
          // Now combine with all other variables if any
          if (otherVars.length === 0) {
            // Simple case: only two variables
            const tuple: SingleValue[] = new Array(varNames.length);
            tuple[leftIdx] = leftVal;
            tuple[rightIdx] = rightVal;
            result.push(tuple);
          } else {
            // Need to generate cartesian product with other variables
            const otherCombos = cartesianProduct(otherSets);
            for (const otherCombo of otherCombos) {
              const tuple: SingleValue[] = new Array(varNames.length);
              tuple[leftIdx] = leftVal;
              tuple[rightIdx] = rightVal;
              for (let i = 0; i < otherVars.length; i++) {
                tuple[otherVars[i]] = otherCombo[i];
              }
              result.push(tuple);
            }
          }
        }
      }
    }
  };
  
  switch (pattern.type) {
    case 'less_than':
      generatePairs((a, b) => a < b);
      break;
    case 'greater_than':
      generatePairs((a, b) => a > b);
      break;
    case 'less_equal':
      generatePairs((a, b) => a <= b);
      break;
    case 'greater_equal':
      generatePairs((a, b) => a >= b);
      break;
    case 'not_equal':
      generatePairs((a, b) => a !== b);
      break;
    default:
      // Unknown pattern, return empty (will fall back to standard approach)
      return [];
  }
  
  return result;
}

/**
 * Helper to generate cartesian product of number arrays
 */
function cartesianProduct(arrays: number[][]): number[][] {
  if (arrays.length === 0) return [[]];
  if (arrays.some(arr => arr.length === 0)) return [];
  
  let result: number[][] = [[]];
  for (const arr of arrays) {
    const newResult: number[][] = [];
    for (const existing of result) {
      for (const value of arr) {
        newResult.push([...existing, value]);
      }
    }
    result = newResult;
  }
  return result;
}
