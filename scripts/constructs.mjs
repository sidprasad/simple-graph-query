// The expression cascade, as records both generators can render.
//
// The *shape* of each construct — where it sits in the precedence cascade, how
// it associates, which tokens spell it — is read from Forge.g4. What the
// grammar cannot say is what a construct MEANS: that `+` is union and `-` is
// difference, or that the braces of a comprehension are its delimiters. That
// lives in SEMANTICS below, keyed by the normalized shape of the alternative it
// documents, and every alternative must have an entry: adding a construct to
// the grammar without describing it here fails generation.

import { TOKENS, RULES } from "./grammar.mjs";

export const CASCADE_RE = /^expr(?:\d+(?:_\d+)?)?$/;
export const cascade = [...RULES.keys()].filter((r) => CASCADE_RE.test(r));

/** Normalize an alternative: cascade rule refs become `_`; spacing canonical. */
export function signatureOf(alt) {
  return alt
    .replace(/([()?])/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (CASCADE_RE.test(w) ? "_" : w))
    .join(" ");
}

/** True when the alternative is just the descent into the next tighter level. */
export function isDescent(sig) {
  return sig === "_";
}

// Rules whose tokens belong to the lexical layer rather than to the construct
// using them, so expansion stops here rather than dragging IDENTIFIER_TOK and
// friends into every binder.
const LEXICAL_RULES = new Set(["name", "qualName", "number"]);

/**
 * Every token an alternative can contain, following non-lexical subrules.
 * Pattern tokens are left out: a string or a number has no fixed spelling to
 * describe here, and the lexical sections of the manifest already carry it.
 */
function tokensOf(alt, seen = new Set()) {
  const found = [];
  for (const word of alt.split(/[^\w]+/).filter(Boolean)) {
    if (TOKENS.has(word)) {
      if (TOKENS.get(word).literals && !found.includes(word)) found.push(word);
    } else if (RULES.has(word) && !CASCADE_RE.test(word) &&
               !LEXICAL_RULES.has(word) && !seen.has(word)) {
      seen.add(word);
      for (const t of RULES.get(word).flatMap((a) => tokensOf(a, seen))) {
        if (!found.includes(t)) found.push(t);
      }
    }
  }
  return found;
}

/**
 * The cascade level each operand descends to, in source order.
 *
 * This is the contract a generator needs, and it is not always the neighbouring
 * level: `expr8` takes its right operand at `expr10`, skipping the cardinality
 * level, so `a + #b` does not parse. A subexpression needs parentheses exactly
 * when its own precedence is below the level of the slot it fills.
 */
function operandLevels(alt) {
  return words(alt).filter((w) => CASCADE_RE.test(w)).map((w) => cascade.indexOf(w));
}

const words = (alt) => alt.replace(/[()?|*]/g, " ").split(/\s+/).filter(Boolean);

/**
 * The level accepted inside the construct's delimiters, reached through the
 * subrules it names rather than directly. Null when it has no such position.
 * Every delimited construct in this grammar admits a whole expression; if one
 * ever admitted two different levels, "the inner level" would stop being a
 * single fact and this fails rather than picking one.
 */
function innerLevel(alt, seen = new Set()) {
  const levels = new Set();
  for (const word of words(alt)) {
    if (CASCADE_RE.test(word) || !RULES.has(word) || LEXICAL_RULES.has(word) || seen.has(word)) continue;
    seen.add(word);
    for (const sub of RULES.get(word)) {
      for (const level of operandLevels(sub)) levels.add(level);
      const nested = innerLevel(sub, seen);
      if (nested !== null) levels.add(nested);
    }
  }
  if (levels.size > 1) {
    throw new Error(`Alternative '${alt}' admits several inner levels: ${[...levels].join(", ")}`);
  }
  return levels.size ? [...levels][0] : null;
}

// --------------------------------------------------------------------------
// The template: the alternative's production, in source order.
//
// `fixity` says what kind of thing a construct is; it does not say where the
// pieces go, and under one fixity the shapes differ -- `application` is
// `operand [ list ]`, `grouping` is `( operand )`, `block` is `{ operand* }`.
// A generator that only has the fixity has to supply the arrangement from
// somewhere, which means hand-writing one rule per construct. The template is
// that arrangement as data.
//
// Items reference a `parts` role rather than carrying its spelling, so nothing
// here duplicates the parts table.
// --------------------------------------------------------------------------

/**
 * How to read a parser subrule that appears inside an alternative.
 *
 *   expand  it is a token alternation (or a single sequence); inline it and
 *           classify each token against the entry's own `means`/`parts`, which
 *           is what makes `lone` an operator under `quant` and a part under
 *           `arrowOp`
 *   <other> it is a structural position with a shape of its own
 *
 * A subrule absent from here fails generation: a new one is a new shape, and
 * guessing at it would emit a plausible, wrong template.
 */
const SUBRULE_ROLE = {
  quant: "expand", compareOp: "expand", mult: "expand", arrowOp: "expand",
  block: "expand", sexpr: "expand",
  blockOrBar: "body",
  quantDeclList: "binders/typed",
  letDeclList: "binders/bound",
  exprList: "list",
  name: "name", qualName: "qualName",
  const: "constant",
};

