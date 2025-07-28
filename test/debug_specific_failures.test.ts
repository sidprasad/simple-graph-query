import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";
import { TTTDataInstance } from "../test/tttdatainstance";

describe("Debugging specific failing tests", () => {
  let datum: TTTDataInstance;
  let evaluator: SimpleGraphQueryEvaluator;

  beforeEach(() => {
    datum = new TTTDataInstance();
    evaluator = new SimpleGraphQueryEvaluator(datum);
  });

  it("should debug test data content", () => {
    console.log("\n=== Checking test data for boolean atoms ===");
    
    const types = datum.getTypes();
    console.log("All types:", types.map(t => ({ id: t.id, atoms: t.atoms.map(a => a.id) })));
    
    // Check if true/false exist as atoms
    let foundTrueAtom = false;
    let foundFalseAtom = false;
    for (const type of types) {
      for (const atom of type.atoms) {
        if (atom.id === "true") {
          console.log("Found true atom in type:", type.id);
          foundTrueAtom = true;
        }
        if (atom.id === "false") {
          console.log("Found false atom in type:", type.id);
          foundFalseAtom = true;
        }
      }
    }
    
    if (!foundTrueAtom && !foundFalseAtom) {
      console.log("No true/false atoms found - they should be handled as identifiers");
    }
    
    // Test various identifier evaluations
    console.log("\n=== Testing identifier evaluation paths ===");
    
    // Test a known atom
    try {
      const x0Result = evaluator.evaluateExpression('X0');
      console.log("X0 result:", x0Result, typeof x0Result);
    } catch (e: any) {
      console.log("X0 error:", e.message);
    }
    
    // Test an unknown atom (should go through my new logic)
    try {
      const unknownResult = evaluator.evaluateExpression('UnknownIdentifier');
      console.log("UnknownIdentifier result:", unknownResult, typeof unknownResult);
    } catch (e: any) {
      console.log("UnknownIdentifier error:", e.message);
    }
    
    // Test boolean identifiers
    try {
      const trueResult = evaluator.evaluateExpression('true');
      console.log("true identifier result:", trueResult, typeof trueResult);
    } catch (e: any) {
      console.log("true identifier error:", e.message);
    }
    
    try {
      const falseResult = evaluator.evaluateExpression('false');
      console.log("false identifier result:", falseResult, typeof falseResult);
    } catch (e: any) {
      console.log("false identifier error:", e.message);
    }
    
    expect(true).toBe(true);
  });

  it("should debug specific failing expressions", () => {
    console.log("\n=== Debugging specific failing expressions ===");
    
    // Test 1: Boolean operation
    console.log("1. Testing boolean operation:");
    try {
      const individual1 = evaluator.evaluateExpression('false');
      console.log("false alone:", individual1, typeof individual1);
      console.log("false === false (boolean):", individual1 === false);
      console.log("false === 'false' (string):", individual1 === 'false');
      console.log("JSON.stringify(false):", JSON.stringify(individual1));
      
      const individual2 = evaluator.evaluateExpression('true');
      console.log("true alone:", individual2, typeof individual2);
      console.log("true === true (boolean):", individual2 === true);
      console.log("true === 'true' (string):", individual2 === 'true');
      console.log("JSON.stringify(true):", JSON.stringify(individual2));
      
      const result1 = evaluator.evaluateExpression('false and false');
      console.log("false and false:", result1);
    } catch (e: any) {
      console.log("boolean operation error:", e.message);
    }
    
    // Test 2: Set comprehension with true
    console.log("\n2. Testing set comprehension:");
    try {
      const result2 = evaluator.evaluateExpression('{i: X0 + O0 | true}');
      console.log("{i: X0 + O0 | true}:", result2);
    } catch (e: any) {
      console.log("set comprehension error:", e.message);
    }
    
    // Test 3: Non-existent relation
    console.log("\n3. Testing non-existent relation:");
    try {
      const result3 = evaluator.evaluateExpression('NonExistentRelation');
      console.log("NonExistentRelation:", result3);
    } catch (e: any) {
      console.log("non-existent relation error:", e.message);
    }
    
    // Test 4: Check what actual values we get for known working expressions
    console.log("\n4. Testing known working expressions:");
    try {
      const result4 = evaluator.evaluateExpression('X0');
      console.log("X0:", result4);
      
      const result5 = evaluator.evaluateExpression('O0');
      console.log("O0:", result5);
    } catch (e: any) {
      console.log("known expressions error:", e.message);
    }
    
    expect(true).toBe(true);
  });
});