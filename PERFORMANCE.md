# Performance Improvements

This document describes the performance optimizations implemented in the simple-graph-query evaluator.

## Overview

The evaluator is designed to be stateless and functional, making it inherently suitable for optimization through caching and efficient data structures. The optimizations focus on reducing algorithmic complexity while maintaining correctness.

## Optimizations Implemented

### 1. Tuple Comparison Operations (O(n²) → O(n))

**Problem**: Tuple comparisons were using nested loops, resulting in O(n²) complexity for operations like subset checking and equality testing.

**Solution**: Implemented `tupleToKey()` function that converts tuples to JSON strings, enabling O(1) lookups using JavaScript's native Set data structure.

```typescript
function tupleToKey(tuple: Tuple): string {
  return JSON.stringify(tuple);
}

function isTupleArraySubset(a: Tuple[], b: Tuple[]): boolean {
  const bSet = new Set(b.map(tupleToKey));
  return a.every((tupleA) => bSet.has(tupleToKey(tupleA)));
}
```

**Impact**: Reduces complexity from O(n²) to O(n+m) for subset operations.

### 2. Tuple Deduplication (O(n²) → O(n))

**Problem**: Deduplication was checking each tuple against all previously added tuples.

**Solution**: Use a Set to track seen tuples by their string keys.

```typescript
function deduplicateTuples(tuples: Tuple[]): Tuple[] {
  const seen = new Set<string>();
  const result: Tuple[] = [];
  for (const tuple of tuples) {
    const key = tupleToKey(tuple);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tuple);
    }
  }
  return result;
}
```

**Impact**: Reduces complexity from O(n²) to O(n).

### 3. Set Intersection & Difference (O(n*m) → O(n+m))

**Problem**: Set operations were using nested loops with `some()` for membership testing.

**Solution**: Convert one operand to a Set for O(1) membership testing.

```typescript
// Set difference
const rightSet = new Set(rightChildValue.map(tupleToKey));
return leftChildValue.filter(tuple => !rightSet.has(tupleToKey(tuple)));

// Set intersection
const rightSet = new Set(rightChildValue.map(tupleToKey));
return leftChildValue.filter(tuple => rightSet.has(tupleToKey(tuple)));
```

**Impact**: Reduces complexity from O(n*m) to O(n+m).

### 4. Relational Join (dotJoin) Optimization (O(n*m) → O(n+m))

**Problem**: The dot join operation was iterating through all combinations of left and right tuples.

**Solution**: Index right tuples by their first element (the join key) using a Map.

```typescript
function dotJoin(left: EvalResult, right: EvalResult): EvalResult {
  const leftExpr = isSingleValue(left) ? [[left]] : left;
  const rightExpr = isSingleValue(right) ? [[right]] : right;
  
  // Index right tuples by their first element
  const rightIndex = new Map<SingleValue, Tuple[]>();
  for (const rightTuple of rightExpr) {
    const key = rightTuple[0];
    if (!rightIndex.has(key)) {
      rightIndex.set(key, []);
    }
    rightIndex.get(key)!.push(rightTuple);
  }

  // Lookup matching tuples efficiently
  const result: Tuple[] = [];
  for (const leftTuple of leftExpr) {
    const joinKey = leftTuple[leftTuple.length - 1];
    const matchingRightTuples = rightIndex.get(joinKey);
    if (matchingRightTuples) {
      for (const rightTuple of matchingRightTuples) {
        result.push([...leftTuple.slice(0, -1), ...rightTuple.slice(1)]);
      }
    }
  }
  return result;
}
```

**Impact**: Reduces complexity from O(n*m) to O(n+m), especially beneficial for large relations.

### 5. Cartesian Product Optimization

**Problem**: Recursive approach had overhead and no early exit optimization.

**Solution**: Iterative approach with early exit for empty sets.

```typescript
function getCombinations(arrays: Tuple[][]): Tuple[] {
  const valueSets: SingleValue[][] = arrays.map((tuple) => tuple.flat());
  
  if (valueSets.length === 0) return [[]];
  if (valueSets.some(arr => arr.length === 0)) return [];

  let result: Tuple[] = [[]];
  for (const valueSet of valueSets) {
    const newResult: Tuple[] = [];
    for (const existing of result) {
      for (const value of valueSet) {
        newResult.push([...existing, value]);
      }
    }
    result = newResult;
  }
  return result;
}
```

**Impact**: Better performance for quantifier evaluation with early exits.

### 6. Enhanced Cache Key Generation

**Problem**: Cache keys weren't properly serializing complex tuple array values.

**Solution**: Use JSON.stringify for array values in cache keys.

```typescript
private constructFreeVariableKey(freeVarValues: Record<string, EvalResult>): string {
  const keys = Object.keys(freeVarValues);
  keys.sort();
  return keys.map((key) => {
    const value = freeVarValues[key];
    const valueStr = Array.isArray(value) ? JSON.stringify(value) : String(value);
    return `${key}=${valueStr}`;
  }).join("|");
}
```

**Impact**: More reliable caching for complex expressions.

### 7. Transitive Closure (^) Optimization

