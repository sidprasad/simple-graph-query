import IEvaluator, { IEvaluatorResult, EvaluatorConfig, EvaluationContext, EvaluatorResult, SingleValue, Tuple, ErrorResult } from './interface';
import { Graph } from './types';
import { parse } from './parser';

class EvaluatorResultImpl implements IEvaluatorResult {
  private result: EvaluatorResult;
  private expression: string;

  constructor(result: EvaluatorResult, expression: string) {
    this.result = result;
    this.expression = expression;
  }

  prettyPrint(): string {
    return JSON.stringify(this.result, null, 2);
  }

  noResult(): boolean {
    if (Array.isArray(this.result)) return this.result.length === 0;
    if (typeof this.result === 'object' && 'error' in this.result) return true;
    return false;
  }

  singleResult(): SingleValue {
    if (Array.isArray(this.result) && this.result.length === 1 && this.result[0].length === 1) {
      return this.result[0][0];
    }
    throw new Error('Result is not a singleton');
  }

  selectedAtoms(): string[] {
    if (Array.isArray(this.result)) {
      return this.result.filter(t => t.length === 1).map(t => String(t[0]));
    }
    return [];
  }

  selectedTwoples(): string[][] {
    if (Array.isArray(this.result)) {
      return this.result.filter(t => t.length === 2).map(t => [String(t[0]), String(t[1])]);
    }
    return [];
  }

  selectedTuplesAll(): string[][] {
    if (Array.isArray(this.result)) {
      return this.result.map(t => t.map(String));
    }
    return [];
  }

  isError(): boolean {
    return typeof this.result === 'object' && 'error' in this.result;
  }

  isSingleton(): boolean {
    if (Array.isArray(this.result)) return this.result.length === 1 && this.result[0].length === 1;
    return false;
  }

  getExpression(): string {
    return this.expression;
  }

  getRawResult(): EvaluatorResult {
    return this.result;
  }
}

class Evaluator implements IEvaluator {
  private context: EvaluationContext | null = null;
  private graph: Graph | null = null;
  initialize(_context: EvaluationContext): void {
    this.context = _context;
    // Validate processedData as Graph
    if (
      _context.processedData &&
      Array.isArray((_context.processedData as any).nodes) &&
      Array.isArray((_context.processedData as any).edges)
    ) {
      this.graph = _context.processedData as unknown as Graph;
    } else {
      this.graph = null;
    }
  }
  isReady(): boolean {
    return !!this.graph;
  }
  evaluate(_expression: string, _config?: EvaluatorConfig): IEvaluatorResult {
    if (!this.graph) throw new Error('Evaluator not initialized');
    try {
      const tuples = runQuery(this.graph, _expression);
      return new EvaluatorResultImpl(tuples, _expression);
    } catch (e: any) {
      return new EvaluatorResultImpl({ error: { message: e.message } }, _expression);
    }
  }
}

export function runQuery(graph: Graph, query: string): string[][] {
  const parsed = parse(query);
  const { vars, type, condition } = parsed;
  const domain = graph.nodes.filter((n: any) => n.type === type).map((n: any) => n.id);
  const results: string[][] = [];

  for (const x of domain) {
    for (const y of domain) {
      const ctx: Record<string, string> = { [vars[0]]: x, [vars[1]]: y };
      if (evaluateCondition(condition, ctx, graph)) {
        results.push([x, y]);
      }
    }
  }

  return results;
}

function evaluateCondition(expr: string, ctx: Record<string, string>, graph: Graph): boolean {
  if (expr.includes('='))
    return evalEq(expr, ctx, graph);
  if (expr.includes('in'))
    return evalIn(expr, ctx, graph);
  return false;
}

function evalEq(expr: string, ctx: Record<string, string>, graph: Graph): boolean {
  const [lhs, rhs] = expr.split('=').map(x => x.trim());
  const leftSet = resolve(lhs, ctx, graph);
  const rightSet = resolve(rhs, ctx, graph);
  const rightVal = rightSet.values().next().value;
  if (typeof rightVal === 'string') {
    return leftSet.has(rightVal);
  }
  return false;
}

function evalIn(expr: string, ctx: Record<string, string>, graph: Graph): boolean {
  const [x, path] = expr.split('in').map(s => s.trim());
  const xVal = ctx[x];
  const steps = path.split('.');
  const star = steps[steps.length - 1].endsWith('*');
  const label = steps[steps.length - 1].replace('*', '');

  const reachable = star ? closure(xVal, label, graph) : direct(xVal, label, graph);
  return reachable.has(ctx[steps[0]]);
}

function resolve(term: string, ctx: Record<string, string>, graph: Graph): Set<string> {
  if (term.includes('.')) {
    const [base, label] = term.replace('*', '').split('.');
    const baseVal = ctx[base];
    if (typeof baseVal === 'string') {
      return closure(baseVal, label, graph);
    } else {
      return new Set();
    }
  } else {
    const val = ctx[term];
    if (typeof val === 'string') {
      return new Set([val]);
    } else {
      return new Set();
    }
  }
}

function direct(start: string, label: string, graph: Graph): Set<string> {
  return new Set(graph.edges.filter((e: any) => e.from === start && e.label === label).map((e: any) => e.to));
}

function closure(start: string, label: string, graph: Graph): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const current = stack.pop()!;
    if (!seen.has(current)) {
      seen.add(current);
      for (const edge of graph.edges) {
        if (edge.from === current && edge.label === label && !seen.has(edge.to)) {
          stack.push(edge.to);
        }
      }
    }
  }
  return seen;
}

export { Evaluator };
export default Evaluator;
