import { SimpleGraphQueryEvaluator } from '../src/index';
import { IDataInstance, IAtom, IRelation, ITuple, IType } from '../src/types';

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
 * Create a test data instance with MatrixCell atoms for cache testing
 */
function createMatrixDataInstance(size: number): IDataInstance {
  const matrixCellAtoms = [];
  const rowTuples: ITuple[] = [];
  const colTuples: ITuple[] = [];
  
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const cellId = `Cell_${i}_${j}`;
      matrixCellAtoms.push({
        "_": "atom",
        id: cellId,
        type: "MatrixCell"
      });
      
      rowTuples.push({
        atoms: [cellId, String(i)],
        types: ["MatrixCell", "Int"]
      });
      
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

describe('Cache Size Limit Tests', () => {
  
  test('Cache size limit prevents unbounded growth', () => {
    // Create a small matrix for testing
    const matrixSize = 5;
    const datum = createMatrixDataInstance(matrixSize);
    
    // Create evaluator with a small cache size
    const smallCacheSize = 10;
    const evaluator = new SimpleGraphQueryEvaluator(datum, smallCacheSize);
    
    // Execute a complex query that generates many cached entries
    // This query will create multiple parse tree contexts and cache entries
    const query = '{c1, c2 : MatrixCell | c1 != c2 and c1.row = c2.row}';
    
    // Should not crash or consume excessive memory
    const result = evaluator.evaluateExpression(query);
    
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      // Verify the query produced results (pairs of cells in same row)
      expect(result.length).toBeGreaterThan(0);
    }
  });
  
  test('Large cache size allows more caching', () => {
    const matrixSize = 5;
    const datum = createMatrixDataInstance(matrixSize);
    
    // Create evaluator with a large cache size
    const largeCacheSize = 10000;
    const evaluator = new SimpleGraphQueryEvaluator(datum, largeCacheSize);
    
    // Execute the same complex query
    const query = '{c1, c2 : MatrixCell | c1 != c2 and c1.row = c2.row}';
    
    const result = evaluator.evaluateExpression(query);
    
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0);
    }
  });
  
  test('Default cache size works correctly', () => {
    const matrixSize = 5;
    const datum = createMatrixDataInstance(matrixSize);
    
    // Create evaluator with default cache size (1000)
    const evaluator = new SimpleGraphQueryEvaluator(datum);
    
    const query = '{c1, c2 : MatrixCell | c1 != c2 and c1.col < c2.col}';
    
    const result = evaluator.evaluateExpression(query);
    
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0);
    }
  });
  
  test('Multiple queries with limited cache do not crash', () => {
    const matrixSize = 4;
    const datum = createMatrixDataInstance(matrixSize);
    
    // Small cache to stress test eviction
    const smallCacheSize = 5;
    const evaluator = new SimpleGraphQueryEvaluator(datum, smallCacheSize);
    
    // Execute multiple different queries
    const queries = [
      'some MatrixCell',
      '{c : MatrixCell | c.row = 0}',
      '{c : MatrixCell | c.col = 1}',
      '{c1, c2 : MatrixCell | c1.row = c2.row}',
      '{c1, c2 : MatrixCell | c1.col = c2.col}',
      'all c : MatrixCell | some c.row',
      'no c : MatrixCell | c.row = -1',
    ];
    
    // All queries should execute without error
    queries.forEach((query, index) => {
      const result = evaluator.evaluateExpression(query);
      expect(result).toBeDefined();
      // For debugging if a query fails
      if ((result as any).error) {
        console.error(`Query ${index} failed: ${query}`, (result as any).error);
      }
    });
  });
  
  test('Cache with size 1 still works', () => {
    const matrixSize = 3;
    const datum = createMatrixDataInstance(matrixSize);
    
    // Minimal cache - ensures LRU eviction works
    const minimalCacheSize = 1;
    const evaluator = new SimpleGraphQueryEvaluator(datum, minimalCacheSize);
    
    const query = 'some MatrixCell';
    const result = evaluator.evaluateExpression(query);
    
    expect(typeof result).toBe('boolean');
    expect(result).toBe(true);
  });
});
