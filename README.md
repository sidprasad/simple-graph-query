# Forge Expression Evaluator

A TypeScript library for evaluating Forge language expressions with a browser-compatible UMD bundle.

## Installation

```bash
npm install forge-expr-evaluator
```

## Usage

### Browser (UMD Bundle)
```html
<script src="node_modules/forge-expr-evaluator/dist/forge-expr-evaluator.bundle.js"></script>
<script>
  const evaluator = new ForgeExprEvaluator.ForgeExprEvaluatorUtil(datum, sourceCode);
  const result = evaluator.evaluateExpression("some Board", 0);
  console.log(result);
</script>
```

### Node.js
```javascript
const { ForgeExprEvaluatorUtil } = require('forge-expr-evaluator');

const evaluator = new ForgeExprEvaluatorUtil(datum, sourceCode);
const result = evaluator.evaluateExpression("some Board", 0);
console.log(result);
```

### TypeScript
```typescript
import { ForgeExprEvaluatorUtil, DatumParsed } from 'forge-expr-evaluator';

const datum: DatumParsed = {
  parsed: {
    instances: [/* your data */],
    bitwidth: 4
  },
  data: "<alloy>...</alloy>"
};

const sourceCode = `
  sig Board { ... }
  // your Forge signatures and predicates
`;

const evaluator = new ForgeExprEvaluatorUtil(datum, sourceCode);
const result = evaluator.evaluateExpression("some Board", 0);
```

## API

### `ForgeExprEvaluatorUtil`

#### Constructor
```typescript
new ForgeExprEvaluatorUtil(datum: DatumParsed, sourceCode: string)
```

#### Methods
```typescript
evaluateExpression(expression: string, instanceIndex?: number): EvaluationResult
```

### Types
- `DatumParsed`: Data structure containing Forge model instances
- `EvaluationResult`: Result of expression evaluation (value or error)
- `EvalResult`: Successful evaluation result (string | number | boolean | Tuple[])

## Features

- ✅ Browser-compatible UMD bundle (~688 KiB)
- ✅ TypeScript support with full type definitions
- ✅ Evaluates Forge expressions against model data
- ✅ No external dependencies in the bundle
- ✅ Works with Sterling/Alloy data formats

## Development

```bash
# Install dependencies
npm install

# Build the bundle
npm run build

# Run tests
npm test

# Serve demo locally
npm run serve
```

## License

MIT

