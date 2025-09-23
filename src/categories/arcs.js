import { register } from './registry.js';
import { grid, textInput, textarea, getValue, setValue } from './_base.js';

const id = 'Arcs';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = grid(
    textInput('arc-character', 'Character'),
    textInput('arc-status', 'Status (e.g., in-progress, complete)')
  ) + textarea('arc-beats', 'Beats', 'One per line: setup, inciting incident, midpoint, climax, resolution');
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('arc-character', meta.character);
  setValue('arc-status', meta.status);
  setValue('arc-beats', meta.beats);
}

function applyExtrasToMeta(meta) {
  meta.character = getValue('arc-character');
  meta.status = getValue('arc-status');
  meta.beats = getValue('arc-beats');
}

function renderView(ctx) {
  const { meta } = ctx;
  const parts = [];
  if (meta.character) parts.push(`<div><strong>Character:</strong> ${meta.character}</div>`);
  if (meta.status) parts.push(`<div><strong>Status:</strong> ${meta.status}</div>`);
  if (meta.beats) {
    const beats = String(meta.beats).split(/\n+/).map(s=>s.trim()).filter(Boolean);
    if (beats.length) parts.push(`<ol class="list-decimal ml-5 text-gray-300">${beats.map(b=>`<li>${b}</li>`).join('')}</ol>`);
  }
  return parts.length ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700 space-y-2">${parts.join('')}</div>` : '';
}

register({ id, label: 'Arcs', schema: { name: 'Arcs' }, renderExtras, applyExtrasToMeta, renderView });
