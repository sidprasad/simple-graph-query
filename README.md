# Simple Graph Expression Evaluator

A TypeScript library for evaluating relational + some more expressions with a browser-compatible UMD bundle.

## Memory Management

The evaluator includes configurable cache limits to prevent excessive memory usage during complex queries:

```typescript
// Create evaluator with default cache size (1000 entries)
const evaluator = new SimpleGraphQueryEvaluator(datum);

// Or specify a custom cache size
const evaluator = new SimpleGraphQueryEvaluator(datum, 500);
```

The cache uses an LRU (Least Recently Used) eviction strategy to maintain a bounded memory footprint. For typical queries, the default limit of 1000 is sufficient. Adjust the limit based on:

- **Smaller values (100-500)**: Use when memory is constrained (e.g., embedded devices, large datasets)
- **Default (1000)**: Good balance for most use cases
- **Larger values (5000+)**: Use for complex nested quantifiers with extensive caching needs

## License

MIT

