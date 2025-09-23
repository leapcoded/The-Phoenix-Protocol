import { register } from './registry.js';
import { textarea, getValue, setValue } from './_base.js';

const moduleId = 'Relationships';

function prettifyTitleLocal(raw){
  try {
    return String(raw||'').replace(/[_-]+/g,' ').trim().split(' ').map(w=>w? (w.charAt(0).toUpperCase()+w.slice(1)) : '').join(' ');
  } catch(_) { return String(raw||''); }
}

function renderExtras(ctx) {
  const container = document.getElementById('wiki-editor-category-extras');
  if (!container) return;
  const html = textarea(
    'rel-graph',
    'Graph Data (experimental)',
    'Optional: list of relationships for import/export, one per line (A -> B (type))'
  );
  container.innerHTML = html;
  const meta = (ctx && ctx.meta) || {};
  setValue('rel-graph', meta.graph);
}

function applyExtrasToMeta(meta) {
  meta.graph = getValue('rel-graph');
}

function renderView() {
  return `
  <div id="relationships-canvas-root" class="w-full min-h-screen flex flex-col" style="position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483646;background:radial-gradient(1200px 800px at 60% 35%, rgba(24,35,58,1) 0%, rgba(10,16,28,1) 60%, rgba(5,8,15,1) 100%);">
    <div id="rel-canvas-wrap" class="relative" style="position:absolute; inset:0; padding:0; overflow:hidden; touch-action:none; width:100vw; height:100vh;">
      <canvas id="rel-bg" class="absolute inset-0 w-full h-full" style="z-index:0; pointer-events:none;"></canvas>
      <div id="rel-stage" class="absolute left-0 top-0 origin-top-left" style="transform:translate(0px,0px) scale(1); z-index:2;"></div>
      <canvas id="rel-canvas" class="absolute inset-0 w-full h-full" style="z-index:1; pointer-events:none;"></canvas>
    </div>
  <div id="rel-toolbar" style="position:fixed; top:12px; right:12px; z-index:10000; display:flex; gap:8px; align-items:center; background:linear-gradient(90deg, rgba(59,130,246,0.03), rgba(236,72,153,0.02)); border:1px solid rgba(255,255,255,0.035); border-radius:14px; padding:8px 10px; box-shadow:0 14px 40px rgba(2,6,23,0.48), inset 0 1px 0 rgba(255,255,255,0.02); backdrop-filter: blur(26px) saturate(150%); -webkit-backdrop-filter: blur(26px) saturate(150%); cursor:move;">
      <span style="color:#7dd3fc; font-weight:600; margin-right:4px;">Relationships</span>
      <button id="rel-home" class="px-2 py-1 text-sm text-sky-300 border border-gray-700 rounded">Home</button>
      <button id="rel-zoom-out" class="px-2 py-1 text-sm text-gray-300 border border-gray-700 rounded">-</button>
      <span id="rel-zoom" class="text-xs text-gray-300">100%</span>
      <button id="rel-zoom-in" class="px-2 py-1 text-sm text-gray-300 border border-gray-700 rounded">+</button>
      <button id="rel-fit" class="px-2 py-1 text-sm text-gray-300 border border-gray-700 rounded">Fit</button>
      <button id="rel-save" class="px-2 py-1 text-sm text-emerald-400 border border-gray-700 rounded">Save</button>
      <button id="rel-debug" class="px-2 py-1 text-sm text-yellow-300 border border-gray-700 rounded">Debug</button>
      <button id="rel-close" class="px-2 py-1 text-sm text-red-400 border border-gray-700 rounded">Close</button>
    </div>
  </div>
  `;
}

function isCharacter(p) {
  if (!p) return false;
  const meta = p.meta || {};
  const cat = (meta.category || '').toString().toLowerCase();
  if (cat === 'characters') return true;
  if ((meta.type || '').toString().toLowerCase() === 'character') return true;
  return false;
}

