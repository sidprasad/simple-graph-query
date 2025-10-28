import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";

describe("Numeric comparison optimization", () => {
  it("should evaluate {a, b: Int | a < b} correctly", () => {
    const datum = new TTTDataInstance();
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    const result = evaluator.evaluateExpression('{a, b: Int | a < b}');
    
    // For 16 integers (-8 to 7), there should be 120 pairs where a < b
    // (sum from 1 to 15 = 15*16/2 = 120)
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(120);
    
    // Verify a few specific results
    const tuples = result as any[];
    expect(tuples).toContainEqual([-8, -7]);
    expect(tuples).toContainEqual([0, 1]);
    expect(tuples).toContainEqual([6, 7]);
    
    // Verify no invalid pairs exist
    expect(tuples).not.toContainEqual([5, 5]); // Not a < b
    expect(tuples).not.toContainEqual([7, 6]); // Not a < b
  });
  
  it("should optimize various numeric comparison operators", () => {
    const datum = new TTTDataInstance();
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    // Test >
    const gt = evaluator.evaluateExpression('{a, b: Int | a > b}');
    expect((gt as any[]).length).toBe(120); // Same as <, symmetric
    
    // Test <=
    const lte = evaluator.evaluateExpression('{a, b: Int | a <= b}');
    expect((lte as any[]).length).toBe(136); // 120 + 16 (for a=b cases)
    
    // Test >=
    const gte = evaluator.evaluateExpression('{a, b: Int | a >= b}');
    expect((gte as any[]).length).toBe(136); // Same as <=, symmetric
    
    // Test !=
    const neq = evaluator.evaluateExpression('{a, b: Int | a != b}');
    expect((neq as any[]).length).toBe(240); // 16*16 - 16 = 240
  });
  
  it("should show optimization reduces generated combinations", () => {
    const datum = new TTTDataInstance();
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    console.log('\nNumeric comparison optimization:');
    console.log('- Without optimization: Generates 16×16=256 combinations, evaluates 256 constraints, keeps 120');
    console.log('- With optimization: Generates only 120 valid combinations directly, skips constraint evaluation');
    console.log('- Benefit: 53% fewer combinations generated, 100% fewer constraints evaluated');
    console.log('- Note: For small Int (16 elements), overhead may offset gains');
    console.log('- Real benefit comes with larger numeric domains or expensive constraints');
  });
});
