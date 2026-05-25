import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import { ForgeVisitor } from "./forge-antlr/ForgeVisitor";
import {
  Expr1Context,
  Expr1_5Context,
  Expr2Context,
  Expr3Context,
  Expr4Context,
  Expr5Context,
  Expr6Context,
  Expr7Context,
  Expr8Context,
  Expr9Context,
  Expr11Context,
  Expr12Context,
  Expr14Context,
  Expr15Context,
  Expr17Context,
  Expr18Context,
  ExprContext,
  NameContext,
  NameListContext,
  QuantDeclListContext,
  BlockContext,
  QuantContext,
} from "./forge-antlr/ForgeParser";
import { getIdentifierName } from "./forge-antlr/utils";
import { IForgeSchema, IRelation, IType } from "./types";

// Internal lattice element used during recursion.
// "bool"/"num" carry the constant they fold to; "empty" means a set/relation
// is provably empty; "typed" means a relation with a known arity and (when
// derivable) column types; "ill-typed" means the expression is statically
// malformed (arity mismatch, etc.); "unknown" is the conservative top.
type Abstract =
  | { kind: "bool"; value: boolean }
  | { kind: "num"; value: number }
  | { kind: "empty" }
  | { kind: "typed"; arity: number; columnTypes?: readonly string[] }
  | { kind: "ill-typed"; reason: string }
  | { kind: "unknown" };

const UNKNOWN: Abstract = { kind: "unknown" };

export type StaticAnalysis =
  | { status: "unsat"; reason: string }       // boolean expr provably false
  | { status: "tautology"; reason: string }   // boolean expr provably true
  | { status: "empty"; reason: string }       // set/relation expr provably empty
  | { status: "ill-typed"; reason: string }   // statically malformed (e.g. arity mismatch)
  | { status: "unknown" };

// Helper that wraps the schema with O(1) lookups and lattice queries.
class SchemaInfo {
  private readonly typesById: Map<string, IType>;
  private readonly relationsByName: Map<string, IRelation>;

  constructor(schema: IForgeSchema) {
    this.typesById = new Map(schema.getTypes().map((t) => [t.id, t]));
    this.relationsByName = new Map(schema.getRelations().map((r) => [r.name, r]));
  }

  getType(id: string): IType | undefined { return this.typesById.get(id); }
  getRelation(name: string): IRelation | undefined { return this.relationsByName.get(name); }

  // A ⊆ B when B is in A's lineage. `IType.types` is the lineage in ascending
  // order, conventionally starting with the type itself.
  isSubtypeOf(a: string, b: string): boolean {
    if (a === b) return true;
    const t = this.typesById.get(a);
    if (!t) return false;
    return t.types.includes(b);
  }

  // Closed-world disjointness: A and B are disjoint iff no type in the
  // schema has both A and B in its lineage (i.e., no common subtype exists).
  // Sound only when the caller treats the supplied schema as complete.
  areDisjoint(a: string, b: string): boolean {
    if (a === b) return false;
    for (const t of this.typesById.values()) {
      if (t.types.includes(a) && t.types.includes(b)) return false;
    }
    return true;
  }
}

// ANTLR's .text concatenates child tokens without whitespace, which gives us
// a usable canonical form for "syntactically the same subexpression".
function sameSubtree(a: ParseTree | undefined, b: ParseTree | undefined): boolean {
  if (!a || !b) return false;
  return a.text === b.text;
}

// True iff `ctx` is structurally a difference whose subtrahend (anywhere in a
// left-associated minus chain) matches `targetText`. Strips parens and
// pass-through wrappers. Examples that match for target="X":
//   X - X       (Y - X)       (Y - Z - X)       ((Y - X) - Z)
function subtractsTarget(ctx: ParseTree | undefined, targetText: string): boolean {
  if (!ctx) return false;
  let cur: ParseTree = ctx;
  while (cur.childCount === 1) cur = cur.getChild(0);
  if (cur instanceof Expr18Context && cur.LEFT_PAREN_TOK()) {
    return subtractsTarget(cur.expr()!, targetText);
  }
  if (cur instanceof Expr8Context && cur.MINUS_TOK()) {
    if (cur.expr10()!.text === targetText) return true;
    // Chain: `A - B - target` parses left-assoc as `((A - B) - target)`;
    // recurse on the left to catch deeper occurrences.
    return subtractsTarget(cur.expr8()!, targetText);
  }
  return false;
}

