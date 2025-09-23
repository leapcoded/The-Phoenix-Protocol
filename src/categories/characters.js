import { register } from './registry.js';
import { grid, textInput, textarea, select, getValue, setValue } from './_base.js';
import { parseMedia, serializeMedia, addMediaPreview } from './mediaUtil.js';

const id = 'Characters';

const schema = {
  name: 'Characters',
  fields: [
    { key: 'fullName', type: 'text' },
    { key: 'alias', type: 'text' },
    { key: 'age', type: 'text' },
    { key: 'role', type: 'text' },
    { key: 'status', type: 'select', options: ['Alive', 'Deceased', 'Unknown'] },
    { key: 'affiliation', type: 'text' },
    { key: 'traits', type: 'textarea' },
  ]
};

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const statusOptions = [
    { value: 'Alive', label: 'Alive' },
    { value: 'Deceased', label: 'Deceased' },
    { value: 'Unknown', label: 'Unknown' },
  ];
  const html = grid(
    textInput('ch-fullName', 'Full Name'),
    textInput('ch-pronouns', 'Pronouns'),
    textInput('ch-age', 'Age'),
    textInput('ch-role', 'Role / Occupation'),
    select('ch-status', 'Status', statusOptions),
    textInput('ch-affiliation', 'Affiliation / Faction')
  ) + textarea('ch-personality', 'Personality') + textarea('ch-background', 'Background') + textarea('ch-physical', 'Physical Description') + textarea('ch-dialogue', 'Dialogue Style');

  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('ch-fullName', meta.fullName);
  try { if (meta.fullName && !meta.title) meta.title = meta.fullName; } catch(_) {}
  setValue('ch-pronouns', meta.pronouns);
  setValue('ch-age', meta.age);
  setValue('ch-role', meta.role);
  setValue('ch-status', meta.status);
  setValue('ch-affiliation', meta.affiliation);
  setValue('ch-personality', meta.personality);
  setValue('ch-background', meta.background);
  setValue('ch-physical', meta.physicalDescription);
  setValue('ch-dialogue', meta.dialogueStyle);
}

// Use shared addMediaPreview from mediaUtil for consistency

async function handleGalleryUploads(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const progressContainer = document.getElementById('ch-gallery-progress');
  const progressBar = progressContainer ? progressContainer.querySelector('div') : null;
  const previewContainer = document.getElementById('ch-gallery-preview');
    
  if (progressContainer) progressContainer.classList.remove('hidden');
    
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const { uploadFile } = await import('../firebase.js');
      const url = await uploadFile(file, 'character-gallery', (progress) => {
        if (progressBar) {
          const overallProgress = ((i + (progress / 100)) / files.length) * 100;
          progressBar.style.width = `${overallProgress}%`;
        }
      });
      if (previewContainer) addMediaPreview('image', url, file.name, previewContainer);
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
    }
  }

  if (progressBar) progressBar.style.width = '100%';
  setTimeout(() => {
    if (progressContainer) progressContainer.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
  }, 1000);
}

function applyExtrasToMeta(meta, formEl) {
  meta.fullName = getValue('ch-fullName');
  meta.pronouns = getValue('ch-pronouns');
  meta.age = getValue('ch-age');
  meta.role = getValue('ch-role');
  meta.status = getValue('ch-status');
  meta.affiliation = getValue('ch-affiliation');
  meta.personality = getValue('ch-personality');
  meta.background = getValue('ch-background');
  meta.physicalDescription = getValue('ch-physical');
  meta.dialogueStyle = getValue('ch-dialogue');
  // Collect gallery entries from preview container and serialize to meta.media
  const previewContainer = document.getElementById('ch-gallery-preview');
  if (previewContainer) {
    const entries = Array.from(previewContainer.querySelectorAll('[data-type][data-url]')).map(el => ({ type: el.dataset.type || 'image', url: el.dataset.url, name: el.dataset.name || '' }));
    meta.media = serializeMedia(entries);
  }
}

