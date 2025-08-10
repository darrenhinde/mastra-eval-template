export function embedTextDeterministic(text: string): number[] {
  const dim = 8;
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) vec[i % dim] += text.charCodeAt(i) % 10;
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

type Chunk = { id: string; text: string; metadata?: Record<string, any>; embedding?: number[] };
const store: Chunk[] = [];

export function clearStore() { store.length = 0; }

export function addDocument(id: string, text: string, metadata: Record<string, any> = {}) {
  const embedding = embedTextDeterministic(text);
  store.push({ id, text, metadata, embedding });
}

function dot(a: number[], b: number[]) { return a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0); }

export async function queryVector(query: string, k = 5) {
  const qv = embedTextDeterministic(query);
  const scored = store.map(c => ({ ...c, score: dot(qv, c.embedding || []) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(s => ({ id: s.id, text: s.text, metadata: s.metadata, score: s.score }));
}
