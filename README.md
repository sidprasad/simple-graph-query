# Simple Graph Expression Evaluator

A TypeScript library for evaluating relational + some more expressions with a browser-compatible UMD bundle.

## License

MIT

## Strings

Strings are written as double-quoted literals:

```
{y : Color | @:y = "Black"}
```

A literal always denotes a string, whatever the instance happens to contain. It
may hold any characters — spaces, punctuation, reserved keywords — and supports
the escapes `\"`, `\\`, `\n`, `\t`, `\r`, and `\0`; any other escaped character
stands for itself.

```
"dark blue"     "#FF0000"     "2 of clubs"     "set"     "say \"hi\""
```

There is no implicit conversion: `"12" = 12` and `"true" = true` are both false.
Use `@num:` / `@bool:` to convert explicitly.

### Embedding in YAML

`@` is a reserved indicator in YAML, so an expression beginning with `@:` cannot
be a plain scalar — it has to be quoted whether or not it contains a string
literal. Single-quoted and block scalars pass `"` through untouched and are the
recommended styles:

```yaml
selector: '@:y = "Black"'

selector: |-
  @:y = "Black"
```

A double-quoted YAML scalar also works, but requires escaping: `"@:y = \"Black\""`.

### Prior to 3.0

Any identifier that failed to resolve was silently reinterpreted as a string, so
`@:y = Black` worked only as long as nothing in the instance was named `Black`.
Adding a sig by that name silently changed what the query meant, labels
containing spaces or punctuation were inexpressible, and typos evaluated to
themselves instead of being reported. Bare names are no longer strings; quote
them.

## Unresolved names

A name that matches nothing in the instance evaluates to the **empty relation**
and raises a diagnostic. It is not an error:

```ts
const { value, diagnostics } = evaluator.evaluateExpressionWithDiagnostics("Playr");
// value       -> []
// diagnostics -> [{
//   kind: "unresolved-name",
//   severity: "warning",
//   name: "Playr",
//   suggestion: "Player",
//   message: "'Playr' does not name a type, relation, or atom in this instance; ..."
// }]
```

An instance carries only *populated* types and relations, so a sig with no atoms
is absent from it entirely — and a sig can empty out between frames of one
trace. A missing name is therefore indistinguishable from a typo at evaluation
time, which is why this is a warning for the consumer to surface rather than an
error. `evaluateExpression` is unchanged and returns the value alone.

Note that empty means predicates pass vacuously: `no Playr` is `true`. This is
correct for an empty set, and the diagnostic is the only thing distinguishing it
from a real result — so consumers should show these warnings, not drop them.

### Static analysis

`analyzeForgeExpression(expr, schema)` reports the same names in
`unresolvedNames`, alongside (not instead of) its status. Given a *schema* it
is conclusive, because a schema declares every entity whether populated or not:

```ts
analyzeForgeExpression("none & Playr", schema);
// { status: "empty", reason: "...", unresolvedNames: ["Playr"] }
```

Without a schema the field is omitted — there is nothing to check names against.

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

