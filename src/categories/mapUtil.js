// Utilities for Maps feature: parsing/serializing map meta and coordinate conversions
export function parseMap(mapStr) {
  if (!mapStr) return { metaVersion: 1, layers: [], markers: [] };
  try { const parsed = typeof mapStr === 'string' ? JSON.parse(mapStr) : mapStr; return parsed || { metaVersion: 1, layers: [], markers: [] }; } catch (_) { return { metaVersion: 1, layers: [], markers: [] }; }
}

export function serializeMap(mapObj) {
  if (!mapObj) return JSON.stringify({ metaVersion: 1, layers: [], markers: [] });
  return JSON.stringify(mapObj);
}

export function normToPixel(xNorm, yNorm, imageSize, renderSize) {
  // imageSize: {width,height} natural image pixels
  // renderSize: {width,height} DOM render size
  const px = (xNorm || 0) * (renderSize.width || imageSize.width || 1);
  const py = (yNorm || 0) * (renderSize.height || imageSize.height || 1);
  return { x: px, y: py };
}

export function pixelToNorm(xPx, yPx, imageSize, renderSize) {
  const nx = xPx / (renderSize.width || imageSize.width || 1);
  const ny = yPx / (renderSize.height || imageSize.height || 1);
  return { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) };
}

export async function uploadMapImage(file, pageSlug, onProgress) {
  // Wrap existing uploadFile pattern used elsewhere. Dynamically import firebase helper.
  try {
    const { uploadFile } = await import('../firebase.js');
    const path = `maps/${pageSlug}/${Date.now()}_${file.name.replace(/[^a-z0-9.\-_]/gi,'')}`;
    const url = await uploadFile(file, path, typeof onProgress === 'function' ? (p)=>{
      try { onProgress(p); } catch(_) {}
    } : undefined);
    return url;
  } catch (err) {
    console.error('uploadMapImage failed', err);
    throw err;
  }
}
