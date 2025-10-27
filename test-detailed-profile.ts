import { SimpleGraphQueryEvaluator } from "./src";
import { TTTDataInstance } from "./test/testdatainstances";

const datum = new TTTDataInstance();

console.log("Detailed profiling of numeric operations\n");

// Test multiply with constants
console.log("Test: multiply with constants");
const evaluator1 = new SimpleGraphQueryEvaluator(datum);
const start1 = performance.now();
for (let i = 0; i < 1000; i++) {
  evaluator1.evaluateExpression("multiply[2, 3]");
}
const elapsed1 = performance.now() - start1;
console.log("multiply[2, 3] x1000:", elapsed1, "ms, avg:", elapsed1/1000, "ms\n");

// Test multiply with @num: operator
console.log("Test: multiply with @num: operator");
const evaluator2 = new SimpleGraphQueryEvaluator(datum);
const start2 = performance.now();
for (let i = 0; i < 1000; i++) {
  evaluator2.evaluateExpression("multiply[@num:(-2), 2]");
}
const elapsed2 = performance.now() - start2;
console.log("multiply[@num:(-2), 2] x1000:", elapsed2, "ms, avg:", elapsed2/1000, "ms\n");

// Test just @num: operator
console.log("Test: @num: operator alone");
const evaluator3 = new SimpleGraphQueryEvaluator(datum);
const start3 = performance.now();
for (let i = 0; i < 1000; i++) {
  evaluator3.evaluateExpression("@num:(-2)");
}
const elapsed3 = performance.now() - start3;
console.log("@num:(-2) x1000:", elapsed3, "ms, avg:", elapsed3/1000, "ms\n");

// Test comparison operation
console.log("Test: comparison operation");
const evaluator4 = new SimpleGraphQueryEvaluator(datum);
const start4 = performance.now();
for (let i = 0; i < 1000; i++) {
  evaluator4.evaluateExpression("2 = 3");
}
const elapsed4 = performance.now() - start4;
console.log("2 = 3 x1000:", elapsed4, "ms, avg:", elapsed4/1000, "ms\n");
