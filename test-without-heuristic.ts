import { LabelTestDataInstance } from "./test/testdatainstances";
import { SimpleGraphQueryEvaluator } from "./src";

const datum = new LabelTestDataInstance();
const evaluator = new SimpleGraphQueryEvaluator(datum);

console.log("Test 1: {y : Color | @:y = Black}");
try {
  const r1 = evaluator.evaluateExpression("{y : Color | @:y = Black}");
  console.log("Result:", JSON.stringify(r1));
} catch (e: any) {
  console.log("Error:", e.message);
}

console.log("\nTest 2: Direct comparison with bare identifier: Black = Black");
try {
  const r2 = evaluator.evaluateExpression("Black = Black");
  console.log("Result:", JSON.stringify(r2));
} catch (e: any) {
  console.log("Error:", e.message);
}

console.log("\nTest 3: Using Black in a quantifier without @:");
try {
  const r3 = evaluator.evaluateExpression("{y : Color | y = Black}");
  console.log("Result:", JSON.stringify(r3));
} catch (e: any) {
  console.log("Error:", e.message);
}
