<!-- GENERATED FILE — DO NOT EDIT.
     Built from src/forge-antlr/ForgeLexer.g4, src/forge-antlr/Forge.g4, and
     the evaluator's builtin tables by scripts/generate-lang-ref.mjs.
     Regenerate with: npm run docs:lang -->

# The Expression Language

This library evaluates a single **expression** (the `parseExpr` grammar entry
point) against a data instance. The language is the expression fragment of
[Forge](https://forge-fm.org) (itself a dialect of Alloy), with a few
extensions (string literals, label access) and deliberate omissions.

**Everything is a set of tuples.** A sig name denotes the set of its atoms, a
relation name the set of its tuples, and a scalar (one atom, one number, one
string) is a singleton set. Boolean formulas evaluate to `true`/`false`.

**There is no temporal fragment.** The temporal operators (`always`,
`eventually`, `after`, `before`, `once`, `historically`, `until`,
`release`, `since`, `triggered`) and primed expressions (`e'`) were
removed from the grammar; their syntax is a parse error, and the former
keywords are ordinary identifiers.

## Lexical structure

- **STRING_TOK** — A double-quoted string literal: `"dark blue"`. Escapes: `\"`, `\\`, `\n`, `\t`, `\r`, `\0`; any other escaped character stands for itself.
- **NUM_CONST_TOK** — An integer or decimal literal: `42`, `3.5`. Negate with a leading `-`.
- **QUOTED_IDENTIFIER_TOK** — A backquoted name: `` `n0 ``. Names an atom by id, and escapes reserved words.
- **IDENTIFIER_TOK** — A name: letters, digits, `_`, `$`, `/` (not starting with a digit).

Comments run from `//` or `--` to the end of the line, or between `/*`
and `*/`. A `#lang` line is ignored.

### Reserved words

`Int`, `abstract`, `all`, `and`, `as`, `assert`, `bind`, `but`, `check`, `checked`, `consistent`, `disj`, `else`, `eval`, `exactly`, `example`, `expect`, `extends`, `for`, `forge_error`, `fun`, `func`, `iden`, `iff`, `implies`, `in`, `inconsistent`, `inst`, `is`, `let`, `lone`, `necessary`, `ni`, `no`, `none`, `not`, `one`, `open`, `option`, `or`, `pfunc`, `pred`, `run`, `sat`, `set`, `sexpr`, `sig`, `some`, `sufficient`, `suite`, `sum`, `test`, `theorem`, `this`, `two`, `univ`, `unsat`, `var`, `wheat`, `with`, `xor`

A data-instance entity whose name collides with a reserved word is still
reachable by backquoting: `` `set` `` names the *atom* with id `set`.

## Operators and precedence

Constructs are listed loosest-binding first; higher numbers bind tighter.
"Evaluates ✗" marks syntax the grammar accepts but the evaluator rejects.

| # | Construct | Example | Operators | Evaluates | Meaning |
|---|-----------|---------|-----------|:---------:|---------|
| 1 | let binding | `let x = e \| body` | — | ✗ | Bind names to expression values inside a body. Parses, but evaluation is not implemented and fails. |
| 1 | bind | `bind x = e \| body` | — | ✗ | Alloy `bind`. Parses, but evaluation is rejected. |
| 1 | quantified formula | `all x: S \| body` | — | ✓ | Quantifiers `all`, `no`, `some`, `lone`, `one`, `two`, and the aggregator `sum x: S \| intExpr`. `disj` requires the bound variables to take pairwise-distinct values. The body must use the bar form (`\| expr`). |
| 2 | disjunction | `a or b` | `\|\|` / `or` | ✓ | Logical or (short-circuits). |
| 3 | exclusive or | `a xor b` | `xor` | ✓ | Logical exclusive or. |
| 4 | biconditional | `a iff b` | `<=>` / `iff` | ✓ | Logical if-and-only-if. |
| 5 | implication | `a implies b else c` | `implies` / `=>`, `else` | ✓ | Implication, with an optional else branch (`a => b else c` means `(a and b) or ((not a) and c)`). |
| 6 | conjunction | `a and b` | `&&` / `and` | ✓ | Logical and (short-circuits). |
| 7 | negation | `not a` | `!` / `not` | ✓ | Logical negation of a boolean formula. |
| 8 | comparison | `a in b` | `in`, `=`, `<`, `>`, `<=` / `=<`, `>=`, `ni`, `is` | ✓ | Subset (`in`), reverse containment (`ni`), set equality (`=`), and numeric comparisons. A scalar is a singleton set, so `in` doubles as membership. A leading `!`/`not` negates the comparison. `is` parses but its evaluation is rejected. |
| 9 | multiplicity test | `some e` | `no`, `some`, `lone`, `one`, `two`, `set` | ✓ | Cardinality predicates over a set: `no` (empty), `some` (non-empty), `lone` (at most one), `one` (exactly one), `two` (exactly two). `set e` is the identity. |
| 10 | union / difference | `a + b` | `+`, `-` | ✓ | Set union and set difference. (For integer arithmetic use the `add[...]`/`subtract[...]` builtins; `1 + 2` is the two-element set.) |
| 11 | cardinality | `#e` | `#` | ✓ | Number of tuples in the set. |
| 12 | override | `a ++ b` | `++` | ✓ | Relational override: tuples of `b`, plus the tuples of `a` whose first atom is not a first atom of `b`. |
| 13 | intersection | `a & b` | `&` | ✓ | Set intersection. |
| 14 | product | `a -> b` | `->` | ✓ | Cartesian product. Multiplicity annotations (`a one -> lone b`) are declaration syntax and are rejected in expressions. |
| 15 | restriction | `S <: r` | `<:`, `:>` | ✓ | Domain restriction (`S <: r`: tuples of `r` starting in `S`) and range restriction (`r :> S`: tuples ending in `S`). |
| 16 | box join / builtin call | `f[a, b]` | `[`, `]` | ✓ | `a[b]` is the box join `b.a`. When the callee names a builtin (see the builtin table) it is a function call instead: `add[1, 2]`. |
| 17 | join | `a.f` | `.` | ✓ | Relational join: match the last column of the left operand against the first column of the right. |
| 17 | applied name (grammar corner) | `x.f[a]` | — | ✗ | A bracket application whose callee is parsed as a bare name inside a dot-chain. Redundant with box join; evaluation is not implemented. |
| 18 | unary prefixes | `^r` | `~`, `^`, `*`, `@:`, `@str:`, `@bool:`, `@num:` | ✓ | `~r` transpose, `^r` transitive closure, `*r` reflexive-transitive closure. `@:`/`@str:` label of an atom as a string, `@bool:`/`@num:` label converted to boolean/number (extensions; not Forge). |
| 19 | constant | `none` | — | ✓ | `none` (empty set), `univ` (all atoms), `iden` (identity relation), integer literals (incl. negative), and `"..."` string literals. |
| 19 | name | `Person` | — | ✓ | A type, relation, atom, or bound variable. An unresolved name evaluates to the empty set and raises an `unresolved-name` diagnostic. |
| 19 | @name | `@x` | — | ✗ | Alloy-specific; evaluation is rejected. |
| 19 | atom literal | <code>&#96;n0</code> | — | ✓ | The atom with exactly this id, bypassing type/relation/variable lookup. |
| 19 | this | `this` | — | ✗ | Alloy-specific; evaluation is rejected. |
| 19 | set comprehension | `{x: S \| body}` | — | ✓ | The set of bindings satisfying the body. Multiple binders build a relation: `{x: A, y: B \| body}` is a set of pairs. |
| 19 | parentheses | `(e)` | — | ✓ | Grouping. |
| 19 | block | `{ e1 e2 }` | — | ✓ | A conjunction of boolean expressions, separated by whitespace (there is no `;` in the language). |
| 19 | s-expression | `sexpr` | — | ✗ | Reserved for internal use; evaluation is rejected. |

## Builtin functions

Called with square brackets, e.g. `add[1, 2]`.

| Builtins | Arity | Notes |
|----------|-------|-------|
| `add`, `subtract`, `multiply`, `divide`, `remainder` | 2 | Integer/real arithmetic. `divide` is real division. |
| `abs`, `sign`, `floor`, `ceil` | 1 | |
| `min`, `max`, `sum` | set | Aggregate over a set; numeric strings resolve to numbers. `sum` also has a quantifier form `sum x: S \| intExpr`. |

Builtin names are **not** reserved words: a data instance that names an
entity `add` shadows the builtin (see issue #59).

## Grammar

The expression grammar, with token literals substituted in. Pattern tokens
(see [Lexical structure](#lexical-structure)) keep their names.

```
parseExpr
    : expr EOF
    ;

expr
    : expr1
    | 'let' letDeclList blockOrBar
    | 'bind' letDeclList blockOrBar
    | quant 'disj'? quantDeclList blockOrBar
    ;

expr1
    : expr1_5
    | expr1 ('||' | 'or') expr1_5
    ;

letDeclList
    : letDecl
    | letDecl ',' letDeclList
    ;

blockOrBar
    : block
    | '|' expr
    ;

quant
    : 'all'
    | 'no'
    | 'sum'
    | mult
    ;

quantDeclList
    : quantDecl
    | quantDecl ',' quantDeclList
    ;

expr1_5
    : expr2
    | expr1_5 'xor' expr2
    ;

letDecl
    : name '=' expr
    ;

block
    : '{' expr* '}'
    ;

mult
    : 'lone'
    | 'some'
    | 'one'
    | 'two'
    ;

quantDecl
    : 'disj'? nameList ':' 'set'? expr
    ;

expr2
    : expr3
    | expr2 ('<=>' | 'iff') expr3
    ;

name
    : IDENTIFIER_TOK
    | QUOTED_IDENTIFIER_TOK
    ;

nameList
    : name
    | name ',' nameList
    ;

expr3
    : expr4
    | expr4 ('implies' | '=>') expr3 ('else' expr3)?
    ;

expr4
    : expr5
    | expr4 ('&&' | 'and') expr5
    ;

expr5
    : expr6
    | ('!' | 'not') expr5
    ;

expr6
    : expr7
    | expr6 ('!' | 'not')? compareOp expr7
    ;

expr7
    : expr8
    | ('no' | 'some' | 'lone' | 'one' | 'two' | 'set') expr8
    ;

compareOp
    : 'in'
    | '='
    | '<'
    | '>'
    | ('<=' | '=<')
    | '>='
    | 'is'
    | 'ni'
    ;

expr8
    : expr9
    | expr8 ('+' | '-') expr10
    ;

expr9
    : expr10
    | '#' expr9
    ;

expr10
    : expr11
    | expr10 '++' expr11
    ;

expr11
    : expr12
    | expr11 '&' expr12
    ;

expr12
    : expr13
    | expr12 arrowOp expr13
    ;

expr13
    : expr14
    | expr13 ('<:' | ':>') expr14
    ;

arrowOp
    : (mult | 'set')? '->' (mult | 'set')?
    ;

expr14
    : expr15
    | expr14 '[' exprList ']'
    ;

expr15
    : expr17
    | expr15 '.' expr17
    | name '[' exprList ']'
    ;

exprList
    : expr
    | expr ',' exprList
    ;

expr17
    : expr18
    | ('~' | '^' | '*' | '@:' | '@str:' | '@bool:' | '@num:') expr17
    ;

expr18
    : const
    | qualName
    | '@' name
    | '`' name
    | 'this'
    | '{' quantDeclList blockOrBar '}'
    | '(' expr ')'
    | block
    | sexpr
    ;

const
    : 'none'
    | 'univ'
    | 'iden'
    | '-'? number
    | STRING_TOK
    ;

qualName
    : ('this' '/')? (name '/')* name
    | 'Int'
    | 'sum'
    ;

sexpr
    : 'sexpr'
    ;

number
    : NUM_CONST_TOK
    ;
```
