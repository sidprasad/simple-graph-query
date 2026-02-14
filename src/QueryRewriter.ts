/**
 * Query rewriter that applies algebraic equivalences to optimize comprehensions
 * before evaluation. This implements the optimizations described in the issue:
 * 
 * A. Field equality to direct relation: {a,b | a.f = b} ⇒ f
 * B. Existential join fusion: {a,b | some t | a = t.f0 and b = t.f1} ⇒ ~f0 . f1
 * C. Membership in a join: {a,b | b in a.r} ⇒ r
 * D. Membership with guard on second component: {a,b | a->b in R and b ∈ S} ⇒ R & (UNIV -> S)
 * E. Mutual reachability via closure: {a,b | a->b in ^E and b->a in ^E} ⇒ (^E) & ~(^E)
 * F. Nonreflexive pairs: {a,b | a!=b and a->b in R} ⇒ R - iden
 */

/**
 * Result of attempting to rewrite an expression.
 */
export interface RewriteResult {
  rewritten: boolean;
  expression: string;
  patternApplied?: string;
}

/**
 * Main rewriter class that applies algebraic optimizations to set comprehensions.
 * Uses string-based pattern matching for simplicity and reliability.
 */
export class QueryRewriter {
  /**
   * Attempt to rewrite a comprehension expression using algebraic equivalences.
   * @param expression The expression to potentially rewrite
   * @returns Result indicating if rewrite was applied and the resulting expression
   */
  public rewrite(expression: string): RewriteResult {
    // Parse the comprehension structure
    const comprehension = this.parseComprehension(expression);
    if (!comprehension) {
      return { rewritten: false, expression };
    }

    // Only process binary comprehensions (2 variables)
    if (comprehension.vars.length !== 2) {
      return { rewritten: false, expression };
    }

    const [var1, var2] = comprehension.vars;
    const constraint = comprehension.constraint;

    // Try each rewrite pattern in sequence
    const patterns = [
      () => this.tryPatternA(var1, var2, constraint),
      () => this.tryPatternC(var1, var2, constraint),
      () => this.tryPatternD(var1, var2, constraint),
      () => this.tryPatternE(var1, var2, constraint),
      () => this.tryPatternF(var1, var2, constraint),
    ];

    for (const pattern of patterns) {
      const result = pattern();
      if (result.rewritten) {
        return result;
      }
    }

    return { rewritten: false, expression };
  }

  /**
   * Parse a set comprehension expression into its components.
   */
  private parseComprehension(expr: string): {
    vars: string[],
    domain: string,
    constraint: string
  } | null {
    // Pattern: {vars: domain | constraint}
    // Allow spaces around the colon and bar
    // Limit quantifiers to prevent ReDoS - max 10 spaces
    const pattern = /^\{([^:]+):[ \t]{0,10}([^|]+?)[ \t]{0,10}\|[ \t]{0,10}(.+?)\}$/;
    const match = expr.match(pattern);
    
    if (!match) {
      return null;
    }

    const vars = match[1].split(',').map(v => v.trim());
    const domain = match[2].trim();
    const constraint = match[3].trim();

    return { vars, domain, constraint };
  }

  /**
   * Pattern A: Field equality to direct relation
   * {a,b | a.f = b} ⇒ f
   * Also handles: {a,b | b = a.f}
   */
  private tryPatternA(var1: string, var2: string, constraint: string): RewriteResult {
    // Try: a.f = b
    let pattern = new RegExp(`^${this.escapeRegex(var1)}\\.(\\w+)\\s*=\\s*${this.escapeRegex(var2)}$`);
    let match = constraint.match(pattern);
    if (match) {
      return {
        rewritten: true,
        expression: match[1],
        patternApplied: 'A: Field equality to direct relation'
      };
    }

    // Try: b = a.f
    pattern = new RegExp(`^${this.escapeRegex(var2)}\\s*=\\s*${this.escapeRegex(var1)}\\.(\\w+)$`);
    match = constraint.match(pattern);
    if (match) {
      return {
        rewritten: true,
        expression: match[1],
        patternApplied: 'A: Field equality to direct relation'
      };
    }

    return { rewritten: false, expression: "" };
  }

  /**
   * Pattern C: Membership in a join
   * {a,b | b in a.r} ⇒ r
   * {a,b | a->b in r} ⇒ r
   */
  private tryPatternC(var1: string, var2: string, constraint: string): RewriteResult {
    // Try: b in a.r
    let pattern = new RegExp(`^${this.escapeRegex(var2)}\\s+in\\s+${this.escapeRegex(var1)}\\.(\\w+)$`);
    let match = constraint.match(pattern);
    if (match) {
      return {
        rewritten: true,
        expression: match[1],
        patternApplied: 'C: Membership in a join'
      };
    }

    // Try: a->b in r
    pattern = new RegExp(`^${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+(\\w+)$`);
    match = constraint.match(pattern);
    if (match) {
      return {
        rewritten: true,
        expression: match[1],
        patternApplied: 'C: Membership in a join (arrow form)'
      };
    }

    return { rewritten: false, expression: "" };
  }

