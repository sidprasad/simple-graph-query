import { SimpleGraphQueryEvaluator } from "./src";
import { TTTDataInstance } from "./test/testdatainstances";

const datum = new TTTDataInstance();
const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

const intResult = evaluatorUtil.evaluateExpression("Int");
console.log("Int elements:", intResult);
console.log("Int size:", Array.isArray(intResult) ? intResult.length : 1);
