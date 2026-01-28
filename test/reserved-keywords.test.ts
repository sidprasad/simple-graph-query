import { SimpleGraphQueryEvaluator } from "../src";
import { IDataInstance, IAtom, IRelation, ITuple, IType } from "../src/types";
import { getIdentifierName, quoteIfReserved, FORGE_RESERVED_KEYWORDS } from "../src/forge-antlr/utils";
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { ForgeParser } from '../src/forge-antlr/ForgeParser';
import { ForgeLexer } from '../src/forge-antlr/ForgeLexer';

/**
 * Test data instance with reserved keywords as type and relation names.
 * This tests the backtick-quoting mechanism for escaping reserved words.
 */
class ReservedKeywordDataInstance implements IDataInstance {
  private atoms: IAtom[] = [
    { id: "set0", type: "set", label: "Set0" },
    { id: "set1", type: "set", label: "Set1" },
    { id: "some0", type: "some", label: "Some0" },
    { id: "some1", type: "some", label: "Some1" },
    { id: "item0", type: "Item", label: "Item0" },
    { id: "item1", type: "Item", label: "Item1" },
  ];

  private types: IType[] = [
    {
      id: "set",  // Reserved keyword as type name!
      types: ["set"],
      atoms: [
        { id: "set0", type: "set", label: "Set0" },
        { id: "set1", type: "set", label: "Set1" },
      ],
      isBuiltin: false,
    },
    {
      id: "some",  // Reserved keyword as type name!
      types: ["some"],
      atoms: [
        { id: "some0", type: "some", label: "Some0" },
        { id: "some1", type: "some", label: "Some1" },
      ],
      isBuiltin: false,
    },
    {
      id: "Item",
      types: ["Item"],
      atoms: [
        { id: "item0", type: "Item", label: "Item0" },
        { id: "item1", type: "Item", label: "Item1" },
      ],
      isBuiltin: false,
    },
  ];

  private relations: IRelation[] = [
    {
      id: "in",  // Reserved keyword as relation name!
      name: "in",
      types: ["Item", "set"],
      tuples: [
        { atoms: ["item0", "set0"], types: ["Item", "set"] },
        { atoms: ["item1", "set0"], types: ["Item", "set"] },
        { atoms: ["item1", "set1"], types: ["Item", "set"] },
      ],
    },
    {
      id: "one",  // Reserved keyword as relation name!
      name: "one",
      types: ["set", "some"],
      tuples: [
        { atoms: ["set0", "some0"], types: ["set", "some"] },
        { atoms: ["set1", "some1"], types: ["set", "some"] },
      ],
    },
    {
      id: "contains",  // Normal relation name
      name: "contains",
      types: ["set", "Item"],
      tuples: [
        { atoms: ["set0", "item0"], types: ["set", "Item"] },
        { atoms: ["set0", "item1"], types: ["set", "Item"] },
        { atoms: ["set1", "item1"], types: ["set", "Item"] },
      ],
    },
  ];

  getAtomType(id: string): IType {
    const atom = this.atoms.find(a => a.id === id);
    if (!atom) throw new Error(`Atom ${id} not found`);
    const type = this.types.find(t => t.id === atom.type);
    if (!type) throw new Error(`Type for atom ${id} not found`);
    return type;
  }

  getTypes(): readonly IType[] {
    return this.types;
  }

  getAtoms(): readonly IAtom[] {
    return this.atoms;
  }

  getRelations(): readonly IRelation[] {
    return this.relations;
  }
}

function createParser(input: string): ForgeParser {
  const inputStream = CharStreams.fromString(input);
  const lexer = new ForgeLexer(inputStream);
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new ForgeParser(tokenStream);
  parser.buildParseTree = true;
  return parser;
}

