import { register } from './registry.js';
import { textarea, textInput, grid, getValue, setValue } from './_base.js';
import { parseSystem, serializeSystem, defaultSystem, newNode } from './systemUtil.js';
import { deletePage } from '../firebase.js';

const id = 'Systems';

// Inline editor extras (still supported when editing a Systems page inline)
function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = grid(
    textInput('sys-type', 'System Type (e.g., Government, Guild, Food Chain)')
  ) + 
  textarea('sys-history', 'History') +
  textarea('sys-impact', 'Social Impact') +
  textarea('sys-perception', 'Perception');

  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('sys-type', meta.type);
  setValue('sys-history', meta.history);
  setValue('sys-impact', meta.impact);
  setValue('sys-perception', meta.perception);
}

function applyExtrasToMeta(meta) {
  meta.type = getValue('sys-type');
  meta.history = getValue('sys-history');
  meta.impact = getValue('sys-impact');
  meta.perception = getValue('sys-perception');
}

// Compact render for inline view (not used by the fullscreen module)
function renderView(ctx) {
  const { meta } = ctx;
  const blocks = [];
  if (meta.type) blocks.push(`<div><strong>Type:</strong> ${meta.type}</div>`);
  if (meta.history) blocks.push(`<div class="mt-3"><strong class="text-gray-300">History</strong><div class="text-gray-300 prose prose-sm max-w-none">${meta.history}</div></div>`);
  if (meta.impact) blocks.push(`<div class="mt-3"><strong class="text-gray-300">Social Impact</strong><div class="text-gray-300 prose prose-sm max-w-none">${meta.impact}</div></div>`);
  if (meta.perception) blocks.push(`<div class="mt-3"><strong class="text-gray-300">Perception</strong><div class="text-gray-300 prose prose-sm max-w-none">${meta.perception}</div></div>`);
  
  return blocks.length ? `<div class="mt-4 p-3 rounded bg-gray-800 border border-gray-700">${blocks.join('')}</div>` : '';
}