// True iff `ctx` is structurally an intersection involving `targetText`
// (so `ctx ⊆ target`). Walks through parens, pass-throughs, and chains of `&`.
function intersectionInvolves(ctx: ParseTree | undefined, targetText: string): boolean {
  if (!ctx) return false;
  let cur: ParseTree = ctx;
  while (cur.childCount === 1) cur = cur.getChild(0);
  if (cur instanceof Expr18Context && cur.LEFT_PAREN_TOK()) {
    return intersectionInvolves(cur.expr()!, targetText);
  }
  if (cur instanceof Expr11Context && cur.AMP_TOK()) {
    if (cur.expr11()!.text === targetText) return true;
    if (cur.expr12()!.text === targetText) return true;
    return (
      intersectionInvolves(cur.expr11()!, targetText) ||
      intersectionInvolves(cur.expr12()!, targetText)
    );
  }
  return false;
}

// True iff `ctx` is structurally a union containing `targetText`
// (so `target ⊆ ctx`). Walks through parens, pass-throughs, and chains of `+`.
function unionContains(ctx: ParseTree | undefined, targetText: string): boolean {
  if (!ctx) return false;
  let cur: ParseTree = ctx;
  while (cur.childCount === 1) cur = cur.getChild(0);
  if (cur instanceof Expr18Context && cur.LEFT_PAREN_TOK()) {
    return unionContains(cur.expr()!, targetText);
  }
  if (cur instanceof Expr8Context && cur.PLUS_TOK()) {
    if (cur.expr8()!.text === targetText) return true;
    if (cur.expr10()!.text === targetText) return true;
    return (
      unionContains(cur.expr8()!, targetText) ||
      unionContains(cur.expr10()!, targetText)
    );
  }
  return false;
}

// Strip wrapping parens / pass-through expr layers to reveal an inner NEG_TOK
// at the expr5 level. Returns the operand-text if `ctx` is structurally `not E`,
// else undefined.
function negationOperandText(ctx: ParseTree | undefined): string | undefined {
  if (!ctx) return undefined;
  let cur: ParseTree = ctx;
  while (cur.childCount === 1) {
    cur = cur.getChild(0);
  }
  if (cur instanceof Expr5Context && cur.NEG_TOK()) {
    const inner = cur.expr5();
    return inner ? inner.text : undefined;
  }
  if (cur instanceof Expr18Context && cur.LEFT_PAREN_TOK()) {
    return negationOperandText(cur.expr()!);
  }
  return undefined;
}

