#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Documentation generator for Forge language from ANTLR4 grammar files
 */
class ForgeDocGenerator {
  constructor() {
    this.tokens = new Map();
    this.rules = new Map();
    this.operators = new Map();
    this.keywords = new Set();
  }

  /**
   * Parse the ForgeLexer.g4 file to extract tokens
   */
  parseLexerFile(content) {
    const lines = content.split('\n');
    let inLexerGrammar = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('lexer grammar')) {
        inLexerGrammar = true;
        continue;
      }

      if (!inLexerGrammar || !trimmed || trimmed.startsWith('//')) {
        continue;
      }

      // Parse token definitions like: TOKEN_NAME: 'literal' | 'another';
      const tokenMatch = trimmed.match(/^([A-Z_]+)\s*:\s*(.+);?$/);
      if (tokenMatch) {
        const [, tokenName, definition] = tokenMatch;
        
        // Extract literal values
        const literals = this.extractLiterals(definition);
        
        this.tokens.set(tokenName, {
          name: tokenName,
          definition: definition,
          literals: literals
        });

        // Collect keywords and operators
        for (const literal of literals) {
          if (literal.match(/^[a-zA-Z]+$/)) {
            this.keywords.add(literal);
          } else {
            this.operators.set(literal, tokenName);
          }
        }
      }
    }
  }

  /**
   * Extract literal values from token definition
   */
  extractLiterals(definition) {
    const literals = [];
    const regex = /'([^']+)'/g;
    let match;
    
    while ((match = regex.exec(definition)) !== null) {
      literals.push(match[1]);
    }
    
    return literals;
  }

  /**
   * Parse the Forge.g4 file to extract grammar rules
   */
  parseGrammarFile(content) {
    const lines = content.split('\n');
    let currentRule = null;
    let ruleContent = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('grammar') || trimmed.startsWith('options')) {
        continue;
      }

      // Check if this is a new rule (starts with lowercase and has colon)
      const ruleMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*:/);
      if (ruleMatch) {
        // Save previous rule if exists
        if (currentRule) {
          this.rules.set(currentRule, ruleContent.trim());
        }
        
        currentRule = ruleMatch[1];
        ruleContent = trimmed;
      } else if (currentRule) {
        ruleContent += ' ' + trimmed;
      }
    }

    // Save the last rule
    if (currentRule) {
      this.rules.set(currentRule, ruleContent.trim());
    }
  }

  /**
   * Generate markdown documentation
   */
  generateDocumentation() {
    let doc = `# Simple Graph Query Language Documentation

This library provides a TypeScript evaluator for Forge expressions with a browser-compatible UMD bundle. The language is based on Alloy/Forge and supports relational logic, temporal operators, and graph queries.

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

\`\`\`typescript
import { SimpleGraphQueryEvaluator } from 'simple-graph-query';

// Create an evaluator with your data instance
const evaluator = new SimpleGraphQueryEvaluator(dataInstance);

// Evaluate expressions
const result = evaluator.evaluateExpression("some Node");
\`\`\`

## Interactive Playground

You can try the language interactively using the test HTML file included in this repository:

1. Start a local server: \`npm run serve\`
2. Open \`http://localhost:8080/test-minimal.html\`
3. Try expressions in the browser console using the global \`evaluator\` object

Example expressions to try:
\`\`\`javascript
// Try these in the browser console
evaluator.evaluateExpression("add[1, 1]");
evaluator.evaluateExpression("Int");
evaluator.evaluateExpression("#{i: Int | i > 0}");
\`\`\`

## Language Overview

The Simple Graph Query language is based on Alloy/Forge and provides:

- **Relational Logic**: Express constraints and queries over relations
- **Set Operations**: Union, intersection, difference, and cardinality
- **Temporal Logic**: Always, eventually, until, since operators
- **Quantification**: Universal (all) and existential (some) quantifiers
- **Graph Operations**: Transitive closure, joins, and navigation

## Syntax Reference

### Basic Expressions

- **Atoms**: \`NodeA\`, \`EdgeB\`
- **Numbers**: \`0\`, \`1\`, \`2\`
- **Sets**: \`{x: Type | condition}\`
- **Relations**: \`parent[child]\`

### Quantifiers

- \`all x: Type | condition\` - Universal quantification
- \`some x: Type | condition\` - Existential quantification
- \`no x: Type | condition\` - No elements satisfy condition
- \`lone x: Type | condition\` - At most one element
- \`one x: Type | condition\` - Exactly one element

## Operators

`;

    // Add operators section
    doc += this.generateOperatorsSection();
    
    // Add keywords section
    doc += this.generateKeywordsSection();
    
    // Add grammar rules section
    doc += this.generateGrammarRulesSection();
    
    // Add examples section
    doc += this.generateExamplesSection();
    
    // Add semantics section
    doc += this.generateSemanticsSection();

    return doc;
  }

  generateOperatorsSection() {
    let section = `### Logical Operators

| Operator | Symbol | Description | Example |
|----------|---------|-------------|---------|
`;

    const logicalOps = [
      ['AND', '&&, and', 'Logical conjunction', 'A and B'],
      ['OR', '||, or', 'Logical disjunction', 'A or B'],
      ['NOT', '!, not', 'Logical negation', 'not A'],
      ['IMPLIES', '=>, implies', 'Logical implication', 'A implies B'],
      ['IFF', '<=>, iff', 'Logical biconditional', 'A iff B'],
      ['XOR', 'xor', 'Exclusive or', 'A xor B']
    ];

    for (const [name, symbol, desc, example] of logicalOps) {
      section += `| ${name} | \`${symbol}\` | ${desc} | \`${example}\` |\n`;
    }

    section += `
### Relational Operators

| Operator | Symbol | Description | Example |
|----------|---------|-------------|---------|
`;

    const relationalOps = [
      ['EQUALS', '=', 'Set equality', 'A = B'],
      ['IN', 'in', 'Set membership', 'x in A'],
      ['SUBSET', 'in', 'Subset relation', 'A in B'],
      ['ARROW', '->', 'Relational product', 'A->B'],
      ['DOT', '.', 'Relational join', 'A.B'],
      ['PLUS', '+', 'Set union', 'A + B'],
      ['MINUS', '-', 'Set difference', 'A - B'],
      ['INTERSECT', '&', 'Set intersection', 'A & B']
    ];

    for (const [name, symbol, desc, example] of relationalOps) {
      section += `| ${name} | \`${symbol}\` | ${desc} | \`${example}\` |\n`;
    }

    section += `
### Temporal Operators

| Operator | Symbol | Description | Example |
|----------|---------|-------------|---------|
| ALWAYS | \`always\` | Globally true | \`always P\` |
| EVENTUALLY | \`eventually\` | Eventually true | \`eventually P\` |
| UNTIL | \`until\` | P until Q | \`P until Q\` |
| SINCE | \`since\` | P since Q | \`P since Q\` |
| ONCE | \`once\` | Once in the past | \`once P\` |
| HISTORICALLY | \`historically\` | Always in the past | \`historically P\` |

### Closure Operators

| Operator | Symbol | Description | Example |
|----------|---------|-------------|---------|
| CLOSURE | \`^\` | Transitive closure | \`^parent\` |
| REFLEXIVE_CLOSURE | \`*\` | Reflexive transitive closure | \`*parent\` |
| TRANSPOSE | \`~\` | Relation transpose | \`~parent\` |

`;

    return section;
  }

  generateKeywordsSection() {
    let section = `## Keywords

The following keywords are reserved in the language:

`;

    const sortedKeywords = Array.from(this.keywords).sort();
    const keywordRows = [];
    
    for (let i = 0; i < sortedKeywords.length; i += 4) {
      const row = sortedKeywords.slice(i, i + 4);
      keywordRows.push('| ' + row.map(k => `\`${k}\``).join(' | ') + ' |');
    }

    // Add table header
    section += '| | | | |\n|---|---|---|---|\n';
    section += keywordRows.join('\n') + '\n\n';

    return section;
  }

  generateGrammarRulesSection() {
    let section = `## Grammar Rules

This section shows key grammar rules from the Forge language specification:

### Expression Hierarchy

The language uses a precedence hierarchy for expressions:

\`\`\`
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
\`\`\`

### Key Grammar Productions

**Quantified Expressions:**
\`\`\`
expr: quant DISJ_TOK? quantDeclList blockOrBar
quant: ALL_TOK | NO_TOK | SUM_TOK | mult
quantDecl: DISJ_TOK? nameList COLON_TOK SET_TOK? expr
\`\`\`

**Set Comprehensions:**
\`\`\`
expr18: LEFT_CURLY_TOK quantDeclList blockOrBar RIGHT_CURLY_TOK
\`\`\`

**Let Bindings:**
\`\`\`
expr: LET_TOK letDeclList blockOrBar
letDecl: name EQ_TOK expr
\`\`\`

**Signature Declarations:**
\`\`\`
sigDecl: VAR_TOK? ABSTRACT_TOK? mult? SIG_TOK nameList sigExt? 
         LEFT_CURLY_TOK arrowDeclList? RIGHT_CURLY_TOK block?
sigExt: EXTENDS_TOK qualName | IN_TOK qualName (PLUS_TOK qualName)*
\`\`\`

**Function and Predicate Declarations:**
\`\`\`
funDecl: FUN_TOK name paraDecls? COLON_TOK helperMult? expr 
         LEFT_CURLY_TOK expr RIGHT_CURLY_TOK
predDecl: PRED_TOK predType? name paraDecls? block
\`\`\`

For the complete grammar specification, see the ANTLR4 files:
- \`src/forge-antlr/Forge.g4\` - Main grammar rules
- \`src/forge-antlr/ForgeLexer.g4\` - Lexical tokens

`;
    return section;
  }

  generateExamplesSection() {
    return `## Examples

### Basic Arithmetic and Functions

\`\`\`forge
// Basic arithmetic function call
add[1, 1]  // Returns: 2

// Working with integer types  
Int  // The set of all integers
\`\`\`

### Instance-Specific Queries

\`\`\`forge
// Access specific board positions
Board6.board[0][0]  // Returns: [["O0"]]

// Navigate relations with dot notation
Node.parent.children
\`\`\`

### Set Operations and Cardinality

\`\`\`forge
// Check cardinality of a set
#Node = 5

// Set comprehensions
{n: Node | some n.parent}

// Cardinality on comprehensions  
#{n: Node | some n.parent}
\`\`\`

### Relational Operations

\`\`\`forge
// Relational product (arrow)
Node->Node

// Transitive closure
^parent  // All ancestors

// Reflexive transitive closure  
*parent  // All ancestors including self

// Relational join with dot
Node.children.parent
\`\`\`

### Quantified Expressions

\`\`\`forge
// Universal quantification
all n: Node | some n.parent

// Existential quantification  
some n: Node | #n.children > 2

// Disjoint quantification
all disj n1, n2: Node | n1.id != n2.id
\`\`\`

### Boolean Logic

\`\`\`forge
// Basic boolean operations
(some Node) and (some Edge)
(#Node > 5) or (no Edge)
not (Node in Node.parent)

// Comparison operators
A = B     // Set equality
A == B    // Label equality (different from ID equality)
A in B    // Set membership/subset
\`\`\`

### Temporal Queries

\`\`\`forge
// Something is always true
always (some Node)

// Eventually a condition holds
eventually (#Node > 5)

// Until operator
(#Node < 10) until (some Edge)

// Since operator (past temporal)
(some Node) since (some Edge)
\`\`\`

### Advanced Examples

\`\`\`forge
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
\`\`\`

### Real Examples from Tests

The following examples are taken from the test suite:

\`\`\`typescript
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
\`\`\`

`;
  }

  generateSemanticsSection() {
    return `## Semantics

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
  - \`lone\`: 0 or 1 tuple
  - \`one\`: exactly 1 tuple  
  - \`some\`: 1 or more tuples
  - \`set\`: 0 or more tuples (default)

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

\`\`\`typescript
class SimpleGraphQueryEvaluator {
  constructor(datum: IDataInstance)
  evaluateExpression(forgeExpr: string): EvaluationResult
  getExpressionParseTree(forgeExpr: string): ExprContext
}
\`\`\`

### Data Model Interfaces

\`\`\`typescript
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
\`\`\`

## License

MIT
`;
  }
}

