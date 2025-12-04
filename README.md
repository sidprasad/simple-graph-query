# Simple Graph Expression Evaluator

A TypeScript library for evaluating relational + some more expressions with a browser-compatible UMD bundle.

## License

MIT

## Selector synthesis overview

The selector synthesizer infers a relational expression that returns exactly the atoms supplied in a set of training examples (pairs of `Set<IAtom>` and `IDataInstance`). The current implementation uses a bounded, enumerative search over a compact expression grammar (identifiers, unions/intersections/differences, joins, and transitive closure) that mirrors a lightweight Alloy fragment. The search works breadth-first by depth so that the first solution found is the simplest expression within the bound, and it only explores identifiers shared by every example plus Alloy built-ins like `univ` and `iden`.

Although the implementation is enumerative, it follows the same spirit as CEGIS and FOIL-style learners: each candidate expression is validated against every provided example, immediately pruning failures before expanding the search frontier. This tight feedback loop keeps the search space tractable in bounded instances while still allowing compositional operators (e.g., joins composed under closure) to satisfy more relational targets. Raising the `maxDepth` parameter broadens the hypothesis space when more complex solutions are needed, while lower depths keep synthesis fast for simple selectors.