**Problem**: The BFS implementation used `queue.shift()` which is O(n) in JavaScript arrays. Each shift operation requires moving all remaining elements, making each dequeue operation expensive during graph traversal.

**Solution**: Use index-based queue traversal instead of `shift()` for O(1) queue access.

```typescript
function transitiveClosure(pairs: Tuple[]): Tuple[] {
  // ... build adjacency list ...
  
  for (const start of graph.keys()) {
    const visited = new Set<SingleValue>();
    const queue: SingleValue[] = [...(graph.get(start) ?? [])];
    let queueIndex = 0; // Use index instead of shift() for O(1) access
    
    while (queueIndex < queue.length) {
      const current = queue[queueIndex++]; // O(1) instead of shift()'s O(n)
      if (visited.has(current)) continue;
      visited.add(current);
      
      transitiveClosureSet.add(JSON.stringify([start, current]));
      // ... process neighbors ...
    }
  }
}
```

**Impact**: Eliminates O(n) queue.shift() operations, improving BFS performance from O(V*E*n) to O(V*E) where V is vertices, E is edges, and n is queue size.

### 8. Reflexive Transitive Closure (*) Optimization

**Problem**: The operation combined transitive closure with identity using `deduplicateTuples()` which had O(n²) complexity.

**Solution**: Use Set-based deduplication for O(n) complexity when combining results.

```typescript
if (ctx.STAR_TOK()) {
  const transitiveClosureResult = transitiveClosure(childrenResults);
  const idenResult = this.getIden();
  // Optimize: Use Set for efficient deduplication
  const resultSet = new Set<string>();
  for (const tuple of idenResult) {
    resultSet.add(tupleToKey(tuple));
  }
  for (const tuple of transitiveClosureResult) {
    resultSet.add(tupleToKey(tuple));
  }
  return Array.from(resultSet).map(key => JSON.parse(key));
}
```

**Impact**: Reduces deduplication from O(n²) to O(n), significantly improving performance for reflexive transitive closure operations.

## Performance Test Results

New performance tests were added in `test/performance.test.ts` to validate the optimizations:

- **Set operations**: Complete in < 1 second for operations on Int (16 elements)
- **Set comprehensions**: Complete in < 500ms for cartesian products with filtering
- **Repeated evaluations**: Consistent performance < 100ms per evaluation
- **Complex joins**: Complete in < 100ms
- **Transitive closure**: Complete in < 100ms for typical graph structures
- **Reflexive transitive closure**: Complete in < 150ms including identity computation
- **Multiple set comprehensions**: Complete in < 500ms with optimized cartesian products

## Future Optimization Opportunities

### Parallelism
Since the evaluator is stateless, several operations could benefit from parallelism:
- Quantifier evaluation over independent bindings
- Set operations on large tuple arrays
- Independent sub-expression evaluation

However, JavaScript's single-threaded nature limits these optimizations without Web Workers or worker threads, which would add complexity.

### Smarter Caching
- Cache at more granular levels (individual operations)
- Implement LRU eviction for memory management
- Share caches across evaluator instances for the same data instance

### Query Optimization
Learn from relational database query optimizers:
- Push down filters (evaluate constraints early)
- Reorder joins based on cardinality
- Exploit algebraic equivalences to rewrite expensive operations

### Specialized Data Structures
- Use sparse representations for large domains with few populated values
- Implement specialized structures for binary relations (common case)

### 9. Numeric Operations Optimization

**Problem**: Queries involving numeric operations like `@num:` label conversions and arithmetic functions (add, multiply, etc.) were slow, especially in nested quantifiers and set comprehensions.

**Solution**: Implemented several optimizations:

1. **Fast-path for primitive type label conversions**: When converting labels to numbers/booleans/strings using `@num:`, `@bool:`, or `@str:`, check if the value is already of the target type and return immediately.

```typescript
private getLabelAsNumber(value: SingleValue): number {
  // Optimization: if value is already a number, return it directly
  if (typeof value === "number") {
    return value;
  }
  // ... rest of conversion logic
}
```

2. **Environment object reuse in loops**: In quantifier and set comprehension loops, reuse the same environment object instead of creating a new one each iteration, updating values in place.

```typescript
// Optimize: create environment once and reuse it
const quantDeclEnv: Environment = {
  env: {},
  type: "quantDecl",
};
this.environmentStack.push(quantDeclEnv);

for (let i = 0; i < product.length; i++) {
  // Update environment values in place
  for (let j = 0; j < varNames.length; j++) {
    quantDeclEnv.env[varNames[j]] = tuple[j];
  }
  // ... evaluate expression
}

this.environmentStack.pop();
```

3. **Parse tree caching**: Cache parsed expression trees to avoid re-parsing the same query string multiple times.

```typescript
private parseTreeCache: Map<string, ExprContext> = new Map();

// In evaluateExpression:
if (this.parseTreeCache.has(forgeExpr)) {
  tree = this.parseTreeCache.get(forgeExpr)!;
} else {
  tree = this.getExpressionParseTree(forgeExpr);
  this.parseTreeCache.set(forgeExpr, tree);
}
```

