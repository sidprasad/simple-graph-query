# simple-graph-query

**simple-graph-query** is a lightweight query engine for navigating and extracting tuples from finite graphs using a relational logic inspired by Alloy. It runs entirely client-side and supports a small, composable query language based on set comprehension and relational navigation.

## Query Syntax

- Queries are written as `{ var1[: Type1], var2[: Type2], ... | condition }`
- Each variable can have an optional type annotation. If omitted, the type defaults to the phantom top type `univ`.
- The condition is a string expression (e.g., `y in x.friend*`).

### Examples

- All variables with explicit types:
  ```
  { x: Person, y: Animal | y in x.friend* }
  ```
- Some variables with types, some default:
  ```
  { x: Person, y | y in x.friend* }
  ```
- No types specified (all default to `univ`):
  ```
  { x, y | y in x.friend* }
  ```

## Graph Format

Graphs are JSON objects with `nodes` and `edges` arrays:

```
{
  "nodes": [ { "id": "a", "type": "Person" }, ... ],
  "edges": [ { "from": "a", "to": "b", "label": "friend" }, ... ]
}
```

## Parser Errors

- The parser will throw an `Error` with a helpful message if the query is malformed.
- Example: `throw new Error("Parse error: expected {...|...}")`
- If a variable definition is invalid, the error will indicate which variable is problematic.

## Usage

```js
const evaluator = new Evaluator();
evaluator.initialize({ processedData: graph, sourceData: graph });
const result = evaluator.evaluate('{ x: Person, y | y in x.friend* }');
console.log(result.prettyPrint());
```

---

For more, see the code and examples in the repo.

## What Logic Does It Support

`simple-graph-query` evaluates first-order relational queries over finite graph structures. Specifically:

- Typed variables: `{ x: Person, y: Animal | ... }`
- Set comprehension: `{ tuple | condition }`
- Relational navigation: `x.friend`, `x.friend.friend`
- Equality: `x.friend = y`
- Membership: `y in x.friend`
- Transitive closure: `x.friend*`

This is a subset of Alloy-style relational logic, evaluated over a fixed graph structure, with results returned as sets of tuples.

## Getting Started

1. Clone or unzip the repository.
2. Open `public/index.html` in your browser.
3. Paste a query like `{ x: Person, y | y in x.friend* }`.
4. Click Run and view the results.

## Project Structure

- `src/` – parser, evaluator, and AST
- `examples/graph.json` – sample graph data
- `public/index.html` – minimal UI to run queries
- `runQuery(graph, query)` – main API

## TODO

- Support for `and`, `!=`, `no`, `some`
- Regex-style navigation (`friend|coworker`)
- Type checking and improved error handling