/** An alternative as a tree: sequences of atoms, each a word or a group. */
function parseAlt(alt) {
  const toks = alt.replace(/([()?*|])/g, " $1 ").split(/\s+/).filter(Boolean);
  let i = 0;
  const seq = () => {
    const atoms = [];
    while (i < toks.length && toks[i] !== ")" && toks[i] !== "|") {
      const atom = toks[i] === "(" ? (i++, { alts: alts() }) : { word: toks[i++] };
      if (atom.alts && toks[i++] !== ")") throw new Error(`Unbalanced '(' in '${alt}'`);
      if (toks[i] === "?" || toks[i] === "*") atom.quant = toks[i++];
      atoms.push(atom);
    }
    return atoms;
  };
  const alts = () => {
    const out = [seq()];
    while (toks[i] === "|") { i++; out.push(seq()); }
    return out;
  };
  const tree = alts();
  if (i !== toks.length) throw new Error(`Unparsed tail in '${alt}': ${toks.slice(i).join(" ")}`);
  return tree;
}

/**
 * The template for one alternative. Throws rather than guessing: an
 * alternation it cannot collapse, a token the entry does not describe, or a
 * subrule with no role all fail generation.
 */
function templateOf(alt, entry) {
  const where = `SEMANTICS entry '${entry.id}'`;

  const fromWord = (word, quant) => {
    if (CASCADE_RE.test(word)) {
      const level = cascade.indexOf(word);
      return [{ item: quant === "*" ? "repeat" : "operand", level }];
    }
    if (TOKENS.has(word)) {
      if (word in entry.means) return [{ item: "operator" }];
      if (word in entry.parts) {
        return [{ item: "part", role: entry.parts[word], optional: quant === "?" }];
      }
      throw new Error(`${where}: token ${word} is in the grammar but in neither means nor parts`);
    }
    const role = SUBRULE_ROLE[word];
    if (!role) throw new Error(`${where}: subrule '${word}' has no entry in SUBRULE_ROLE`);
    if (role === "expand") return fromGroup(RULES.get(word).map(parseAlt).flat(), quant);
    if (role === "name") return [{ item: "name", qualified: false }];
    if (role === "qualName") return [{ item: "name", qualified: true }];
    if (role === "constant") return [{ item: "constant" }];
    if (role === "list") return [{ item: "list", level: innerLevel(word), role: "separator" }];
    if (role === "body") return [{ item: "body", level: innerLevel(word) }];
    const [, style] = role.split("/");
    return [{ item: "binders", style, level: innerLevel(word) }];
  };

  const fromSeq = (atoms) => atoms.flatMap((a) => (a.word ? fromWord(a.word, a.quant) : fromGroup(a.alts, a.quant)));

  /** Collapse a `(a | b | c)` into one item when every branch means the same. */
  const fromGroup = (branches, quant) => {
    const rendered = branches.map(fromSeq);
    const single = rendered.every((r) => r.length === 1);
    if (single && rendered.every((r) => r[0].item === "operator")) return [{ item: "operator" }];
    if (single && rendered.every((r) => r[0].item === "part" && r[0].role === rendered[0][0].role)) {
      return [{ item: "part", role: rendered[0][0].role, optional: quant === "?" }];
    }
    if (branches.length === 1) {
      return quant === "?" ? [{ item: "optional", items: rendered[0] }] : rendered[0];
    }
    throw new Error(`${where}: cannot collapse the alternation ${JSON.stringify(rendered)}`);
  };

  const template = fromSeq(parseAlt(alt).flat());

  // Cross-check against the two facts derived independently of this walk. An
  // operand the template misses (or invents) would silently mis-place a slot.
  const operandItems = (items) => items.flatMap((i) =>
    i.item === "operand" ? [i.level] : i.item === "optional" ? operandItems(i.items) : []);
  const levels = operandItems(template);
  const expected = operandLevels(alt);
  if (levels.join() !== expected.join()) {
    throw new Error(`${where}: template operands [${levels}] do not match the alternative's [${expected}]`);
  }
  const innerItems = template.flatMap((i) => ("level" in i && i.item !== "operand" ? [i.level] : []));
  const inner = innerLevel(alt);
  if (innerItems.some((l) => l !== inner)) {
    throw new Error(`${where}: template inner levels [${innerItems}] do not match the alternative's ${inner}`);
  }
  return template;
}

/** Left- or right-associative according to which end re-enters the level. */
function associativityOf(level, operands) {
  if (operands.length < 2) return null;
  const first = operands[0] === level;
  const last = operands[operands.length - 1] === level;
  if (first === last) return null;
  return first ? "left" : "right";
}