function init() {
  const rootId = 'relationships-canvas-root';
  // Attempt to find any existing roots (avoid duplicate IDs on refresh / double router calls)
  let roots = Array.from(document.querySelectorAll('#' + rootId));
  // If multiple exist, prefer an already-initialized one, otherwise the first, and remove extras
  if (roots.length > 1) {
    const keep = roots.find(r => r.__relationships_inited) || roots[0];
    roots.forEach(r => { if (r !== keep) { try { r.parentElement && r.parentElement.removeChild(r); } catch(_) { r.remove && r.remove(); } } });
    roots = [keep];
  }
  let root = roots[0] || document.getElementById(rootId);
  if (!root) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderView();
    document.body.appendChild(wrapper.firstElementChild);
    root = document.getElementById(rootId);
  }
  // If the root exists but was inserted into a transformed container, reparent to body
  if (root && root.parentElement !== document.body) {
    try {
      document.body.appendChild(root);
    } catch(_){}
  }
  // Guard against double-initialization on fast consecutive router() calls / refresh
  if (root && root.__relationships_inited) {
    try { document.body.style.overflow = 'hidden'; } catch (_){ }
    try { document.documentElement.style.overflow = 'hidden'; } catch(_){ }
    // Ensure it's in the body and visible, then bail (all listeners already wired)
    root.style.display = '';
    return;
  }
  if (!root) return;
  try { document.body.style.overflow = 'hidden'; } catch (_){ }
  try { document.documentElement.style.overflow = 'hidden'; } catch(_){ }

  const wrap = document.getElementById('rel-canvas-wrap');
  const stage = document.getElementById('rel-stage');
  const canvas = document.getElementById('rel-canvas');
  const bgCanvas = document.getElementById('rel-bg');
  const ctx = canvas.getContext('2d');
  const bg = bgCanvas.getContext('2d');
  // Starfield renders inside the overlay wrap beneath the map
  const toolbar = document.getElementById('rel-toolbar');
  const zoomLabel = document.getElementById('rel-zoom');
  const zoomInBtn = document.getElementById('rel-zoom-in');
  const zoomOutBtn = document.getElementById('rel-zoom-out');
  const fitBtn = document.getElementById('rel-fit');
  const saveBtn = document.getElementById('rel-save');
  const closeBtn = document.getElementById('rel-close');
  const homeBtn = document.getElementById('rel-home');

  let scale = 1, offsetX = 0, offsetY = 0;
  let lastFitScale = 1;
  const ANCHORS_PER_SIDE = 3;
  let nodes = [];
  let edges = [];
  const nodeW = 120, nodeH = 160, layoutGap = 40, preferredLayoutWidth = 1200;
  let dragNode = null, dragOffset = { x:0, y:0 };
  let drawFrom = null, drawFromSide = null, drawFromIndex = null;
  const anchorIndex = new Map();
  let highlightNodeEl = null, highlightAnchorEl = null;
  let sourceNodeEl = null, sourcePrevShadow = '';

  function setTransform() {
    stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  function setZoomDisplay(){ if (zoomLabel) zoomLabel.textContent = Math.round(scale*100) + '%'; }
  function isAtFitZoom(){ return scale <= (lastFitScale + 0.001); }
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

  function getContentBounds(){
    const w = nodeW, h = nodeH;
    if (!nodes || nodes.length === 0) return { minX:0, minY:0, maxX:w, maxY:h };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    });
    minX = Math.floor(minX);
    minY = Math.floor(minY);
    maxX = Math.ceil(maxX);
    maxY = Math.ceil(maxY);
    return { minX, minY, maxX, maxY };
  }

  function updateStageSize(padX=0, padY=48){
    const b = getContentBounds();
    const contentW = Math.max(1, b.maxX - b.minX + padX);
    const contentH = Math.max(1, b.maxY - b.minY + padY);
    const width = Math.max(wrap.clientWidth, contentW, window.innerWidth);
    const height = Math.max(wrap.clientHeight, contentH, window.innerHeight);
    stage.style.width = width + 'px';
    stage.style.height = height + 'px';
    stage.style.left = '0px';
    stage.style.top = '0px';
  }

  function setCanvasSize(){
    const dpr = window.devicePixelRatio || 1;
    const sw = Math.max(1, wrap.clientWidth, window.innerWidth);
    const sh = Math.max(1, wrap.clientHeight, window.innerHeight);
    canvas.width = Math.max(1, Math.floor(sw * dpr));
    canvas.height = Math.max(1, Math.floor(sh * dpr));
    canvas.style.width = sw + 'px';
    canvas.style.height = sh + 'px';
    canvas.style.left = '0px';
    canvas.style.top = '0px';
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
  }
  function setBgCanvasSize(){
    const dpr = window.devicePixelRatio || 1;
    const sw = Math.max(1, wrap.clientWidth, window.innerWidth || 0);
    const sh = Math.max(1, wrap.clientHeight, window.innerHeight || 0);
    bgCanvas.width = Math.max(1, Math.floor(sw * dpr));
    bgCanvas.height = Math.max(1, Math.floor(sh * dpr));
    bgCanvas.style.width = sw + 'px';
    bgCanvas.style.height = sh + 'px';
    bg.setTransform(1,0,0,1,0,0);
    bg.scale(dpr, dpr);
  }
  function drawStarfield(){
    const sw = Math.max(1, wrap.clientWidth, window.innerWidth || 0);
    const sh = Math.max(1, wrap.clientHeight, window.innerHeight || 0);
    bg.clearRect(0,0, sw, sh);
    // subtle nebula glows
    const glows = [
      { x: sw*0.25, y: sh*0.2, r: Math.min(sw,sh)*0.35, c: 'rgba(56,189,248,0.08)' },
      { x: sw*0.75, y: sh*0.6, r: Math.min(sw,sh)*0.45, c: 'rgba(139,92,246,0.06)' },
      { x: sw*0.55, y: sh*0.3, r: Math.min(sw,sh)*0.3, c: 'rgba(34,197,94,0.04)' },
    ];
    glows.forEach(g => {
      const grad = bg.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
      grad.addColorStop(0, g.c);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      bg.fillStyle = grad;
      bg.beginPath();
      bg.arc(g.x, g.y, g.r, 0, Math.PI*2);
      bg.fill();
    });
    // stars
    const count = Math.ceil((sw*sh)/8000); // density
    for (let i=0;i<count;i++){
      const x = Math.random()*sw;
      const y = Math.random()*sh;
      const r = 0.4 + Math.random()*1.1;
      const tw = Math.random();
      const color = tw < 0.75 ? 'rgba(255,255,255,0.9)' : (tw < 0.9 ? 'rgba(196,225,255,0.9)' : 'rgba(173,216,230,0.9)');
      bg.fillStyle = color;
      bg.beginPath();
      bg.arc(x, y, r, 0, Math.PI*2);
      bg.fill();
      if (Math.random() < 0.08){
        // tiny cross twinkle
        bg.strokeStyle = color;
        bg.lineWidth = 0.5;
        bg.beginPath(); bg.moveTo(x-2, y); bg.lineTo(x+2, y); bg.stroke();
        bg.beginPath(); bg.moveTo(x, y-2); bg.lineTo(x, y+2); bg.stroke();
      }
    }
  }
  setCanvasSize();
  setBgCanvasSize();
  drawStarfield();
  window.addEventListener('resize', ()=>{ setCanvasSize(); setBgCanvasSize(); drawStarfield(); updateStageSize(); drawAllEdges(); });

  function fitContentToViewport(padding = 32, minScale = 0.35){
    const b = getContentBounds();
    const contentW = Math.max(1, b.maxX - b.minX);
    const contentH = Math.max(1, b.maxY - b.minY);
    const vw = Math.max(wrap.clientWidth, window.innerWidth || 0);
    const vh = Math.max(wrap.clientHeight, window.innerHeight || 0);
    const availW = Math.max(50, vw - padding*2);
    const availH = Math.max(50, vh - padding*2);
    let fit = Math.min(1, (availW) / contentW, (availH) / contentH);
    fit = Math.max(Math.min(0.5, minScale), fit);
    scale = fit;
    // Left-align and top-align to padding
    offsetX = padding - b.minX * scale;
    offsetY = padding - b.minY * scale;
    setTransform(); setZoomDisplay(); updateStageSize(); setCanvasSize();
    try { lastFitScale = scale; } catch(_) {}
  }

  function centerLayout(){
    const chars = nodes; const gap = layoutGap; const w = nodeW; const h = nodeH;
    const computedPreferredWidth = Math.max(wrap.clientWidth, preferredLayoutWidth || 1200);
    let cols = Math.max(1, Math.floor((computedPreferredWidth - 80) / (w + gap)));
    cols = Math.max(1, Math.min(chars.length, cols));
    chars.forEach((n,i)=>{ n.x = (i%cols)*(w+gap); n.y = Math.floor(i/cols)*(h+gap); });
    try { fitContentToViewport(); } catch(_) { scale = 1; setTransform(); }
  }

  function createPortrait(n){
    const el = document.createElement('div');
    el.className = 'rel-node absolute';
    el.style.width = nodeW + 'px';
    el.style.height = nodeH + 'px';
    el.style.left = (n.x||0) + 'px';
    el.style.top = (n.y||0) + 'px';
    el.dataset.page = n.key;
  const titleText = (n.meta && (n.meta.fullName || n.meta.title)) ? (n.meta.fullName || n.meta.title) : prettifyTitleLocal(n.key);
    el.innerHTML = `
      <div class="tarot-card" style="position:relative;width:100%;height:100%;border-radius:14px;background:
        linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%),
        linear-gradient(90deg, rgba(59,130,246,0.08), rgba(236,72,153,0.06));
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
        border:1px solid rgba(255,255,255,0.12);
        box-shadow: 0 16px 36px rgba(2,6,23,0.48), 0 3px 16px rgba(59,130,246,0.10), inset 0 1px 0 rgba(255,255,255,0.25);
      ">
        <div class="tarot-frame" style="position:absolute;inset:10px;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.05));box-shadow:inset 0 0 0 1px rgba(255,255,255,0.25), 0 0 0 1px rgba(2,6,23,0.2);backdrop-filter: blur(6px) saturate(150%);-webkit-backdrop-filter: blur(6px) saturate(150%);display:flex;flex-direction:column;">
          <div class="rel-head" style="height:70%;overflow:hidden;display:flex;align-items:center;justify-content:center;border-radius:8px;">
            ${(n.meta && n.meta.thumb)
              ? `<img src=\"${n.meta.thumb}\" draggable=\"false\" style=\"width:100%;height:100%;object-fit:cover;-webkit-user-drag:none;user-select:none;pointer-events:none;\">`
              : `<div style=\"font-size:36px;color:#94a3b8;user-select:none;\">${(n.key||'?')[0]||'?'}<\/div>`}
          </div>
          <div class="rel-title" style="text-align:center;font-size:12px;margin-top:6px;color:#f3f8ff;text-shadow:0 1px 6px rgba(59,130,246,0.25);font-weight:600;font-family:ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;">${titleText}</div>
        </div>
        <div class="rel-anchor-col" data-col="left" style="position:absolute;left:-6px;top:20%;bottom:20%;display:flex;flex-direction:column;justify-content:space-between;">
          ${Array.from({length: ANCHORS_PER_SIDE}).map((_,i)=>`<div class=\"rel-anchor\" data-side=\"left\" data-index=\"${i}\" style=\"width:12px;height:12px;border-radius:50%;background:#0ea5e9;border:2px solid rgba(2,6,23,0.8);box-shadow:0 0 8px rgba(56,189,248,0.35);\"></div>`).join('')}
        </div>
        <div class="rel-anchor-col" data-col="right" style="position:absolute;right:-6px;top:20%;bottom:20%;display:flex;flex-direction:column;justify-content:space-between;">
          ${Array.from({length: ANCHORS_PER_SIDE}).map((_,i)=>`<div class=\"rel-anchor\" data-side=\"right\" data-index=\"${i}\" style=\"width:12px;height:12px;border-radius:50%;background:#0ea5e9;border:2px solid rgba(2,6,23,0.8);box-shadow:0 0 8px rgba(56,189,248,0.35);\"></div>`).join('')}
        </div>
      </div>
    `;
    return el;
  }

  function rebuildNodes(){
    stage.innerHTML = '';
    anchorIndex.clear();
    updateStageSize();
  nodes.forEach(n=>{
      const el = createPortrait(n);
      stage.appendChild(el);
  el.addEventListener('dragstart', (e)=>{ e.preventDefault(); });
      const info = { element: el, anchors: { left: [], right: [] } };
      el.querySelectorAll('.rel-anchor').forEach(a => {
        const side = a.getAttribute('data-side');
        const idx = parseInt(a.getAttribute('data-index')||'0',10);
        if (side === 'left' || side === 'right') {
          info.anchors[side][idx] = a;
        }
      });
      anchorIndex.set(n.key, info);
      // Card interactions: differentiate click vs drag
      let pointerDownPos = null;
      let didDragMove = false;
      el.addEventListener('pointerdown', (e)=>{
        if (e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest('.rel-anchor')) return;
        pointerDownPos = { x: e.clientX, y: e.clientY };
        didDragMove = false;
        dragNode = n;
        const sr = stage.getBoundingClientRect();
        const pointerStageX = (e.clientX - sr.left) / scale;
        const pointerStageY = (e.clientY - sr.top) / scale;
        dragOffset.x = pointerStageX - n.x;
        dragOffset.y = pointerStageY - n.y;
        try { el.setPointerCapture && el.setPointerCapture(e.pointerId); } catch(_){ }
      });
      el.addEventListener('pointermove', (e)=>{
        if (!dragNode) return;
        // determine if movement exceeded click threshold
        if (pointerDownPos) {
          const dx = e.clientX - pointerDownPos.x;
          const dy = e.clientY - pointerDownPos.y;
          if ((dx*dx + dy*dy) > 16) didDragMove = true; // threshold ~4px
        }
        const sr = stage.getBoundingClientRect();
        const pointerStageX = (e.clientX - sr.left) / scale;
        const pointerStageY = (e.clientY - sr.top) / scale;
        let nx = pointerStageX - dragOffset.x;
        let ny = pointerStageY - dragOffset.y;
        // When fully zoomed out (fit), keep nodes within visible viewport
        if (isAtFitZoom()) {
          const vw = wrap.clientWidth || window.innerWidth || 0;
          const vh = wrap.clientHeight || window.innerHeight || 0;
          const viewLeft = (-offsetX) / scale;
          const viewTop = (-offsetY) / scale;
          const viewRight = (vw - offsetX) / scale;
          const viewBottom = (vh - offsetY) / scale;
          const pad = 6;
          const minX = viewLeft + pad;
          const minY = viewTop + pad;
          const maxX = viewRight - nodeW - pad;
          const maxY = viewBottom - nodeH - pad;
          nx = clamp(nx, minX, Math.max(minX, maxX));
          ny = clamp(ny, minY, Math.max(minY, maxY));
        }
        dragNode.x = nx; dragNode.y = ny;
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
        updateStageSize();
        drawAllEdges();
      });
      el.addEventListener('pointerup', (e)=>{
        try{ el.releasePointerCapture && el.releasePointerCapture(e.pointerId); }catch(_){ }
        const wasDragging = !!dragNode;
        dragNode = null;
        // If this was effectively a click (no drag) and not on an anchor, open bio
        if (e.button === 0 && !didDragMove) {
          if (!(e.target && e.target.closest && e.target.closest('.rel-anchor'))) {
            showBioPopupFor(n, el);
          }
        }
        pointerDownPos = null;
        didDragMove = false;
      });
      el.querySelectorAll('.rel-anchor').forEach(anchor => {
        anchor.addEventListener('pointerdown', (e)=>{
          if (e.button !== 0) return;
          e.stopPropagation();
          drawFrom = n;
          drawFromSide = anchor.getAttribute('data-side') || null;
          drawFromIndex = parseInt(anchor.getAttribute('data-index')||'0',10);
          const infoA = anchorIndex.get(n.key);
          if (infoA && infoA.element) {
            sourceNodeEl = infoA.element;
            sourcePrevShadow = sourceNodeEl.style.boxShadow || '';
            sourceNodeEl.style.boxShadow = '0 0 0 2px rgba(56,189,248,0.8), 0 0 14px rgba(56,189,248,0.5)';
          }
        });
      });
    });
  }

  function getPageSummaryFor(key){
    try {
      const pages = window.wikiPages || {};
      const obj = pages[key];
      if (!obj) return '';
      const meta = (obj && obj.meta) || {};
  const content = (obj && obj.content) || '';
      // crude extract: first 140 chars of plain text
      const plain = String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g,' ').trim();
      return plain.slice(0, 180) + (plain.length > 180 ? '…' : '');
    } catch(_) { return ''; }
  }
  function getPageData(key){
    try { const p = (window.wikiPages||{})[key]; return p || null; } catch(_) { return null; }
  }

  function humanizeKey(k){
    try {
      const spaced = String(k||'')
        .replace(/_/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
      return spaced.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ');
    } catch(_) { return String(k||''); }
  }

  function showBioPopupFor(node, el){
    // Remove any existing popup
    const prev = document.getElementById('rel-bio-popup');
    if (prev && prev.parentElement) prev.parentElement.removeChild(prev);
    const popup = document.createElement('div');
    popup.id = 'rel-bio-popup';
    // Position inside overlay so it stays above canvases
    popup.style.position = 'absolute';
    popup.style.zIndex = '10002';
    popup.style.maxWidth = '280px';
    popup.style.borderRadius = '12px';
    popup.style.padding = '10px 12px';
    popup.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.90))';
    popup.style.color = '#0b1220';
    popup.style.boxShadow = '0 18px 40px rgba(2,6,23,0.45), inset 0 1px 0 rgba(255,255,255,0.85)';
    popup.style.border = '1px solid rgba(0,0,0,0.08)';
    popup.style.backdropFilter = 'blur(8px)';
    popup.style.webkitBackdropFilter = 'blur(8px)';
  const title = (node.meta && (node.meta.fullName || node.meta.title || node.key)) || node.key;
    const data = getPageData(node.key) || { meta: node.meta||{}, content: '' };
    const meta = data.meta || {};
    const sum = getPageSummaryFor(node.key);
      const thumb = meta.thumb || '';
      const cat = meta.category || '';
    const details = Object.entries(meta)
      .filter(([k,v]) => !['thumb','title','fullName','summary','category','graph','backlinks'].includes(k))
      .filter(([_,v]) => v !== undefined && v !== null && String(v).trim() !== '');
      popup.innerHTML = `
        <div style=\"display:flex;align-items:flex-start;gap:10px;\">
          <div style=\"width:56px;height:56px;border-radius:8px;overflow:hidden;background:#e5e7eb;flex-shrink:0;\">${thumb ? `<img src=\"${thumb}\" style=\"width:100%;height:100%;object-fit:cover;\"/>` : ''}</div>
          <div style=\"flex:1;min-width:0;\">
            <div style=\"font-weight:800;font-size:14px;letter-spacing:.2px;\">${title}</div>
            <div style=\"font-size:11px;color:#374151;opacity:.85;margin-top:2px;\">${cat}</div>
          </div>
        </div>
        ${sum ? `<div style=\\"margin-top:8px;font-size:12px;line-height:1.45;color:#111827;\\">${sum}</div>` : ''}
        ${details.length ? `<div style=\\"margin-top:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;font-size:11px;\\">${details.map(([k,v])=>`<div style=\\"background:rgba(229,231,235,.6);border:1px solid rgba(0,0,0,.06);border-radius:8px;padding:6px;\\"><div style=\\"color:#374151;font-weight:600;font-size:10px;margin-bottom:2px;\\">${humanizeKey(k)}</div><div style=\\"color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\\">${String(v)}</div></div>`).join('')}</div>` : ''}
        <div style=\"margin-top:10px;display:flex;gap:8px;justify-content:flex-end;\">
          <a href=\"#/page/${encodeURIComponent(node.key)}\" style=\"font-size:12px;padding:6px 10px;border-radius:8px;background:#0ea5e9;color:white;text-decoration:none;\">Open Page</a>
        </div>
      `;
    // Ensure navigation closes overlay first to reveal the page view
    const openLink = popup.querySelector('a[href^="#/page/"]');
    if (openLink) {
      openLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        try { restoreAndClose(); } catch(_) {}
        try { location.hash = `#/page/${encodeURIComponent(node.key)}`; } catch(_) { window.location.href = `#/page/${encodeURIComponent(node.key)}`; }
      });
    }
  // Attach inside overlay wrap for correct coordinates
  const overlay = document.getElementById('rel-canvas-wrap') || document.getElementById('relationships-canvas-root') || document.body;
  overlay.appendChild(popup);
  // Position near the card (right side), clamped to overlay bounds
  const cardRect = el.getBoundingClientRect();
  const wrapRect = (overlay === document.body ? {left:0, top:0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight} : overlay.getBoundingClientRect());
  const pad = 8; const gap = 10;
  let left = (cardRect.right - wrapRect.left) + gap;
  let top = (cardRect.top - wrapRect.top);
  // measure using offsetWidth/Height after insertion
  const pw = popup.offsetWidth; const ph = popup.offsetHeight;
  if (left + pw + pad > wrapRect.width) left = Math.max(pad, (cardRect.left - wrapRect.left) - pw - gap);
  if (top + ph + pad > wrapRect.height) top = Math.max(pad, wrapRect.height - ph - pad);
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
    // Dismiss on outside click or ESC
    const onDocClick = (ev)=>{
      if (popup.contains(ev.target)) return;
      cleanup();
    };
    const onKey = (ev)=>{ if (ev.key === 'Escape') cleanup(); };
    function cleanup(){
      document.removeEventListener('mousedown', onDocClick, true);
      document.removeEventListener('keydown', onKey, true);
      if (popup && popup.parentElement) popup.parentElement.removeChild(popup);
    }
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    // Prevent panning when interacting with the popup
    popup.addEventListener('mousedown', (ev)=>{ ev.stopPropagation(); }, true);
    popup.addEventListener('wheel', (ev)=>{ ev.stopPropagation(); }, {capture:true, passive:true});
  }

  function anchorCenterFor(key, side, index){
    const info = anchorIndex.get(key);
    if (!info) return null;
    let el = null;
    if (info.anchors && info.anchors[side]) {
      const list = info.anchors[side];
      if (Array.isArray(list)) {
        const idx = (typeof index === 'number' && !Number.isNaN(index)) ? index : Math.floor(ANCHORS_PER_SIDE/2);
        el = list[idx] || list[Math.floor(ANCHORS_PER_SIDE/2)] || list[0];
      } else {
        el = info.anchors[side];
      }
    }
    if (!el) el = info.element;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    return { x: (r.left + r.width/2) - wr.left, y: (r.top + r.height/2) - wr.top };
  }

  function drawAllEdges(){
    ctx.clearRect(0,0, canvas.width, canvas.height);
    updateStageSize();
    edges.forEach((e)=>{
      const A = anchorCenterFor(e.from, e.fromSide || 'right', e.fromIndex);
      const B = anchorCenterFor(e.to, e.toSide || 'left', e.toIndex);
      if (!A || !B) return;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.save();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = 'rgba(2,6,23,0.35)';
      ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = 'rgba(56,189,248,0.12)';
      ctx.shadowBlur = 6;
      ctx.stroke();
      const mx = (A.x+B.x)/2;
      const my = (A.y+B.y)/2 - 6;
      ctx.fillStyle = '#e6eef8';
      ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial';
      if (e.type) ctx.fillText(e.type, mx, my);
    });
  }

  // pan/zoom
  wrap.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const old = scale;
    const factor = (e.deltaY < 0) ? 1.1 : 0.9;
    const next = Math.min(2.5, Math.max(0.3, old * factor));
    const ratio = next / old;
    scale = next;
    offsetX = mx - (mx - offsetX) * ratio;
    offsetY = my - (my - offsetY) * ratio;
    setTransform(); setZoomDisplay(); setCanvasSize(); updateStageSize(); drawAllEdges();
  }, { passive:false });

  let panning = false; let panStart = {x:0,y:0};
  try { wrap.style.cursor = 'grab'; } catch(_){ }
  wrap.addEventListener('mousedown', (e)=>{
    const onToolbar = e.target && toolbar && toolbar.contains(e.target);
    if (onToolbar) return;
    const onNode = e.target && e.target.closest && e.target.closest('.rel-node');
    const onAnchor = e.target && e.target.closest && e.target.closest('.rel-anchor');
    const canPanWithLeft = (e.button===0 && !e.shiftKey && !onNode && !onAnchor && !drawFrom);
    if (e.button===1 || (e.button===0 && e.shiftKey) || canPanWithLeft) {
      panning = true;
      panStart = {x:e.clientX - offsetX, y:e.clientY - offsetY};
      try { wrap.style.cursor = 'grabbing'; } catch(_){ }
      e.preventDefault();
    }
  });
  wrap.addEventListener('mousemove', (e)=>{
    if (!panning) return;
    offsetX = e.clientX - panStart.x;
    offsetY = e.clientY - panStart.y;
    setTransform();
    drawAllEdges();
  });
  function endPan(){ if (!panning) return; panning = false; try { wrap.style.cursor = 'grab'; } catch(_){ } }
  wrap.addEventListener('mouseup', endPan);
  wrap.addEventListener('mouseleave', endPan);

  if (zoomInBtn) zoomInBtn.addEventListener('click', ()=>{ scale = Math.min(2.5, scale + 0.1); setZoomDisplay(); setTransform(); updateStageSize(); drawAllEdges(); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', ()=>{ scale = Math.max(0.3, scale - 0.1); setZoomDisplay(); setTransform(); updateStageSize(); drawAllEdges(); });

  // Draggable toolbar
  (function(){
    if (!toolbar) return;
    let draggingTB = false;
    let tbStart = {x:0,y:0};
    let tbOffset = {x:0,y:0};
    // initial position from inline styles (top/right). We'll switch to left/top for dragging
    function setToolbarPos(left, top){
      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      const rect = toolbar.getBoundingClientRect();
      const clampedLeft = Math.max(8, Math.min(left, vw - rect.width - 8));
      const clampedTop = Math.max(8, Math.min(top, vh - rect.height - 8));
      toolbar.style.left = clampedLeft + 'px';
      toolbar.style.top = clampedTop + 'px';
      toolbar.style.right = 'auto';
    }
    function onTBDown(e){
      // start drag only if dragging background, not clicking a button
      if (e.target.closest('button')) return;
      draggingTB = true;
      const rect = toolbar.getBoundingClientRect();
      tbOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      tbStart = { x: rect.left, y: rect.top };
      e.preventDefault();
    }
    function onTBMove(e){
      if (!draggingTB) return;
      const left = e.clientX - tbOffset.x;
      const top = e.clientY - tbOffset.y;
      setToolbarPos(left, top);
    }
    function onTBUp(){ draggingTB = false; }
    toolbar.addEventListener('mousedown', onTBDown);
    window.addEventListener('mousemove', onTBMove);
    window.addEventListener('mouseup', onTBUp);
  })();

  let drawTemp = null;
  wrap.addEventListener('mousemove', (e)=>{
    if (!drawFrom) return;
    const rect = wrap.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const start = anchorCenterFor(drawFrom.key, drawFromSide || 'right', drawFromIndex) || { x: localX, y: localY };
    drawTemp = { x1: start.x, y1: start.y, x2: localX, y2: localY };
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const anchorEl = el && (el.closest ? el.closest('.rel-anchor') : null);
    const nodeEl = anchorEl ? anchorEl.closest('.rel-node') : null;
    if (highlightNodeEl && (!nodeEl || nodeEl !== highlightNodeEl)) { highlightNodeEl.classList.remove('ring-2','ring-red-500'); highlightNodeEl = null; }
    if (highlightAnchorEl && (!anchorEl || anchorEl !== highlightAnchorEl)) { highlightAnchorEl.classList.remove('bg-red-500'); highlightAnchorEl = null; }
    if (anchorEl && nodeEl && nodeEl.dataset.page !== drawFrom.key) {
      nodeEl.classList.add('ring-2','ring-red-500');
      anchorEl.classList.add('bg-red-500');
      highlightNodeEl = nodeEl;
      highlightAnchorEl = anchorEl;
    }
    drawAllEdges();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(drawTemp.x1, drawTemp.y1);
    ctx.lineTo(drawTemp.x2, drawTemp.y2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#60a5fa';
    ctx.shadowColor = '#60a5fa';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();
  });
  wrap.addEventListener('mouseup', (e)=>{
    if (!drawFrom) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const anchorEl = el && (el.closest ? el.closest('.rel-anchor') : null);
    if (anchorEl){
      const nodeEl = anchorEl.closest('.rel-node');
      const toKey = nodeEl ? nodeEl.dataset.page : null;
      const toSide = anchorEl ? anchorEl.getAttribute('data-side') : null;
      const toIndex = anchorEl ? parseInt(anchorEl.getAttribute('data-index')||'0',10) : null;
      if (toKey && toKey !== drawFrom.key){
        const type = prompt('Relationship type (e.g., friend, enemy, mentor):','');
        if (type !== null) {
          edges.push({ from: drawFrom.key, to: toKey, type: type||'', fromSide: drawFromSide||undefined, fromIndex: drawFromIndex!=null?drawFromIndex:undefined, toSide: toSide||undefined, toIndex: toIndex!=null?toIndex:undefined });
        }
      }
    }
    if (highlightNodeEl) { highlightNodeEl.classList.remove('ring-2','ring-red-500'); highlightNodeEl = null; }
    if (highlightAnchorEl) { highlightAnchorEl.classList.remove('bg-red-500'); highlightAnchorEl = null; }
    if (sourceNodeEl) { sourceNodeEl.style.boxShadow = sourcePrevShadow || ''; sourceNodeEl = null; sourcePrevShadow = ''; }
    drawTemp = null; drawFrom = null; drawFromSide = null; drawFromIndex = null;
    drawAllEdges();
  });

  wrap.addEventListener('click', (e)=>{
    if (!(e.metaKey || e.ctrlKey)) return;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const distToSeg = (px,py, ax,ay, bx,by) => {
      const vx = bx-ax, vy = by-ay;
      const wx = px-ax, wy = py-ay;
      const c1 = vx*wx + vy*wy;
      if (c1 <= 0) return Math.hypot(px-ax, py-ay);
      const c2 = vx*vx + vy*vy;
      if (c2 <= c1) return Math.hypot(px-bx, py-by);
      const t = c1/c2;
      const projx = ax + t*vx;
      const projy = ay + t*vy;
      return Math.hypot(px-projx, py-projy);
    };
    let best = { idx: -1, d: 1e9 };
    edges.forEach((edge, idx) => {
      const A = anchorCenterFor(edge.from, edge.fromSide || 'right', edge.fromIndex);
      const B = anchorCenterFor(edge.to, edge.toSide || 'left', edge.toIndex);
      if (!A || !B) return;
      const d = distToSeg(x, y, A.x, A.y, B.x, B.y);
      if (d < best.d) best = { idx, d };
    });
    if (best.idx >= 0 && best.d <= 12) {
      if (confirm('Delete this relationship?')) {
        edges.splice(best.idx,1);
        drawAllEdges();
      }
    }
  });

  function restoreAndClose(){
    try{ document.body.style.overflow = ''; }catch(_){ }
    try{ document.documentElement.style.overflow = ''; }catch(_){ }
    try{
      const rr = document.getElementById('relationships-canvas-root');
      if (rr) {
        try{ rr.__relationships_inited = false; }catch(_){ }
        if (rr.parentElement) {
          try{ rr.parentElement.removeChild(rr); }catch(_){ rr.remove && rr.remove(); }
        }
      }
    }catch(_){ }
  // bg canvas stays within overlay; remove with root
    try{ const dbg = document.getElementById('rel-debug-overlay'); if (dbg && dbg.parentElement) dbg.parentElement.removeChild(dbg); }catch(_){ }
    try{ location.hash = '#/'; }catch(_){ }
  }

  if (fitBtn) fitBtn.addEventListener('click', ()=>{ fitContentToViewport(); setCanvasSize(); setBgCanvasSize(); drawStarfield(); drawAllEdges(); });
  if (closeBtn) closeBtn.addEventListener('click', restoreAndClose);
  if (homeBtn) homeBtn.addEventListener('click', ()=>{ fitContentToViewport(); setCanvasSize(); setBgCanvasSize(); drawStarfield(); drawAllEdges(); });

  function onSave(){
    try{
      const snapshot = {
        nodes: nodes.map(n=>({ key:n.key, x:Math.round(n.x), y:Math.round(n.y), meta: n.meta })),
        edges
      };
      const payload = { meta: { category: 'Relationships', graph: JSON.stringify(snapshot) }, content: '' };
      if (window.saveWikiPage) window.saveWikiPage('__relationships', payload);
      alert('Relationships saved.');
    }catch(err){ console.error(err); alert('Save failed'); }
  }
  if (saveBtn) saveBtn.addEventListener('click', onSave);

  function getPagesArray(){
    try{
      const pages = window.wikiPages || {};
      return Object.keys(pages).map(k=>({ key:k, meta: pages[k] && pages[k].meta ? pages[k].meta : {} }));
    }catch(_){ return []; }
  }

  const all = getPagesArray();
  const chars = all.filter(isCharacter);
  nodes = chars.map(c=>({ key: c.key, meta: c.meta, x: 0, y: 0 }));
  centerLayout();
  rebuildNodes();
  fitContentToViewport();
  setCanvasSize(); setBgCanvasSize(); drawStarfield();
  drawAllEdges();

  function refreshFromPages(){
    const currAll = getPagesArray();
    const currChars = currAll.filter(isCharacter);
    const byKey = new Map(nodes.map(n=>[n.key,n]));
    const existingKeys = new Set(nodes.map(n=>n.key));
    const nextNodes = currChars.map(c => {
      const prev = byKey.get(c.key);
      if (prev) return { key: c.key, meta: c.meta, x: prev.x, y: prev.y };
      return { key: c.key, meta: c.meta, x: 0, y: 0 };
    });
    const added = nextNodes.filter(n => !existingKeys.has(n.key));
    nodes = nextNodes;
    // Place new nodes near current content top-left without disturbing existing layout
    if (added.length > 0 && nodes.length > added.length) {
      const b = getContentBounds();
      added.forEach((n, i) => { n.x = b.minX + 20 + i * (nodeW + layoutGap); n.y = b.minY + 20; });
    }
    rebuildNodes();
    // Do not auto-fit on meta-only updates; preserve current scale/offset
    drawAllEdges();
  }
  try { window.addEventListener('wikiPagesUpdated', refreshFromPages); } catch(_){ }

  try{
    const relDoc = (window.wikiPages && window.wikiPages['__relationships']) || null;
    const meta = relDoc && relDoc.meta ? relDoc.meta : {};
    if (meta && meta.graph){
      try {
        const snap = JSON.parse(meta.graph);
        if (snap && Array.isArray(snap.nodes)){
          snap.nodes.forEach(p=>{
            const n = nodes.find(nn=>nn.key===p.key);
            if (n) { n.x = p.x||n.x; n.y = p.y||n.y; }
          });
        }
        if (snap && Array.isArray(snap.edges)) edges = snap.edges;
    rebuildNodes();
    fitContentToViewport();
    setCanvasSize(); setBgCanvasSize(); drawStarfield();
    drawAllEdges();
      } catch(e){ console.warn('[relationships] failed applying saved graph', e); }
    }
  }catch(_){ }

  // Mark as initialized (prevents duplicate wiring on refresh or double router calls)
  try { root.__relationships_inited = true; } catch(_) {}
}

register({ id: moduleId, label: 'Relationships', schema: { name: 'Relationships' }, renderExtras, applyExtrasToMeta, renderView, init });
export { init };
