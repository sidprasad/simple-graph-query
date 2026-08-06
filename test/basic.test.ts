import { EvaluationResult, SimpleGraphQueryEvaluator } from "../src";

import { TTTDataInstance } from "./testdatainstances";
import { Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";



// helper function to check if an evaluated result is equivalent to a given tuple
// array (when treated as a set of tuples)
function areEquivalentTupleArrays(result: EvaluationResult, expected: Tuple[]) {
  // check if result is a Tuple[]
  if (Array.isArray(result)) {
    const resultTuples = result as Tuple[];
    return areTupleArraysEqual(resultTuples, expected);
  }
  return false;
}

describe("sgq-evaluator ", () => {
  it("can evaluate a basic expression", () => {
    // tttDatum is being read from a JSON file. This is the DatumParsed<any>
    // object that is used in Sterling -- if one is using Sterling, they should
    // be able to pass in the DatumParsed<any> object from there directly into this
    // tool
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "add[1, 1]";
 // could choose a different index if we wanted to
    const result = evaluatorUtil.evaluateExpression(expr);

    expect(result).toBe(2);
  });

  it("can evaluate an instance-specific expression", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Board6.board[0][0]";

    const result = evaluatorUtil.evaluateExpression(expr);

    // expect(result).toEqual([["O0"]]);
    expect(areEquivalentTupleArrays(result, [["O0"]])).toBe(true);
  });

  it("can evaluate Int qualName", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Int";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(
      areEquivalentTupleArrays(result, [
        [-8],
        [-7],
        [-6],
        [-5],
        [-4],
        [-3],
        [-2],
        [-1],
        [0],
        [1],
        [2],
        [3],
        [4],
        [5],
        [6],
        [7],
      ])
    ).toBe(true);
  });

  it("can evaluate a set comprehension", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "{i, j: Int | some Board6.board[i][j]}";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(
      areEquivalentTupleArrays(result, [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [2, 0],
      ])
    ).toBe(true);
  });

  it("can evaluate cardinality on the result of a set comprehension", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "#{i, j: Int | some Board6.board[i][j]}";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(result).toBe(6);
  });

  it("can evaluate a set comprehension over a set that isn't just `Int`", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "{i: X0 + O0 | true}";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [["X0"], ["O0"]])).toBe(true);
  });

  it("can evaluate -> operation", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "X->O->X";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [["X0", "O0", "X0"]])).toBe(true);
  });

  it("can evaluate basic inter and intra-sig relations", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const expr1 = "Board in Board";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toEqual(true);

    const expr2 = "Board0 in Board";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toEqual(true);
  });

  it("can evaluate a reference to a sig", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Board0";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [["Board0"]])).toBe(true);
  });

  it("can perform truthy quantifications when specifying disjoint", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);


    const expr1 = "all disj i, j : Int | { not i = j }";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toEqual(true);

    const expr2 = "some disj i, j : Int | { i = j }";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toEqual(false);
  });


  it("can evaluate chained dot joins", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Game.next.Board1";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(areEquivalentTupleArrays(result, [["Board0"]])).toBe(true);
  });

  it("can evaluate a dot join when neither relation is a singleton", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "Game.next.(Game.next)";

    const result = evaluatorUtil.evaluateExpression(expr);

    expect(
      areEquivalentTupleArrays(result, [
        ["Board0", "Board2"],
        ["Board1", "Board3"],
        ["Board2", "Board4"],
        ["Board3", "Board5"],
        ["Board4", "Board6"],
      ])
    ).toBe(true);
  });

  it("can evaluate a number", () => {
    const datum = new TTTDataInstance();


    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "1";
    const result = evaluatorUtil.evaluateExpression(expr);

    expect(result).toEqual(1);
  });

  it("can evaluate basic boolean operations", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const expr1 = "false and false";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toEqual(false);

    const expr2 = "false and true";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toEqual(false);

    const expr3 = "true and false";
    const result3 = evaluatorUtil.evaluateExpression(expr3);
    expect(result3).toEqual(false);

    const expr4 = "true and true";
    const result4 = evaluatorUtil.evaluateExpression(expr4);
    expect(result4).toEqual(true);

    const expr5 = "false or false";
    const result5 = evaluatorUtil.evaluateExpression(expr5);
    expect(result5).toEqual(false);

    const expr6 = "false or true";
    const result6 = evaluatorUtil.evaluateExpression(expr6);
    expect(result6).toEqual(true);

    const expr7 = "true or false";
    const result7 = evaluatorUtil.evaluateExpression(expr7);
    expect(result7).toEqual(true);

    const expr8 = "true or true";
    const result8 = evaluatorUtil.evaluateExpression(expr8);
    expect(result8).toEqual(true);

    const expr9 = "false implies false";
    const result9 = evaluatorUtil.evaluateExpression(expr9);
    expect(result9).toEqual(true);

    const expr10 = "false implies true";
    const result10 = evaluatorUtil.evaluateExpression(expr10);
    expect(result10).toEqual(true);

    const expr11 = "true implies false";
    const result11 = evaluatorUtil.evaluateExpression(expr11);
    expect(result11).toEqual(false);

    const expr12 = "true implies true";
    const result12 = evaluatorUtil.evaluateExpression(expr12);
    expect(result12).toEqual(true);
  });

  it("can evaluate reverse containment and multiplicity operators", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // `A ni B` is `B in A`, so Board contains Board0 but not X0.
    const containsExpr = "Board ni Board0";
    const containsResult = evaluatorUtil.evaluateExpression(containsExpr);
    expect(containsResult).toBe(true);

    const doesNotContainExpr = "Board ni X0";
    const doesNotContainResult = evaluatorUtil.evaluateExpression(doesNotContainExpr);
    expect(doesNotContainResult).toBe(false);

    const twoExpr = "two (X0 + O0)";
    const twoResult = evaluatorUtil.evaluateExpression(twoExpr);
    expect(twoResult).toBe(true);

    const twoFalseExpr = "two X";
    const twoFalseResult = evaluatorUtil.evaluateExpression(twoFalseExpr);
    expect(twoFalseResult).toBe(false);

    const setExpr = "set (X0 + O0)";
    const setResult = evaluatorUtil.evaluateExpression(setExpr);
    expect(areEquivalentTupleArrays(setResult, [["X0"], ["O0"]])).toBe(true);

    const quantifierTwoExpr = "two i: X + O | true";
    const quantifierTwoResult = evaluatorUtil.evaluateExpression(quantifierTwoExpr);
    expect(quantifierTwoResult).toBe(true);
  });

  it("treats a scalar as a singleton set for `in`/`ni` (Alloy/Forge subset semantics)", () => {
    const datum = new TTTDataInstance();
    const ev = new SimpleGraphQueryEvaluator(datum);

    // Scalar `in` scalar is equality: a singleton is a subset of a singleton
    // iff the elements are equal. This path previously always returned false.
    expect(ev.evaluateExpression("1 in 1")).toBe(true);
    expect(ev.evaluateExpression("1 in 2")).toBe(false);
    expect(ev.evaluateExpression('@:(X0) in "red"')).toBe(true); // label "red" == "red"
    expect(ev.evaluateExpression('@:(X0) in "blue"')).toBe(false);

    // `ni` is containment the other way round, so for scalars it is equality too.
    expect(ev.evaluateExpression("1 ni 1")).toBe(true);
    expect(ev.evaluateExpression("1 ni 2")).toBe(false);

    // Membership against a real (multi-element) set is unchanged...
    expect(ev.evaluateExpression('@:(X0) in ("red" + "blue")')).toBe(true);
    expect(ev.evaluateExpression('@:(X0) not in ("red" + "blue")')).toBe(false);

    // ...and `in` with a single value now behaves, so the old "use = for one
    // value" footgun is gone: this comprehension keeps only the red player.
    const reds = ev.evaluateExpression('{p: Player | @:p in "red"}');
    expect(areEquivalentTupleArrays(reds, [["X0"]])).toBe(true);
  });

  it("can evaluate implies with else", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    const expr1 = "false implies false else true";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toEqual(true);

    const expr2 = "true implies false else true";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toEqual(false);
  });


  it("can evaluate a transitive closure", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "^(Game0.next)";
 

    const result = evaluatorUtil.evaluateExpression(expr);
    expect(
      areEquivalentTupleArrays(result, [
        ["Board0", "Board1"],
        ["Board0", "Board2"],
        ["Board0", "Board3"],
        ["Board0", "Board4"],
        ["Board0", "Board5"],
        ["Board0", "Board6"],
        ["Board1", "Board2"],
        ["Board1", "Board3"],
        ["Board1", "Board4"],
        ["Board1", "Board5"],
        ["Board1", "Board6"],
        ["Board2", "Board3"],
        ["Board2", "Board4"],
        ["Board2", "Board5"],
        ["Board2", "Board6"],
        ["Board3", "Board4"],
        ["Board3", "Board5"],
        ["Board3", "Board6"],
        ["Board4", "Board5"],
        ["Board4", "Board6"],
        ["Board5", "Board6"],
      ])
    ).toBe(true);
  });

  it("errors if transitive closure is attempted on a relation of arity other than 2", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "^(Board6.board)"; // has arity 3


    const result = evaluatorUtil.evaluateExpression(expr);
    expect(result).toHaveProperty("error");
  });

  it("can evaluate a reflexive transitive closure", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "*(Game.next)";

    const result = evaluatorUtil.evaluateExpression(expr);
    expect(
      areEquivalentTupleArrays(result, [
        [-8, -8],
        [-7, -7],
        [-6, -6],
        [-5, -5],
        [-4, -4],
        [-3, -3],
        [-2, -2],
        [-1, -1],
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
        [6, 6],
        [7, 7],
        ["X0", "X0"],
        ["O0", "O0"],
        ["Board0", "Board0"],
        ["Board0", "Board1"],
        ["Board0", "Board2"],
        ["Board0", "Board3"],
        ["Board0", "Board4"],
        ["Board0", "Board5"],
        ["Board0", "Board6"],
        ["Board1", "Board1"],
        ["Board1", "Board2"],
        ["Board1", "Board3"],
        ["Board1", "Board4"],
        ["Board1", "Board5"],
        ["Board1", "Board6"],
        ["Board2", "Board2"],
        ["Board2", "Board3"],
        ["Board2", "Board4"],
        ["Board2", "Board5"],
        ["Board2", "Board6"],
        ["Board3", "Board3"],
        ["Board3", "Board4"],
        ["Board3", "Board5"],
        ["Board3", "Board6"],
        ["Board4", "Board4"],
        ["Board4", "Board5"],
        ["Board4", "Board6"],
        ["Board5", "Board5"],
        ["Board5", "Board6"],
        ["Board6", "Board6"],
        ["Game0", "Game0"],
      ])
    ).toBe(true);
  });

  it("errors if reflexive transitive closure is attempted on a relation of arity other than 2", () => {
    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "*(Board6.board)"; // has arity 3


    const result = evaluatorUtil.evaluateExpression(expr);
    expect(result).toHaveProperty("error");
  });


  it("evaluates an unresolved name to the empty set and warns", () => {

    const datum = new TTTDataInstance();

    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    const expr = "NonExistentRelation";

    // An unresolved name is NOT a string literal (write `"..."` for that) and
    // is not an error either — the instance only carries populated types and
    // relations, so an empty sig is indistinguishable from a typo.
    const { value, diagnostics } = evaluatorUtil.evaluateExpressionWithDiagnostics(expr);
    expect(areEquivalentTupleArrays(value, [])).toBe(true);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe("unresolved-name");
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].name).toBe("NonExistentRelation");
  });

  it("can distinguish between ID comparison (=) and label comparison (@:)", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Test basic ID comparison 
    const idComparisonExpr = 'X0 = X0';
    const idResult = evaluatorUtil.evaluateExpression(idComparisonExpr);
    expect(idResult).toBe(true);

    // Test basic label comparison using @: operator  
    const labelComparisonExpr = '@:(X0) = @:(X0)';
    const labelResult = evaluatorUtil.evaluateExpression(labelComparisonExpr);
    expect(labelResult).toBe(true);

    // Test that both operators work for same comparisons
    const idComparisonExpr2 = 'O0 = O0';
    const idResult2 = evaluatorUtil.evaluateExpression(idComparisonExpr2);
    expect(idResult2).toBe(true);

    const labelComparisonExpr2 = '@:(O0) = @:(O0)';
    const labelResult2 = evaluatorUtil.evaluateExpression(labelComparisonExpr2);
    expect(labelResult2).toBe(true);

    // Verify the operators are recognized as different by using them in boolean expressions
    const complexExpr = '(X0 = X0) and (@:(X0) = @:(X0))';
    const complexResult = evaluatorUtil.evaluateExpression(complexExpr);
    expect(complexResult).toBe(true);
  });

  it("demonstrates label vs ID functionality with atoms that have different labels", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // Verify that our test data has atoms with different labels
    // X0 has id="X0" but label="red"
    // O0 has id="O0" but label="blue"
    
    // Test ID comparison vs label comparison
    const idTest = 'X0 = X0';
    const labelTest = '@:(X0) = @:(X0)';
    
    expect(evaluatorUtil.evaluateExpression(idTest)).toBe(true);
    expect(evaluatorUtil.evaluateExpression(labelTest)).toBe(true);
    
    // Test inequality as well
    const idInequality = 'X0 = O0';
    const labelInequality = '@:(X0) = @:(O0)';
    
    expect(evaluatorUtil.evaluateExpression(idInequality)).toBe(false);
    expect(evaluatorUtil.evaluateExpression(labelInequality)).toBe(false);
    
    // Test that @: operator extracts labels correctly
    // @:(X0) should return "red", @:(O0) should return "blue"
    const x0Label = evaluatorUtil.evaluateExpression('@:(X0)');
    const o0Label = evaluatorUtil.evaluateExpression('@:(O0)');
    
    expect(x0Label).toBe("red");
    expect(o0Label).toBe("blue");
    
    // Verify label comparison works with different labels
    const differentLabels = '@:(X0) = @:(O0)';
    expect(evaluatorUtil.evaluateExpression(differentLabels)).toBe(false);
  });

  it("can evaluate iden (identity relation)", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    
    // iden should contain (x, x) for every atom x in the universe
    const result = evaluatorUtil.evaluateExpression("iden");
    
    // Verify that result is a Tuple[]
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      // Each tuple should have arity 2
      expect(result.every((tuple) => tuple.length === 2)).toBe(true);
      
      // Each tuple should have the form (x, x)
      expect(result.every((tuple) => tuple[0] === tuple[1])).toBe(true);
      
      // The number of tuples should equal the number of atoms in the universe
      const atoms = datum.getAtoms();
      expect(result.length).toBe(atoms.length);
    }
  });

  it("can use iden in relational operations", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    
    // Test that X0->X0 is in iden
    const expr1 = "X0->X0 in iden";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toBe(true);
    
    // Test that X0->O0 is NOT in iden
    const expr2 = "X0->O0 in iden";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toBe(false);
  });

  it("can use iden with join operations", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    
    // X0.iden should give X0
    const expr = "X0.iden";
    const result = evaluatorUtil.evaluateExpression(expr);
    expect(areEquivalentTupleArrays(result, [["X0"]])).toBe(true);
  });

  it("can evaluate univ (universal relation)", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    
    // univ should contain all atoms in the universe as unary tuples
    const result = evaluatorUtil.evaluateExpression("univ");
    
    // Verify that result is a Tuple[]
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      // Each tuple should have arity 1 (unary)
      expect(result.every((tuple) => tuple.length === 1)).toBe(true);
      
      // The number of tuples should equal the number of atoms in the universe
      const atoms = datum.getAtoms();
      expect(result.length).toBe(atoms.length);
      
      // All atoms should be present in univ
      const atomIds = new Set(atoms.map(a => a.id));
      const resultAtoms = new Set(result.map((tuple) => tuple[0]));
      // Convert numeric strings to numbers for comparison
      atoms.forEach(atom => {
        const atomId = atom.id;
        const numericId = !isNaN(Number(atomId)) ? Number(atomId) : atomId;
        expect(resultAtoms.has(atomId) || resultAtoms.has(numericId)).toBe(true);
      });
    }
  });

  it("can use univ in relational operations", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    
    // Test that X0 is in univ
    const expr1 = "X0 in univ";
    const result1 = evaluatorUtil.evaluateExpression(expr1);
    expect(result1).toBe(true);
    
    // Test that Board0 is in univ
    const expr2 = "Board0 in univ";
    const result2 = evaluatorUtil.evaluateExpression(expr2);
    expect(result2).toBe(true);
  });

  it("can use univ with set operations", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    
    // univ should be a superset of any type
    const expr = "X in univ";
    const result = evaluatorUtil.evaluateExpression(expr);
    expect(result).toBe(true);
  });

  // Int in this fixture is the bitwidth-4 range {-8 .. 7}.
  it("sum aggregates a numeric body over the full quantified set", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // -8 + -7 + ... + 6 + 7  ==  -8
    expect(evaluatorUtil.evaluateExpression("sum i: Int | @num:i")).toBe(-8);
  });

  it("sum aggregates over a comprehension subset", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // 1 + 2 + ... + 7  ==  28
    expect(evaluatorUtil.evaluateExpression("sum i: {x: Int | x > 0} | @num:i")).toBe(28);
    // Body is a real int expression, evaluated per binding: 2 * 28 == 56
    expect(evaluatorUtil.evaluateExpression("sum i: {x: Int | x > 0} | multiply[@num:i, 2]")).toBe(56);
  });

  it("sum over an empty set is 0", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    expect(evaluatorUtil.evaluateExpression("sum i: {x: Int | x > 100} | @num:i")).toBe(0);
  });

  it("sum ranges over the cartesian product of multiple variables", () => {
    const datum = new TTTDataInstance();
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);

    // For i, j in {1..7}: sum of (i + j) == 2 * |S| * sum(S) == 2 * 7 * 28 == 392
    expect(evaluatorUtil.evaluateExpression("sum i, j: {x: Int | x > 0} | add[@num:i, @num:j]")).toBe(392);
  });

});
