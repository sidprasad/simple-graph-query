import { IDataInstance, IAtom, IRelation, ITuple, IType } from "../src/types";



const rbttData = `
{
    "atoms": [
        {
            "id": "n1",
            "type": "int",
            "label": "10",
            "type_hierarchy": [
                "int",
                "object"
            ]
        },
        {
            "id": "n2",
            "type": "str",
            "label": "black",
            "type_hierarchy": [
                "str",
                "object"
            ]
        },
        {
            "id": "n4",
            "type": "int",
            "label": "5",
            "type_hierarchy": [
                "int",
                "object"
            ]
        },
        {
            "id": "n5",
            "type": "str",
            "label": "red",
            "type_hierarchy": [
                "str",
                "object"
            ]
        },
        {
            "id": "n7",
            "type": "int",
            "label": "3",
            "type_hierarchy": [
                "int",
                "object"
            ]
        },
        {
            "id": "n8",
            "type": "NoneType",
            "label": "None",
            "type_hierarchy": [
                "NoneType",
                "object"
            ]
        },
        {
            "id": "n6",
            "type": "RBTreeNode",
            "label": "RBTreeNode",
            "type_hierarchy": [
                "RBTreeNode",
                "TreeNode",
                "object"
            ]
        },
        {
            "id": "n10",
            "type": "int",
            "label": "7",
            "type_hierarchy": [
                "int",
                "object"
            ]
        },
        {
            "id": "n9",
            "type": "RBTreeNode",
            "label": "RBTreeNode",
            "type_hierarchy": [
                "RBTreeNode",
                "TreeNode",
                "object"
            ]
        },
        {
            "id": "n3",
            "type": "RBTreeNode",
            "label": "RBTreeNode",
            "type_hierarchy": [
                "RBTreeNode",
                "TreeNode",
                "object"
            ]
        },
        {
            "id": "n12",
            "type": "int",
            "label": "15",
            "type_hierarchy": [
                "int",
                "object"
            ]
        },
        {
            "id": "n14",
            "type": "int",
            "label": "12",
            "type_hierarchy": [
                "int",
                "object"
            ]
        },
        {
            "id": "n13",
            "type": "RBTreeNode",
            "label": "RBTreeNode",
            "type_hierarchy": [
                "RBTreeNode",
                "TreeNode",
                "object"
            ]
        },
        {
            "id": "n16",
            "type": "int",
            "label": "18",
            "type_hierarchy": [
                "int",
                "object"
            ]
        },
        {
            "id": "n15",
            "type": "RBTreeNode",
            "label": "RBTreeNode",
            "type_hierarchy": [
                "RBTreeNode",
                "TreeNode",
                "object"
            ]
        },
        {
            "id": "n11",
            "type": "RBTreeNode",
            "label": "RBTreeNode",
            "type_hierarchy": [
                "RBTreeNode",
                "TreeNode",
                "object"
            ]
        },
        {
            "id": "n0",
            "type": "RBTreeNode",
            "label": "RBTreeNode",
            "type_hierarchy": [
                "RBTreeNode",
                "TreeNode",
                "object"
            ]
        }
    ],
    "relations": [
        {
            "id": "value",
            "name": "value",
            "types": [
                "object",
                "object"
            ],
            "tuples": [
                {
                    "atoms": [
                        "n6",
                        "n7"
                    ],
                    "types": [
                        "RBTreeNode",
                        "int"
                    ]
                },
                {
                    "atoms": [
                        "n9",
                        "n10"
                    ],
                    "types": [
                        "RBTreeNode",
                        "int"
                    ]
                },
                {
                    "atoms": [
                        "n3",
                        "n4"
                    ],
                    "types": [
                        "RBTreeNode",
                        "int"
                    ]
                },
                {
                    "atoms": [
                        "n13",
                        "n14"
                    ],
                    "types": [
                        "RBTreeNode",
                        "int"
                    ]
                },
                {
                    "atoms": [
                        "n15",
                        "n16"
                    ],
                    "types": [
                        "RBTreeNode",
                        "int"
                    ]
                },
                {
                    "atoms": [
                        "n11",
                        "n12"
                    ],
                    "types": [
                        "RBTreeNode",
                        "int"
                    ]
                },
                {
                    "atoms": [
                        "n0",
                        "n1"
                    ],
                    "types": [
                        "RBTreeNode",
                        "int"
                    ]
                }
            ]
        },
        {
            "id": "color",
            "name": "color",
            "types": [
                "object",
                "object"
            ],
            "tuples": [
                {
                    "atoms": [
                        "n6",
                        "n2"
                    ],
                    "types": [
                        "RBTreeNode",
                        "str"
                    ]
                },
                {
                    "atoms": [
                        "n9",
                        "n2"
                    ],
                    "types": [
                        "RBTreeNode",
                        "str"
                    ]
                },
                {
                    "atoms": [
                        "n3",
                        "n5"
                    ],
                    "types": [
                        "RBTreeNode",
                        "str"
                    ]
                },
                {
                    "atoms": [
                        "n13",
                        "n2"
                    ],
                    "types": [
                        "RBTreeNode",
                        "str"
                    ]
                },
                {
                    "atoms": [
                        "n15",
                        "n2"
                    ],
                    "types": [
                        "RBTreeNode",
                        "str"
                    ]
                },
                {
                    "atoms": [
                        "n11",
                        "n5"
                    ],
                    "types": [
                        "RBTreeNode",
                        "str"
                    ]
                },
                {
                    "atoms": [
                        "n0",
                        "n2"
                    ],
                    "types": [
                        "RBTreeNode",
                        "str"
                    ]
                }
            ]
        },
        {
            "id": "left",
            "name": "left",
            "types": [
                "object",
                "object"
            ],
            "tuples": [
                {
                    "atoms": [
                        "n6",
                        "n8"
                    ],
                    "types": [
                        "RBTreeNode",
                        "NoneType"
                    ]
                },
                {
                    "atoms": [
                        "n9",
                        "n8"
                    ],
                    "types": [
                        "RBTreeNode",
                        "NoneType"
                    ]
                },
                {
                    "atoms": [
                        "n3",
                        "n6"
                    ],
                    "types": [
                        "RBTreeNode",
                        "RBTreeNode"
                    ]
                },
                {
                    "atoms": [
                        "n13",
                        "n8"
                    ],
                    "types": [
                        "RBTreeNode",
                        "NoneType"
                    ]
                },
                {
                    "atoms": [
                        "n15",
                        "n8"
                    ],
                    "types": [
                        "RBTreeNode",
                        "NoneType"
                    ]
                },
                {
                    "atoms": [
                        "n11",
                        "n13"
                    ],
                    "types": [
                        "RBTreeNode",
                        "RBTreeNode"
                    ]
                },
                {
                    "atoms": [
                        "n0",
                        "n3"
                    ],
                    "types": [
                        "RBTreeNode",
                        "RBTreeNode"
                    ]
                }
            ]
        },
        {
            "id": "right",
            "name": "right",
            "types": [
                "object",
                "object"
            ],
            "tuples": [
                {
                    "atoms": [
                        "n6",
                        "n8"
                    ],
                    "types": [
                        "RBTreeNode",
                        "NoneType"
                    ]
                },
                {
                    "atoms": [
                        "n9",
                        "n8"
                    ],
                    "types": [
                        "RBTreeNode",
                        "NoneType"
                    ]
                },
                {
                    "atoms": [
                        "n3",
                        "n9"
                    ],
                    "types": [
                        "RBTreeNode",
                        "RBTreeNode"
                    ]
                },
                {
                    "atoms": [
                        "n13",
                        "n8"
                    ],
                    "types": [
                        "RBTreeNode",
                        "NoneType"
                    ]
                },
                {
                    "atoms": [
                        "n15",
                        "n8"
                    ],
                    "types": [
                        "RBTreeNode",
                        "NoneType"
                    ]
                },
                {
                    "atoms": [
                        "n11",
                        "n15"
                    ],
                    "types": [
                        "RBTreeNode",
                        "RBTreeNode"
                    ]
                },
                {
                    "atoms": [
                        "n0",
                        "n11"
                    ],
                    "types": [
                        "RBTreeNode",
                        "RBTreeNode"
                    ]
                }
            ]
        }
    ],
    "types": [
        {
            "_": "type",
            "id": "int",
            "types": [
                "int",
                "object"
            ],
            "atoms": [
                {
                    "_": "atom",
                    "id": "n1",
                    "type": "int"
                },
                {
                    "_": "atom",
                    "id": "n4",
                    "type": "int"
                },
                {
                    "_": "atom",
                    "id": "n7",
                    "type": "int"
                },
                {
                    "_": "atom",
                    "id": "n10",
                    "type": "int"
                },
                {
                    "_": "atom",
                    "id": "n12",
                    "type": "int"
                },
                {
                    "_": "atom",
                    "id": "n14",
                    "type": "int"
                },
                {
                    "_": "atom",
                    "id": "n16",
                    "type": "int"
                }
            ],
            "meta": {
                "builtin": true
            }
        },
        {
            "_": "type",
            "id": "str",
            "types": [
                "str",
                "object"
            ],
            "atoms": [
                {
                    "_": "atom",
                    "id": "n2",
                    "type": "str"
                },
                {
                    "_": "atom",
                    "id": "n5",
                    "type": "str"
                }
            ],
            "meta": {
                "builtin": true
            }
        },
        {
            "_": "type",
            "id": "NoneType",
            "types": [
                "NoneType",
                "object"
            ],
            "atoms": [
                {
                    "_": "atom",
                    "id": "n8",
                    "type": "NoneType"
                }
            ],
            "meta": {
                "builtin": true
            }
        },
        {
            "_": "type",
            "id": "RBTreeNode",
            "types": [
                "RBTreeNode",
                "TreeNode",
                "object"
            ],
            "atoms": [
                {
                    "_": "atom",
                    "id": "n6",
                    "type": "RBTreeNode"
                },
                {
                    "_": "atom",
                    "id": "n9",
                    "type": "RBTreeNode"
                },
                {
                    "_": "atom",
                    "id": "n3",
                    "type": "RBTreeNode"
                },
                {
                    "_": "atom",
                    "id": "n13",
                    "type": "RBTreeNode"
                },
                {
                    "_": "atom",
                    "id": "n15",
                    "type": "RBTreeNode"
                },
                {
                    "_": "atom",
                    "id": "n11",
                    "type": "RBTreeNode"
                },
                {
                    "_": "atom",
                    "id": "n0",
                    "type": "RBTreeNode"
                }
            ],
            "meta": {
                "builtin": false
            }
        }
    ],
    "errors": [],
    "eventListeners": {}
}
`;


