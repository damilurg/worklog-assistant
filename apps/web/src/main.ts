import { bootstrapApplication } from '@angular/platform-browser';
import { Component, computed, signal, LOCALE_ID } from '@angular/core';
import { Graph, GraphNode, NodeKind, neighborhood } from '../../../packages/shared/src/graph';
import { demoGraph } from '../../../packages/shared/src/demoGraph';
import { en } from './i18n/en';
@Component({ selector: 'app-root', standalone: true, templateUrl: './app.html' })
class App {
  graph = signal<Graph>(demoGraph);
  selected = signal('issue:DEV-142');
  query = signal('');
  filter = signal<string>('all');
  focus = signal(false);
  depth = signal(1);
  zoom = signal(1);
  loading = signal(false);
  error = signal('');
  apiKey = signal('');
  showSettings = signal(false);
  kinds: NodeKind[] = ['issue', 'mr', 'commit', 'person', 'repository', 'worklog'];
  readonly t = en;
  readonly labels: Record<string, string> = en.nodeKinds;
  icons: Record<string, string> = {
    issue: '◇',
    mr: '↔',
    commit: '●',
    person: '◉',
    repository: '▱',
    worklog: '◷',
  };
  active = computed(() => this.graph().nodes.find((n) => n.id === this.selected()));
  related = computed(() => {
    const g = neighborhood(this.graph(), this.selected());
    return g.nodes.filter((n) => n.id !== this.selected());
  });
  matches = computed(() =>
    this.graph().nodes.filter(
      (n) =>
        (this.filter() === 'all' || n.kind === this.filter()) &&
        `${n.label} ${n.title}`.toLowerCase().includes(this.query().toLowerCase()),
    ),
  );
  visible = computed(() => {
    const g = this.focus()
      ? neighborhood(this.graph(), this.selected(), this.depth())
      : this.graph();
    const matches = new Set(this.matches().map((n) => n.id));
    const ns = g.nodes.filter((n) => matches.has(n.id));
    const ids = new Set(ns.map((n) => n.id));
    return { ...g, nodes: ns, edges: g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
  });
  positions = computed(() => {
    const groups: Record<string, GraphNode[]> = {};
    for (const n of this.visible().nodes) (groups[n.kind] ??= []).push(n);
    const xs: Record<string, number> = {
      repository: 100,
      person: 275,
      mr: 450,
      commit: 650,
      issue: 850,
      worklog: 1050,
    };
    const pos = new Map<string, { x: number; y: number }>();
    for (const [kind, ns] of Object.entries(groups))
      ns.forEach((n, i) =>
        pos.set(n.id, {
          x: xs[kind],
          y: ns.length === 1 ? 330 : 110 + i * (440 / Math.max(1, ns.length - 1)),
        }),
      );
    return pos;
  });
  position(id: string) {
    return this.positions().get(id) ?? { x: 0, y: 0 };
  }
  line(from: string, to: string) {
    const a = this.position(from),
      b = this.position(to);
    return `M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`;
  }
  connected(id: string) {
    return id === this.selected() || this.related().some((n) => n.id === id);
  }
  count(kind: string) {
    return this.graph().nodes.filter((n) => n.kind === kind).length;
  }
  select(n: GraphNode) {
    this.selected.set(n.id);
  }
  safeUrl(url?: string) {
    try {
      const u = new URL(url ?? '');
      return u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  }
  changeZoom(amount: number) {
    this.zoom.update((z) => Math.min(1.8, Math.max(0.55, z + amount)));
  }
  from = signal(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  to = signal(new Date().toISOString().slice(0, 10));
  async load(sync = false) {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await fetch(
        `/api/${sync ? 'sync' : 'graph'}?from=${encodeURIComponent(this.from())}&to=${encodeURIComponent(this.to())}`,
        {
          method: sync ? 'POST' : 'GET',
          headers: this.apiKey() ? { 'x-api-key': this.apiKey() } : {},
        },
      );
      if (!res.ok)
        throw new Error(
          res.status === 401 ? this.t.apiKeyRequired : this.t.apiUnavailable(res.status),
        );
      const g = (await res.json()) as Graph;
      this.graph.set(g);
      if (g.mode === 'live') this.focus.set(true);
      if (!g.nodes.some((n) => n.id === this.selected())) this.selected.set(g.nodes[0]?.id ?? '');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : this.t.connectionError);
    } finally {
      this.loading.set(false);
    }
  }
  constructor() {
    void this.load();
  }
}
bootstrapApplication(App, { providers: [{ provide: LOCALE_ID, useValue: en.locale }] }).catch(
  console.error,
);
