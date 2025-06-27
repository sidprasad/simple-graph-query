import { Expr } from './types';

export function parse(query: string): Expr {
  // Match { x, y: Person, z: Animal | ... } or { x: Person, y, z: Animal | ... }
  const m = query.match(/\{\s*(.*?)\s*\|\s*(.*?)\s*\}/);
  if (!m) throw new Error("Parse error: expected '{ ... | ... }'");
  const [_, varsPart, cond] = m;
  // Split by comma, allow optional type annotation
  const varDefs = varsPart.split(',').map(v => v.trim());
  const vars: string[] = [];
  const varTypes: Record<string, string> = {};
  for (const def of varDefs) {
    if (!def) continue;
    const match = def.match(/^([a-zA-Z_]\w*)(?::\s*([a-zA-Z_]\w*))?$/);
    if (!match) {
      throw new Error(`Parse error: invalid variable definition '${def}'`);
    }
    const [, name, type] = match;
    vars.push(name);
    varTypes[name] = type || 'univ';
  }
  return { vars, varTypes, condition: cond };
}
