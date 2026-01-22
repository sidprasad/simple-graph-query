# Simple Graph Query - Forge Expression Evaluator

## Overview

This is a TypeScript library for evaluating **Forge/Alloy-style relational expressions** against data instances. Think of it as "SQL for graphs" with first-order logic. It parses and evaluates expressions over sets of atoms and relations.

## Core Concepts

### Data Model
- **Atoms**: Individual entities with an `id` and optional `label`
- **Types**: Collections of atoms (like tables)
- **Relations**: Named sets of tuples connecting atoms (like foreign keys)
- **Instance**: A complete data snapshot with types and relations

### Expression Evaluation
The evaluator takes a Forge expression string and an `IDataInstance`, returning:
- `boolean` for logical expressions
- `number` for numeric expressions  
- `Tuple[]` for set/relational expressions (where `Tuple = (string | number | boolean)[]`)

## Forge Expression Syntax

### Logical Operators
```forge
A and B        // conjunction (also: &&)
A or B         // disjunction (also: ||)
not A          // negation (also: !)
A implies B    // implication (also: =>)
A implies B else C  // if-then-else
A iff B        // biconditional (also: <=>)
A xor B        // exclusive or
```

### Quantifiers
```forge
all x: Set | expr      // universal: expr holds for all x in Set
some x: Set | expr     // existential: expr holds for at least one x
no x: Set | expr       // none: expr holds for no x
lone x: Set | expr     // at most one
one x: Set | expr      // exactly one
two x: Set | expr      // exactly two

// Multiple variables
all x, y: Set | expr
all disj x, y: Set | expr   // x and y must be different

// Mixed types
all x: TypeA, y: TypeB | expr
```

### Set/Relational Operators
```forge
A + B          // union
A - B          // difference
A & B          // intersection
A.B            // relational join (last column of A joins first column of B)
A[B]           // box join (equivalent to B.A)
A -> B         // cartesian product
^R             // transitive closure
*R             // reflexive transitive closure
~R             // transpose/inverse
#S             // cardinality (count of tuples)
```

### Comparison Operators
```forge
A = B          // set equality
A in B         // subset (A ⊆ B)
A ni B         // superset (A ⊇ B)
x < y          // numeric less than
x > y          // numeric greater than
x <= y         // less than or equal (also: =<)
x >= y         // greater than or equal
```

### Multiplicity Expressions
```forge
no expr        // true if expr is empty
some expr      // true if expr is non-empty
lone expr      // true if |expr| ≤ 1
one expr       // true if |expr| = 1
two expr       // true if |expr| = 2
```

### Set Comprehensions
```forge
{x: Type | condition}              // single variable
{x, y: Type | condition}           // multiple variables (cartesian base)
{x: TypeA, y: TypeB | condition}   // mixed types
```

### Built-in Constants
```forge
none           // empty set
univ           // all atoms in the instance
iden           // identity relation {(a,a) | a in univ}
Int            // integer type
true, false    // boolean literals
```

### Built-in Functions
```forge
add[a, b]         // integer addition
subtract[a, b]    // integer subtraction  
multiply[a, b]    // integer multiplication
divide[a, b]      // integer division (floor)
remainder[a, b]   // modulo
abs[x]            // absolute value
sign[x]           // returns -1, 0, or 1
min[Set]          // minimum value in set
max[Set]          // maximum value in set
```

### Label Access (Custom Extension)
```forge
@:expr         // get label as string
@str:expr      // get label as string (explicit)
@bool:expr     // get label as boolean
@num:expr      // get label as number
```

## NOT Implemented

These Forge/Alloy features are **not available**:

| Feature | Syntax | Reason |
|---------|--------|--------|
| Let bindings | `let x = e \| body` | Not implemented |
| Override | `R ++ S` | Not implemented |
| Type restriction | `S <: R`, `R :> S` | Not implemented |
| Sum expression | `sum x: S \| intExpr` | Not implemented |
| Temporal operators | `always`, `eventually`, `after`, `until`, etc. | Requires trace semantics |
| Primed expressions | `expr'` | Requires state model |
| Backquoted atoms | `` `AtomName `` | Not implemented |

## Code Examples

### Basic Usage
```typescript
import { ForgeExprEvaluator } from './ForgeExprEvaluator';
import { parseExpr } from './index';

// Create evaluator with a data instance
const evaluator = new ForgeExprEvaluator(dataInstance);

// Parse and evaluate an expression
const parseTree = parseExpr("all p: Person | some p.friends");
const result = evaluator.visit(parseTree); // returns boolean
```

### Calling Predicates with Arguments
```typescript
import { evaluatePredCall } from './index';

const result = evaluatePredCall(
  dataInstance,
  "isConnected",           // predicate name
  predicateDefinitions,    // Map<string, PredDeclContext>
  { source: "Alice", target: "Bob" }  // arguments
);
```

### Selector Synthesis
```typescript
import { synthesizeSelector } from './SelectorSynthesizer';

// Find an expression that returns exactly these atoms
const expr = synthesizeSelector([
  { atoms: new Set([atom1, atom2]), datum: instance1 },
  { atoms: new Set([atom3]), datum: instance2 },
]);
// expr might be "Person" or "Person.friends" etc.
```

## File Structure

```
src/
├── ForgeExprEvaluator.ts    # Main expression evaluator
├── ForgeExprFreeVariableFinder.ts  # Free variable analysis
├── SelectorSynthesizer.ts   # Expression synthesis from examples
├── NumericConstraintOptimizer.ts   # Optimization for numeric quantifiers
├── types.ts                 # IDataInstance, IAtom, IRelation interfaces
├── index.ts                 # Public API exports
└── forge-antlr/             # ANTLR-generated parser
    ├── Forge.g4             # Grammar definition
    ├── ForgeLexer.g4        # Lexer rules
    ├── ForgeParser.ts       # Generated parser
    └── ...
```

## Key Interfaces

```typescript
interface IAtom {
  id: string;
  label?: string | number | boolean;
}

interface IType {
  name: string;
  atoms: IAtom[];
}

interface ITuple {
  atoms: (string | number | boolean)[];
}

interface IRelation {
  name: string;
  tuples: ITuple[];
}

interface IDataInstance {
  getAtoms(): IAtom[];
  getTypes(): IType[];
  getRelations(): IRelation[];
}
```

## Common Patterns

### Check if relation is functional
```forge
all x: Domain | lone x.relation
```

### Check if relation is total
```forge
all x: Domain | some x.relation
```

### Check reachability
```forge
target in source.^edge
```

### Find all connected pairs
```forge
{x, y: Node | y in x.^edge}
```

### Count with constraint
```forge
#{x: Person | x.age > 18}
```
