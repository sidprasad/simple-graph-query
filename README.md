# Simple Graph Expression Evaluator

A TypeScript library for evaluating relational + some more expressions with a browser-compatible UMD bundle.

## License

MIT

## Selector synthesis overview

The selector synthesizer infers a relational expression that returns exactly the atoms supplied in a set of training examples (pairs of `Set<IAtom>` and `IDataInstance`). The current implementation uses a bounded, enumerative search over a compact expression grammar (identifiers, unions/intersections/differences, joins, and transitive closure) that mirrors a lightweight Alloy fragment. The search works breadth-first by depth so that the first solution found is the simplest expression within the bound, and it only explores identifiers shared by every example plus Alloy built-ins like `univ` and `iden`.

Although the implementation is enumerative, it follows the same spirit as CEGIS and FOIL-style learners: each candidate expression is validated against every provided example, immediately pruning failures before expanding the search frontier. This tight feedback loop keeps the search space tractable in bounded instances while still allowing compositional operators (e.g., joins composed under closure) to satisfy more relational targets. Raising the `maxDepth` parameter broadens the hypothesis space when more complex solutions are needed, while lower depths keep synthesis fast for simple selectors.

### Synthesis "why" explanations

The `synthesizeSelectorWithWhy` and `synthesizeBinaryRelationWithWhy` helpers return a provenance tree alongside the synthesized expression. Each returned `examples[i].why` value mirrors the final expression: every node records the operator kind, the textual subexpression, and the evaluated result for that subexpression in the corresponding datum. Binary operators (union, intersection, difference, join) list two children, closures list one, and identifiers are leaves.

For example, synthesizing a selector for `{a1, a2}` and `{b1}` produces:

```ts
const { expression, examples } = synthesizeSelectorWithWhy([
  { atoms: new Set([a1, a2]), datum: datumA },
  { atoms: new Set([b1]), datum: datumB },
]);

// expression === "Thing"
// examples[0].why === {
//   kind: "identifier",
//   expression: "Thing",
//   result: new Set(["a1", "a2"]),
// }
```

Synthesizing a binary relation explanation yields the same structure, but `result` contains normalized tuple identifiers (e.g., `"n1\u0000n3"`) for each subexpression. For a two-hop reachability example, the root `why` node would have `kind: "join"` with two child nodes describing the `edge` relations on the left and right of the join.

