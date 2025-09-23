import { register } from './registry.js';
import { select, textInput, grid, getValue, setValue } from './_base.js';

const id = 'Manuscript';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = grid(
    select('ms-act', 'Act', [
      { value: 'Act I', label: 'Act I' },
      { value: 'Act II', label: 'Act II' },
      { value: 'Act III', label: 'Act III' },
    ]),
    textInput('ms-chapter', 'Chapter Number/Name')
  );
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('ms-act', meta.act);
  setValue('ms-chapter', meta.chapter);
}

function applyExtrasToMeta(meta) {
  meta.act = getValue('ms-act');
  meta.chapter = getValue('ms-chapter');
}

function renderView(ctx) {
  const { meta } = ctx;
  const bits = [];
  if (meta.act) bits.push(`<span class="px-2 py-0.5 bg-sky-800 text-sky-200 rounded text-xs mr-2">${meta.act}</span>`);
  if (meta.chapter) bits.push(`<span class="px-2 py-0.5 bg-gray-700 text-gray-200 rounded text-xs">Chapter: ${meta.chapter}</span>`);
  return bits.length ? `<div class="mt-3">${bits.join('')}</div>` : '';
}

register({ id, label: 'Manuscript', schema: { name: 'Manuscript' }, renderExtras, applyExtrasToMeta, renderView });