// --------------------------------------------------------------------------
// SEMANTICS: one entry per non-descent alternative in the expression cascade.
// Key = normalized signature (see signatureOf). Missing key => build error.
//
// status: "yes" (evaluates), "no" (parses but evaluation is rejected/fails).
// opStatus: per-operator override of `status`, for a construct the engine runs
//         except for one spelling -- `a is b` parses and is then rejected while
//         every other comparison evaluates.
// kinds:  what the construct yields and what each slot accepts. See KINDS.
// opKinds: overrides for constructs whose operators differ -- `sum` yields a
//         number where the other quantifiers yield a boolean, `@bool:` a
//         boolean where `~` yields a relation. Keyed by token, merged over
//         `kinds`. test/language-kinds.test.ts checks every `yields` against
//         what the evaluator actually returns.
// ops:    token names for the reference's "Operators" column.
// id:     stable name for the construct, for consumers that generate syntax.
// fixity: how the construct is written.
// means:  token -> the operator it selects. Which one you write picks the
//         meaning, so a generator indexes by these.
// parts:  token -> its structural role. Fixed punctuation; a generator needs
//         the spelling but never chooses between them.
//
// `means` and `parts` together must cover every token the alternative can
// contain, so a new token in an existing construct fails generation too.
// --------------------------------------------------------------------------

/**
 * What an expression is. The evaluator's `EvalResult` is a union that does not
 * say which arm a construct produces, and nothing in the grammar says it
 * either, so it is stated here and checked by execution.
 *
 *   relation  a set of tuples (a scalar is a singleton)
 *   number    an integer
 *   boolean   a formula's truth value
 *   string    an atom label or a string literal
 *   operand   whatever the operand is (grouping)
 *   any       any of the above is accepted here
 *   null      the construct does not determine it: read its operators, or it
 *             depends on something the grammar cannot see
 */
export const KINDS = ["relation", "number", "boolean", "string", "operand", "any", null];

const K = (yields, operands = [], inner = null) => ({ yields, operands, inner });

/**
 * How wide the result is, and how wide the operands have to be.
 *
 * Arity is the one thing about an expression that neither the grammar nor
 * `kinds` says, and a consumer that checks expressions before it emits them
 * needs it. The vocabulary below is closed; test/language-arity.test.ts runs a
 * witness per rule and measures the tuples that come back.
 *
 *   slot0/slot1  the result is as wide as that operand
 *   sum          the two operands' widths added (`->`)
 *   join         `a + b - 2`, and an error when that is below 1 (`.`)
 *   boxJoin      join folded over the argument list (`f[a, b]`)
 *   binders      one column per binder (`{x, y: S | ...}`)
 *   <number>     a fixed width
 *   null         the construct does not produce a relation
 */
export const ARITY_YIELDS = ["slot0", "slot1", "sum", "join", "boxJoin", "binders", null];

/**
 * `slots` is the width each operand must have (null = any), which the
 * evaluator enforces. `requires` is a cross-slot constraint, which is the
 * *static analyzer's* rule: executed at 3.1.0, the evaluator re-checks
 * `"equal"` only for `++` -- `Board + next` unions an arity-1 and an arity-3
 * relation and returns the mixed set. Both are the engine, so both are here,
 * and which one a consumer honours is its own call.
 */
const A = (yields = null, slots = null, requires = null) => ({ yields, slots, requires });

