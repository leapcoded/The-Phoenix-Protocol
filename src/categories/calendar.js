import { register } from './registry.js';
import { grid, textInput, textarea, getValue, setValue } from './_base.js';

const id = 'Calendar';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = grid(
    textInput('cal-system', 'Calendar System'),
    textInput('cal-epoch', 'Epoch / Year Zero')
  ) + textarea('cal-holidays', 'Important Dates/Holidays', 'One per line, with brief description');
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('cal-system', meta.system);
  setValue('cal-epoch', meta.epoch);
  setValue('cal-holidays', meta.holidays);
}

function applyExtrasToMeta(meta) {
  meta.system = getValue('cal-system');
  meta.epoch = getValue('cal-epoch');
  meta.holidays = getValue('cal-holidays');
}

function renderView(ctx) {
  const { meta } = ctx;
  const lines = String(meta.holidays || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  return `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">
    ${meta.system ? `<div><strong>System:</strong> ${meta.system}</div>` : ''}
    ${meta.epoch ? `<div><strong>Epoch:</strong> ${meta.epoch}</div>` : ''}
    ${lines.length ? `<ul class="list-disc ml-5 text-gray-300 mt-2">${lines.map(l=>`<li>${l}</li>`).join('')}</ul>` : ''}
  </div>`;
}

register({ id, label: 'Calendar', schema: { name: 'Calendar' }, renderExtras, applyExtrasToMeta, renderView });
