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

export const SEMANTICS = new Map(Object.entries({
  // ---- binders (the `expr` level) ----
  "LET_TOK letDeclList blockOrBar": {
    name: "let binding", example: "let x = e | body", status: "no",
    meaning: "Bind names to expression values inside a body. Parses, but evaluation is not implemented and fails.",
    id: "let", fixity: "binder",
    means: { LET_TOK: "let" },
    parts: {
      EQ_TOK: "bind", COMMA_TOK: "separator", BAR_TOK: "bar",
      LEFT_CURLY_TOK: "blockOpen", RIGHT_CURLY_TOK: "blockClose",
    },
  },
  "BIND_TOK letDeclList blockOrBar": {
    name: "bind", example: "bind x = e | body", status: "no",
    meaning: "Alloy `bind`. Parses, but evaluation is rejected.",
    id: "bind", fixity: "binder",
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
    id: "or", fixity: "infix", means: { OR_TOK: "or" }, parts: {},
  },
  "_ XOR_TOK _": {
    name: "exclusive or", example: "a xor b", ops: ["XOR_TOK"], status: "yes", meaning: "Logical exclusive or.",
    id: "xor", fixity: "infix", means: { XOR_TOK: "xor" }, parts: {},
  },
  "_ IFF_TOK _": {
    name: "biconditional", example: "a iff b", ops: ["IFF_TOK"], status: "yes", meaning: "Logical if-and-only-if.",
    id: "iff", fixity: "infix", means: { IFF_TOK: "iff" }, parts: {},
  },
  "_ IMP_TOK _ ( ELSE_TOK _ ) ?": {
    name: "implication", example: "a implies b else c", ops: ["IMP_TOK", "ELSE_TOK"], status: "yes",
    meaning: "Implication, with an optional else branch (`a => b else c` means `(a and b) or ((not a) and c)`).",
    id: "implies", fixity: "infix",
    means: { IMP_TOK: "implies" }, parts: { ELSE_TOK: "else" },
  },
  "_ AND_TOK _": {
    name: "conjunction", example: "a and b", ops: ["AND_TOK"], status: "yes", meaning: "Logical and (short-circuits).",
    id: "and", fixity: "infix", means: { AND_TOK: "and" }, parts: {},
  },
  "NEG_TOK _": {
    name: "negation", example: "not a", ops: ["NEG_TOK"], status: "yes", meaning: "Logical negation of a boolean formula.",
    id: "not", fixity: "prefix", means: { NEG_TOK: "not" }, parts: {},
  },
  // ---- comparisons ----
  "_ NEG_TOK ? compareOp _": {
    name: "comparison", example: "a in b", ops: ["IN_TOK", "EQ_TOK", "LT_TOK", "GT_TOK", "LEQ_TOK", "GEQ_TOK", "NI_TOK", "IS_TOK"], status: "yes",
    meaning: "Subset (`in`), reverse containment (`ni`), set equality (`=`), and numeric comparisons. " +
      "A scalar is a singleton set, so `in` doubles as membership. A leading `!`/`not` negates the comparison. " +
      "`is` parses but its evaluation is rejected.",
    id: "comparison", fixity: "infix",
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
    means: { PLUS_TOK: "union", MINUS_TOK: "difference" }, parts: {},
  },
  "CARD_TOK _": {
    name: "cardinality", example: "#e", ops: ["CARD_TOK"], status: "yes", meaning: "Number of tuples in the set.",
    id: "cardinality", fixity: "prefix", means: { CARD_TOK: "cardinality" }, parts: {},
  },
  "_ PPLUS_TOK _": {
    name: "override", example: "a ++ b", ops: ["PPLUS_TOK"], status: "yes",
    meaning: "Relational override: tuples of `b`, plus the tuples of `a` whose first atom is not a first atom of `b`.",
    id: "override", fixity: "infix", means: { PPLUS_TOK: "override" }, parts: {},
  },
  "_ AMP_TOK _": {
    name: "intersection", example: "a & b", ops: ["AMP_TOK"], status: "yes", meaning: "Set intersection.",
    id: "intersection", fixity: "infix", means: { AMP_TOK: "intersection" }, parts: {},
  },
  "_ arrowOp _": {
    name: "product", example: "a -> b", ops: ["ARROW_TOK"], status: "yes",
    meaning: "Cartesian product. Multiplicity annotations (`a one -> lone b`) are declaration syntax and are rejected in expressions.",
    id: "product", fixity: "infix",
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
    means: { SUBT_TOK: "domainRestriction", SUPT_TOK: "rangeRestriction" }, parts: {},
  },
  "_ LEFT_SQUARE_TOK exprList RIGHT_SQUARE_TOK": {
    name: "box join / builtin call", example: "f[a, b]", ops: ["LEFT_SQUARE_TOK", "RIGHT_SQUARE_TOK"], status: "yes",
    meaning: "`a[b]` is the box join `b.a`. When the callee names a builtin (see the builtin table) it is a function call instead: `add[1, 2]`.",
    id: "application", fixity: "bracket",
    means: {},
    parts: { LEFT_SQUARE_TOK: "open", RIGHT_SQUARE_TOK: "close", COMMA_TOK: "separator" },
  },
  "_ DOT_TOK _": {
    name: "join", example: "a.f", ops: ["DOT_TOK"], status: "yes",
    meaning: "Relational join: match the last column of the left operand against the first column of the right.",
    id: "join", fixity: "infix", means: { DOT_TOK: "join" }, parts: {},
  },
  "name LEFT_SQUARE_TOK exprList RIGHT_SQUARE_TOK": {
    name: "applied name (grammar corner)", example: "x.f[a]", status: "no",
    meaning: "A bracket application whose callee is parsed as a bare name inside a dot-chain. Redundant with box join; evaluation is not implemented.",
    id: "appliedName", fixity: "bracket",
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
    means: { NONE_TOK: "empty", UNIV_TOK: "universe", IDEN_TOK: "identity" },
    parts: { MINUS_TOK: "negation" },
  },
  "qualName": {
    name: "name", example: "Person", status: "yes",
    meaning: "A type, relation, atom, or bound variable. An unresolved name evaluates to the empty set and raises an `unresolved-name` diagnostic.",
    id: "name", fixity: "atom", means: {}, parts: {},
  },
  "AT_TOK name": {
    name: "@name", example: "@x", status: "no", meaning: "Alloy-specific; evaluation is rejected.",
    id: "atName", fixity: "prefix", means: { AT_TOK: "atName" }, parts: {},
  },
  "BACKQUOTE_TOK name": {
    name: "atom literal", example: "`n0", status: "yes",
    meaning: "The atom with exactly this id, bypassing type/relation/variable lookup.",
    id: "atomLiteral", fixity: "prefix", means: { BACKQUOTE_TOK: "atomLiteral" }, parts: {},
  },
  "THIS_TOK": {
    name: "this", example: "this", status: "no", meaning: "Alloy-specific; evaluation is rejected.",
    id: "this", fixity: "atom", means: { THIS_TOK: "this" }, parts: {},
  },
  "LEFT_CURLY_TOK quantDeclList blockOrBar RIGHT_CURLY_TOK": {
    name: "set comprehension", example: "{x: S | body}", status: "yes",
    meaning: "The set of bindings satisfying the body. Multiple binders build a relation: `{x: A, y: B | body}` is a set of pairs.",
    id: "comprehension", fixity: "comprehension",
    means: {},
    parts: {
      LEFT_CURLY_TOK: "open", RIGHT_CURLY_TOK: "close", BAR_TOK: "bar",
      COLON_TOK: "colon", COMMA_TOK: "separator", DISJ_TOK: "disjoint",
      SET_TOK: "domainMultiplicity",
    },
  },
  "LEFT_PAREN_TOK _ RIGHT_PAREN_TOK": {
    name: "parentheses", example: "(e)", status: "yes", meaning: "Grouping.",
    id: "grouping", fixity: "bracket",
    means: {}, parts: { LEFT_PAREN_TOK: "open", RIGHT_PAREN_TOK: "close" },
  },
  "block": {
    name: "block", example: "{ e1 e2 }", status: "yes",
    meaning: "A conjunction of boolean expressions, separated by whitespace (there is no `;` in the language).",
    id: "block", fixity: "bracket",
    means: {}, parts: { LEFT_CURLY_TOK: "open", RIGHT_CURLY_TOK: "close" },
  },
  "sexpr": {
    name: "s-expression", example: "sexpr", status: "no", meaning: "Reserved for internal use; evaluation is rejected.",
    id: "sexpr", fixity: "atom", means: { SEXPR_TOK: "sexpr" }, parts: {},
  },
}));

// --------------------------------------------------------------------------

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
      out.push({ rule, level, alt, sig, entry });
    }
  });
  return out;
}

/** The cascade as data: one record per construct, loosest first. */
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
      operators: Object.entries(entry.means)
        .map(([token, id]) => ({ id, spellings: spellingsOf(token) })),
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