function renderView(ctx) {
  const { meta } = ctx;
  if (!meta || Object.keys(meta).length === 0) return '';

  const statusColor = {
    'Alive': 'bg-green-600 text-white',
    'Deceased': 'bg-red-700 text-white',
    'Unknown': 'bg-gray-500 text-white',
  };
  const statusPill = meta.status ? `<div class="px-3 py-1 rounded-full text-xs font-semibold ${statusColor[meta.status] || 'bg-gray-500'}">${meta.status}</div>` : '';

  const traits = (meta.traits || '').split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `<span class="bg-sky-800 text-sky-200 text-xs font-medium px-2.5 py-0.5 rounded-full">${t}</span>`)
    .join('');
  
  const titles = (meta.titles || '').split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `<span class="text-sm text-amber-300">${t}</span>`)
    .join(', ');

  const aliases = (meta.aliases || meta.alias || '').split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `<span class="text-sm text-gray-400 italic">"${t}"</span>`)
    .join(', ');

  const firstAppearanceLink = meta.firstAppearance 
    ? `<a href="#/page/${encodeURIComponent(meta.firstAppearance.trim().toLowerCase().replace(/\s+/g, '_'))}" class="text-sky-400 hover:underline">${meta.firstAppearance}</a>` 
    : '';

  const mediaArr = parseMedia(meta.media);
  const galleryImages = mediaArr.filter(e=>e && e.type==='image').map(entry => `
      <div class="w-full aspect-square bg-gray-900 rounded-lg overflow-hidden">
        <img src="${entry.url}" alt="Image gallery" class="w-full h-full object-cover">
      </div>
    `).join('');

  return `
    <div class="character-sheet border border-gray-700 bg-gray-800/50 rounded-lg p-4 my-4">
      <div class="flex items-start justify-between mb-4">
        <div class="flex-1">
          ${meta.fullName ? `<h3 class="text-xl font-bold text-sky-300">${meta.fullName}</h3>` : ''}
          ${titles ? `<div class="font-semibold">${titles}</div>` : ''}
          ${aliases ? `<p>${aliases}</p>` : ''}
        </div>
        ${statusPill ? `<div class="flex-shrink-0 ml-4">${statusPill}</div>` : ''}
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
        ${meta.pronouns ? `<div><strong>Pronouns:</strong> <span class="text-gray-300">${meta.pronouns}</span></div>` : ''}
        ${meta.age ? `<div><strong>Age:</strong> <span class="text-gray-300">${meta.age}</span></div>` : ''}
        ${meta.role ? `<div><strong>Role:</strong> <span class="text-gray-300">${meta.role}</span></div>` : ''}
        ${meta.status ? `<div><strong>Status:</strong> <span class="text-gray-300">${meta.status}</span></div>` : ''}
        ${meta.affiliation ? `<div class="md:col-span-2"><strong>Affiliation:</strong> <span class="text-gray-300">${meta.affiliation}</span></div>` : ''}
      </div>

      ${meta.personality ? `
        <div class="mb-4">
          <h4 class="text-sm font-semibold text-gray-300 mb-2">Personality</h4>
          <div class="text-sm text-gray-300">${meta.personality}</div>
        </div>
      ` : ''}

      ${meta.background ? `
        <div class="mb-4">
          <h4 class="text-sm font-semibold text-gray-300 mb-2">Background</h4>
          <div class="text-sm text-gray-300">${meta.background}</div>
        </div>
      ` : ''}

      ${meta.physicalDescription ? `
        <div class="mb-4">
          <h4 class="text-sm font-semibold text-gray-300 mb-2">Physical Description</h4>
          <div class="text-sm text-gray-300">${meta.physicalDescription}</div>
        </div>
      ` : ''}

      ${meta.dialogueStyle ? `
        <div class="mb-4">
          <h4 class="text-sm font-semibold text-gray-300 mb-2">Dialogue Style</h4>
          <div class="text-sm text-gray-300">${meta.dialogueStyle}</div>
        </div>
      ` : ''}

      ${galleryImages ? `
        <div class="mb-4">
          <h4 class="text-sm font-semibold text-gray-300 mb-2">Gallery</h4>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            ${galleryImages}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

register({ id, label: 'Characters', schema, renderExtras, applyExtrasToMeta, renderView });
