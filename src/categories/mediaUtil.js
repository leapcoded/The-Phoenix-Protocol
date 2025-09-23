// Utilities for media fields used by category modules
export function parseMedia(mediaStr) {
  if (!mediaStr) return [];
  const s = String(mediaStr).trim();
  // If already JSON, parse it
  if (s.startsWith('[') || s.startsWith('{')) {
    try { const parsed = JSON.parse(s); return Array.isArray(parsed) ? parsed : []; } catch (_) { /* fallthrough */ }
  }
  // Backwards-compatible: newline/tab format
  return s.split('\n').map(it => it.trim()).filter(Boolean).map(entry => {
    const parts = entry.split('\t');
    return { type: parts[0] || 'image', url: parts[1] || '', name: parts[2] || '' };
  });
}

export function serializeMedia(items) {
  if (!Array.isArray(items)) return '[]';
  return JSON.stringify(items);
}

export function renderMediaHtml(mediaArr) {
  if (!Array.isArray(mediaArr) || mediaArr.length === 0) return '';
  return mediaArr.map(entry => {
    if (!entry || !entry.url) return '';
    if (entry.type === 'pdf') return `<div class="p-2 bg-gray-900 rounded"><a href="${entry.url}" target="_blank" rel="noopener" class="text-sky-400 hover:underline">${entry.name || 'Document'}</a></div>`;
    if (entry.type === 'audio') return `<div class="w-full"><audio controls src="${entry.url}" class="w-full"></audio></div>`;
    return `<div class="w-full aspect-square bg-gray-900 rounded-lg overflow-hidden"><img src="${entry.url}" alt="${entry.name || ''}" class="w-full h-full object-cover"/></div>`;
  }).join('');
}

export function addMediaPreview(type, url, name, container) {
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'relative w-full rounded-lg overflow-hidden';
  div.dataset.type = type; div.dataset.url = url; div.dataset.name = name || '';
  if (type === 'pdf') {
    div.innerHTML = `<div class="p-3 bg-gray-900 rounded h-full flex items-center justify-center"><a href="${url}" target="_blank" rel="noopener" class="text-sky-400 hover:underline">${name || 'Document'}</a></div><button type="button" class="absolute top-0 right-0 m-1 w-6 h-6 bg-red-600 text-white rounded-full text-xs">&times;</button>`;
  } else if (type === 'audio') {
    div.innerHTML = `<audio controls src="${url}" class="w-full"></audio><button type="button" class="absolute top-0 right-0 m-1 w-6 h-6 bg-red-600 text-white rounded-full text-xs">&times;</button>`;
  } else {
    div.classList.add('aspect-square','bg-gray-900');
    div.innerHTML = `<img src="${url}" data-url="${url}" class="w-full h-full object-cover"><button type="button" class="absolute top-0 right-0 m-1 w-6 h-6 bg-red-600 text-white rounded-full text-xs">&times;</button>`;
  }
  div.querySelector('button').addEventListener('click', (e) => { e.preventDefault(); div.remove(); });
  container.appendChild(div);
}
