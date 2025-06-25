# simple-graph-query

**simple-graph-query** is a lightweight query engine for navigating and extracting tuples from finite graphs using a relational logic inspired by Alloy. It runs entirely client-side and supports a small, composable query language based on set comprehension and relational navigation.

## What It Does

This tool lets you run queries like:

```
{ x, y : Person | y in x.friend* }
{ x, y : Person | x.friend = y }
{ x : Person | x in x.friend* }
```

over JSON-encoded graphs like:

```json
{
  "nodes": [
    { "id": "a", "type": "Person" },
    { "id": "b", "type": "Person" },
    { "id": "c", "type": "Person" }
  ],
  "edges": [
    { "from": "a", "to": "b", "label": "friend" },
    { "from": "b", "to": "c", "label": "friend" }
  ]
}
```

And returns results like:

```json
[
  ["a", "b"],
  ["a", "c"],
  ["b", "c"]
]
```

## What Logic Does It Support

`simple-graph-query` evaluates first-order relational queries over finite graph structures. Specifically:

- Typed variables: `{ x, y : Person | ... }`
- Set comprehension: `{ tuple | condition }`
- Relational navigation: `x.friend`, `x.friend.friend`
- Equality: `x.friend = y`
- Membership: `y in x.friend`
- Transitive closure: `x.friend*`

This is a subset of Alloy-style relational logic, evaluated over a fixed graph structure, with results returned as sets of tuples.

## Getting Started

1. Clone or unzip the repository.
2. Open `public/index.html` in your browser.
3. Paste a query like `{ x, y : Person | y in x.friend* }`.
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