export const SEMANTICS = new Map(Object.entries({
  // ---- binders (the `expr` level) ----
  "LET_TOK letDeclList blockOrBar": {
    name: "let binding", example: "let x = e | body", status: "no",
    meaning: "Bind names to expression values inside a body. Parses, but evaluation is not implemented and fails.",
    id: "let", fixity: "binder", kinds: K(null, [], null), arity: A(),
    means: { LET_TOK: "let" },
    parts: {
      EQ_TOK: "bind", COMMA_TOK: "separator", BAR_TOK: "bar",
      LEFT_CURLY_TOK: "blockOpen", RIGHT_CURLY_TOK: "blockClose",
    },
  },
  "BIND_TOK letDeclList blockOrBar": {
    name: "bind", example: "bind x = e | body", status: "no",
    meaning: "Alloy `bind`. Parses, but evaluation is rejected.",
    id: "bind", fixity: "binder", kinds: K(null, [], null), arity: A(),
    means: { BIND_TOK: "bind" },
    parts: {
      EQ_TOK: "bind", COMMA_TOK: "separator", BAR_TOK: "bar",
      LEFT_CURLY_TOK: "blockOpen", RIGHT_CURLY_TOK: "blockClose",
    },
  },
  "quant DISJ_TOK ? quantDeclList blockOrBar": {
    name: "quantified formula", example: "all x: S | body", status: "yes",
    meaning: "Quantifiers `all`, `no`, `some`, `lone`, `one`, `two`, and the aggregator `sum x: S | intExpr`. " +
      "`disj` requires the bound variables to take pairwise-distinct values. The body must use the bar form (`| expr`).",
    id: "quantifier", fixity: "quantifier",
    kinds: K("boolean", [], "boolean"), arity: A(),
    opKinds: { SUM_TOK: { yields: "number", inner: "number" } },
    means: {
      ALL_TOK: "all", NO_TOK: "no", SUM_TOK: "sum",
      LONE_TOK: "lone", SOME_TOK: "some", ONE_TOK: "one", TWO_TOK: "two",
    },
    parts: {
      DISJ_TOK: "disjoint", COLON_TOK: "colon", COMMA_TOK: "separator",
      SET_TOK: "domainMultiplicity", BAR_TOK: "bar",
      LEFT_CURLY_TOK: "blockOpen", RIGHT_CURLY_TOK: "blockClose",
    },
  },
  // ---- boolean connectives ----
  "_ OR_TOK _": {
    name: "disjunction", example: "a or b", ops: ["OR_TOK"], status: "yes", meaning: "Logical or (short-circuits).",
    id: "or", fixity: "infix", kinds: K("boolean", ["boolean", "boolean"]), arity: A(),
    means: { OR_TOK: "or" }, parts: {},
  },
  "_ XOR_TOK _": {
    name: "exclusive or", example: "a xor b", ops: ["XOR_TOK"], status: "yes", meaning: "Logical exclusive or.",
    id: "xor", fixity: "infix", kinds: K("boolean", ["boolean", "boolean"]), arity: A(),
    means: { XOR_TOK: "xor" }, parts: {},
  },
  "_ IFF_TOK _": {
    name: "biconditional", example: "a iff b", ops: ["IFF_TOK"], status: "yes", meaning: "Logical if-and-only-if.",
    id: "iff", fixity: "infix", kinds: K("boolean", ["boolean", "boolean"]), arity: A(),
    means: { IFF_TOK: "iff" }, parts: {},
  },
  "_ IMP_TOK _ ( ELSE_TOK _ ) ?": {
    name: "implication", example: "a implies b else c", ops: ["IMP_TOK", "ELSE_TOK"], status: "yes",
    meaning: "Implication, with an optional else branch (`a => b else c` means `(a and b) or ((not a) and c)`).",
    id: "implies", fixity: "infix",
    kinds: K("boolean", ["boolean", "boolean", "boolean"]), arity: A(),
    means: { IMP_TOK: "implies" }, parts: { ELSE_TOK: "else" },
  },
  "_ AND_TOK _": {
    name: "conjunction", example: "a and b", ops: ["AND_TOK"], status: "yes", meaning: "Logical and (short-circuits).",
    id: "and", fixity: "infix", kinds: K("boolean", ["boolean", "boolean"]), arity: A(),
    means: { AND_TOK: "and" }, parts: {},
  },
  "NEG_TOK _": {
    name: "negation", example: "not a", ops: ["NEG_TOK"], status: "yes", meaning: "Logical negation of a boolean formula.",
    id: "not", fixity: "prefix", kinds: K("boolean", ["boolean"]), arity: A(),
    means: { NEG_TOK: "not" }, parts: {},
  },
  // ---- comparisons ----
  "_ NEG_TOK ? compareOp _": {
    name: "comparison", example: "a in b", ops: ["IN_TOK", "EQ_TOK", "LT_TOK", "GT_TOK", "LEQ_TOK", "GEQ_TOK", "NI_TOK", "IS_TOK"], status: "yes",
    meaning: "Subset (`in`), reverse containment (`ni`), set equality (`=`), and numeric comparisons. " +
      "A scalar is a singleton set, so `in` doubles as membership. A leading `!`/`not` negates the comparison. " +
      "`is` parses but its evaluation is rejected.",
    id: "comparison", fixity: "infix",
    // `=`, `in` and `ni` compare anything against anything -- a scalar is a
    // singleton set, so `1 = 1` and `Board = Board` are both fine. The ordered
    // comparisons want numbers: `Board < Board` is an evaluation error.
    kinds: K("boolean", ["any", "any"]), arity: A(null, null, "equal"),
    opStatus: { IS_TOK: "no" },
    opKinds: {
      LT_TOK: { operands: ["number", "number"] }, GT_TOK: { operands: ["number", "number"] },
      LEQ_TOK: { operands: ["number", "number"] }, GEQ_TOK: { operands: ["number", "number"] },
    },
    means: {
      IN_TOK: "subset", EQ_TOK: "equal", LT_TOK: "lessThan", GT_TOK: "greaterThan",
      LEQ_TOK: "atMost", GEQ_TOK: "atLeast", NI_TOK: "contains", IS_TOK: "is",
    },
    parts: { NEG_TOK: "negation" },
  },
  // ---- multiplicity tests ----
  "( NO_TOK | SOME_TOK | LONE_TOK | ONE_TOK | TWO_TOK | SET_TOK ) _": {
    name: "multiplicity test", example: "some e", ops: ["NO_TOK", "SOME_TOK", "LONE_TOK", "ONE_TOK", "TWO_TOK", "SET_TOK"], status: "yes",
    meaning: "Cardinality predicates over a set: `no` (empty), `some` (non-empty), `lone` (at most one), `one` (exactly one), `two` (exactly two). `set e` is the identity.",
    id: "multiplicityTest", fixity: "prefix",
    // `set e` is the identity, so it hands back the operand rather than a
    // truth value -- the one spelling here that is not a predicate.
    kinds: K("boolean", ["relation"]), arity: A(),
    opKinds: { SET_TOK: { yields: "operand" } },
    opArity: { SET_TOK: { yields: "slot0" } },
    means: {
      NO_TOK: "empty", SOME_TOK: "nonEmpty", LONE_TOK: "atMostOne",
      ONE_TOK: "exactlyOne", TWO_TOK: "exactlyTwo", SET_TOK: "any",
    },
    parts: {},
  },
  // ---- set / relational algebra ----
  "_ ( PLUS_TOK | MINUS_TOK ) _": {
    name: "union / difference", example: "a + b", ops: ["PLUS_TOK", "MINUS_TOK"], status: "yes",
    meaning: "Set union and set difference. (For integer arithmetic use the `add[...]`/`subtract[...]` builtins; `1 + 2` is the two-element set.)",
    id: "unionDifference", fixity: "infix",
    kinds: K("relation", ["relation", "relation"]), arity: A("slot0", null, "equal"),
    means: { PLUS_TOK: "union", MINUS_TOK: "difference" }, parts: {},
  },
  "CARD_TOK _": {
    name: "cardinality", example: "#e", ops: ["CARD_TOK"], status: "yes", meaning: "Number of tuples in the set.",
    id: "cardinality", fixity: "prefix", kinds: K("number", ["relation"]), arity: A(),
    means: { CARD_TOK: "cardinality" }, parts: {},
  },
  "_ PPLUS_TOK _": {
    name: "override", example: "a ++ b", ops: ["PPLUS_TOK"], status: "yes",
    meaning: "Relational override: tuples of `b`, plus the tuples of `a` whose first atom is not a first atom of `b`.",
    id: "override", fixity: "infix", kinds: K("relation", ["relation", "relation"]),
    arity: A("slot0", null, "equal"),
    means: { PPLUS_TOK: "override" }, parts: {},
  },
  "_ AMP_TOK _": {
    name: "intersection", example: "a & b", ops: ["AMP_TOK"], status: "yes", meaning: "Set intersection.",
    id: "intersection", fixity: "infix", kinds: K("relation", ["relation", "relation"]),
    arity: A("slot0", null, "equal"),
    means: { AMP_TOK: "intersection" }, parts: {},
  },
  "_ arrowOp _": {
    name: "product", example: "a -> b", ops: ["ARROW_TOK"], status: "yes",
    meaning: "Cartesian product. Multiplicity annotations (`a one -> lone b`) are declaration syntax and are rejected in expressions.",
    id: "product", fixity: "infix",
    kinds: K("relation", ["relation", "relation"]), arity: A("sum"),
    means: { ARROW_TOK: "product" },
    parts: {
      LONE_TOK: "multiplicity", SOME_TOK: "multiplicity", ONE_TOK: "multiplicity",
      TWO_TOK: "multiplicity", SET_TOK: "multiplicity",
    },
  },
  "_ ( SUBT_TOK | SUPT_TOK ) _": {
    name: "restriction", example: "S <: r", ops: ["SUBT_TOK", "SUPT_TOK"], status: "yes",
    meaning: "Domain restriction (`S <: r`: tuples of `r` starting in `S`) and range restriction (`r :> S`: tuples ending in `S`).",
    id: "restriction", fixity: "infix",
    kinds: K("relation", ["relation", "relation"]), arity: A(),
    // The restrictor is a set, and the restricted side survives whole.
    opArity: {
      SUBT_TOK: { slots: [1, null], yields: "slot1" },
      SUPT_TOK: { slots: [null, 1], yields: "slot0" },
    },
    means: { SUBT_TOK: "domainRestriction", SUPT_TOK: "rangeRestriction" }, parts: {},
  },
  "_ LEFT_SQUARE_TOK exprList RIGHT_SQUARE_TOK": {
    name: "box join / builtin call", example: "f[a, b]", ops: ["LEFT_SQUARE_TOK", "RIGHT_SQUARE_TOK"], status: "yes",
    meaning: "`a[b]` is the box join `b.a`. When the callee names a builtin (see the builtin table) it is a function call instead: `add[1, 2]`.",
    id: "application", fixity: "bracket",
    // Undetermined by the construct: `f[a]` is a join and yields a relation,
    // `add[1,2]` is a call and yields a number, and which it is depends on
    // whether the callee names a builtin.
    kinds: K(null, [null], null), arity: A("boxJoin"),
    means: {},
    parts: { LEFT_SQUARE_TOK: "open", RIGHT_SQUARE_TOK: "close", COMMA_TOK: "separator" },
  },
  "_ DOT_TOK _": {
    name: "join", example: "a.f", ops: ["DOT_TOK"], status: "yes",
    meaning: "Relational join: match the last column of the left operand against the first column of the right.",
    id: "join", fixity: "infix", kinds: K("relation", ["relation", "relation"]), arity: A("join"),
    means: { DOT_TOK: "join" }, parts: {},
  },
  "name LEFT_SQUARE_TOK exprList RIGHT_SQUARE_TOK": {
    name: "applied name (grammar corner)", example: "x.f[a]", status: "no",
    meaning: "A bracket application whose callee is parsed as a bare name inside a dot-chain. Redundant with box join; evaluation is not implemented.",
    id: "appliedName", fixity: "bracket", kinds: K(null, [], null), arity: A(),
    means: {},
    parts: { LEFT_SQUARE_TOK: "open", RIGHT_SQUARE_TOK: "close", COMMA_TOK: "separator" },
  },
  // ---- unary relational / label prefixes ----
  "( TILDE_TOK | EXP_TOK | STAR_TOK | GET_LABEL_TOK | GET_LABEL_STR_TOK | GET_LABEL_BOOL_TOK | GET_LABEL_NUM_TOK ) _": {
    name: "unary prefixes", example: "^r",
    ops: ["TILDE_TOK", "EXP_TOK", "STAR_TOK", "GET_LABEL_TOK", "GET_LABEL_STR_TOK", "GET_LABEL_BOOL_TOK", "GET_LABEL_NUM_TOK"], status: "yes",
    meaning: "`~r` transpose, `^r` transitive closure, `*r` reflexive-transitive closure. " +
      "`@:`/`@str:` label of an atom as a string, `@bool:`/`@num:` label converted to boolean/number (extensions; not Forge).",
    id: "unaryPrefix", fixity: "prefix",
    kinds: K("relation", ["relation"]), arity: A(),
    // The three relational prefixes are binary-only; a label projection maps
    // over whatever it is given, so it constrains nothing.
    opArity: {
      TILDE_TOK: { slots: [2], yields: 2 }, EXP_TOK: { slots: [2], yields: 2 },
      STAR_TOK: { slots: [2], yields: 2 },
    },
    opKinds: {
      GET_LABEL_TOK: { yields: "string" }, GET_LABEL_STR_TOK: { yields: "string" },
      GET_LABEL_BOOL_TOK: { yields: "boolean" }, GET_LABEL_NUM_TOK: { yields: "number" },
    },
    means: {
      TILDE_TOK: "transpose", EXP_TOK: "transitiveClosure", STAR_TOK: "reflexiveTransitiveClosure",
      GET_LABEL_TOK: "label", GET_LABEL_STR_TOK: "labelString",
      GET_LABEL_BOOL_TOK: "labelBoolean", GET_LABEL_NUM_TOK: "labelNumber",
    },
    parts: {},
  },
  // ---- atoms (the expr18 level) ----
  "const": {
    name: "constant", example: "none", status: "yes",
    meaning: "`none` (empty set), `univ` (all atoms), `iden` (identity relation), integer literals (incl. negative), and `\"...\"` string literals.",
    id: "constant", fixity: "atom",
    // The three named constants are relations; the same alternative also spells
    // a numeric or string literal, whose kind the lexical sections carry.
    kinds: K(null), arity: A(),
    opKinds: {
      NONE_TOK: { yields: "relation" }, UNIV_TOK: { yields: "relation" },
      IDEN_TOK: { yields: "relation" },
    },
    opArity: {
      NONE_TOK: { yields: 1 }, UNIV_TOK: { yields: 1 }, IDEN_TOK: { yields: 2 },
    },
    means: { NONE_TOK: "emptySet", UNIV_TOK: "universe", IDEN_TOK: "identity" },
    parts: { MINUS_TOK: "negation" },
  },
  "qualName": {
    name: "name", example: "Person", status: "yes",
    meaning: "A type, relation, atom, or bound variable. An unresolved name evaluates to the empty set and raises an `unresolved-name` diagnostic.",
    // A name's width is the schema's, so the construct settles nothing.
    id: "name", fixity: "atom", kinds: K("relation"), arity: A(), means: {}, parts: {},
  },
  "AT_TOK name": {
    name: "@name", example: "@x", status: "no", meaning: "Alloy-specific; evaluation is rejected.",
    id: "atName", fixity: "prefix", kinds: K(null), arity: A(),
    means: { AT_TOK: "atName" }, parts: {},
  },
  "BACKQUOTE_TOK name": {
    name: "atom literal", example: "`n0", status: "yes",
    meaning: "The atom with exactly this id, bypassing type/relation/variable lookup.",
    id: "atomLiteral", fixity: "prefix", kinds: K("relation"), arity: A(1),
    means: { BACKQUOTE_TOK: "atomLiteral" }, parts: {},
  },
  "THIS_TOK": {
    name: "this", example: "this", status: "no", meaning: "Alloy-specific; evaluation is rejected.",
    id: "this", fixity: "atom", kinds: K(null), arity: A(),
    means: { THIS_TOK: "this" }, parts: {},
  },
  "LEFT_CURLY_TOK quantDeclList blockOrBar RIGHT_CURLY_TOK": {
    name: "set comprehension", example: "{x: S | body}", status: "yes",
    meaning: "The set of bindings satisfying the body. Multiple binders build a relation: `{x: A, y: B | body}` is a set of pairs.",
    id: "comprehension", fixity: "comprehension",
    kinds: K("relation", [], "boolean"), arity: A("binders"),
    means: {},
    parts: {
      LEFT_CURLY_TOK: "open", RIGHT_CURLY_TOK: "close", BAR_TOK: "bar",
      COLON_TOK: "colon", COMMA_TOK: "separator", DISJ_TOK: "disjoint",
      SET_TOK: "domainMultiplicity",
    },
  },
  "LEFT_PAREN_TOK _ RIGHT_PAREN_TOK": {
    name: "parentheses", example: "(e)", status: "yes", meaning: "Grouping.",
    id: "grouping", fixity: "bracket", kinds: K("operand", ["operand"]), arity: A("slot0"),
    means: {}, parts: { LEFT_PAREN_TOK: "open", RIGHT_PAREN_TOK: "close" },
  },
  "block": {
    name: "block", example: "{ e1 e2 }", status: "yes",
    meaning: "A conjunction of boolean expressions, separated by whitespace (there is no `;` in the language).",
    id: "block", fixity: "bracket", kinds: K("boolean", [], "boolean"), arity: A(),
    means: {}, parts: { LEFT_CURLY_TOK: "open", RIGHT_CURLY_TOK: "close" },
  },
  "sexpr": {
    name: "s-expression", example: "sexpr", status: "no", meaning: "Reserved for internal use; evaluation is rejected.",
    id: "sexpr", fixity: "atom", kinds: K(null), arity: A(),
    means: { SEXPR_TOK: "sexpr" }, parts: {},
  },
}));