// Fullscreen flowchart module (mirrors Maps UX)
function renderModuleView() {
  return `
  <div id="systems-canvas-root" style="position:fixed; inset:0; width:100vw; height:100vh; z-index:2147483646; background:radial-gradient(1200px 800px at 60% 35%, rgba(24,35,58,1) 0%, rgba(10,16,28,1) 60%, rgba(5,8,15,1) 100%);">
    <div id="systems-canvas-wrap" style="position:absolute; inset:0; overflow:hidden; touch-action:none;">
      <div id="systems-toolbar" style="position:fixed; top:12px; right:12px; z-index:2147483647; display:flex; gap:8px; align-items:center; background:linear-gradient(90deg, rgba(59,130,246,0.03), rgba(236,72,153,0.02)); border:1px solid rgba(255,255,255,0.035); border-radius:14px; padding:8px 10px; box-shadow:0 14px 40px rgba(2,6,23,0.48), inset 0 1px 0 rgba(255,255,255,0.02); backdrop-filter: blur(26px) saturate(150%); -webkit-backdrop-filter: blur(26px) saturate(150%); cursor:move;">
        <select id="system-select" class="px-2 py-1 bg-gray-800 text-gray-200 rounded"></select>
        <select id="system-tool" class="px-2 py-1 bg-gray-800 text-gray-200 rounded" title="Tool">
          <option value="pan">🖐️ Pan</option>
          <option value="select">🔎 Select/Move</option>
          <option value="node">🧩 Add Node</option>
          <option value="connect">🔗 Connect</option>
        </select>
        <button id="system-center" class="px-2 py-1 text-sm text-sky-300 border border-gray-700 rounded">Centre</button>
        <button id="system-zoom-out" class="px-2 py-1 text-sm text-gray-300 border border-gray-700 rounded">-</button>
        <span id="system-zoom" class="text-xs text-gray-300">100%</span>
        <button id="system-zoom-in" class="px-2 py-1 text-sm text-gray-300 border border-gray-700 rounded">+</button>
        <button id="system-load" class="px-2 py-1 text-sm text-sky-400 border border-gray-700 rounded">Load</button>
        <button id="system-new" class="px-2 py-1 text-sm text-emerald-400 border border-gray-700 rounded">New</button>
        <button id="system-delete" class="px-2 py-1 text-sm text-red-300 border border-gray-700 rounded">Delete</button>
        <button id="system-save" class="px-2 py-1 text-sm text-emerald-400 border border-gray-700 rounded">Save</button>
        <button id="system-close" class="px-2 py-1 text-sm text-red-400 border border-gray-700 rounded">Close</button>
      </div>
      <div id="system-canvas-container" style="position:absolute; inset:0; border:1px solid #333;"></div>

      <div id="system-node-inspector" style="position:fixed; bottom:16px; right:16px; z-index:2147483647; min-width:260px; display:none; background:linear-gradient(180deg, rgba(2,6,23,0.8), rgba(2,6,23,0.6)); border:1px solid rgba(148,163,184,0.2); border-radius:12px; padding:10px; box-shadow:0 14px 40px rgba(2,6,23,0.6); color:#e2e8f0;">
        <div style="font-weight:600; font-size:14px; margin-bottom:6px;">Node Inspector</div>
        <div style="display:grid; grid-template-columns:1fr; gap:8px;">
          <div>
            <label style="display:block; font-size:12px; color:#cbd5e1; margin-bottom:3px;">Label</label>
            <input id="sys-node-label" type="text" style="width:100%; padding:6px 8px; background:#0b1220; color:#e2e8f0; border:1px solid #334155; border-radius:8px;"/>
          </div>
          <div>
            <label style="display:block; font-size:12px; color:#cbd5e1; margin-bottom:3px;">Linked Page (slug or name)</label>
            <input id="sys-node-page" type="text" placeholder="optional" style="width:100%; padding:6px 8px; background:#0b1220; color:#e2e8f0; border:1px solid #334155; border-radius:8px;"/>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="sys-node-open" class="px-2 py-1 text-xs" style="background:#0f172a; color:#93c5fd; border:1px solid #334155; border-radius:8px;">Open</button>
            <button id="sys-node-delete" class="px-2 py-1 text-xs" style="background:#7f1d1d; color:#fecaca; border:1px solid #7f1d1d; border-radius:8px;">Delete</button>
            <button id="sys-node-close" class="px-2 py-1 text-xs" style="background:#111827; color:#cbd5e1; border:1px solid #334155; border-radius:8px;">Close</button>
          </div>
        </div>
      </div>

      <div id="system-edge-inspector" style="position:fixed; bottom:16px; right:300px; z-index:2147483647; min-width:240px; display:none; background:linear-gradient(180deg, rgba(2,6,23,0.8), rgba(2,6,23,0.6)); border:1px solid rgba(148,163,184,0.2); border-radius:12px; padding:10px; box-shadow:0 14px 40px rgba(2,6,23,0.6); color:#e2e8f0;">
        <div style="font-weight:600; font-size:14px; margin-bottom:6px;">Edge Inspector</div>
        <div style="display:grid; grid-template-columns:1fr; gap:8px;">
          <div>
            <label style="display:block; font-size:12px; color:#cbd5e1; margin-bottom:3px;">Label</label>
            <input id="sys-edge-label" type="text" style="width:100%; padding:6px 8px; background:#0b1220; color:#e2e8f0; border:1px solid #334155; border-radius:8px;"/>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="sys-edge-delete" class="px-2 py-1 text-xs" style="background:#7f1d1d; color:#fecaca; border:1px solid #7f1d1d; border-radius:8px;">Delete</button>
            <button id="sys-edge-close" class="px-2 py-1 text-xs" style="background:#111827; color:#cbd5e1; border:1px solid #334155; border-radius:8px;">Close</button>
          </div>
        </div>
      </div>

      <div id="system-new-modal" style="display:none; position:fixed; inset:0; z-index:2147483647;">
        <div style="position:absolute; inset:0; background:rgba(0,0,0,0.6);"></div>
        <div style="position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:min(92vw, 640px); background:linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04)); border:1px solid rgba(255,255,255,0.18); border-radius:14px; box-shadow:0 24px 60px rgba(2,6,23,0.6); backdrop-filter: blur(22px) saturate(150%); -webkit-backdrop-filter: blur(22px) saturate(150%); padding:16px;">
          <div style="font-weight:600; color:#e2e8f0; font-size:16px; margin-bottom:8px;">Create New System</div>
          <div style="display:grid; grid-template-columns: 1fr; gap:12px;">
            <div>
              <label style="display:block; color:#cbd5e1; font-size:12px; margin-bottom:4px;">Name</label>
              <input id="system-new-name" type="text" placeholder="E.g., Federal Government" style="width:100%; padding:8px 10px; background:#0f172a; color:#e2e8f0; border:1px solid #334155; border-radius:8px;" />
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:6px;">
              <button id="system-new-cancel" class="px-3 py-1 text-sm" style="background:#0f172a; color:#cbd5e1; border:1px solid #334155; border-radius:8px;">Cancel</button>
              <button id="system-new-create" class="px-3 py-1 text-sm" style="background:#059669; color:white; border:1px solid #065f46; border-radius:8px;">Create</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function init() {
  const rootId = 'systems-canvas-root';
  Array.from(document.querySelectorAll('#' + rootId)).forEach(r => { try { r.remove(); } catch(_) {} });
  const wrap = document.createElement('div');
  wrap.innerHTML = renderModuleView();
  document.body.appendChild(wrap.firstElementChild);
  try { document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden'; } catch(_) {}

  const selectEl = document.getElementById('system-select');
  const toolSel = document.getElementById('system-tool');
  const container = document.getElementById('system-canvas-container');
  const loadBtn = document.getElementById('system-load');
  const newBtn = document.getElementById('system-new');
  const delBtn = document.getElementById('system-delete');
  const saveBtn = document.getElementById('system-save');
  const closeBtn = document.getElementById('system-close');
  const centerBtn = document.getElementById('system-center');
  const zoomInBtn = document.getElementById('system-zoom-in');
  const zoomOutBtn = document.getElementById('system-zoom-out');
  const newModal = document.getElementById('system-new-modal');
  const newNameEl = document.getElementById('system-new-name');
  const newCancel = document.getElementById('system-new-cancel');
  const newCreate = document.getElementById('system-new-create');
  const inspector = document.getElementById('system-node-inspector');
  const inLabel = document.getElementById('sys-node-label');
  const inPage = document.getElementById('sys-node-page');
  const inOpen = document.getElementById('sys-node-open');
  const inDelete = document.getElementById('sys-node-delete');
  const inClose = document.getElementById('sys-node-close');
  // Edge inspector elements
  const edgeInspector = document.getElementById('system-edge-inspector');
  const edgeLabelInput = document.getElementById('sys-edge-label');
  const edgeDeleteBtn = document.getElementById('sys-edge-delete');
  const edgeCloseBtn = document.getElementById('sys-edge-close');

  function populateList() {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const pages = window.wikiPages || {};
    const keys = Object.keys(pages).sort();
    const systems = keys.filter(k => {
      const p = pages[k] || {}; const m = p.meta || {};
      const cat = (m.category || '').toString();
      return cat === 'Systems' || !!m.system;
    });
    if (systems.length === 0) {
      const opt = document.createElement('option'); opt.value = ''; opt.textContent = 'No systems yet'; selectEl.appendChild(opt);
    } else {
      systems.forEach(k => {
        const p = pages[k] || {}; const m = p.meta || {};
        const title = (m.title || m.name) ? (m.title || m.name) : k;
        const opt = document.createElement('option'); opt.value = k; opt.textContent = title; selectEl.appendChild(opt);
      });
    }
  }

  populateList();

  function loadSelected() {
    if (!selectEl || !container) return;
    const slug = selectEl.value;
    const pages = window.wikiPages || {};
    const p = pages[slug];
    if (!p) return;
    try { localStorage.setItem('lastSystemSlug', slug); } catch(_){ }
    const state = parseSystem(p.meta && p.meta.system);
    setupSystemCanvas(container, state, toolSel && toolSel.value);
    try { localStorage.setItem('lastSystemState', typeof state === 'string' ? state : JSON.stringify(state)); } catch(_){ }
  }

  // Auto-select last or first
  (function autoSelect(){
    const pages = window.wikiPages || {};
    const last = localStorage.getItem('lastSystemSlug');
    if (last && pages[last]) { selectEl.value = last; loadSelected(); return; }
    if (selectEl && selectEl.options && selectEl.options.length > 0) {
      for (let i=0;i<selectEl.options.length;i++) { if (selectEl.options[i].value) { selectEl.selectedIndex = i; break; } }
      loadSelected();
    } else {
      // Fallback to cached state
      const cached = localStorage.getItem('lastSystemState');
      if (cached) { try { const st = JSON.parse(cached); setupSystemCanvas(container, st, toolSel && toolSel.value); } catch(_){} }
    }
  })();

  // Listen for live updates to pages
  const onPagesUpdated = () => {
    const prev = (selectEl && selectEl.value) || localStorage.getItem('lastSystemSlug') || '';
    populateList();
    const pages = window.wikiPages || {};
    if (prev && pages[prev]) { selectEl.value = prev; loadSelected(); return; }
    if (selectEl && selectEl.options && selectEl.options.length > 0) { selectEl.selectedIndex = 0; loadSelected(); }
  };
  try { window.addEventListener('wikiPagesUpdated', onPagesUpdated); } catch(_){ }

  selectEl && selectEl.addEventListener('change', loadSelected);
  loadBtn && loadBtn.addEventListener('click', loadSelected);
  toolSel && toolSel.addEventListener('change', ()=>{ if (container) container._systemTool = toolSel.value; });
  // Hide inspector when changing tool away from select
  toolSel && toolSel.addEventListener('change', ()=>{ try { if (toolSel.value !== 'select' && inspector) inspector.style.display='none'; } catch(_){} });

  function openNew(){ if (newModal) newModal.style.display = ''; if (newNameEl) newNameEl.value = ''; }
  function closeNew(){ if (newModal) newModal.style.display = 'none'; }
  newBtn && newBtn.addEventListener('click', openNew);
  newCancel && newCancel.addEventListener('click', closeNew);
  newCreate && newCreate.addEventListener('click', ()=>{
    try {
      const name = (newNameEl && newNameEl.value || '').trim();
      if (!name) { alert('Please enter a system name'); return; }
      const slug = name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_\-]/g,'');
      const state = defaultSystem();
      const page = { meta: { category: 'Systems', title: name, system: JSON.stringify(state) }, content: '' };
      if (!window.saveWikiPage) { alert('Save not available'); return; }
      window.saveWikiPage(slug, page);
      try { localStorage.setItem('lastSystemSlug', slug); localStorage.setItem('lastSystemState', JSON.stringify(state)); } catch(_){ }
      populateList(); if (selectEl) { selectEl.value = slug; loadSelected(); }
      closeNew();
    } catch(e) { console.error('Create system failed', e); alert('Create system failed'); }
  });

  delBtn && delBtn.addEventListener('click', async ()=>{
    try {
      const slug = (selectEl && selectEl.value) || '';
      if (!slug) { alert('Select a system to delete.'); return; }
      if (!confirm('Delete this system page? This cannot be undone.')) return;
      await deletePage(slug);
      try { if (window.wikiPages) delete window.wikiPages[slug]; } catch(_){ }
      populateList(); if (selectEl) { selectEl.selectedIndex = 0; loadSelected(); }
      try { showToast && showToast('System deleted'); } catch(_){ }
    } catch(e) { console.error('Delete failed', e); try { showToast && showToast('Delete failed','error'); } catch(_) { alert('Delete failed'); } }
  });

  saveBtn && saveBtn.addEventListener('click', ()=>{
    try {
      const slug = (selectEl && selectEl.value) || '';
      if (!slug) { openNew(); return; }
      const pages = window.wikiPages || {};
      const page = pages[slug] || { meta: { category: 'Systems' }, content: '' };
      const state = (container && container._systemState) || defaultSystem();
      page.meta = page.meta || {};
      page.meta.system = typeof state === 'string' ? state : JSON.stringify(state);
      if (window.saveWikiPage) {
        window.saveWikiPage(slug, page);
        try { localStorage.setItem('lastSystemSlug', slug); localStorage.setItem('lastSystemState', page.meta.system); } catch(_){ }
        try { showToast && showToast('System saved.'); } catch(_){}
      } else { alert('Save function not available'); }
    } catch(e) { console.error('Save failed', e); try { showToast && showToast('Save failed','error'); } catch(_){} }
  });

  // Inspector events
  if (inClose) inClose.addEventListener('click', () => { if (inspector) inspector.style.display = 'none'; if (container) container._selectedNodeId = null; });
  if (edgeCloseBtn) edgeCloseBtn.addEventListener('click', ()=>{ if (edgeInspector) edgeInspector.style.display='none'; if (container) container._selectedEdgeId=null; });
  if (inDelete) inDelete.addEventListener('click', () => {
    const st = (container && container._systemState) || null; if (!st) return;
    const id = container._selectedNodeId; if (!id) return;
    const before = (st.nodes||[]).length; st.nodes = (st.nodes||[]).filter(n => n.id !== id);
    st.edges = (st.edges||[]).filter(e => e.from !== id && e.to !== id);
    container._selectedNodeId = null; if (inspector) inspector.style.display = 'none';
    try { localStorage.setItem('lastSystemState', serializeSystem(st)); } catch(_){}
    if (container._requestDraw) container._requestDraw();
  });
  if (edgeDeleteBtn) edgeDeleteBtn.addEventListener('click', ()=>{
    const st = (container && container._systemState) || null; if (!st) return;
    const eid = container._selectedEdgeId; if (!eid) return;
    st.edges = (st.edges||[]).filter(e => e.id !== eid);
    container._selectedEdgeId = null; if (edgeInspector) edgeInspector.style.display='none';
    try { localStorage.setItem('lastSystemState', serializeSystem(st)); } catch(_){ }
    if (container._requestDraw) container._requestDraw();
  });
  if (inLabel) inLabel.addEventListener('input', () => {
    const st = (container && container._systemState) || null; if (!st) return; const id = container._selectedNodeId; if (!id) return;
    const n = (st.nodes||[]).find(x => x.id === id); if (!n) return; n.label = inLabel.value;
    try { localStorage.setItem('lastSystemState', serializeSystem(st)); } catch(_){}
    if (container._requestDraw) container._requestDraw();
  });
  if (edgeLabelInput) edgeLabelInput.addEventListener('input', ()=>{
    const st = (container && container._systemState) || null; if (!st) return; const eid = container._selectedEdgeId; if (!eid) return;
    const ed = (st.edges||[]).find(e => e.id === eid); if (!ed) return; ed.label = edgeLabelInput.value || '';
    try { localStorage.setItem('lastSystemState', serializeSystem(st)); } catch(_){ }
    if (container._requestDraw) container._requestDraw();
  });
  if (inPage) inPage.addEventListener('input', () => {
    const st = (container && container._systemState) || null; if (!st) return; const id = container._selectedNodeId; if (!id) return;
    const n = (st.nodes||[]).find(x => x.id === id); if (!n) return; n.page = inPage.value ? inPage.value.trim() : null;
    try { localStorage.setItem('lastSystemState', serializeSystem(st)); } catch(_){}
  });
  if (inOpen) inOpen.addEventListener('click', () => {
    const st = (container && container._systemState) || null; if (!st) return; const id = container._selectedNodeId; if (!id) return;
    const n = (st.nodes||[]).find(x => x.id === id); if (!n || !n.page) return;
    try {
      const slug = encodeURIComponent((n.page||'').toString().trim().toLowerCase().replace(/\s+/g,'_'));
      location.hash = `#/page/${slug}`;
    } catch(_){}
  });

  function restoreAndClose(){
    try { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; } catch(_){}
    try { const r = document.getElementById('systems-canvas-root'); if (r) r.remove(); } catch(_){}
    try { location.hash = '#/'; } catch(_){ }
  }
  closeBtn && closeBtn.addEventListener('click', restoreAndClose);

  // Toolbar drag
  (function(){
    const toolbar = document.getElementById('systems-toolbar'); if (!toolbar) return;
    let dragging=false, off={x:0,y:0};
    function setPos(l,t){ const vw=innerWidth||0, vh=innerHeight||0; const rect=toolbar.getBoundingClientRect(); const cl=Math.max(8, Math.min(l, vw-rect.width-8)); const ct=Math.max(8, Math.min(t, vh-rect.height-8)); toolbar.style.left=cl+'px'; toolbar.style.top=ct+'px'; toolbar.style.right='auto'; }
    function down(e){ if (e.target.closest('button, select, input, textarea')) return; dragging=true; const r=toolbar.getBoundingClientRect(); off={x:e.clientX-r.left, y:e.clientY-r.top}; e.preventDefault(); }
    function move(e){ if (!dragging) return; setPos(e.clientX-off.x, e.clientY-off.y); }
    function up(){ dragging=false; }
    toolbar.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  })();

  // Zoom controls
  container && container.addEventListener('system-zoom', (ev)=>{
    const delta = (ev && ev.detail && ev.detail.delta) || 1;
    try { const s = container._zoom || 1; const ns = Math.max(0.1, Math.min(5, s*delta)); container._zoom = ns; const zl=document.getElementById('system-zoom'); if (zl) zl.textContent = Math.round(ns*100)+'%'; if (container._requestDraw) container._requestDraw(); } catch(_){}
  });
  zoomInBtn && zoomInBtn.addEventListener('click', ()=>{ try { container && container.dispatchEvent(new CustomEvent('system-zoom', { detail:{ delta:1.1 } })); } catch(_){} });
  zoomOutBtn && zoomOutBtn.addEventListener('click', ()=>{ try { container && container.dispatchEvent(new CustomEvent('system-zoom', { detail:{ delta:0.9 } })); } catch(_){} });
  centerBtn && centerBtn.addEventListener('click', ()=>{ try { if (container && container._center) container._center(); } catch(_){} });
}

