import { SimpleGraphQueryEvaluator } from "../src";
import { IDataInstance, IAtom, IRelation, ITuple, IType } from "../src/types";

/**
 * DataInstance base class that parses JSON-formatted data
 */
class DataInstance implements IDataInstance {
  private _data: any;
  constructor(data: string) {
    this._data = JSON.parse(data);
  }
  getTypes(): IType[] {
    return Object.values(this._data.types) as IType[];
  }
  getRelations(): IRelation[] {
    return Object.values(this._data.relations) as IRelation[];
  }
  getAtoms(): IAtom[] {
    const atomMap = new Map<string, IAtom>();
    for (const type of this.getTypes()) {
      for (const atom of type.atoms) {
        if (!atomMap.has(atom.id)) {
          atomMap.set(atom.id, atom);
        }
      }
    }
    return Array.from(atomMap.values());
  }
  getAtomType(id: string): IType {
    for (const type of this.getTypes()) {
      if (type.atoms.some(atom => atom.id === id)) {
        return type;
      }
    }
    throw new Error(`Atom with id ${id} not found`);
  }
}

/**
 * Create a test data instance with MatrixCell atoms for performance testing
 * Each cell has row and col numeric fields
 */
function createMatrixDataInstance(size: number): IDataInstance {
  const matrixCellAtoms = [];
  const rowTuples: ITuple[] = [];
  const colTuples: ITuple[] = [];
  
  // Create MatrixCell atoms and their row/col relations
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const cellId = `Cell_${i}_${j}`;
      matrixCellAtoms.push({
        "_": "atom",
        id: cellId,
        type: "MatrixCell"
      });
      
      // Add row tuple: (cellId, row_number)
      rowTuples.push({
        atoms: [cellId, String(i)],
        types: ["MatrixCell", "Int"]
      });
      
      // Add col tuple: (cellId, col_number)
      colTuples.push({
        atoms: [cellId, String(j)],
        types: ["MatrixCell", "Int"]
      });
    }
  }
  
  const dataStr = JSON.stringify({
    types: {
      "MatrixCell": {
        "_": "type",
        "id": "MatrixCell",
        "types": ["MatrixCell"],
        "atoms": matrixCellAtoms,
        "isBuiltin": false
      }
    },
    relations: {
      "row": {
        "_": "relation",
        "id": "row",
        "name": "row",
        "types": ["MatrixCell", "Int"],
        "tuples": rowTuples
      },
      "col": {
        "_": "relation",
        "id": "col",
        "name": "col",
        "types": ["MatrixCell", "Int"],
        "tuples": colTuples
      }
    }
  });
  
  return new DataInstance(dataStr);
}

describe("Matrix nested quantifier performance", () => {
  it("handles nested quantifier with ~250 cells in reasonable time (SLOW)", () => {
    // Create a 16x16 matrix = 256 cells
    const datum = createMatrixDataInstance(16);
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    console.log("Testing with 256 MatrixCell atoms...");
    
    const startTime = performance.now();
    
    // The problematic query from the issue:
    // {c1, c2 : MatrixCell | c1 != c2 and c1.row = c2.row and c1.col < c2.col}
    const query = "{c1, c2 : MatrixCell | c1 != c2 and c1.row = c2.row and c1.col < c2.col}";
    const result = evaluator.evaluateExpression(query);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    console.log(`Query completed in ${elapsed.toFixed(2)}ms`);
    console.log(`Result has ${Array.isArray(result) ? result.length : 0} tuples`);
    
    // With optimization, should complete much faster than before (~3s vs ~25s)
    expect(elapsed).toBeLessThan(10000); // 10 seconds max (was 30s before)
    
    // Verify result is correct - should have pairs where same row, different col
    // For a 16x16 matrix: 16 rows × C(16,2) = 16 × 120 = 1920 pairs
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(1920);
    }
  }, 30000); // 30 second timeout for this test
  
  it("smaller matrix (5x5) should be fast", () => {
    const datum = createMatrixDataInstance(5);
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    const startTime = performance.now();
    
    const query = "{c1, c2 : MatrixCell | c1 != c2 and c1.row = c2.row and c1.col < c2.col}";
    const result = evaluator.evaluateExpression(query);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    console.log(`5x5 matrix query completed in ${elapsed.toFixed(2)}ms`);
    
    // Smaller matrix should be quite fast
    expect(elapsed).toBeLessThan(500); // 500ms
    expect(Array.isArray(result)).toBe(true);
    
    // 5 rows × C(5,2) = 5 × 10 = 50 pairs
    if (Array.isArray(result)) {
      expect(result.length).toBe(50);
    }
  }, 5000);
  
  it("handles queries with numeric comparisons efficiently", () => {
    const datum = createMatrixDataInstance(8);
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    const startTime = performance.now();
    
    // Query with numeric field comparisons
    const query = "{c : MatrixCell | c.row < 3 and c.col > 5}";
    const result = evaluator.evaluateExpression(query);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    // Should complete quickly with optimizations
    expect(elapsed).toBeLessThan(500);
    
    // Verify result: rows 0,1,2 and cols 6,7 = 3×2 = 6 cells
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(6);
    }
  }, 5000);
  
  it("handles same field comparisons between different variables", () => {
    const datum = createMatrixDataInstance(6);
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    const startTime = performance.now();
    
    // Query comparing same field on two different variables
    const query = "{c1, c2 : MatrixCell | c1.col = c2.col and c1.row < c2.row}";
    const result = evaluator.evaluateExpression(query);
    
    const endTime = performance.now();
    const elapsed = endTime - startTime;
    
    console.log(`Same field comparison query completed in ${elapsed.toFixed(2)}ms`);
    
    // Should complete in reasonable time
    expect(elapsed).toBeLessThan(1000);
    
    // Verify result: 6 cols × C(6,2) = 6 × 15 = 90 pairs
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBe(90);
    }
  }, 5000);
});