// --------------------------------------------------------------------------

/**
 * The kinds an entry declares have to line up with the shape the grammar gives
 * it: one per operand slot, and an inner kind exactly where there is an inner
 * position. An override may only name a token the construct actually spells.
 */
function checkKinds(entry, alt) {
  const where = `SEMANTICS entry '${entry.id}'`;
  const k = entry.kinds ?? (() => { throw new Error(`${where} declares no kinds`); })();
  const bad = (kind) => !KINDS.includes(kind ?? null);
  const slots = operandLevels(alt).length;
  const inner = innerLevel(alt);
  const check = (kinds, what) => {
    if (bad(kinds.yields)) throw new Error(`${where}${what}: unknown kind ${JSON.stringify(kinds.yields)}`);
    if (kinds.operands.length !== slots) {
      throw new Error(`${where}${what}: ${kinds.operands.length} operand kinds for ${slots} operand slots`);
    }
    for (const o of kinds.operands) {
      if (bad(o)) throw new Error(`${where}${what}: unknown operand kind ${JSON.stringify(o)}`);
    }
    if (bad(kinds.inner)) throw new Error(`${where}${what}: unknown inner kind ${JSON.stringify(kinds.inner)}`);
    if (inner === null && kinds.inner !== null) {
      throw new Error(`${where}${what}: declares an inner kind, but the alternative has no inner position`);
    }
  };
  check(k, "");
  for (const [table, name] of [[entry.opKinds, "opKinds"], [entry.opStatus, "opStatus"]]) {
    for (const token of Object.keys(table ?? {})) {
      if (!(token in entry.means)) {
        throw new Error(`${where}: ${name} names ${token}, which is not one of its operators`);
      }
    }
  }
  for (const [token, over] of Object.entries(entry.opKinds ?? {})) {
    check({ ...k, ...over }, `.${entry.means[token]}`);
  }
}