**Impact**: 
- Parse tree caching provides **12x speedup** on repeated evaluations of the same query
- Label conversion optimizations reduce overhead in numeric comparisons
- Environment reuse reduces memory allocation overhead in loops
- Deduplication ensures set comprehensions return proper sets without duplicates
- Combined with JIT warm-up, queries like `{ i, i2 : Int | @num:i2 = multiply[@num:i, 2] }` improve from ~200ms (cold start) to ~17ms (warm, cached)

### 10. Set Comprehension Deduplication

**Problem**: Set comprehensions should return sets (no duplicate tuples), but the implementation was not deduplicating results, leading to duplicate tuples in some scenarios and harming performance.

**Solution**: Add deduplication to set comprehension results to ensure proper set semantics.

```typescript
// In set comprehension evaluation:
for (let i = 0; i < product.length; i++) {
  const tuple = product[i];
  // ... update environment and evaluate condition
  if (barExprValue) {
    result.push(tuple);
  }
}

this.environmentStack.pop();

// Deduplicate results to ensure set semantics
return deduplicateTuples(result);
```

**Impact**: Ensures correctness and can improve performance by avoiding processing duplicate tuples in subsequent operations.

### 11. Relation Caching and Indexing

**Problem**: In nested quantifier expressions like `{c1, c2 : MatrixCell | c1 != c2 and c1.row = c2.row and c1.col < c2.col}`, the evaluator repeatedly performs:
- O(n) scans through all relations to find specific relations like "row" and "col"
- dotJoin operations that rebuild indexes on every call
- For a 16×16 matrix (256 cells), this results in ~25 seconds of evaluation time

**Solution**: Implement two-level caching for relations:

1. **Relation Cache**: Store all relations in a Map for O(1) lookup by name
```typescript
// Build cache once on first access
private relationCache: Map<string, Tuple[]> | null = null;

private buildRelationCache(): void {
  this.relationCache = new Map();
  for (const relation of this.instanceData.getRelations()) {
    // Convert and cache relation tuples
    this.relationCache.set(relation.name, processedTuples);
  }
}
```

2. **Relation Index Cache**: Pre-build indexes for each relation mapping first element to all tuples
```typescript
// Index: relationName -> (firstElement -> Tuple[])
private relationIndexCache: Map<string, Map<SingleValue, Tuple[]>> | null = null;

// In buildRelationCache:
for (const relation of relations) {
  const relationIndex = new Map<SingleValue, Tuple[]>();
  for (const tuple of relationAtoms) {
    const key = tuple[0];
    if (!relationIndex.has(key)) {
      relationIndex.set(key, []);
    }
    relationIndex.get(key)!.push(tuple);
  }
  this.relationIndexCache.set(relation.name, relationIndex);
}
```

3. **Optimized dotJoin**: Convert to class method that leverages pre-built indexes
```typescript
private dotJoin(left: EvalResult, right: EvalResult, rightRelationName?: string): EvalResult {
  // Try to use pre-built index if available
  let rightIndex: Map<SingleValue, Tuple[]> | undefined;
  if (rightRelationName && this.relationIndexCache) {
    rightIndex = this.relationIndexCache.get(rightRelationName);
  }
  
  // If no pre-built index, build on the fly
  if (!rightIndex) {
    rightIndex = buildIndexOnTheFly(rightExpr);
  }
  
  // Use index for O(1) lookups
  for (const leftTuple of leftExpr) {
    const matchingRightTuples = rightIndex.get(joinKey);
    // ... process matches
  }
}
```

**Impact**: 
- **~8x speedup** for nested quantifier queries on large datasets
- 16×16 matrix (256 cells): 25s → 3s
- Eliminates redundant relation lookups: O(n) → O(1)
- Avoids rebuilding indexes in tight loops
- All existing tests pass without modification

**Benchmark Results**:
```
Matrix Query: {c1, c2 : MatrixCell | c1 != c2 and c1.row = c2.row and c1.col < c2.col}
- 16×16 matrix (256 cells): ~3 seconds (down from ~25 seconds)
- 5×5 matrix (25 cells): ~34ms (down from ~73ms)
```

## Conclusion

These optimizations significantly improve performance without sacrificing code clarity or correctness. The key insights are organized by optimization category:

### Algorithmic Complexity Improvements (Optimizations 1-8)
- Many O(n²) operations can be reduced to O(n) or O(n+m) using appropriate data structures (Set and Map)
- Using index-based iteration instead of array.shift() improves queue operations from O(n) to O(1)
- Specialized data structures (Maps for joins, Sets for deduplication) provide significant speedups

### Overhead Reduction (Optimizations 9-11)
- Avoiding redundant work (parsing, type conversions, object allocations) provides significant benefits
- Caching at multiple levels (parsed trees, evaluated sub-expressions, relations, indexes) enables fast repeated evaluations
- Specialized fast paths for common cases (primitive type conversions) reduce overhead
- Environment object reuse in loops reduces memory allocation pressure
- Pre-built relation indexes eliminate redundant work in nested quantifiers

All changes are backwards compatible and all existing tests pass without modification.