const tttData = `
  {
    "types": {
      "seq/Int": {
        "_": "type",
        "id": "seq/Int",
        "types": ["seq/Int", "Int"],
        "atoms": [],
        "meta": {
          "builtin": true
        }
      },
      "Int": {
        "_": "type",
        "id": "Int",
        "types": ["Int"],
        "atoms": [
          {
            "_": "atom",
            "id": "-8",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "-7",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "-6",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "-5",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "-4",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "-3",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "-2",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "-1",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "0",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "1",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "2",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "3",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "4",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "5",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "6",
            "type": "Int"
          },
          {
            "_": "atom",
            "id": "7",
            "type": "Int"
          }
        ],
        "meta": {
          "builtin": true
        }
      },
      "univ": {
        "_": "type",
        "id": "univ",
        "types": [],
        "atoms": [],
        "meta": {
          "builtin": true
        }
      },
      "Board": {
        "_": "type",
        "id": "Board",
        "types": ["Board"],
        "atoms": [
          {
            "_": "atom",
            "id": "Board0",
            "type": "Board"
          },
          {
            "_": "atom",
            "id": "Board1",
            "type": "Board"
          },
          {
            "_": "atom",
            "id": "Board2",
            "type": "Board"
          },
          {
            "_": "atom",
            "id": "Board3",
            "type": "Board"
          },
          {
            "_": "atom",
            "id": "Board4",
            "type": "Board"
          },
          {
            "_": "atom",
            "id": "Board5",
            "type": "Board"
          },
          {
            "_": "atom",
            "id": "Board6",
            "type": "Board"
          }
        ]
      },
      "Player": {
        "_": "type",
        "id": "Player",
        "types": ["Player"],
        "atoms": []
      },
      "X": {
        "_": "type",
        "id": "X",
        "types": ["X", "Player"],
        "atoms": [
          {
            "_": "atom",
            "id": "X0",
            "type": "X",
            "label": "red"
          }
        ]
      },
      "Game": {
        "_": "type",
        "id": "Game",
        "types": ["Game"],
        "atoms": [
          {
            "_": "atom",
            "id": "Game0",
            "type": "Game"
          }
        ]
      },
      "O": {
        "_": "type",
        "id": "O",
        "types": ["O", "Player"],
        "atoms": [
          {
            "_": "atom",
            "id": "O0",
            "type": "O",
            "label": "blue"
          }
        ]
      }
    },
    "relations": {
      "univ<:no-field-guard": {
        "_": "relation",
        "id": "univ<:no-field-guard",
        "name": "no-field-guard",
        "types": ["univ", "univ"],
        "tuples": []
      },
      "Game<:next": {
        "_": "relation",
        "id": "Game<:next",
        "name": "next",
        "types": ["Game", "Board", "Board"],
        "tuples": [
          {
            "_": "tuple",
            "types": ["Game", "Board", "Board"],
            "atoms": ["Game0", "Board0", "Board1"]
          },
          {
            "_": "tuple",
            "types": ["Game", "Board", "Board"],
            "atoms": ["Game0", "Board1", "Board2"]
          },
          {
            "_": "tuple",
            "types": ["Game", "Board", "Board"],
            "atoms": ["Game0", "Board2", "Board3"]
          },
          {
            "_": "tuple",
            "types": ["Game", "Board", "Board"],
            "atoms": ["Game0", "Board3", "Board4"]
          },
          {
            "_": "tuple",
            "types": ["Game", "Board", "Board"],
            "atoms": ["Game0", "Board4", "Board5"]
          },
          {
            "_": "tuple",
            "types": ["Game", "Board", "Board"],
            "atoms": ["Game0", "Board5", "Board6"]
          }
        ]
      },
      "Game<:initialState": {
        "_": "relation",
        "id": "Game<:initialState",
        "name": "initialState",
        "types": ["Game", "Board"],
        "tuples": [
          {
            "_": "tuple",
            "types": ["Game", "Board"],
            "atoms": ["Game0", "Board0"]
          }
        ]
      },
      "Board<:board": {
        "_": "relation",
        "id": "Board<:board",
        "name": "board",
        "types": ["Board", "Int", "Int", "Player"],
        "tuples": [
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board1", "1", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board2", "0", "2", "O0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board2", "1", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board3", "0", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board3", "0", "2", "O0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board3", "1", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board4", "0", "0", "O0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board4", "0", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board4", "0", "2", "O0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board4", "1", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board5", "0", "0", "O0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board5", "0", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board5", "0", "2", "O0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board5", "1", "0", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board5", "1", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board6", "0", "0", "O0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board6", "0", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board6", "0", "2", "O0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board6", "1", "0", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board6", "1", "1", "X0"]
          },
          {
            "_": "tuple",
            "types": ["Board", "Int", "Int", "Player"],
            "atoms": ["Board6", "2", "0", "O0"]
          }
        ]
      }
    },
    "skolems": {}
  }
`;



