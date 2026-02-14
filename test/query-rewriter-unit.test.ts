import { QueryRewriter } from "../src/QueryRewriter";

describe("Query Rewriter - Unit Tests", () => {
  let rewriter: QueryRewriter;

  beforeEach(() => {
    rewriter = new QueryRewriter();
  });

  it("should detect and rewrite field equality pattern", () => {
    const expr = "{a, b: univ | a.f = b}";
    const result = rewriter.rewrite(expr);
    
    expect(result.rewritten).toBe(true);
    expect(result.expression).toBe("f");
  });

  it("should detect and rewrite membership in join pattern", () => {
    const expr = "{a, b: univ | a->b in r}";
    const result = rewriter.rewrite(expr);
    
    expect(result.rewritten).toBe(true);
    expect(result.expression).toBe("r");
  });

  it("should detect and rewrite pattern F", () => {
    const expr = "{a, b: univ | a!=b and a->b in r}";
    const result = rewriter.rewrite(expr);
    
    expect(result.rewritten).toBe(true);
    expect(result.expression).toBe("r - iden");
  });

  it("should not rewrite non-matching patterns", () => {
    const expr = "{a, b, c: univ | a.f = b and b.g = c}";
    const result = rewriter.rewrite(expr);
    
    expect(result.rewritten).toBe(false);
    expect(result.expression).toBe(expr);
  });
});
