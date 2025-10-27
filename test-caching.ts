import { SimpleGraphQueryEvaluator } from "./src";
import { TTTDataInstance } from "./test/testdatainstances";

const datum = new TTTDataInstance();

// Test 1: Simple numeric query - should be slow
console.log("Test 1: Numeric query without optimization");
const evaluator1 = new SimpleGraphQueryEvaluator(datum);
const start1 = performance.now();
const result1 = evaluator1.evaluateExpression("{ i, i2 : Int | @num:i2 = multiply[@num:i, 2]}");
const elapsed1 = performance.now() - start1;
console.log("Result count:", Array.isArray(result1) ? result1.length : 1);
console.log("Time taken:", elapsed1, "ms\n");

// Test 2: Simpler numeric query
console.log("Test 2: Simpler numeric query");
const evaluator2 = new SimpleGraphQueryEvaluator(datum);
const start2 = performance.now();
const result2 = evaluator2.evaluateExpression("{ i : Int | @num:i > 0}");
const elapsed2 = performance.now() - start2;
console.log("Result count:", Array.isArray(result2) ? result2.length : 1);
console.log("Time taken:", elapsed2, "ms\n");

// Test 3: Non-numeric query for comparison
console.log("Test 3: Non-numeric query");
const evaluator3 = new SimpleGraphQueryEvaluator(datum);
const start3 = performance.now();
const result3 = evaluator3.evaluateExpression("{ i, j : Int | i = j}");
const elapsed3 = performance.now() - start3;
console.log("Result count:", Array.isArray(result3) ? result3.length : 1);
console.log("Time taken:", elapsed3, "ms\n");
