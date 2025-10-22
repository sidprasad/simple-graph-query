import { IDataInstance, IAtom, IRelation, IType } from "./src/types";
import { SimpleGraphQueryEvaluator } from "./src";

// Test data from the issue
const testData = {
    "atoms": [
        {
            "id": "atom0",
            "type": "RBTree",
            "label": "RBTree"
        },
        {
            "id": "atom1",
            "type": "Node",
            "label": "Node"
        },
        {
            "id": "atom2",
            "type": "u32",
            "label": "5"
        },
        {
            "id": "atom3",
            "type": "Color",
            "label": "Black"
        },
        {
            "id": "atom4",
            "type": "Node",
            "label": "Node"
        },
        {
            "id": "atom5",
            "type": "u32",
            "label": "3"
        },
        {
            "id": "atom6",
            "type": "Color",
            "label": "Red"
        },
        {
            "id": "atom7",
            "type": "None",
            "label": "None"
        },
        {
            "id": "atom8",
            "type": "Node",
            "label": "Node"
        },
        {
            "id": "atom9",
            "type": "u32",
            "label": "7"
        }
    ],
    "relations": [
        {
            "id": "root",
            "name": "root",
            "types": [
                "RBTree",
                "atom"
            ],
            "tuples": [
                {
                    "atoms": [
                        "atom0",
                        "atom1"
                    ],
                    "types": [
                        "RBTree",
                        "atom"
                    ]
                }
            ]
        },
        {
            "id": "color",
            "name": "color",
            "types": [
                "Node",
                "atom"
            ],
            "tuples": [
                {
                    "atoms": [
                        "atom1",
                        "atom3"
                    ],
                    "types": [
                        "Node",
                        "atom"
                    ]
                },
                {
                    "atoms": [
                        "atom4",
                        "atom6"
                    ],
                    "types": [
                        "Node",
                        "atom"
                    ]
                },
                {
                    "atoms": [
                        "atom8",
                        "atom6"
                    ],
                    "types": [
                        "Node",
                        "atom"
                    ]
                }
            ]
        },
        {
            "id": "key",
            "name": "key",
            "types": [
                "Node",
                "atom"
            ],
            "tuples": [
                {
                    "atoms": [
                        "atom1",
                        "atom2"
                    ],
                    "types": [
                        "Node",
                        "atom"
                    ]
                },
                {
                    "atoms": [
                        "atom4",
                        "atom5"
                    ],
                    "types": [
                        "Node",
                        "atom"
                    ]
                },
                {
                    "atoms": [
                        "atom8",
                        "atom9"
                    ],
                    "types": [
                        "Node",
                        "atom"
                    ]
                }
            ]
        }
    ]
};

class TestDataInstance implements IDataInstance {
    private atoms: IAtom[];
    private relations: IRelation[];
    private types: IType[];

    constructor() {
        this.atoms = testData.atoms;
        this.relations = testData.relations;
        
        // Build types from atoms
        const typeMap = new Map<string, IAtom[]>();
        for (const atom of this.atoms) {
            if (!typeMap.has(atom.type)) {
                typeMap.set(atom.type, []);
            }
            typeMap.get(atom.type)!.push(atom);
        }
        
        this.types = Array.from(typeMap.entries()).map(([typeName, atoms]) => ({
            id: typeName,
            types: [typeName],
            atoms: atoms,
            isBuiltin: false
        }));
        
        // Add a generic "atom" type that includes all atoms
        this.types.push({
            id: "atom",
            types: ["atom"],
            atoms: this.atoms,
            isBuiltin: false
        });
    }

    getAtomType(id: string): IType {
        const atom = this.atoms.find(a => a.id === id);
        if (!atom) {
            throw new Error(`Atom ${id} not found`);
        }
        const type = this.types.find(t => t.id === atom.type);
        if (!type) {
            throw new Error(`Type ${atom.type} not found`);
        }
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

// Create evaluator and test
const datum = new TestDataInstance();
const evaluator = new SimpleGraphQueryEvaluator(datum);

console.log("Testing expression: {y : Color | @:y = Black}");
const result = evaluator.evaluateExpression("{y : Color | @:y = Black}");
console.log("Result:", JSON.stringify(result, null, 2));

console.log("\nTesting expression: {y : Color | @:y = \"Black\"}");
const result2 = evaluator.evaluateExpression("{y : Color | @:y = \"Black\"}");
console.log("Result:", JSON.stringify(result2, null, 2));

console.log("\nTesting Color type:");
const colorResult = evaluator.evaluateExpression("Color");
console.log("Color result:", JSON.stringify(colorResult, null, 2));

console.log("\nTesting atom3 directly:");
const atom3Result = evaluator.evaluateExpression("atom3");
console.log("atom3 result:", JSON.stringify(atom3Result, null, 2));

console.log("\nTesting @:atom3:");
const labelResult = evaluator.evaluateExpression("@:atom3");
console.log("@:atom3 result:", JSON.stringify(labelResult, null, 2));