describe("Reserved keyword identifier support", () => {
  
  describe("Lexer and Parser", () => {
    it("should parse backtick-quoted identifiers", () => {
      const parser = createParser("`set`");
      const tree = parser.name();
      expect(tree.QUOTED_IDENTIFIER_TOK()).toBeTruthy();
      expect(tree.QUOTED_IDENTIFIER_TOK()?.text).toBe("`set`");
    });

    it("should parse regular identifiers", () => {
      const parser = createParser("normalName");
      const tree = parser.name();
      expect(tree.IDENTIFIER_TOK()).toBeTruthy();
      expect(tree.IDENTIFIER_TOK()?.text).toBe("normalName");
    });

    it("should parse backtick-quoted identifier in expression", () => {
      const parser = createParser("x.`in`");
      const tree = parser.parseExpr();
      expect(tree.text).toContain("`in`");
    });

    it("should parse complex expression with multiple quoted identifiers", () => {
      const parser = createParser("all x: `set` | x.`in` = y");
      const tree = parser.parseExpr();
      expect(tree.text).toContain("`set`");
      expect(tree.text).toContain("`in`");
    });
  });

  describe("getIdentifierName utility", () => {
    it("should extract name from regular identifier", () => {
      const parser = createParser("myVariable");
      const nameCtx = parser.name();
      expect(getIdentifierName(nameCtx)).toBe("myVariable");
    });

    it("should extract name from quoted identifier, stripping backticks", () => {
      const parser = createParser("`set`");
      const nameCtx = parser.name();
      expect(getIdentifierName(nameCtx)).toBe("set");
    });

    it("should handle escaped backticks inside quoted identifier", () => {
      const parser = createParser("`my\\`name`");
      const nameCtx = parser.name();
      expect(getIdentifierName(nameCtx)).toBe("my`name");
    });

    it("should handle escaped backslashes", () => {
      const parser = createParser("`path\\\\to`");
      const nameCtx = parser.name();
      expect(getIdentifierName(nameCtx)).toBe("path\\to");
    });
  });

  describe("quoteIfReserved utility", () => {
    it("should quote reserved keywords", () => {
      expect(quoteIfReserved("set", FORGE_RESERVED_KEYWORDS)).toBe("`set`");
      expect(quoteIfReserved("some", FORGE_RESERVED_KEYWORDS)).toBe("`some`");
      expect(quoteIfReserved("in", FORGE_RESERVED_KEYWORDS)).toBe("`in`");
      expect(quoteIfReserved("one", FORGE_RESERVED_KEYWORDS)).toBe("`one`");
    });

    it("should not quote non-reserved identifiers", () => {
      expect(quoteIfReserved("myVar", FORGE_RESERVED_KEYWORDS)).toBe("myVar");
      expect(quoteIfReserved("Person", FORGE_RESERVED_KEYWORDS)).toBe("Person");
      expect(quoteIfReserved("contains", FORGE_RESERVED_KEYWORDS)).toBe("contains");
    });

    it("should escape backticks when quoting", () => {
      const customKeywords = new Set(["my`name"]);
      expect(quoteIfReserved("my`name", customKeywords)).toBe("`my\\`name`");
    });
  });

  describe("Expression evaluation with reserved keyword types", () => {
    let evaluator: SimpleGraphQueryEvaluator;

    beforeEach(() => {
      const datum = new ReservedKeywordDataInstance();
      evaluator = new SimpleGraphQueryEvaluator(datum);
    });

    it("should evaluate type reference with backtick-quoted reserved keyword", () => {
      // Reference the type "set" using backticks
      const result = evaluator.evaluateExpression("`set`");
      expect(Array.isArray(result)).toBe(true);
      const tuples = result as string[][];
      expect(tuples.length).toBe(2);
      expect(tuples.map(t => t[0]).sort()).toEqual(["set0", "set1"]);
    });

    it("should evaluate type reference 'some' with backtick quoting", () => {
      const result = evaluator.evaluateExpression("`some`");
      expect(Array.isArray(result)).toBe(true);
      const tuples = result as string[][];
      expect(tuples.length).toBe(2);
      expect(tuples.map(t => t[0]).sort()).toEqual(["some0", "some1"]);
    });

    it("should evaluate normal type without backticks", () => {
      const result = evaluator.evaluateExpression("Item");
      expect(Array.isArray(result)).toBe(true);
      const tuples = result as string[][];
      expect(tuples.length).toBe(2);
    });
  });

  describe("Expression evaluation with reserved keyword relations", () => {
    let evaluator: SimpleGraphQueryEvaluator;

    beforeEach(() => {
      const datum = new ReservedKeywordDataInstance();
      evaluator = new SimpleGraphQueryEvaluator(datum);
    });

    it("should evaluate relation access with backtick-quoted reserved keyword", () => {
      // Access the "in" relation on item0
      const result = evaluator.evaluateExpression("item0.`in`");
      expect(Array.isArray(result)).toBe(true);
      const tuples = result as string[][];
      expect(tuples.length).toBe(1);
      expect(tuples[0][0]).toBe("set0");
    });

    it("should evaluate relation 'one' with backtick quoting", () => {
      const result = evaluator.evaluateExpression("set0.`one`");
      expect(Array.isArray(result)).toBe(true);
      const tuples = result as string[][];
      expect(tuples.length).toBe(1);
      expect(tuples[0][0]).toBe("some0");
    });

    it("should evaluate normal relation without backticks", () => {
      const result = evaluator.evaluateExpression("set0.contains");
      expect(Array.isArray(result)).toBe(true);
      const tuples = result as string[][];
      expect(tuples.length).toBe(2);
    });
  });

  describe("Quantified expressions with reserved keyword types", () => {
    let evaluator: SimpleGraphQueryEvaluator;

    beforeEach(() => {
      const datum = new ReservedKeywordDataInstance();
      evaluator = new SimpleGraphQueryEvaluator(datum);
    });

    it("should evaluate 'all' quantifier over backtick-quoted type", () => {
      // All sets have at least one item
      const result = evaluator.evaluateExpression("all s: `set` | some s.contains");
      expect(result).toBe(true);
    });

    it("should evaluate 'some' quantifier over backtick-quoted type", () => {
      // Some set contains item1
      const result = evaluator.evaluateExpression("some s: `set` | item1 in s.contains");
      expect(result).toBe(true);
    });

    it("should handle mixed quoted and unquoted types", () => {
      // For all items, there exists a set containing them
      const result = evaluator.evaluateExpression("all i: Item | some s: `set` | i in s.contains");
      expect(result).toBe(true);
    });

    it("should correctly bind quantifier variable with backtick-quoted name", () => {
      // This tests the specific bug: quantifier variable named with reserved keyword
      // The variable `in` should be bound and looked up consistently (uses a relation name, not type)
      const result = evaluator.evaluateExpression("all `in`: Item | `in` in Item");
      expect(result).toBe(true);
    });

    it("should handle backtick-quoted variable referencing itself in body", () => {
      // Variable named `one` (a reserved keyword) used in the body
      const result = evaluator.evaluateExpression("some `one`: Item | `one` = item0");
      expect(result).toBe(true);
    });

    it("should handle multiple backtick-quoted variable names in same quantifier", () => {
      // Multiple reserved keyword variable names
      const result = evaluator.evaluateExpression("some `in`: Item, `one`: `set` | `in` in `one`.contains");
      expect(result).toBe(true);
    });
  });

  describe("Complex expressions with multiple reserved keywords", () => {
    let evaluator: SimpleGraphQueryEvaluator;

    beforeEach(() => {
      const datum = new ReservedKeywordDataInstance();
      evaluator = new SimpleGraphQueryEvaluator(datum);
    });

    it("should evaluate join through multiple reserved-keyword relations", () => {
      // item0.in.one = item0's set's some
      const result = evaluator.evaluateExpression("item0.`in`.`one`");
      expect(Array.isArray(result)).toBe(true);
      const tuples = result as string[][];
      expect(tuples.length).toBe(1);
      expect(tuples[0][0]).toBe("some0");
    });

    it("should evaluate set comprehension with reserved keyword type", () => {
      const result = evaluator.evaluateExpression("{ s: `set` | #(s.contains) > 1 }");
      expect(Array.isArray(result)).toBe(true);
      const tuples = result as string[][];
      // set0 has 2 items, set1 has 1 item
      expect(tuples.length).toBe(1);
      expect(tuples[0][0]).toBe("set0");
    });
  });

  describe("FORGE_RESERVED_KEYWORDS set", () => {
    it("should contain common reserved keywords", () => {
      const expectedKeywords = [
        'set', 'some', 'one', 'all', 'no', 'lone', 'in',
        'sig', 'pred', 'fun', 'extends', 'abstract',
        'and', 'or', 'not', 'implies', 'iff', 'else',
        'let', 'sum', 'Int', 'univ', 'none', 'iden'
      ];
      
      for (const keyword of expectedKeywords) {
        expect(FORGE_RESERVED_KEYWORDS.has(keyword)).toBe(true);
      }
    });

    it("should not contain common identifiers", () => {
      const nonKeywords = ['Person', 'myVar', 'x', 'Node', 'value', 'name'];
      
      for (const word of nonKeywords) {
        expect(FORGE_RESERVED_KEYWORDS.has(word)).toBe(false);
      }
    });
  });
});
