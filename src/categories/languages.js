import { register } from './registry.js';
import { grid, textInput, textarea, select, getValue, setValue } from './_base.js';
import { parseMedia, serializeMedia, addMediaPreview, renderMediaHtml } from './mediaUtil.js';

const id = 'Languages';

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const statusOptions = [
    { value: 'Active', label: 'Active' },
    { value: 'Constructed', label: 'Constructed / Conlang' },
    { value: 'Dead', label: 'Dead / Extinct' },
    { value: 'Unknown', label: 'Unknown' },
  ];

  const html = grid(
    textInput('lang-family', 'Language Family'),
    textInput('lang-script', 'Script / Alphabet'),
    select('lang-status', 'Status', statusOptions),
    textInput('lang-speakers', 'Speakers (est.)'),
  ) + textarea('lang-phonology', 'Phonology / Grammar Notes') + textarea('lang-sample', 'Sample sentence / glossary');

  // Media (images + audio samples)
  const mediaHtml = `
    <div class="col-span-2">
      <label for="lang-media-upload" class="block text-sm font-medium text-gray-300 mb-1">Media (images & audio)</label>
      <div id="lang-media-preview" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-2"></div>
      <input type="file" id="lang-media-upload" multiple accept="image/*,audio/*" class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700"/>
      <div id="lang-media-progress" class="w-full bg-gray-700 rounded-full h-2.5 mt-2 hidden"><div class="bg-sky-600 h-2.5 rounded-full" style="width: 0%"></div></div>
    </div>`;

  container.innerHTML = html + mediaHtml;
  const meta = (ctx && ctx.meta) || {};
  setValue('lang-family', meta.family);
  setValue('lang-script', meta.script);
  setValue('lang-status', meta.status);
  setValue('lang-speakers', meta.speakers);
  setValue('lang-phonology', meta.phonology || meta.notes);
  setValue('lang-sample', meta.sample);

  // Populate existing media
  const previewContainer = document.getElementById('lang-media-preview');
  const existing = parseMedia(meta.media);
  existing.forEach(entry => addMediaPreview(entry.type, entry.url, entry.name, previewContainer));

  document.getElementById('lang-media-upload').addEventListener('change', handleMediaUploads);
}

function applyExtrasToMeta(meta) {
  meta.family = getValue('lang-family');
  meta.script = getValue('lang-script');
  meta.status = getValue('lang-status');
  meta.speakers = getValue('lang-speakers');
  meta.phonology = getValue('lang-phonology');
  meta.sample = getValue('lang-sample');

  const previewContainer = document.getElementById('lang-media-preview');
  if (previewContainer) {
    const entries = Array.from(previewContainer.querySelectorAll('[data-type][data-url]')).map(el => ({ type: el.dataset.type, url: el.dataset.url, name: el.dataset.name || '' }));
    meta.media = serializeMedia(entries);
  }
}

function renderView(ctx) {
  const { meta } = ctx;
  const blocks = [];
  if (meta.family) blocks.push(`<div><strong>Family:</strong> ${meta.family}</div>`);
  if (meta.script) blocks.push(`<div><strong>Script:</strong> ${meta.script}</div>`);
  if (meta.status) blocks.push(`<div><strong>Status:</strong> ${meta.status}</div>`);
  if (meta.speakers) blocks.push(`<div><strong>Speakers:</strong> ${meta.speakers}</div>`);
  if (meta.phonology) blocks.push(`<div class="mt-2 text-gray-300">${meta.phonology}</div>`);
  if (meta.sample) blocks.push(`<div class="mt-2 text-gray-300"><strong>Sample:</strong> <div class="mt-1">${meta.sample}</div></div>`);

  const mediaArr = parseMedia(meta.media);
  const mediaHtml = renderMediaHtml(mediaArr);

  return (blocks.length || mediaHtml) ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">${blocks.join('')}${mediaHtml ? `<div class="mt-4"><h4 class="text-sm font-semibold text-gray-300 mb-2">Media</h4><div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">${mediaHtml}</div></div>` : ''}</div>` : '';
}

async function handleMediaUploads(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  const progressContainer = document.getElementById('lang-media-progress');
  const progressBar = progressContainer.querySelector('div');
  const previewContainer = document.getElementById('lang-media-preview');
  progressContainer.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const { uploadFile } = await import('../firebase.js');
      const kind = file.type.startsWith('audio') ? 'audio' : 'image';
      const url = await uploadFile(file, `language-media`, (progress) => {
        const overallProgress = ((i + (progress / 100)) / files.length) * 100;
        progressBar.style.width = `${overallProgress}%`;
      });
  addMediaPreview(kind, url, file.name, previewContainer);
    } catch (err) {
      console.error('Media upload failed', err);
    }
  }

  progressBar.style.width = '100%';
  setTimeout(() => { progressContainer.classList.add('hidden'); progressBar.style.width = '0%'; }, 800);
}

register({ id, label: 'Languages', schema: { name: 'Languages' }, renderExtras, applyExtrasToMeta, renderView });
