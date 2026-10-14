export type NodeKind = 'issue' | 'mr' | 'commit' | 'person' | 'repository' | 'worklog';
export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  title: string;
  status?: string;
  url?: string;
  updatedAt?: string;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: 'implements' | 'contains' | 'authored' | 'depends_on' | 'logged';
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  mode: 'demo' | 'live';
  syncedAt?: string;
  truncated?: boolean;
}
export function issueKeys(text: string): string[] {
  return [...new Set(text.toUpperCase().match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [])];
}
export function edge(from: string, to: string, type: GraphEdge['type']): GraphEdge {
  return { id: `${type}:${from}:${to}`, from, to, type };
}
export function neighborhood(graph: Graph, id: string, depth = 1): Graph {
  const ids = new Set([id]);
  for (let i = 0; i < depth; i++) {
    const frontier = new Set(ids);
    for (const e of graph.edges)
      if (frontier.has(e.from) || frontier.has(e.to)) {
        ids.add(e.from);
        ids.add(e.to);
      }
  }
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => ids.has(n.id)),
    edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
}
