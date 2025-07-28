# Simple Graph Query Language Documentation

This library provides a TypeScript evaluator for Forge expressions with a browser-compatible UMD bundle. The language is based on Alloy/Forge and supports relational logic and graph queries.

## Table of Contents

- [Quick Start](#quick-start)
- [Interactive Playground](#interactive-playground)
- [Language Overview](#language-overview)
- [Syntax Reference](#syntax-reference)
- [Operators](#operators)
- [Keywords](#keywords)
- [Grammar Rules](#grammar-rules)
- [Examples](#examples)
- [Semantics](#semantics)

## Quick Start

```typescript
import { SimpleGraphQueryEvaluator } from 'simple-graph-query';

// Create an evaluator with your data instance
const evaluator = new SimpleGraphQueryEvaluator(dataInstance);

// Evaluate expressions
const result = evaluator.evaluateExpression("some Node");
```

## Interactive Playground

You can try the language interactively using the test HTML file included in this repository:

1. Start a local server: `npm run serve`
2. Open `http://localhost:8080/test-minimal.html`
3. Try expressions in the browser console using the global `evaluator` object

Example expressions to try:
```javascript
// Try these in the browser console
evaluator.evaluateExpression("add[1, 1]");
evaluator.evaluateExpression("Int");
evaluator.evaluateExpression("#{i: Int | i > 0}");
```

## Language Overview

The Simple Graph Query language is based on Alloy/Forge and provides:

- **Relational Logic**: Express constraints and queries over relations
- **Set Operations**: Union, intersection, difference, and cardinality
- **Temporal Logic**: Always, eventually, until, since operators
- **Quantification**: Universal (all) and existential (some) quantifiers
- **Graph Operations**: Transitive closure, joins, and navigation

## Syntax Reference

### Basic Expressions

- **Atoms**: `NodeA`, `EdgeB`
- **Numbers**: `0`, `1`, `2`
- **Sets**: `{x: Type | condition}`
- **Relations**: `parent[child]`

### Quantifiers

- `all x: Type | condition` - Universal quantification
- `some x: Type | condition` - Existential quantification
- `no x: Type | condition` - No elements satisfy condition
- `lone x: Type | condition` - At most one element
- `one x: Type | condition` - Exactly one element

## Operators

### Logical Operators

| Operator | Symbol | Description | Example |
|----------|---------|-------------|---------|
| AND | `&&, and` | Logical conjunction | `A and B` |
| OR | `||, or` | Logical disjunction | `A or B` |
| NOT | `!, not` | Logical negation | `not A` |
| IMPLIES | `=>, implies` | Logical implication | `A implies B` |
| IFF | `<=>, iff` | Logical biconditional | `A iff B` |
| XOR | `xor` | Exclusive or | `A xor B` |

### Relational Operators

| Operator | Symbol | Description | Example |
|----------|---------|-------------|---------|
| EQUALS | `=` | Set equality | `A = B` |
| IN | `in` | Set membership | `x in A` |
| SUBSET | `in` | Subset relation | `A in B` |
| ARROW | `->` | Relational product | `A->B` |
| DOT | `.` | Relational join | `A.B` |
| PLUS | `+` | Set union | `A + B` |
| MINUS | `-` | Set difference | `A - B` |
| INTERSECT | `&` | Set intersection | `A & B` |

### Temporal Operators

| Operator | Symbol | Description | Example |
|----------|---------|-------------|---------|
| ALWAYS | `always` | Globally true | `always P` |
| EVENTUALLY | `eventually` | Eventually true | `eventually P` |
| UNTIL | `until` | P until Q | `P until Q` |
| SINCE | `since` | P since Q | `P since Q` |
| ONCE | `once` | Once in the past | `once P` |
| HISTORICALLY | `historically` | Always in the past | `historically P` |

### Closure Operators

| Operator | Symbol | Description | Example |
|----------|---------|-------------|---------|
| CLOSURE | `^` | Transitive closure | `^parent` |
| REFLEXIVE_CLOSURE | `*` | Reflexive transitive closure | `*parent` |
| TRANSPOSE | `~` | Relation transpose | `~parent` |

## Keywords

The following keywords are reserved in the language:

| | | | |
|---|---|---|---|
| `Int` | `abstract` | `after` | `all` |
| `always` | `and` | `as` | `assert` |
| `before` | `bind` | `but` | `check` |
| `checked` | `consistent` | `disj` | `else` |
| `eval` | `eventually` | `exactly` | `example` |
| `expect` | `extends` | `for` | `fun` |
| `func` | `historically` | `iden` | `iff` |
| `implies` | `in` | `inconsistent` | `inst` |
| `is` | `let` | `lone` | `necessary` |
| `ni` | `no` | `none` | `not` |
| `once` | `one` | `open` | `option` |
| `or` | `pfunc` | `pred` | `release` |
| `run` | `sat` | `set` | `sexpr` |
| `sig` | `since` | `some` | `sufficient` |
| `suite` | `sum` | `test` | `theorem` |
| `this` | `triggered` | `two` | `univ` |
| `unsat` | `until` | `var` | `wheat` |
| `with` | `xor` |

## Grammar Rules

This section shows key grammar rules from the Forge language specification:

### Expression Hierarchy

The language uses a precedence hierarchy for expressions:

```
expr        -> quantified expressions (all, some, no, etc.)
expr1       -> logical OR (||, or)  
expr1_5     -> logical XOR (xor)
expr2       -> logical IFF (<->, iff)
expr3       -> logical IMPLIES (=>, implies)
expr4       -> logical AND (&&, and)
expr4_5     -> temporal operators (until, since, etc.)
expr5       -> logical NOT (!), temporal unary (always, eventually)
expr6       -> comparison operators (=, in, <, >, etc.)
expr7       -> multiplicity operators (no, some, lone, one, two)
expr8       -> arithmetic (+, -)
expr9       -> cardinality (#)
expr10      -> override (++)
expr11      -> intersection (&)
expr12      -> relational product (->)
expr13      -> domain/range restriction (<:, :>)
expr14      -> indexing with brackets []
expr15      -> dot join (.)
expr16      -> prime (')
expr17      -> unary operators (~, ^, *)
expr18      -> atoms, constants, parentheses, blocks
```

### Key Grammar Productions

**Quantified Expressions:**
```
expr: quant DISJ_TOK? quantDeclList blockOrBar
quant: ALL_TOK | NO_TOK | SUM_TOK | mult
quantDecl: DISJ_TOK? nameList COLON_TOK SET_TOK? expr
```

**Set Comprehensions:**
```
expr18: LEFT_CURLY_TOK quantDeclList blockOrBar RIGHT_CURLY_TOK
```

**Let Bindings:**
```
expr: LET_TOK letDeclList blockOrBar
letDecl: name EQ_TOK expr
```

**Signature Declarations:**
```
sigDecl: VAR_TOK? ABSTRACT_TOK? mult? SIG_TOK nameList sigExt? 
         LEFT_CURLY_TOK arrowDeclList? RIGHT_CURLY_TOK block?
sigExt: EXTENDS_TOK qualName | IN_TOK qualName (PLUS_TOK qualName)*
```

**Function and Predicate Declarations:**
```
funDecl: FUN_TOK name paraDecls? COLON_TOK helperMult? expr 
         LEFT_CURLY_TOK expr RIGHT_CURLY_TOK
predDecl: PRED_TOK predType? name paraDecls? block
```

For the complete grammar specification, see the ANTLR4 files:
- `src/forge-antlr/Forge.g4` - Main grammar rules
- `src/forge-antlr/ForgeLexer.g4` - Lexical tokens

## Examples

### Basic Arithmetic and Functions

```forge
// Basic arithmetic function call
add[1, 1]  // Returns: 2

// Working with integer types  
Int  // The set of all integers
```

### Instance-Specific Queries

```forge
// Access specific board positions
Board6.board[0][0]  // Returns: [["O0"]]

// Navigate relations with dot notation
Node.parent.children
```

### Set Operations and Cardinality

```forge
// Check cardinality of a set
#Node = 5

// Set comprehensions
{n: Node | some n.parent}

// Cardinality on comprehensions  
#{n: Node | some n.parent}
```

### Relational Operations

```forge
// Relational product (arrow)
Node->Node

// Transitive closure
^parent  // All ancestors

// Reflexive transitive closure  
*parent  // All ancestors including self

// Relational join with dot
Node.children.parent
```

### Quantified Expressions

```forge
// Universal quantification
all n: Node | some n.parent

// Existential quantification  
some n: Node | #n.children > 2

// Disjoint quantification
all disj n1, n2: Node | n1.id != n2.id
```

### Boolean Logic

```forge
// Basic boolean operations
(some Node) and (some Edge)
(#Node > 5) or (no Edge)
not (Node in Node.parent)

// Comparison operators
A = B     // Set equality
A == B    // Label equality (different from ID equality)
A in B    // Set membership/subset
```

### Temporal Queries

```forge
// Something is always true
always (some Node)

// Eventually a condition holds
eventually (#Node > 5)

// Until operator
(#Node < 10) until (some Edge)

// Since operator (past temporal)
(some Node) since (some Edge)
```

### Advanced Examples

```forge
// Complex set operations with domain/range restriction
Node <: (parent + children) :> Node

// Let bindings for complex expressions
let ancestors = ^parent | 
  all n: Node | n not in n.ancestors

// Preventing cycles
no n: Node | n in n.^parent

// Working with signatures and fields
sig Person {
  friends: set Person,
  age: one Int
}

// Constraints on multiplicities
all p: Person | lone p.age  // Each person has at most one age
```

### Real Examples from Tests

The following examples are taken from the test suite:

```typescript
// Basic expression evaluation
evaluator.evaluateExpression("add[1, 1]")
// Result: 2

// Instance-specific board game evaluation  
evaluator.evaluateExpression("Board6.board[0][0]")
// Result: [["O0"]]

// Integer type reference
evaluator.evaluateExpression("Int")
// Result: Set of all integers in the instance

// Set comprehension over integers
evaluator.evaluateExpression("{i: Int | i > 0}")
// Result: Set of positive integers

// Cardinality of comprehension result
evaluator.evaluateExpression("#{i: Int | i > 0}")
// Result: Number of positive integers

// Relational arrow operation
evaluator.evaluateExpression("Node->Node")
// Result: Cartesian product of Node with itself
```

## Semantics

The Simple Graph Query language follows Alloy/Forge semantics:

### Relational Model

- **Universe**: A finite set of atoms
- **Relations**: Sets of tuples over atoms
- **Signatures**: Types that partition the universe
- **Fields**: Relations declared within signatures

### Evaluation Semantics

1. **Set-based**: All expressions evaluate to sets of tuples
2. **Relational**: Operations are relational algebra operations
3. **First-order**: Quantification over finite domains
4. **Temporal**: Linear temporal logic operators

### Type System

- **Atoms**: Indivisible entities with unique identities
- **Relations**: Typed sets of tuples
- **Multiplicity**: Constraints on relation cardinality
  - `lone`: 0 or 1 tuple
  - `one`: exactly 1 tuple  
  - `some`: 1 or more tuples
  - `set`: 0 or more tuples (default)

### Execution Model

1. Parse expression into abstract syntax tree
2. Type check and resolve names
3. Evaluate against provided data instance
4. Return set of tuples as result

For more details on Alloy/Forge semantics, see:
- [Alloy Documentation](http://alloytools.org/documentation.html)
- [Forge Documentation](https://cs.brown.edu/courses/cs1710/2023/docs/)

## API Reference

### SimpleGraphQueryEvaluator

Main class for evaluating expressions:

```typescript
class SimpleGraphQueryEvaluator {
  constructor(datum: IDataInstance)
  evaluateExpression(forgeExpr: string): EvaluationResult
  getExpressionParseTree(forgeExpr: string): ExprContext
}
```

### Data Model Interfaces

```typescript
interface IDataInstance {
  getAtomType(id: string): IType
  getTypes(): readonly IType[]
  getAtoms(): readonly IAtom[]
  getRelations(): readonly IRelation[]
}

interface IAtom {
  id: string
  type: string
  label: string
}

interface IRelation {
  id: string
  name: string
  types: string[]
  tuples: ITuple[]
}
```

## License

MIT
