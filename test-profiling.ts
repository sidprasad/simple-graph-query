import { SimpleGraphQueryEvaluator } from "./src";
import { TTTDataInstance } from "./test/testdatainstances";

const datum = new TTTDataInstance();
const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

console.log("Testing individual operations...\n");

// Test @num: operator
const start1 = performance.now();
for (let i = 0; i < 1000; i++) {
  evaluatorUtil.evaluateExpression("@num:(-4)");
}
const elapsed1 = performance.now() - start1;
console.log("@num: operation (1000x):", elapsed1, "ms, avg:", elapsed1/1000, "ms");

// Test multiply operation
const start2 = performance.now();
for (let i = 0; i < 1000; i++) {
  evaluatorUtil.evaluateExpression("multiply[2, 3]");
}
const elapsed2 = performance.now() - start2;
console.log("multiply operation (1000x):", elapsed2, "ms, avg:", elapsed2/1000, "ms");

// Test combined: @num:i2 = multiply[@num:i, 2] in a loop
const start3 = performance.now();
for (let i = 0; i < 256; i++) {
  evaluatorUtil.evaluateExpression("@num:(-4) = multiply[@num:(-2), 2]");
}
const elapsed3 = performance.now() - start3;
console.log("Combined comparison (256x):", elapsed3, "ms, avg:", elapsed3/256, "ms");

console.log("\nEstimated time for set comprehension over Int x Int (256 iterations):", (elapsed3/256) * 256, "ms");
