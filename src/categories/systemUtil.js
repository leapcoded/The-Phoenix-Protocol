// Utility helpers for Systems flowchart data
// Data model:
// {
//   metaVersion: 1,
//   virtualSize: { width: 4000, height: 3000 },
//   nodes: [ { id, type, label, page, x, y, meta } ],
//   edges: [ { id, from, to, label, meta } ]
// }

export function parseSystem(input) {
  try {
    if (!input) return defaultSystem();
    if (typeof input === 'string') return JSON.parse(input);
    if (typeof input === 'object') return input;
  } catch(_) {}
  return defaultSystem();
}

export function serializeSystem(obj) {
  try { return typeof obj === 'string' ? obj : JSON.stringify(obj); } catch(_) { return JSON.stringify(defaultSystem()); }
}

export function defaultSystem() {
  return {
    metaVersion: 1,
    virtualSize: { width: 4000, height: 3000 },
    nodes: [],
    edges: []
  };
}

export function newNode(partial = {}) {
  const id = partial.id || `n-${Date.now()}-${Math.floor(Math.random()*1e5)}`;
  return { id, type: partial.type || 'entity', label: partial.label || 'New Node', page: partial.page || null, x: partial.x || 200, y: partial.y || 200, meta: partial.meta || {} };
}

export function newEdge(from, to, partial = {}) {
  const id = partial.id || `e-${Date.now()}-${Math.floor(Math.random()*1e5)}`;
  return { id, from, to, label: partial.label || '', meta: partial.meta || {} };
}
