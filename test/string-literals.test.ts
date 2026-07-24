import { SimpleGraphQueryEvaluator } from "../src";
import { unquoteStringLiteral, Tuple, areTupleArraysEqual } from "../src/ForgeExprEvaluator";
import {
  TTTDataInstance,
  RBTTDataInstance,
  LabelTestDataInstance,
} from "./testdatainstances";

function tuples(result: unknown, expected: Tuple[]) {
  return Array.isArray(result) && areTupleArraysEqual(result as Tuple[], expected);
}

describe("sgq-evaluator.string-literals", () => {
  let ev: SimpleGraphQueryEvaluator;
  beforeEach(() => {
    ev = new SimpleGraphQueryEvaluator(new TTTDataInstance());
  });

  describe("lexing", () => {
    it("accepts an empty string", () => {
      expect(ev.evaluateExpression('""')).toBe("");
    });

    it("preserves whitespace, including a whitespace-only string", () => {
      expect(ev.evaluateExpression('" "')).toBe(" ");
      expect(ev.evaluateExpression('"  a  b  "')).toBe("  a  b  ");
      expect(ev.evaluateExpression('"\t"')).toBe("\t");
    });

    it("accepts characters that are not valid in an identifier", () => {
      expect(ev.evaluateExpression('"dark blue"')).toBe("dark blue");
      expect(ev.evaluateExpression('"#FF0000"')).toBe("#FF0000");
      expect(ev.evaluateExpression('"2 of clubs"')).toBe("2 of clubs");
      expect(ev.evaluateExpression('"a-b"')).toBe("a-b");
      expect(ev.evaluateExpression('"x.y"')).toBe("x.y");
      expect(ev.evaluateExpression('"a,b;c:d"')).toBe("a,b;c:d");
      expect(ev.evaluateExpression('"(paren)"')).toBe("(paren)");
      expect(ev.evaluateExpression('"{brace}"')).toBe("{brace}");
      expect(ev.evaluateExpression('"1st"')).toBe("1st");
      expect(ev.evaluateExpression('"@:"')).toBe("@:");
    });

    it("accepts non-ASCII text", () => {
      expect(ev.evaluateExpression('"héllo"')).toBe("héllo");
      expect(ev.evaluateExpression('"日本語"')).toBe("日本語");
      expect(ev.evaluateExpression('"→"')).toBe("→");
    });

    it("accepts reserved keywords as string content", () => {
      // The keyword only has meaning as a bare token; inside quotes it is text.
      for (const kw of ["set", "some", "no", "all", "none", "univ", "iden", "in", "sum", "Int"]) {
        expect(ev.evaluateExpression(`"${kw}"`)).toBe(kw);
      }
    });
  });

  describe("escapes", () => {
    it("resolves the recognised escape sequences", () => {
      expect(ev.evaluateExpression('"a\\nb"')).toBe("a\nb");
      expect(ev.evaluateExpression('"a\\tb"')).toBe("a\tb");
      expect(ev.evaluateExpression('"a\\rb"')).toBe("a\rb");
      expect(ev.evaluateExpression('"a\\0b"')).toBe("a\0b");
    });

    it("resolves an escaped quote and an escaped backslash", () => {
      expect(ev.evaluateExpression('"say \\"hi\\""')).toBe('say "hi"');
      expect(ev.evaluateExpression('"back\\\\slash"')).toBe("back\\slash");
      expect(ev.evaluateExpression('"\\""')).toBe('"');
      expect(ev.evaluateExpression('"\\\\"')).toBe("\\");
    });

    it("treats an unrecognised escape as the character itself", () => {
      expect(ev.evaluateExpression('"\\q"')).toBe("q");
      expect(ev.evaluateExpression('"a\\-b"')).toBe("a-b");
    });

    it("unquoteStringLiteral matches the evaluator on the same inputs", () => {
      expect(unquoteStringLiteral('""')).toBe("");
      expect(unquoteStringLiteral('"plain"')).toBe("plain");
      expect(unquoteStringLiteral('"a\\nb"')).toBe("a\nb");
      expect(unquoteStringLiteral('"\\""')).toBe('"');
      expect(unquoteStringLiteral('"\\\\"')).toBe("\\");
      expect(unquoteStringLiteral('"\\q"')).toBe("q");
    });
  });

  describe("typing", () => {
    it("is a string even when it looks like a number or a boolean", () => {
      expect(ev.evaluateExpression('"12"')).toBe("12");
      expect(ev.evaluateExpression('"0"')).toBe("0");
      expect(ev.evaluateExpression('"true"')).toBe("true");
      expect(ev.evaluateExpression('"false"')).toBe("false");
    });

    it("does not implicitly convert to a number or boolean in comparisons", () => {
      expect(ev.evaluateExpression('"12" = 12')).toBe(false);
      expect(ev.evaluateExpression('"true" = true')).toBe(false);
      expect(ev.evaluateExpression('"false" = false')).toBe(false);
    });

    it("converts explicitly under the coercing label operators", () => {
      expect(ev.evaluateExpression('@num:("12")')).toBe(12);
      expect(ev.evaluateExpression('@bool:("true")')).toBe(true);
      expect(ev.evaluateExpression('@bool:("false")')).toBe(false);
      expect(ev.evaluateExpression('@str:("x")')).toBe("x");
      // The label of a string literal is the string itself — there is no atom
      // to look up, and that is not an error.
      expect(ev.evaluateExpression('@:("Black")')).toBe("Black");
    });
  });

  describe("as a value", () => {
    it("compares with = and !=", () => {
      expect(ev.evaluateExpression('"a" = "a"')).toBe(true);
      expect(ev.evaluateExpression('"a" = "b"')).toBe(false);
      expect(ev.evaluateExpression('"a" != "b"')).toBe(true);
      expect(ev.evaluateExpression('"a" = "A"')).toBe(false); // case sensitive
      expect(ev.evaluateExpression('"" = ""')).toBe(true);
    });

    it("participates in set operations as a singleton", () => {
      expect(tuples(ev.evaluateExpression('"a" + "b"'), [["a"], ["b"]])).toBe(true);
      expect(ev.evaluateExpression('#("a" + "b")')).toBe(2);
      expect(ev.evaluateExpression('#("a" + "a")')).toBe(1); // set semantics
      expect(ev.evaluateExpression('"a" in "a"')).toBe(true);
      expect(ev.evaluateExpression('"a" in ("a" + "b")')).toBe(true);
      expect(ev.evaluateExpression('"c" in ("a" + "b")')).toBe(false);
      expect(tuples(ev.evaluateExpression('"a" & "b"'), [])).toBe(true);
    });

    it("composes inside boolean expressions", () => {
      expect(ev.evaluateExpression('"a" = "a" and "b" = "b"')).toBe(true);
      expect(ev.evaluateExpression('"a" = "b" or "b" = "b"')).toBe(true);
      expect(ev.evaluateExpression('not ("a" = "b")')).toBe(true);
      expect(ev.evaluateExpression('"a" = "b" implies "x" = "y" else "p" = "p"')).toBe(true);
    });

    it("compares equal to an atom id with the same text", () => {
      // Atom ids are strings internally, so this holds. Use @: when you mean to
      // compare against an atom's *label* rather than its id.
      expect(ev.evaluateExpression('X0 = "X0"')).toBe(true);
      expect(ev.evaluateExpression('X0 = "O0"')).toBe(false);
    });
  });

  describe("in selector position", () => {
    it("filters a comprehension by label", () => {
      const reds = ev.evaluateExpression('{p : Player | @:p = "red"}');
      expect(tuples(reds, [["X0"]])).toBe(true);
    });

    it("works with in as well as =", () => {
      // X0 is labelled "red" and O0 "blue", so a singleton matches one and the
      // two-element set matches both.
      expect(tuples(ev.evaluateExpression('{p : Player | @:p in "red"}'), [["X0"]])).toBe(true);
      expect(
        tuples(ev.evaluateExpression('{p : Player | @:p in ("red" + "blue")}'), [["X0"], ["O0"]])
      ).toBe(true);
      expect(
        tuples(ev.evaluateExpression('{p : Player | @:p in ("red" + "green")}'), [["X0"]])
      ).toBe(true);
    });

    it("filters a field label across a join", () => {
      const rbt = new SimpleGraphQueryEvaluator(new RBTTDataInstance());
      const blacks = rbt.evaluateExpression('{ x : RBTreeNode | @:(x.color) = "black" }');
      expect(tuples(blacks, [["n6"], ["n9"], ["n13"], ["n15"], ["n0"]])).toBe(true);
    });

    it("survives quantifiers", () => {
      const rbt = new SimpleGraphQueryEvaluator(new RBTTDataInstance());
      expect(rbt.evaluateExpression('some x : RBTreeNode | @:(x.color) = "black"')).toBe(true);
      expect(rbt.evaluateExpression('all x : RBTreeNode | @:(x.color) = "purple"')).toBe(false);
    });
  });

  describe("capture resistance", () => {
    it("means the string even when the instance declares that name", () => {
      // `None` is a type id in this instance and `Color` a type with atoms. A
      // quoted literal is unaffected by either.
      const lt = new SimpleGraphQueryEvaluator(new LabelTestDataInstance());

      expect(lt.evaluateExpression('"None"')).toBe("None");
      expect(lt.evaluateExpression('"Color"')).toBe("Color");
      expect(tuples(lt.evaluateExpression('{y : Color | @:y = "None"}'), [])).toBe(true);
      expect(tuples(lt.evaluateExpression('{y : Color | @:y = "Black"}'), [["atom3"]])).toBe(true);
    });

    it('"none" is a string, not the empty relation', () => {
      expect(ev.evaluateExpression('"none"')).toBe("none");
      expect(ev.evaluateExpression('#("none")')).toBe(1);
      expect(ev.evaluateExpression("#(none)")).toBe(0);
    });

    it('"Player" is a string, not the type\'s atoms', () => {
      expect(ev.evaluateExpression('"Player"')).toBe("Player");
      expect(ev.evaluateExpression('#("Player")')).toBe(1);
      expect(ev.evaluateExpression("#Player")).toBe(2);
    });

    it("raises no diagnostic — a literal always resolves", () => {
      const { diagnostics } = ev.evaluateExpressionWithDiagnostics(
        '"Playr" = "anything at all"'
      );
      expect(diagnostics).toEqual([]);
    });
  });
});