class DataInstance implements IDataInstance {
  private _data: any;
  constructor(data: string) {
    this._data = JSON.parse(data);
  }
  getTypes(): IType[] {
    // Convert the types object to an array
    const types = Object.values(this._data.types) as IType[];
    
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
        // Merge label information from the main atoms array before checking for duplicates
        const fullAtom = atomMap.get(atom.id);
        if (fullAtom && fullAtom.label !== undefined) {
          atom.label = fullAtom.label;
        }
        
        // Skip if we've already seen this atom ID in this type
        if (uniqueAtomMap.has(atom.id)) {
          continue;
        }
        
        uniqueAtomMap.set(atom.id, atom);
      }
      
      // Replace the atoms array with deduplicated atoms
      type.atoms = Array.from(uniqueAtomMap.values());
    }
    
    return types;
  }

  getRelations(): IRelation[] {
    // Convert the relations object to an array
    return Object.values(this._data.relations) as IRelation[];
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
    // Find the type that contains the atom with the given id
    for (const type of this.getTypes()) {
      if (type.atoms.some(atom => atom.id === id)) {
        return type;
      }
    }
    throw new Error(`Atom with id ${id} not found`);
  }
}




export class TTTDataInstance extends DataInstance implements IDataInstance {
  constructor() {
    super(tttData);
  }
}

