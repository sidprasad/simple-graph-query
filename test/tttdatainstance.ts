import { IDataInstance, IAtom, IRelation, ITuple, IType } from "../src/types";

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

export class TTTDataInstance implements IDataInstance {
  private _data: any;

  constructor() {
    this._data = JSON.parse(tttData);
  }

  getTypes(): IType[] {
    // Convert the types object to an array
    return Object.values(this._data.types) as IType[];
  }

  getRelations(): IRelation[] {
    // Convert the relations object to an array
    return Object.values(this._data.relations) as IRelation[];
  }

  getAtoms(): IAtom[] {
    // Collect all atoms from all types
    return this.getTypes().flatMap(type => type.atoms);
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