function setupSystemCanvas(container, systemObj, initialTool) {
  if (!container) return;
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const vs = (systemObj && systemObj.virtualSize) || { width: 4000, height: 3000 };
  let scale = container._zoom || 1, offsetX = container._offsetX || 0, offsetY = container._offsetY || 0;
  let isPanning = false, startX=0, startY=0, moved=false;
  let dragNodeId = null; let dragStart = {x:0,y:0};
  let connectStartId = null; // for connector tool
  let needsRedraw=false;
  container._systemTool = initialTool || container._systemTool || 'pan';

  function resize(){ const r = container.getBoundingClientRect(); canvas.width = r.width; canvas.height = r.height; requestDraw(); }
  window.addEventListener('resize', resize, { passive:true }); resize();

  function drawNow(){
    ctx.clearRect(0,0,canvas.width, canvas.height);
    // background grid
    ctx.save(); ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,canvas.width, canvas.height); ctx.restore();
    ctx.save(); ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.lineWidth = 1;
    const step = 100 * scale; if (step > 8) {
      for (let x = (offsetX%step); x < canvas.width; x += step) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
      for (let y = (offsetY%step); y < canvas.height; y += step) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
    }
    ctx.restore();

    // edges
    ctx.save();
    (systemObj.edges||[]).forEach(e => {
      const from = (systemObj.nodes||[]).find(n => n.id === e.from);
      const to = (systemObj.nodes||[]).find(n => n.id === e.to);
      if (!from || !to) return;
      const x1 = offsetX + from.x * scale; const y1 = offsetY + from.y * scale;
      const x2 = offsetX + to.x * scale; const y2 = offsetY + to.y * scale;
      const selected = container._selectedEdgeId === e.id;
      ctx.strokeStyle = selected ? '#fbbf24' : 'rgba(236,72,153,0.85)'; ctx.lineWidth = selected ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      // arrowhead
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const ah = 8; const aw = 5;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ah*Math.cos(ang) + aw*Math.sin(ang), y2 - ah*Math.sin(ang) - aw*Math.cos(ang));
      ctx.lineTo(x2 - ah*Math.cos(ang) - aw*Math.sin(ang), y2 - ah*Math.sin(ang) + aw*Math.cos(ang));
      ctx.closePath(); ctx.fillStyle = selected ? '#fbbf24' : 'rgba(236,72,153,0.85)'; ctx.fill();
      // label (midpoint) if present
      if (e.label) {
        const mx = (x1 + x2)/2; const my = (y1 + y2)/2; ctx.fillStyle = selected ? '#fbbf24' : '#94a3b8'; ctx.font = '11px sans-serif'; ctx.textAlign='center'; ctx.fillText(e.label, mx, my - 6);
      }
    });
    ctx.restore();
    // nodes
    (systemObj.nodes||[]).forEach(n => {
      const px = offsetX + n.x * scale;
      const py = offsetY + n.y * scale;
      ctx.fillStyle = 'rgba(59,130,246,0.95)';
      ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e2e8f0'; ctx.font = '12px sans-serif'; ctx.textAlign='center'; ctx.fillText((n.label||'Node'), px, py - 26);
      if (container._selectedNodeId === n.id) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI*2); ctx.stroke();
      }
    });
  }
  function requestDraw(){ if (needsRedraw) return; needsRedraw=true; window.requestAnimationFrame(()=>{ needsRedraw=false; drawNow(); }); }
  container._requestDraw = requestDraw;

  // mouse interactions
  canvas.addEventListener('wheel', (e)=>{ e.preventDefault(); const delta = e.deltaY < 0 ? 1.1 : 0.9; scale = Math.max(0.1, Math.min(5, scale*delta)); container._zoom = scale; const zl=document.getElementById('system-zoom'); if (zl) zl.textContent = Math.round(scale*100)+'%'; requestDraw(); });
  function hitNodeAtClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left; const y = clientY - rect.top;
    const worldX = (x - offsetX) / scale; const worldY = (y - offsetY) / scale;
    let hit = null; (systemObj.nodes||[]).forEach(n => {
      const dx = worldX - n.x; const dy = worldY - n.y; const r = 18/scale + 2;
      if ((dx*dx + dy*dy) <= r*r) hit = n;
    });
    return { hit, worldX, worldY };
  }

  function hitEdgeAtClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left; const y = clientY - rect.top;
    const worldX = (x - offsetX) / scale; const worldY = (y - offsetY) / scale;
    let edgeHit = null; let minDist = Infinity;
    (systemObj.edges||[]).forEach(e => {
      const from = (systemObj.nodes||[]).find(n => n.id === e.from);
      const to = (systemObj.nodes||[]).find(n => n.id === e.to);
      if (!from || !to) return;
      // distance from point to segment (world coordinates)
      const x1 = from.x, y1 = from.y, x2 = to.x, y2 = to.y;
      const A = worldX - x1; const B = worldY - y1; const C = x2 - x1; const D = y2 - y1;
      const dot = A*C + B*D; const lenSq = C*C + D*D; let param = -1; if (lenSq !== 0) param = dot / lenSq; let xx, yy;
      if (param < 0) { xx = x1; yy = y1; } else if (param > 1) { xx = x2; yy = y2; } else { xx = x1 + param * C; yy = y1 + param * D; }
      const dx = worldX - xx; const dy = worldY - yy; const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < (12/scale) && dist < minDist) { minDist = dist; edgeHit = e; }
    });
    return { edgeHit, worldX, worldY };
  }

  canvas.addEventListener('mousedown', (e)=>{
    startX=e.clientX; startY=e.clientY; moved=false; isPanning=false; dragNodeId=null;
    const tool = container._systemTool || 'pan';
    const { hit, worldX, worldY } = hitNodeAtClient(e.clientX, e.clientY);
    if (tool === 'pan') {
      isPanning = true;
    } else if (tool === 'select') {
      if (hit) {
        container._selectedNodeId = hit.id; container._selectedEdgeId = null; dragNodeId = hit.id; dragStart = { x: worldX - hit.x, y: worldY - hit.y };
        const insp = document.getElementById('system-node-inspector'); if (insp) insp.style.display='block';
        const einsp = document.getElementById('system-edge-inspector'); if (einsp) einsp.style.display='none';
        const inLabel = document.getElementById('sys-node-label'); if (inLabel) inLabel.value = hit.label || '';
        const inPage = document.getElementById('sys-node-page'); if (inPage) inPage.value = hit.page || '';
        requestDraw();
      } else {
        // try edge
        const { edgeHit } = hitEdgeAtClient(e.clientX, e.clientY);
        if (edgeHit) {
          container._selectedEdgeId = edgeHit.id; container._selectedNodeId = null; dragNodeId = null;
          const einsp = document.getElementById('system-edge-inspector'); if (einsp) einsp.style.display='block';
          const insp = document.getElementById('system-node-inspector'); if (insp) insp.style.display='none';
          const edgeLabel = document.getElementById('sys-edge-label'); if (edgeLabel) edgeLabel.value = edgeHit.label || '';
          requestDraw();
        } else {
          container._selectedNodeId = null; container._selectedEdgeId = null;
          const insp = document.getElementById('system-node-inspector'); if (insp) insp.style.display='none';
          const einsp = document.getElementById('system-edge-inspector'); if (einsp) einsp.style.display='none';
          isPanning = true; // empty space drag pans
        }
      }
    } else if (tool === 'connect') {
      if (hit) { connectStartId = hit.id; }
    } else if (tool === 'node') {
      // handled on click; allow simple pan if drags
      isPanning = true;
    }
  });
  window.addEventListener('mouseup', (e)=>{
    // finalize connect
    const tool = container._systemTool || 'pan';
    if (tool === 'connect' && connectStartId) {
      const { hit } = hitNodeAtClient(e.clientX, e.clientY);
      if (hit && hit.id !== connectStartId) {
        systemObj.edges = systemObj.edges || []; systemObj.edges.push({ id: `e-${Date.now()}-${Math.floor(Math.random()*1e5)}`, from: connectStartId, to: hit.id, label: '' });
        try { localStorage.setItem('lastSystemState', serializeSystem(systemObj)); } catch(_){}
        requestDraw();
      }
    }
    isPanning=false; dragNodeId=null; connectStartId=null;
  });
  window.addEventListener('mousemove', (e)=>{
    const dx=e.clientX-startX, dy=e.clientY-startY; if (Math.abs(dx)>1||Math.abs(dy)>1) moved=true; startX=e.clientX; startY=e.clientY;
    if (isPanning) { offsetX += dx; offsetY += dy; container._offsetX=offsetX; container._offsetY=offsetY; requestDraw(); return; }
    if (dragNodeId) {
      const { worldX, worldY } = hitNodeAtClient(e.clientX, e.clientY);
      const n = (systemObj.nodes||[]).find(x => x.id === dragNodeId); if (!n) return;
      n.x = worldX - dragStart.x; n.y = worldY - dragStart.y;
      container._systemState = systemObj; try { localStorage.setItem('lastSystemState', serializeSystem(systemObj)); } catch(_){}
      requestDraw();
    }
  });

  canvas.addEventListener('click', (e)=>{
    if (moved) { moved=false; return; }
    const tool = container._systemTool || 'pan'; if (tool==='pan') return;
    const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const worldX = (x - offsetX) / scale; const worldY = (y - offsetY) / scale;
    if (tool === 'node') {
      systemObj.nodes = systemObj.nodes || []; systemObj.nodes.push(newNode({ x: worldX, y: worldY }));
      container._systemState = systemObj; try { localStorage.setItem('lastSystemState', serializeSystem(systemObj)); } catch(_){ }
      requestDraw();
    } else if (tool === 'select') {
      const { hit } = (function(){
        let found=null; (systemObj.nodes||[]).forEach(n => { const dx=worldX-n.x, dy=worldY-n.y; if ((dx*dx+dy*dy) <= (18*18)) found=n; });
        return { hit: found };
      })();
      if (hit) {
        container._selectedNodeId = hit.id; container._selectedEdgeId = null;
        const insp = document.getElementById('system-node-inspector'); if (insp) insp.style.display='block';
        const einsp = document.getElementById('system-edge-inspector'); if (einsp) einsp.style.display='none';
        const inLabel = document.getElementById('sys-node-label'); if (inLabel) inLabel.value = hit.label || '';
        const inPage = document.getElementById('sys-node-page'); if (inPage) inPage.value = hit.page || '';
        requestDraw();
      } else {
        const { edgeHit } = hitEdgeAtClient(e.clientX, e.clientY);
        if (edgeHit) {
          container._selectedEdgeId = edgeHit.id; container._selectedNodeId = null;
            const einsp = document.getElementById('system-edge-inspector'); if (einsp) einsp.style.display='block';
            const insp = document.getElementById('system-node-inspector'); if (insp) insp.style.display='none';
            const edgeLabel = document.getElementById('sys-edge-label'); if (edgeLabel) edgeLabel.value = edgeHit.label || '';
            requestDraw();
        } else {
          container._selectedNodeId = null; container._selectedEdgeId = null;
          const insp = document.getElementById('system-node-inspector'); if (insp) insp.style.display='none';
          const einsp = document.getElementById('system-edge-inspector'); if (einsp) einsp.style.display='none';
          requestDraw();
        }
      }
    }
  });

  // center to fit
  function center(){ const r = container.getBoundingClientRect(); const sx = r.width / vs.width; const sy = r.height / vs.height; scale = Math.min(sx, sy); container._zoom = scale; offsetX = (r.width - vs.width * scale) / 2; offsetY = (r.height - vs.height * scale) / 2; container._offsetX=offsetX; container._offsetY=offsetY; const zl=document.getElementById('system-zoom'); if (zl) zl.textContent = Math.round(scale*100)+'%'; requestDraw(); }
  container._center = center; center();

  container._systemState = systemObj;
}

// Export init so router can trigger module
export { init, renderModuleView as renderView };

register({ id, label: 'Systems', schema: { name: 'Systems' }, renderExtras, applyExtrasToMeta, renderView });
