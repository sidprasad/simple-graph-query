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

## Performance Test Results

New performance tests were added in `test/performance.test.ts` to validate the optimizations:

- **Set operations**: Complete in < 1 second for operations on Int (16 elements)
- **Set comprehensions**: Complete in < 500ms for cartesian products with filtering
- **Repeated evaluations**: Consistent performance < 100ms per evaluation
- **Complex joins**: Complete in < 100ms

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

## Conclusion

These optimizations significantly improve performance without sacrificing code clarity or correctness. The key insight is that many O(n²) operations can be reduced to O(n) or O(n+m) using appropriate data structures, particularly JavaScript's native Set and Map.

The changes are backwards compatible and all existing tests pass without modification.