/**
 * An arity rule has to fit the shape the grammar gives the construct: one
 * required width per operand slot, a `slotN` that names a slot it has, and a
 * `sum`/`join` only where there are two operands to combine. `binders` and
 * `boxJoin` are checked against the template, which is where those positions
 * are.
 */
function checkArity(entry, alt) {
  const where = `SEMANTICS entry '${entry.id}'`;
  const slots = operandLevels(alt).length;
  const template = templateOf(alt, entry);
  const has = (kind) => template.some((i) => i.item === kind);
  const check = (a, what) => {
    if (a.slots !== null) {
      if (a.slots.length !== slots) {
        throw new Error(`${where}${what}: ${a.slots.length} arity slots for ${slots} operand slots`);
      }
      for (const s of a.slots) {
        if (s !== null && !(Number.isInteger(s) && s > 0)) {
          throw new Error(`${where}${what}: operand arity ${JSON.stringify(s)} is neither null nor a positive integer`);
        }
      }
    }
    const y = a.yields;
    if (Number.isInteger(y)) {
      if (y < 1) throw new Error(`${where}${what}: yields arity ${y}`);
    } else if (!ARITY_YIELDS.includes(y ?? null)) {
      throw new Error(`${where}${what}: unknown arity rule ${JSON.stringify(y)}`);
    } else if (typeof y === "string" && y.startsWith("slot")) {
      if (Number(y.slice(4)) >= slots) throw new Error(`${where}${what}: ${y} but there are ${slots} operand slots`);
    } else if ((y === "sum" || y === "join") && slots !== 2) {
      throw new Error(`${where}${what}: '${y}' needs two operands, this has ${slots}`);
    } else if (y === "binders" && !has("binders")) {
      throw new Error(`${where}${what}: 'binders' but the construct has no binder list`);
    } else if (y === "boxJoin" && !has("list")) {
      throw new Error(`${where}${what}: 'boxJoin' but the construct has no argument list`);
    }
    if (a.requires !== null && a.requires !== "equal") {
      throw new Error(`${where}${what}: unknown arity constraint ${JSON.stringify(a.requires)}`);
    }
    if (a.requires === "equal" && slots < 2) {
      throw new Error(`${where}${what}: 'equal' needs two operands, this has ${slots}`);
    }
  };
  const base = entry.arity ?? (() => { throw new Error(`${where} declares no arity`); })();
  check(base, "");
  for (const token of Object.keys(entry.opArity ?? {})) {
    if (!(token in entry.means)) {
      throw new Error(`${where}: opArity names ${token}, which is not one of its operators`);
    }
    check({ ...base, ...entry.opArity[token] }, `.${entry.means[token]}`);
  }
}