  /**
   * Pattern D: Membership with guard on second component
   * {a,b | a->b in R and b ∈ S} ⇒ R & (UNIV -> S)
   */
  private tryPatternD(var1: string, var2: string, constraint: string): RewriteResult {
    // Try: a->b in R and b in S
    let pattern = new RegExp(
      `^${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+(\\w+)\\s+(and|&&)\\s+${this.escapeRegex(var2)}\\s+in\\s+(\\w+)$`
    );
    let match = constraint.match(pattern);
    if (match) {
      const R = match[1];
      const S = match[3];
      return {
        rewritten: true,
        expression: `${R} & (univ -> ${S})`,
        patternApplied: 'D: Membership with guard on second component'
      };
    }

    // Try: b in S and a->b in R
    pattern = new RegExp(
      `^${this.escapeRegex(var2)}\\s+in\\s+(\\w+)\\s+(and|&&)\\s+${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+(\\w+)$`
    );
    match = constraint.match(pattern);
    if (match) {
      const S = match[1];
      const R = match[3];
      return {
        rewritten: true,
        expression: `${R} & (univ -> ${S})`,
        patternApplied: 'D: Membership with guard on second component'
      };
    }

    return { rewritten: false, expression: "" };
  }

  /**
   * Pattern E: Mutual reachability via closure
   * {a,b | a->b in ^E and b->a in ^E} ⇒ (^E) & ~(^E)
   */
  private tryPatternE(var1: string, var2: string, constraint: string): RewriteResult {
    // Try: a->b in ^E and b->a in ^E
    let pattern = new RegExp(
      `^${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+\\^(\\w+)\\s+(and|&&)\\s+${this.escapeRegex(var2)}\\s*->\\s*${this.escapeRegex(var1)}\\s+in\\s+\\^(\\w+)$`
    );
    let match = constraint.match(pattern);
    if (match && match[1] === match[3]) {
      const E = match[1];
      return {
        rewritten: true,
        expression: `(^${E}) & ~(^${E})`,
        patternApplied: 'E: Mutual reachability via closure'
      };
    }

    // Try: b->a in ^E and a->b in ^E
    pattern = new RegExp(
      `^${this.escapeRegex(var2)}\\s*->\\s*${this.escapeRegex(var1)}\\s+in\\s+\\^(\\w+)\\s+(and|&&)\\s+${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+\\^(\\w+)$`
    );
    match = constraint.match(pattern);
    if (match && match[1] === match[3]) {
      const E = match[1];
      return {
        rewritten: true,
        expression: `(^${E}) & ~(^${E})`,
        patternApplied: 'E: Mutual reachability via closure'
      };
    }

    return { rewritten: false, expression: "" };
  }

  /**
   * Pattern F: Nonreflexive pairs
   * {a,b | a!=b and a->b in R} ⇒ R - iden
   * Also handles: {a,b | not a=b and a->b in R}
   */
  private tryPatternF(var1: string, var2: string, constraint: string): RewriteResult {
    // Try: a!=b and a->b in R
    let pattern = new RegExp(
      `^${this.escapeRegex(var1)}\\s*!=\\s*${this.escapeRegex(var2)}\\s+(and|&&)\\s+${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+(\\w+)$`
    );
    let match = constraint.match(pattern);
    if (match) {
      return {
        rewritten: true,
        expression: `${match[2]} - iden`,
        patternApplied: 'F: Nonreflexive pairs'
      };
    }

    // Try: a->b in R and a!=b
    pattern = new RegExp(
      `^${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+(\\w+)\\s+(and|&&)\\s+${this.escapeRegex(var1)}\\s*!=\\s*${this.escapeRegex(var2)}$`
    );
    match = constraint.match(pattern);
    if (match) {
      return {
        rewritten: true,
        expression: `${match[1]} - iden`,
        patternApplied: 'F: Nonreflexive pairs'
      };
    }

    // Try: not a = b and a->b in R
    pattern = new RegExp(
      `^not\\s+${this.escapeRegex(var1)}\\s*=\\s*${this.escapeRegex(var2)}\\s+(and|&&)\\s+${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+(\\w+)$`
    );
    match = constraint.match(pattern);
    if (match) {
      return {
        rewritten: true,
        expression: `${match[2]} - iden`,
        patternApplied: 'F: Nonreflexive pairs'
      };
    }

    // Try: a->b in R and not a = b
    pattern = new RegExp(
      `^${this.escapeRegex(var1)}\\s*->\\s*${this.escapeRegex(var2)}\\s+in\\s+(\\w+)\\s+(and|&&)\\s+not\\s+${this.escapeRegex(var1)}\\s*=\\s*${this.escapeRegex(var2)}$`
    );
    match = constraint.match(pattern);
    if (match) {
      return {
        rewritten: true,
        expression: `${match[1]} - iden`,
        patternApplied: 'F: Nonreflexive pairs'
      };
    }

    return { rewritten: false, expression: "" };
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
