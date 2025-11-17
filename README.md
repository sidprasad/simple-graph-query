# Simple Graph Expression Evaluator

A TypeScript library for evaluating relational + some more expressions with a browser-compatible UMD bundle.

## Expression synthesis strategies

`ExpressionSynthesizer` can explain a selection of atoms by deriving an Alloy
expression. The synthesizer reports both the expression and the
`strategy` it used so callers understand why a particular description was
chosen:

* **covering** – uses cached unary features and minimal clause covers to return
  the most general expression that holds for every selected atom without naming
  them explicitly.
* **primitive** – unions together literal primitive values when every atom is
  already a primitive (number, boolean, string) and therefore cannot be
  described more abstractly.
* **builtin** – emits built-in Alloy constants such as `none` when they exactly
  match the selection.
* **fallback** – lists the concrete atom identifiers when no other strategy can
  characterize the selection within the bounded instance.

## License

MIT