const spellingsOf = (token) => {
  const t = TOKENS.get(token);
  if (!t) throw new Error(`Token ${token} is not in the lexer grammar`);
  if (!t.literals) throw new Error(`Token ${token} is a pattern, so it has no fixed spelling`);
  return t.literals;
};

/**
 * Walk the cascade loosest-first, pairing each alternative with its entry.
 * Throws when an alternative is undocumented, or when an entry describes a
 * token the alternative cannot contain (or misses one it can).
 */
export function walkCascade() {
  const out = [];
  cascade.forEach((rule, level) => {
    for (const alt of RULES.get(rule)) {
      const sig = signatureOf(alt);
      if (isDescent(sig)) continue;
      const entry = SEMANTICS.get(sig);
      if (!entry) {
        throw new Error(
          `No SEMANTICS entry for grammar alternative of '${rule}':\n  signature: ${sig}\n` +
          `Add one to scripts/constructs.mjs (this is the keep-in-sync check).`
        );
      }
      const described = [...Object.keys(entry.means), ...Object.keys(entry.parts)];
      const present = tokensOf(alt);
      const undescribed = present.filter((t) => !described.includes(t));
      const absent = described.filter((t) => !present.includes(t));
      if (undescribed.length || absent.length) {
        throw new Error(
          `SEMANTICS entry '${entry.id}' does not match its grammar alternative.\n` +
          `  tokens in the grammar but not described: ${undescribed.join(", ") || "-"}\n` +
          `  tokens described but not in the grammar: ${absent.join(", ") || "-"}`
        );
      }
      for (const t of described) spellingsOf(t);
      checkKinds(entry, alt);
      checkArity(entry, alt);
      out.push({ rule, level, alt, sig, entry });
    }
  });
  return out;
}

