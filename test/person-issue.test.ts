import { SimpleGraphQueryEvaluator } from "../src";
import { IDataInstance, IAtom, IRelation, IType } from "../src/types";

// Create the Person data instance based on the issue
const personData = `
{
  "types": {
    "Int": {
      "_": "type",
      "id": "Int",
      "types": ["Int"],
      "atoms": [
        {"_": "atom", "id": "2", "type": "Int"},
        {"_": "atom", "id": "8", "type": "Int"},
        {"_": "atom", "id": "11", "type": "Int"},
        {"_": "atom", "id": "13", "type": "Int"},
        {"_": "atom", "id": "32", "type": "Int"},
        {"_": "atom", "id": "33", "type": "Int"},
        {"_": "atom", "id": "35", "type": "Int"},
        {"_": "atom", "id": "59", "type": "Int"},
        {"_": "atom", "id": "60", "type": "Int"},
        {"_": "atom", "id": "62", "type": "Int"}
      ],
      "meta": {"builtin": true}
    },
    "Person": {
      "_": "type",
      "id": "Person",
      "types": ["Person"],
      "atoms": [
        {"_": "atom", "id": "Jay", "type": "Person"},
        {"_": "atom", "id": "Gloria", "type": "Person"},
        {"_": "atom", "id": "Dede", "type": "Person"},
        {"_": "atom", "id": "Joe", "type": "Person"},
        {"_": "atom", "id": "Phil", "type": "Person"},
        {"_": "atom", "id": "Claire", "type": "Person"},
        {"_": "atom", "id": "Mitchel", "type": "Person"},
        {"_": "atom", "id": "Haley", "type": "Person"},
        {"_": "atom", "id": "Alex", "type": "Person"},
        {"_": "atom", "id": "Luke", "type": "Person"}
      ],
      "meta": {"builtin": false}
    }
  },
  "relations": {
    "parent": {
      "_": "relation",
      "id": "parent",
      "name": "parent",
      "types": ["Person", "Person"],
      "tuples": [
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Claire", "Jay"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Claire", "Dede"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Mitchel", "Jay"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Mitchel", "Dede"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Joe", "Gloria"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Joe", "Jay"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Alex", "Phil"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Alex", "Claire"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Haley", "Phil"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Haley", "Claire"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Luke", "Phil"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Luke", "Claire"]}
      ]
    },
    "age": {
      "_": "relation",
      "id": "age",
      "name": "age",
      "types": ["Person", "Int"],
      "tuples": [
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Jay", "60"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Gloria", "62"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Dede", "59"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Joe", "2"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Phil", "35"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Claire", "33"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Mitchel", "32"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Haley", "13"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Alex", "11"]},
        {"_": "tuple", "types": ["Person", "Int"], "atoms": ["Luke", "8"]}
      ]
    },
    "younger": {
      "_": "relation",
      "id": "younger",
      "name": "younger",
      "types": ["Person", "Person"],
      "tuples": [
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Jay", "Gloria"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Dede", "Jay"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Dede", "Gloria"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Phil", "Claire"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Phil", "Mitchel"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Claire", "Mitchel"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Haley", "Alex"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Haley", "Luke"]},
        {"_": "tuple", "types": ["Person", "Person"], "atoms": ["Alex", "Luke"]}
      ]
    }
  },
  "skolems": {}
}
`;

class PersonDataInstance implements IDataInstance {
  private _data: any;
  constructor(data: string) {
    this._data = JSON.parse(data);
  }
  getTypes(): IType[] {
    return Object.values(this._data.types) as IType[];
  }
  getRelations(): IRelation[] {
    return Object.values(this._data.relations) as IRelation[];
  }
  getAtoms(): IAtom[] {
    const atomMap = new Map<string, IAtom>();
    for (const type of this.getTypes()) {
      for (const atom of type.atoms) {
        if (!atomMap.has(atom.id)) {
          atomMap.set(atom.id, atom);
        }
      }
    }
    return Array.from(atomMap.values());
  }
  getAtomType(id: string): IType {
    for (const type of this.getTypes()) {
      if (type.atoms.some((atom: IAtom) => atom.id === id)) {
        return type;
      }
    }
    throw new Error(`Atom with id ${id} not found`);
  }
}

describe("Person query from issue", () => {
  const datum = new PersonDataInstance(personData);
  const evaluator = new SimpleGraphQueryEvaluator(datum);

  it("can evaluate simple parent relation", () => {
    const query = "Claire.parent";
    const result = evaluator.evaluateExpression(query);
    console.log("Claire.parent result:", JSON.stringify(result));
    expect(Array.isArray(result)).toBe(true);
  });

  it("can evaluate simple younger relation", () => {
    const query = "Jay.younger";
    const result = evaluator.evaluateExpression(query);
    console.log("Jay.younger result:", JSON.stringify(result));
    expect(Array.isArray(result)).toBe(true);
  });

  it("can evaluate membership test", () => {
    const query = "Dede in Jay.younger";
    const result = evaluator.evaluateExpression(query);
    console.log("Dede in Jay.younger result:", result);
    expect(typeof result === "boolean").toBe(true);
  });

  it("can evaluate nested quantifier with variable in dot join", () => {
    // Simpler test case first
    // For Claire with parents Jay and Dede:
    // - When p1=Jay, check if exists p2 in {Jay,Dede} where p2!=Jay and p2 in Jay.younger
    //   Jay.younger = {Gloria}, so Dede is NOT in Jay.younger -> FALSE
    // - When p1=Dede, check if exists p2 in {Jay,Dede} where p2!=Dede and p2 in Dede.younger
    //   Dede.younger = {Jay, Gloria}, so Jay IS in Dede.younger -> TRUE
    // So only ["Claire", "Dede"] should be in result
    
    const query1 = "some p2 : Claire.parent | p2 != Jay and p2 in Jay.younger";
    const result1 = evaluator.evaluateExpression(query1);
    console.log("Query 1:", query1);
    console.log("Result 1:", result1);
    console.log("Jay.younger:", evaluator.evaluateExpression("Jay.younger"));
    console.log("Dede.younger:", evaluator.evaluateExpression("Dede.younger"));
    expect(result1).toBe(false); // Dede is not in Jay.younger
    
    const query2 = "some p2 : Claire.parent | p2 != Dede and p2 in Dede.younger";
    const result2 = evaluator.evaluateExpression(query2);
    console.log("Query 2:", query2);
    console.log("Result 2:", result2);
    expect(result2).toBe(true); // Jay is in Dede.younger
  });

  it("can evaluate the problematic query", () => {
    const query = "{ c, p1 : Person | p1 in c.parent and (some p2 : c.parent | p1 != p2 and p2 in p1.younger) }";
    console.log("Testing query:", query);
    const result = evaluator.evaluateExpression(query);
    console.log("Result:", JSON.stringify(result, null, 2));
    
    // Expected results based on manual verification:
    // ["Claire", "Dede"], ["Mitchel", "Dede"], ["Joe", "Jay"], 
    // ["Alex", "Phil"], ["Haley", "Phil"], ["Luke", "Phil"]
    expect(Array.isArray(result)).toBe(true);
    
    // Check that incorrect results are NOT present
    const resultStrings = (result as any[][]).map((t: any[]) => JSON.stringify(t));
    expect(resultStrings).not.toContain(JSON.stringify(["Claire", "Jay"]));
    expect(resultStrings).not.toContain(JSON.stringify(["Mitchel", "Jay"]));
  });
});