// Main execution
function main() {
  const generator = new ForgeDocGenerator();
  
  // Read grammar files
  const lexerPath = path.join(__dirname, '../src/forge-antlr/ForgeLexer.g4');
  const grammarPath = path.join(__dirname, '../src/forge-antlr/Forge.g4');
  
  if (!fs.existsSync(lexerPath)) {
    console.error('ForgeLexer.g4 not found at:', lexerPath);
    process.exit(1);
  }
  
  if (!fs.existsSync(grammarPath)) {
    console.error('Forge.g4 not found at:', grammarPath);
    process.exit(1);
  }
  
  const lexerContent = fs.readFileSync(lexerPath, 'utf8');
  const grammarContent = fs.readFileSync(grammarPath, 'utf8');
  
  // Parse files
  generator.parseLexerFile(lexerContent);
  generator.parseGrammarFile(grammarContent);
  
  // Generate documentation
  const documentation = generator.generateDocumentation();
  
  // Write to README.md
  const readmePath = path.join(__dirname, '../README.md');
  fs.writeFileSync(readmePath, documentation);
  
  console.log('Documentation generated successfully!');
  console.log(`- Found ${generator.tokens.size} tokens`);
  console.log(`- Found ${generator.keywords.size} keywords`);
  console.log(`- Found ${generator.rules.size} grammar rules`);
  console.log(`- Documentation written to ${readmePath}`);
}

if (require.main === module) {
  main();
}

module.exports = { ForgeDocGenerator };