/**
 * The cascade as data: one record per construct, loosest first.
 *
 * Operator ids are unique across the whole table, so a consumer can name one
 * without also naming its construct.
 */
export function constructRecords() {
  // Several tokens can fill one role -- an arrow's multiplicity is any of
  // `lone`/`some`/`one`/`two`/`set` -- so a role collects all their spellings.
  const byRole = (table) => {
    const roles = {};
    for (const [token, role] of Object.entries(table)) {
      roles[role] = [...(roles[role] ?? []), ...spellingsOf(token)];
    }
    return roles;
  };

  const claimed = new Map();
  for (const { entry } of walkCascade()) {
    for (const id of Object.values(entry.means)) {
      if (claimed.has(id)) {
        throw new Error(
          `Operator id '${id}' is claimed by both '${claimed.get(id)}' and '${entry.id}'. ` +
          `Ids are the manifest's public names, so they must be unique.`);
      }
      claimed.set(id, entry.id);
    }
  }

  // `slots: null` is shorthand for "no slot is constrained"; spelling it out
  // here keeps every consumer from having to know the shorthand.
  const arityOf = (entry, slots, over) => {
    const a = { ...entry.arity, ...over };
    return { ...a, slots: a.slots ?? Array(slots).fill(null) };
  };

  return walkCascade().map(({ level, alt, entry }) => {
    const operands = operandLevels(alt);
    return {
      id: entry.id,
      precedence: level,
      fixity: entry.fixity,
      evaluates: entry.status === "yes",
      operands,
      inner: innerLevel(alt),
      associativity: associativityOf(level, operands),
      template: templateOf(alt, entry),
      kinds: entry.kinds,
      arity: arityOf(entry, operands.length),
      operators: Object.entries(entry.means).map(([token, id]) => ({
        id,
        spellings: spellingsOf(token),
        evaluates: (entry.opStatus?.[token] ?? entry.status) === "yes",
        // merged, so a consumer reads one place rather than two
        kinds: { ...entry.kinds, ...(entry.opKinds?.[token] ?? {}) },
        arity: arityOf(entry, operands.length, entry.opArity?.[token]),
      })),
      parts: byRole(entry.parts),
    };
  });
}

/** The prose table's rows: entries grouped by cascade level. */
export function proseRows() {
  const rows = [];
  for (const { rule, entry } of walkCascade()) {
    const last = rows[rows.length - 1];
    if (last && last.rule === rule) last.entries.push(entry);
    else rows.push({ rule, entries: [entry] });
  }
  return rows;
}
