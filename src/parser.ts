import { Expr } from './types';

export function parse(query: string): Expr {
  const m = query.match(/\{\s*(.*?)\s*:\s*(\w+)\s*\|\s*(.*?)\s*\}/);
  if (!m) throw new Error("Parse error");
  const [_, vars, type, cond] = m;
  const varList = vars.split(',').map(v => v.trim());
  return { vars: varList, type, condition: cond };
}
