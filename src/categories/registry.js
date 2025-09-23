// Category modules registry for The Haven Wiki
// Each module exports: id, label, icon (optional), schema, renderExtras(ctx), applyExtrasToMeta(meta, formEl), renderView(ctx)

const modules = new Map();

function register(mod) {
  if (!mod || !mod.id) return;
  modules.set(mod.id, mod);
}

function getModule(id) {
  return modules.get(id);
}

function listModules() {
  return Array.from(modules.values());
}

export { register, getModule, listModules };
