export interface Expr {
  vars: string[];
  varTypes: Record<string, string>; // variable name to type
  condition: string;
}

export interface Node {
  id: string;
  type: string;
}

export interface Edge {
  from: string;
  to: string;
  label: string;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}