export class ForgeExprStaticAnalyzer
  extends AbstractParseTreeVisitor<Abstract>
  implements ForgeVisitor<Abstract>
{
  private readonly schema?: SchemaInfo;

  constructor(schema?: IForgeSchema) {
    super();
    if (schema) this.schema = new SchemaInfo(schema);
  }

  // Walk a nameList (`a, b, c`) and accumulate identifiers into `out`.
  private collectNamesFromList(ctx: NameListContext, out: Set<string>): void {
    out.add(getIdentifierName(ctx.name()));
    const tail = ctx.nameList();
    if (tail) this.collectNamesFromList(tail, out);
  }

  // Walk a quantDeclList (`a : S, b : T`) and accumulate all bound identifiers.
  private collectBoundNames(ctx: QuantDeclListContext, out: Set<string>): void {
    this.collectNamesFromList(ctx.quantDecl().nameList(), out);
    const tail = ctx.quantDeclList();
    if (tail) this.collectBoundNames(tail, out);
  }

  // Policy: when a schema is provided, type and relation names are reserved —
  // they may only refer to the schema entity. Returns an ill-typed Abstract if
  // any candidate name collides; undefined otherwise.
  private illTypedIfBindsReservedName(names: Iterable<string>): Abstract | undefined {
    if (!this.schema) return undefined;
    for (const name of names) {
      if (this.schema.getType(name) || this.schema.getRelation(name)) {
        return {
          kind: "ill-typed",
          reason:
            `cannot bind variable named '${name}': it is a reserved schema ` +
            `${this.schema.getType(name) ? "type" : "relation"} name`,
        };
      }
    }
    return undefined;
  }

  // Public entry: convert internal lattice value to a verdict + reason.
  analyze(ctx: ParseTree): StaticAnalysis {
    const v = this.visit(ctx);
    if (v.kind === "bool") {
      return v.value
        ? { status: "tautology", reason: "expression folds to literal true" }
        : { status: "unsat", reason: "expression folds to literal false" };
    }
    if (v.kind === "empty") {
      return { status: "empty", reason: "expression is provably the empty set" };
    }
    if (v.kind === "ill-typed") {
      return { status: "ill-typed", reason: v.reason };
    }
    return { status: "unknown" };
  }

  // Arity of an Abstract when known; -1 means "not determinable".
  private static arityOf(v: Abstract): number {
    if (v.kind === "typed") return v.arity;
    if (v.kind === "bool" || v.kind === "num") return 1; // singleton sets
    if (v.kind === "empty") return -1; // empty has no committed arity
    return -1;
  }

  protected defaultResult(): Abstract {
    return UNKNOWN;
  }

  // Return the first ill-typed value among the args, or undefined. Used by
  // every operator handler to surface a statically malformed sub-expression
  // before any fold (including short-circuits like `false AND ?` and `true OR
  // ?`) could mask it.
  private static bailIfIllTyped(...vals: Abstract[]): Abstract | undefined {
    for (const v of vals) {
      if (v.kind === "ill-typed") return v;
    }
    return undefined;
  }

  // Prefer the more specific child result when aggregating across siblings.
  // For pass-through expr layers there's exactly one meaningful child; for
  // wrapper nodes like `( expr )` the terminals contribute UNKNOWN and the
  // real value comes from the single non-terminal child. Ill-typed always
  // wins — if any subtree is statically malformed, the parent is too.
  protected aggregateResult(aggregate: Abstract, nextResult: Abstract): Abstract {
    if (aggregate.kind === "ill-typed") return aggregate;
    if (nextResult.kind === "ill-typed") return nextResult;
    if (aggregate.kind === "unknown") return nextResult;
    return aggregate;
  }

  // Let/bind introduce data-dependent bindings; we don't fold through them.
  // Quantifiers we *do* fold in the cases where the verdict is independent of
  // the binding: an empty quantified domain, or a body that's a literal.
  visitExpr(ctx: ExprContext): Abstract {
    if (ctx.LET_TOK() || ctx.BIND_TOK()) return UNKNOWN;
    const quant = ctx.quant();
    if (quant) return this.foldQuantifier(ctx, quant);
    return this.visitChildren(ctx);
  }

  private foldQuantifier(ctx: ExprContext, quant: QuantContext): Abstract {
    const blockOrBar = ctx.blockOrBar();
    if (!blockOrBar) return UNKNOWN;

    // Reserved-name check at the binder: under a schema, type/relation names
    // cannot be reused as quantified variables.
    const declListTop = ctx.quantDeclList();
    if (declListTop) {
      const boundHere = new Set<string>();
      this.collectBoundNames(declListTop, boundHere);
      const reservedError = this.illTypedIfBindsReservedName(boundHere);
      if (reservedError) return reservedError;
    }

    // Determine if any quantified domain is statically empty.
    let domainEmpty = false;
    let declList = ctx.quantDeclList();
    while (declList) {
      const setExpr = declList.quantDecl().expr();
      const v = this.visit(setExpr);
      if (v.kind === "ill-typed") return v;
      if (v.kind === "empty") {
        domainEmpty = true;
        break;
      }
      const next = declList.quantDeclList();
      if (!next) break;
      declList = next;
    }

    // Body analysis (only attempt the `| expr` form; blocks are conjunctions
    // and would need the binding to be meaningful).
    let body: Abstract = UNKNOWN;
    if (blockOrBar.BAR_TOK() && blockOrBar.expr()) {
      body = this.visit(blockOrBar.expr()!);
    }

    const mult = quant.mult();
    const isAll = quant.ALL_TOK() !== undefined;
    const isNo = quant.NO_TOK() !== undefined;
    const isSome = mult?.SOME_TOK() !== undefined;
    const isOne = mult?.ONE_TOK() !== undefined;
    const isTwo = mult?.TWO_TOK() !== undefined;
    const isLone = mult?.LONE_TOK() !== undefined;

    if (domainEmpty) {
      // ∀ over empty is vacuously true; ∃ over empty is false.
      if (isAll || isNo || isLone) return { kind: "bool", value: true };
      if (isSome || isOne || isTwo) return { kind: "bool", value: false };
    }

    if (body.kind === "bool") {
      if (!body.value) {
        // body always false: no x satisfies, regardless of domain
        if (isNo || isLone) return { kind: "bool", value: true };
        if (isSome || isOne || isTwo) return { kind: "bool", value: false };
        // all x | false  →  data-dependent (vacuous if domain empty, else false)
      } else {
        // body always true: every x satisfies
        if (isAll) return { kind: "bool", value: true };
        // some/one/no etc. depend on domain size — data-dependent
      }
    }

    return UNKNOWN;
  }

  // A block { e1; e2; ...; en } is a conjunction of its expressions.
  visitBlock(ctx: BlockContext): Abstract {
    let result: Abstract = { kind: "bool", value: true };
    for (const e of ctx.expr()) {
      const v = this.visit(e);
      if (v.kind === "ill-typed") return v;               // ill-typed wins
      if (v.kind === "bool" && !v.value) return v;        // any false → false
      if (v.kind !== "bool") result = UNKNOWN;            // forget the running true
    }
    return result;
  }

  visitExpr1(ctx: Expr1Context): Abstract {
    if (ctx.OR_TOK()) {
      const leftCtx = ctx.expr1()!;
      const rightCtx = ctx.expr1_5()!;
      const l = this.visit(leftCtx);
      const r = this.visit(rightCtx);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      // X or X  →  X
      if (sameSubtree(leftCtx, rightCtx)) return l;
      if (l.kind === "bool" && l.value) return l;
      if (r.kind === "bool" && r.value) return r;
      if (l.kind === "bool" && r.kind === "bool") {
        return { kind: "bool", value: l.value || r.value };
      }
      // X or not X  /  not X or X  →  true (classical tautology)
      const lNeg = negationOperandText(leftCtx);
      const rNeg = negationOperandText(rightCtx);
      if (lNeg !== undefined && lNeg === rightCtx.text) return { kind: "bool", value: true };
      if (rNeg !== undefined && rNeg === leftCtx.text) return { kind: "bool", value: true };
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr1_5(ctx: Expr1_5Context): Abstract {
    if (ctx.XOR_TOK()) {
      const leftCtx = ctx.expr1_5()!;
      const rightCtx = ctx.expr2()!;
      const l = this.visit(leftCtx);
      const r = this.visit(rightCtx);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      // X xor X  →  false
      if (sameSubtree(leftCtx, rightCtx)) return { kind: "bool", value: false };
      if (l.kind === "bool" && r.kind === "bool") {
        return { kind: "bool", value: l.value !== r.value };
      }
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr2(ctx: Expr2Context): Abstract {
    if (ctx.IFF_TOK()) {
      const leftCtx = ctx.expr2()!;
      const rightCtx = ctx.expr3()!;
      const l = this.visit(leftCtx);
      const r = this.visit(rightCtx);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      // X iff X  →  true
      if (sameSubtree(leftCtx, rightCtx)) return { kind: "bool", value: true };
      // X iff not X  /  not X iff X  →  false
      const lNeg = negationOperandText(leftCtx);
      const rNeg = negationOperandText(rightCtx);
      if (lNeg !== undefined && lNeg === rightCtx.text) return { kind: "bool", value: false };
      if (rNeg !== undefined && rNeg === leftCtx.text) return { kind: "bool", value: false };
      if (l.kind === "bool" && r.kind === "bool") {
        return { kind: "bool", value: l.value === r.value };
      }
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr3(ctx: Expr3Context): Abstract {
    if (ctx.IMP_TOK()) {
      const ant = this.visit(ctx.expr4()!);
      const exprs3 = ctx.expr3();
      // Implication or implication-with-else. Visit all branches up front so
      // an ill-typed sub-expression is reported even when a short-circuit
      // (false antecedent, etc.) would otherwise fold the verdict.
      if (ctx.ELSE_TOK()) {
        const thenBranch = this.visit(exprs3[0]);
        const elseBranch = this.visit(exprs3[1]);
        const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(ant, thenBranch, elseBranch);
        if (bail) return bail;
        if (ant.kind === "bool") return ant.value ? thenBranch : elseBranch;
        return UNKNOWN;
      }
      const conseqCtx = exprs3[0]!;
      const con = this.visit(conseqCtx);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(ant, con);
      if (bail) return bail;
      // antecedent false → vacuously true
      if (ant.kind === "bool" && !ant.value) return { kind: "bool", value: true };
      // true => X  ≡  X
      if (ant.kind === "bool" && ant.value) return con;
      // _ => true  ≡  true
      if (con.kind === "bool" && con.value) return con;
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr4(ctx: Expr4Context): Abstract {
    if (ctx.AND_TOK()) {
      const leftCtx = ctx.expr4()!;
      const rightCtx = ctx.expr4_5()!;
      const l = this.visit(leftCtx);
      const r = this.visit(rightCtx);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      // X and X  →  X
      if (sameSubtree(leftCtx, rightCtx)) return l;
      if (l.kind === "bool" && !l.value) return l;
      if (r.kind === "bool" && !r.value) return r;
      if (l.kind === "bool" && r.kind === "bool") {
        return { kind: "bool", value: l.value && r.value };
      }
      // X and not X  /  not X and X  →  false
      const lNeg = negationOperandText(leftCtx);
      const rNeg = negationOperandText(rightCtx);
      if (lNeg !== undefined && lNeg === rightCtx.text) return { kind: "bool", value: false };
      if (rNeg !== undefined && rNeg === leftCtx.text) return { kind: "bool", value: false };
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr5(ctx: Expr5Context): Abstract {
    if (ctx.NEG_TOK()) {
      const inner = this.visit(ctx.expr5()!);
      if (inner.kind === "ill-typed") return inner;
      if (inner.kind === "bool") return { kind: "bool", value: !inner.value };
      return UNKNOWN;
    }
    // Temporal operators are not implemented; bail out conservatively.
    if (
      ctx.ALWAYS_TOK() ||
      ctx.EVENTUALLY_TOK() ||
      ctx.AFTER_TOK() ||
      ctx.BEFORE_TOK() ||
      ctx.ONCE_TOK() ||
      ctx.HISTORICALLY_TOK()
    ) {
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr6(ctx: Expr6Context): Abstract {
    const op = ctx.compareOp();
    if (!op) return this.visitChildren(ctx);

    const leftCtx = ctx.expr6()!;
    const rightCtx = ctx.expr7()!;
    const l = this.visit(leftCtx);
    const r = this.visit(rightCtx);
    const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
    if (bail) return bail;
    const negate = ctx.NEG_TOK() !== undefined;
    const opText = op.text;

    // `ni` is non-membership (the codebase's evaluator implements it as
    // !(in)). We fold it by computing the corresponding `in` verdict and
    // letting `finalize` invert. This keeps the static verdict in agreement
    // with runtime semantics for expressions like `X ni X` (false) and
    // `none ni 1` (true).
    const isNi = opText === "ni";
    const opForLogic = isNi ? "in" : opText;
    const finalize = (value: boolean): Abstract => {
      let v = value;
      if (isNi) v = !v;
      if (negate) v = !v;
      return { kind: "bool", value: v };
    };

    // Same-subtree shortcuts hold regardless of unknown values.
    if (sameSubtree(leftCtx, rightCtx)) {
      switch (opForLogic) {
        case "=":
        case "<=":
        case ">=":
        case "in":
          return finalize(true);
        case "<":
        case ">":
          return finalize(false);
      }
    }

    // Numeric literal folding.
    if (l.kind === "num" && r.kind === "num") {
      switch (opForLogic) {
        case "=":
          return finalize(l.value === r.value);
        case "<":
          return finalize(l.value < r.value);
        case ">":
          return finalize(l.value > r.value);
        case "<=":
          return finalize(l.value <= r.value);
        case ">=":
          return finalize(l.value >= r.value);
      }
    }

    // Boolean literal equality.
    if (l.kind === "bool" && r.kind === "bool" && opForLogic === "=") {
      return finalize(l.value === r.value);
    }

    // Empty / singleton comparisons.
    const lIsKnownSingleton = l.kind === "num" || l.kind === "bool";
    const rIsKnownSingleton = r.kind === "num" || r.kind === "bool";
    if (opForLogic === "=") {
      if (l.kind === "empty" && r.kind === "empty") return finalize(true);
      if (l.kind === "empty" && rIsKnownSingleton) return finalize(false);
      if (lIsKnownSingleton && r.kind === "empty") return finalize(false);
    }
    if (opForLogic === "in") {
      // empty set is a subset of every set
      if (l.kind === "empty") return finalize(true);
      // a non-empty singleton cannot be contained in the empty set
      if (lIsKnownSingleton && r.kind === "empty") return finalize(false);
    }

    // Arity mismatch on arity-sensitive comparisons → ill-typed.
    if (opText === "=" || opText === "in" || opText === "ni") {
      const la = ForgeExprStaticAnalyzer.arityOf(l);
      const ra = ForgeExprStaticAnalyzer.arityOf(r);
      if (la > 0 && ra > 0 && la !== ra) {
        return {
          kind: "ill-typed",
          reason: `arity mismatch in '${opText}': left has arity ${la}, right has arity ${ra}`,
        };
      }
    }

    // Schema-driven: subtype tautologies for `in` (and `ni` via finalize
    // inversion when A ⊆ B → A in B is true → A ni B is false). We
    // deliberately do NOT positively fold `ni` from the lattice — concluding
    // "not (A ⊆ B)" requires disjointness reasoning we don't perform here.
    if (this.schema && l.kind === "typed" && r.kind === "typed") {
      const lCols = l.columnTypes;
      const rCols = r.columnTypes;
      if (lCols && rCols && lCols.length === rCols.length) {
        const colWiseSubtype = lCols.every((lc, i) => this.schema!.isSubtypeOf(lc, rCols[i]));
        if (opForLogic === "in" && colWiseSubtype) return finalize(true);
      }
    }

    return UNKNOWN;
  }

  visitExpr7(ctx: Expr7Context): Abstract {
    const inner = this.visit(ctx.expr8());
    if (inner.kind === "ill-typed") return inner;

    if (ctx.SET_TOK()) return inner;

    if (inner.kind === "empty") {
      if (ctx.NO_TOK()) return { kind: "bool", value: true };
      if (ctx.LONE_TOK()) return { kind: "bool", value: true };
      if (ctx.SOME_TOK()) return { kind: "bool", value: false };
      if (ctx.ONE_TOK()) return { kind: "bool", value: false };
      if (ctx.TWO_TOK()) return { kind: "bool", value: false };
    }

    // If we can't say anything specific about the multiplicity, the whole
    // expression is still a boolean — but its value is unknown.
    if (
      ctx.NO_TOK() ||
      ctx.LONE_TOK() ||
      ctx.SOME_TOK() ||
      ctx.ONE_TOK() ||
      ctx.TWO_TOK()
    ) {
      return UNKNOWN;
    }

    return inner;
  }

  visitExpr8(ctx: Expr8Context): Abstract {
    if (ctx.MINUS_TOK()) {
      const leftCtx = ctx.expr8()!;
      const rightCtx = ctx.expr10()!;
      const l = this.visit(leftCtx);
      const r = this.visit(rightCtx);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      // X - X  →  empty (set difference) or 0 (numeric)
      if (sameSubtree(leftCtx, rightCtx)) {
        if (l.kind === "num") return { kind: "num", value: 0 };
        return { kind: "empty" };
      }
      // Numeric folding for literal subtraction.
      if (l.kind === "num" && r.kind === "num") {
        return { kind: "num", value: l.value - r.value };
      }
      // empty - X  →  empty;  X - empty  →  X
      if (l.kind === "empty") return { kind: "empty" };
      if (r.kind === "empty") return l;
      // Subset patterns: L ⊆ R  ⇒  L - R = empty.
      //   (R & ?) - R   or   (? & R) - R     (intersection is a subset)
      if (intersectionInvolves(leftCtx, rightCtx.text)) return { kind: "empty" };
      //   L - (L + ?)   or   L - (? + L)     (L is a subset of the union)
      if (unionContains(rightCtx, leftCtx.text)) return { kind: "empty" };
      // Arity mismatch is a static type error.
      const lArity = ForgeExprStaticAnalyzer.arityOf(l);
      const rArity = ForgeExprStaticAnalyzer.arityOf(r);
      if (lArity > 0 && rArity > 0 && lArity !== rArity) {
        return {
          kind: "ill-typed",
          reason: `arity mismatch in '-': left has arity ${lArity}, right has arity ${rArity}`,
        };
      }
      return UNKNOWN;
    }
    if (ctx.PLUS_TOK()) {
      const l = this.visit(ctx.expr8()!);
      const r = this.visit(ctx.expr10()!);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      // Numeric literal addition.
      if (l.kind === "num" && r.kind === "num") {
        return { kind: "num", value: l.value + r.value };
      }
      // Empty is the identity of set union: X + none ≡ X, none + X ≡ X.
      if (l.kind === "empty" && r.kind === "empty") return { kind: "empty" };
      if (l.kind === "empty") return r;
      if (r.kind === "empty") return l;
      // Arity mismatch is a static type error.
      const lArity = ForgeExprStaticAnalyzer.arityOf(l);
      const rArity = ForgeExprStaticAnalyzer.arityOf(r);
      if (lArity > 0 && rArity > 0 && lArity !== rArity) {
        return {
          kind: "ill-typed",
          reason: `arity mismatch in '+': left has arity ${lArity}, right has arity ${rArity}`,
        };
      }
      if (lArity > 0 && rArity > 0) {
        return { kind: "typed", arity: lArity };
      }
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr9(ctx: Expr9Context): Abstract {
    if (ctx.CARD_TOK()) {
      const inner = this.visit(ctx.expr9()!);
      if (inner.kind === "ill-typed") return inner;
      if (inner.kind === "empty") return { kind: "num", value: 0 };
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr12(ctx: Expr12Context): Abstract {
    if (ctx.arrowOp()) {
      // Cartesian product: if either side is empty, the product is empty.
      const l = this.visit(ctx.expr12()!);
      const r = this.visit(ctx.expr13()!);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      if (l.kind === "empty" || r.kind === "empty") return { kind: "empty" };
      // Propagate combined arity / column types.
      if (l.kind === "typed" && r.kind === "typed") {
        const cols =
          l.columnTypes && r.columnTypes
            ? [...l.columnTypes, ...r.columnTypes]
            : undefined;
        return { kind: "typed", arity: l.arity + r.arity, columnTypes: cols };
      }
      const la = ForgeExprStaticAnalyzer.arityOf(l);
      const ra = ForgeExprStaticAnalyzer.arityOf(r);
      if (la > 0 && ra > 0) return { kind: "typed", arity: la + ra };
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr11(ctx: Expr11Context): Abstract {
    if (ctx.AMP_TOK()) {
      const leftCtx = ctx.expr11()!;
      const rightCtx = ctx.expr12()!;
      const l = this.visit(leftCtx);
      const r = this.visit(rightCtx);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      // X & X  →  X (preserve "empty" if we know it; otherwise unknown).
      if (sameSubtree(leftCtx, rightCtx)) return l;
      // empty & anything  →  empty
      if (l.kind === "empty" || r.kind === "empty") return { kind: "empty" };
      // Distinct numeric singletons are disjoint sets.
      if (l.kind === "num" && r.kind === "num" && l.value !== r.value) {
        return { kind: "empty" };
      }
      // X & (... - X)  →  empty (subtrahend strips X out).
      if (subtractsTarget(rightCtx, leftCtx.text)) return { kind: "empty" };
      if (subtractsTarget(leftCtx, rightCtx.text)) return { kind: "empty" };
      // Arity mismatch → ill-typed.
      const la = ForgeExprStaticAnalyzer.arityOf(l);
      const ra = ForgeExprStaticAnalyzer.arityOf(r);
      if (la > 0 && ra > 0 && la !== ra) {
        return {
          kind: "ill-typed",
          reason: `arity mismatch in '&': left has arity ${la}, right has arity ${ra}`,
        };
      }
      // Schema-driven column-wise disjointness.
      if (this.schema && l.kind === "typed" && r.kind === "typed" && l.columnTypes && r.columnTypes) {
        if (l.columnTypes.length === r.columnTypes.length) {
          const anyDisjoint = l.columnTypes.some((lc, i) =>
            this.schema!.areDisjoint(lc, r.columnTypes![i])
          );
          if (anyDisjoint) return { kind: "empty" };
        }
      }
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr14(ctx: Expr14Context): Abstract {
    if (ctx.LEFT_SQUARE_TOK()) {
      // Box join f[a, b, ...]  ≡  ...b.a.f
      const fn = this.visit(ctx.expr14()!);
      if (fn.kind === "ill-typed") return fn;
      if (fn.kind === "empty") return { kind: "empty" };
      // walk the comma-separated argument list
      let list = ctx.exprList();
      while (list) {
        const arg = this.visit(list.expr());
        if (arg.kind === "ill-typed") return arg;
        if (arg.kind === "empty") return { kind: "empty" };
        list = list.exprList();
      }
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr15(ctx: Expr15Context): Abstract {
    if (ctx.DOT_TOK()) {
      const l = this.visit(ctx.expr15()!);
      const r = this.visit(ctx.expr16()!);
      const bail = ForgeExprStaticAnalyzer.bailIfIllTyped(l, r);
      if (bail) return bail;
      if (l.kind === "empty" || r.kind === "empty") return { kind: "empty" };
      // Joining two singletons / unary expressions yields arity 0 — ill-typed.
      const la = ForgeExprStaticAnalyzer.arityOf(l);
      const ra = ForgeExprStaticAnalyzer.arityOf(r);
      if (la === 1 && ra === 1) {
        return {
          kind: "ill-typed",
          reason: "dot join of two unary expressions produces arity 0",
        };
      }
      // Schema-aware column-type check on the join boundary.
      if (
        this.schema &&
        l.kind === "typed" && r.kind === "typed" &&
        l.columnTypes && r.columnTypes &&
        l.columnTypes.length > 0 && r.columnTypes.length > 0
      ) {
        const leftLast = l.columnTypes[l.columnTypes.length - 1];
        const rightFirst = r.columnTypes[0];
        if (this.schema.areDisjoint(leftLast, rightFirst)) {
          return { kind: "empty" };
        }
        // Propagate typed-ness through the join when possible.
        const newCols = [
          ...l.columnTypes.slice(0, -1),
          ...r.columnTypes.slice(1),
        ];
        if (newCols.length > 0) {
          return { kind: "typed", arity: newCols.length, columnTypes: newCols };
        }
      }
      // Otherwise propagate arity if we have it on both sides.
      if (la > 0 && ra > 0) {
        return { kind: "typed", arity: la + ra - 2 };
      }
      return UNKNOWN;
    }
    // name LEFT_SQUARE_TOK exprList RIGHT_SQUARE_TOK is a named pred call —
    // body unknown, so we can't fold even if args are empty.
    if (ctx.LEFT_SQUARE_TOK()) return UNKNOWN;
    return this.visitChildren(ctx);
  }

  visitExpr17(ctx: Expr17Context): Abstract {
    if (ctx.TILDE_TOK() || ctx.EXP_TOK()) {
      // transpose ~X and transitive closure ^X both preserve emptiness
      const inner = this.visit(ctx.expr17()!);
      if (inner.kind === "ill-typed") return inner;
      if (inner.kind === "empty") return { kind: "empty" };
      return UNKNOWN;
    }
    if (ctx.STAR_TOK()) {
      // reflexive transitive closure *X = iden ∪ ^X — *none = iden, which is
      // generally non-empty, so we cannot conclude empty here.
      return UNKNOWN;
    }
    if (
      ctx.GET_LABEL_TOK() ||
      ctx.GET_LABEL_STR_TOK() ||
      ctx.GET_LABEL_BOOL_TOK() ||
      ctx.GET_LABEL_NUM_TOK()
    ) {
      // Label lookups depend on per-atom labels in the data instance.
      return UNKNOWN;
    }
    return this.visitChildren(ctx);
  }

  visitExpr18(ctx: Expr18Context): Abstract {
    if (ctx.LEFT_PAREN_TOK()) {
      return this.visit(ctx.expr()!);
    }
    if (ctx.const()) {
      const c = ctx.const()!;
      if (c.NONE_TOK()) return { kind: "empty" };
      if (c.number()) {
        const n = Number(c.number()!.text);
        const value = c.MINUS_TOK() ? -n : n;
        return { kind: "num", value };
      }
      // iden, univ are data-dependent
      return UNKNOWN;
    }
    if (ctx.qualName()) {
      // qualName resolves to either INT_TOK / SUM_TOK (data-dependent) or a
      // plain name — descend so visitName can fold `true` / `false`.
      return this.visit(ctx.qualName()!);
    }
    if (ctx.LEFT_CURLY_TOK()) {
      // Set comprehension `{x : S | body}` is empty if any quantified set is
      // empty, or if the body is statically false. We also enforce the
      // reserved-name policy here: under a schema, type/relation names cannot
      // be reused as binder variables.
      const declList = ctx.quantDeclList();
      const boundHere = new Set<string>();
      if (declList) {
        let cur = declList;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (cur) {
          const setExpr = cur.quantDecl().expr();
          const v = this.visit(setExpr);
          if (v.kind === "empty") return { kind: "empty" };
          if (v.kind === "ill-typed") return v;
          this.collectNamesFromList(cur.quantDecl().nameList(), boundHere);
          const next = cur.quantDeclList();
          if (!next) break;
          cur = next;
        }
      }
      const reservedError = this.illTypedIfBindsReservedName(boundHere);
      if (reservedError) return reservedError;
      const blockOrBar = ctx.blockOrBar();
      if (blockOrBar && blockOrBar.BAR_TOK() && blockOrBar.expr()) {
        const body = this.visit(blockOrBar.expr()!);
        if (body.kind === "ill-typed") return body;
        if (body.kind === "bool" && !body.value) return { kind: "empty" };
      }
      return UNKNOWN;
    }
    if (ctx.block()) {
      return this.visit(ctx.block()!);
    }
    // sexpr, AT_TOK, BACKQUOTE_TOK, THIS_TOK — unsupported.
    return UNKNOWN;
  }

  // `true` / `false` are parsed as names rather than `const` literals — the
  // evaluator handles them in visitName, so we do the same. When a schema is
  // available, type and relation names resolve to `typed` with arity and
  // column types from the schema.
  visitName(ctx: NameContext): Abstract {
    const id = getIdentifierName(ctx);
    if (id === "true") return { kind: "bool", value: true };
    if (id === "false") return { kind: "bool", value: false };
    if (this.schema) {
      const t = this.schema.getType(id);
      if (t) return { kind: "typed", arity: 1, columnTypes: [t.id] };
      const r = this.schema.getRelation(id);
      if (r) {
        const cols = r.types;
        return { kind: "typed", arity: cols.length, columnTypes: cols };
      }
    }
    return UNKNOWN;
  }
}