export class RBTTDataInstance extends DataInstance implements IDataInstance {
  constructor() {
    super(rbttData);
  }
}

// Test data for label extraction with mixed-case identifiers (from issue)
const labelTestData = `
{
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
  "types": {
    "RBTree": {
      "id": "RBTree",
      "types": ["RBTree"],
      "atoms": [
        {"id": "atom0", "type": "RBTree"}
      ],
      "meta": {"builtin": false}
    },
    "Node": {
      "id": "Node",
      "types": ["Node"],
      "atoms": [
        {"id": "atom1", "type": "Node"},
        {"id": "atom4", "type": "Node"},
        {"id": "atom8", "type": "Node"}
      ],
      "meta": {"builtin": false}
    },
    "u32": {
      "id": "u32",
      "types": ["u32"],
      "atoms": [
        {"id": "atom2", "type": "u32"},
        {"id": "atom5", "type": "u32"},
        {"id": "atom9", "type": "u32"}
      ],
      "meta": {"builtin": false}
    },
    "Color": {
      "id": "Color",
      "types": ["Color"],
      "atoms": [
        {"id": "atom3", "type": "Color"},
        {"id": "atom6", "type": "Color"}
      ],
      "meta": {"builtin": false}
    },
    "None": {
      "id": "None",
      "types": ["None"],
      "atoms": [
        {"id": "atom7", "type": "None"}
      ],
      "meta": {"builtin": false}
    }
  },
  "relations": {
    "root": {
      "id": "root",
      "name": "root",
      "types": ["RBTree", "atom"],
      "tuples": [
        {
          "atoms": ["atom0", "atom1"],
          "types": ["RBTree", "atom"]
        }
      ]
    },
    "color": {
      "id": "color",
      "name": "color",
      "types": ["Node", "atom"],
      "tuples": [
        {
          "atoms": ["atom1", "atom3"],
          "types": ["Node", "atom"]
        },
        {
          "atoms": ["atom4", "atom6"],
          "types": ["Node", "atom"]
        },
        {
          "atoms": ["atom8", "atom6"],
          "types": ["Node", "atom"]
        }
      ]
    },
    "key": {
      "id": "key",
      "name": "key",
      "types": ["Node", "atom"],
      "tuples": [
        {
          "atoms": ["atom1", "atom2"],
          "types": ["Node", "atom"]
        },
        {
          "atoms": ["atom4", "atom5"],
          "types": ["Node", "atom"]
        },
        {
          "atoms": ["atom8", "atom9"],
          "types": ["Node", "atom"]
        }
      ]
    }
  },
  "skolems": {}
}
`;

export class LabelTestDataInstance extends DataInstance implements IDataInstance {
  constructor() {
    super(labelTestData);
  }
}