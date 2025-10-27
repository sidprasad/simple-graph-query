import { SimpleGraphQueryEvaluator } from "../src";
import { IDataInstance, IAtom, IRelation, ITuple, IType } from "../src/types";

// Test data from the issue
const jsonData = {
  "atoms": [
    {"id": "0", "type": "int", "label": "0", "type_hierarchy": ["int", "object"]},
    {"id": "1", "type": "int", "label": "1", "type_hierarchy": ["int", "object"]},
    {"id": "n0", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "2", "type": "int", "label": "2", "type_hierarchy": ["int"]},
    {"id": "3", "type": "int", "label": "3", "type_hierarchy": ["int"]},
    {"id": "4", "type": "int", "label": "4", "type_hierarchy": ["int"]},
    {"id": "5", "type": "int", "label": "5", "type_hierarchy": ["int"]},
    {"id": "6", "type": "int", "label": "6", "type_hierarchy": ["int"]},
    {"id": "7", "type": "int", "label": "7", "type_hierarchy": ["int"]},
    {"id": "8", "type": "int", "label": "8", "type_hierarchy": ["int"]},
    {"id": "9", "type": "int", "label": "9", "type_hierarchy": ["int"]},
    {"id": "n1", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "n2", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "n3", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "n4", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "n5", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "n6", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "n7", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "n8", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "n9", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]},
    {"id": "obj_15", "type": "list", "label": "list[10]", "type_hierarchy": ["list", "object"]}
  ],
  "relations": [
    {
      "id": "idx",
      "name": "idx",
      "types": ["object", "object", "object"],
      "tuples": [
        {"atoms": ["n0", "0", "0"], "types": ["list", "int", "int"]},
        {"atoms": ["n0", "1", "0"], "types": ["list", "int", "int"]}
      ]
    }
  ],
  "types": [
    {
      "_": "type",
      "id": "int",
      "types": ["int", "object"],
      "atoms": [
        {"_": "atom", "id": "0", "type": "int"},
        {"_": "atom", "id": "0", "type": "int"},
        {"_": "atom", "id": "0", "type": "int"},
        {"_": "atom", "id": "1", "type": "int"},
        {"_": "atom", "id": "2", "type": "int"},
        {"_": "atom", "id": "3", "type": "int"},
        {"_": "atom", "id": "4", "type": "int"},
        {"_": "atom", "id": "5", "type": "int"},
        {"_": "atom", "id": "6", "type": "int"},
        {"_": "atom", "id": "7", "type": "int"},
        {"_": "atom", "id": "8", "type": "int"},
        {"_": "atom", "id": "9", "type": "int"}
      ],
      "meta": {"builtin": true}
    },
    {
      "_": "type",
      "id": "list",
      "types": ["list", "object"],
      "atoms": [
        {"_": "atom", "id": "n0", "type": "list"},
        {"_": "atom", "id": "n1", "type": "list"},
        {"_": "atom", "id": "n2", "type": "list"},
        {"_": "atom", "id": "n3", "type": "list"},
        {"_": "atom", "id": "n4", "type": "list"},
        {"_": "atom", "id": "n5", "type": "list"},
        {"_": "atom", "id": "n6", "type": "list"},
        {"_": "atom", "id": "n7", "type": "list"},
        {"_": "atom", "id": "n8", "type": "list"},
        {"_": "atom", "id": "n9", "type": "list"},
        {"_": "atom", "id": "obj_15", "type": "list"}
      ],
      "meta": {"builtin": false}
    }
  ]
};

class TestDataInstance implements IDataInstance {
  private _data: any;
  
  constructor(data: any) {
    this._data = data;
  }
  
  getTypes(): IType[] {
    const types = this._data.types as IType[];
    
    // Create a map of atom ID to atom data from the main atoms array
    const atomMap = new Map<string, any>();
    if (this._data.atoms) {
      for (const atom of this._data.atoms) {
        atomMap.set(atom.id, atom);
      }
    }
    
    // Deduplicate and merge atom information for each type
    for (const type of types) {
      const uniqueAtomMap = new Map<string, IAtom>();
      
      for (const atom of type.atoms) {
        // Skip if we've already seen this atom ID in this type
        if (uniqueAtomMap.has(atom.id)) {
          continue;
        }
        
        // Create a new atom object with merged label information
        const fullAtom = atomMap.get(atom.id);
        const mergedAtom: IAtom = {
          ...atom,
          label: fullAtom?.label ?? atom.label
        };
        
        uniqueAtomMap.set(atom.id, mergedAtom);
      }
      
      // Replace the atoms array with deduplicated atoms
      type.atoms = Array.from(uniqueAtomMap.values());
    }
    
    return types;
  }

  getRelations(): IRelation[] {
    return this._data.relations as IRelation[];
  }

  getAtoms(): IAtom[] {
    // Collect all atoms from all types and deduplicate by atom ID
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
      if (type.atoms.some(atom => atom.id === id)) {
        return type;
      }
    }
    throw new Error(`Atom with id ${id} not found`);
  }
}

describe("Duplication issue", () => {
  it("should not return duplicate atoms when querying a type", () => {
    const datum = new TestDataInstance(jsonData);
    const evaluatorUtil = new SimpleGraphQueryEvaluator(datum);
    
    const result = evaluatorUtil.evaluateExpression("int");
    
    // The result should be an array of tuples
    expect(Array.isArray(result)).toBe(true);
    
    if (Array.isArray(result)) {
      // Convert to string for easier comparison
      const atomIds = result.map(tuple => String(tuple[0]));
      
      // Check for duplicates
      const uniqueIds = new Set(atomIds);
      
      // There should be no duplicates
      expect(atomIds.length).toBe(uniqueIds.size);
      
      // Verify we have the expected atoms
      expect(uniqueIds.size).toBe(10);
      expect(uniqueIds).toEqual(new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']));
    }
  });
  
  it("should return unique atoms from getAtoms()", () => {
    const datum = new TestDataInstance(jsonData);
    const atoms = datum.getAtoms();
    
    const atomIds = atoms.map(atom => atom.id);
    const uniqueIds = new Set(atomIds);
    
    // There should be no duplicates
    expect(atomIds.length).toBe(uniqueIds.size);
  });
});
