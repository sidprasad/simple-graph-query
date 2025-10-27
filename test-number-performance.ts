import { SimpleGraphQueryEvaluator } from "./src";
import { TTTDataInstance } from "./test/testdatainstances";

const datum = new TTTDataInstance();
const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

console.log("Testing performance of number-based queries...\n");

// Simpler test with numbers
const query3 = `{ i, i2 : Int | @num:i2 = multiply[@num:i, 2]}`;
console.log("Query 3 (simpler):", query3);
const start3 = performance.now();
try {
  const result3 = evaluatorUtil.evaluateExpression(query3);
  const elapsed3 = performance.now() - start3;
  console.log("Result:", result3);
  console.log("Time taken:", elapsed3, "ms\n");
} catch (e) {
  const elapsed3 = performance.now() - start3;
  console.log("Error:", e);
  console.log("Time taken before error:", elapsed3, "ms\n");
}

// Test another numeric query
const query4 = `{ i, i2 : Int | @num:i2 = add[1, @num:i]}`;
console.log("Query 4:", query4);
const start4 = performance.now();
try {
  const result4 = evaluatorUtil.evaluateExpression(query4);
  const elapsed4 = performance.now() - start4;
  console.log("Result:", result4);
  console.log("Time taken:", elapsed4, "ms\n");
} catch (e) {
  const elapsed4 = performance.now() - start4;
  console.log("Error:", e);
  console.log("Time taken before error:", elapsed4, "ms\n");
}
