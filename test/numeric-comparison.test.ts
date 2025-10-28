import { SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "./testdatainstances";

describe("Numeric comparison performance", () => {
  it("should evaluate {a, b: Int | a < b} efficiently", () => {
    const datum = new TTTDataInstance();
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    console.log('Testing: {a, b: Int | a < b}');
    const startTime = performance.now();
    const result = evaluator.evaluateExpression('{a, b: Int | a < b}');
    const endTime = performance.now();
    
    console.log('Query Time:', endTime - startTime, 'ms');
    console.log('Result length:', (result as any[]).length);
    console.log('Expected length: 120 (pairs where a < b from 16 integers)');
    
    // For 16 integers (-8 to 7), there should be 16*15/2 = 120 pairs where a < b
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(120);
  });
  
  it("should show current cartesian product approach", () => {
    const datum = new TTTDataInstance();
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    // This generates 16*16 = 256 combinations, then filters to 120
    console.log('\nCurrent approach evaluates ALL combinations:');
    console.log('- Generates: 16 * 16 = 256 combinations');
    console.log('- Filters to: 120 valid pairs where a < b');
    console.log('- Wasted work: 256 - 120 = 136 evaluations (53%)');
  });
});
