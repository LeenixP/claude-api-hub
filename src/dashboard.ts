export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>API Hub</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
header{background:#1e293b;border-bottom:1px solid #334155;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
header h1{font-size:20px;font-weight:600;color:#f8fafc}
header .status{font-size:13px;color:#94a3b8}
header .status .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px}
main{max-width:960px;margin:0 auto;padding:24px}
section{margin-bottom:32px}
section h2{font-size:16px;font-weight:600;color:#f1f5f9;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:12px}
.alias-row{display:grid;grid-template-columns:100px 1fr 80px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #334155}
.alias-row:last-child{border-bottom:none}
.alias-label{font-weight:600;font-size:15px;text-transform:capitalize}
.alias-label.haiku{color:#22d3ee}
.alias-label.sonnet{color:#a78bfa}
.alias-label.opus{color:#fb923c}
select,input{background:#0f172a;border:1px solid #475569;border-radius:6px;padding:8px 12px;color:#e2e8f0;font-size:14px;width:100%}
select:focus,input:focus{outline:none;border-color:#3b82f6}
button{border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;transition:background .15s}
.btn-primary{background:#3b82f6;color:#fff}
.btn-primary:hover{background:#2563eb}
.btn-danger{background:#ef4444;color:#fff}
.btn-danger:hover{background:#dc2626}
.btn-sm{padding:5px 12px;font-size:12px}
.btn-ghost{background:transparent;color:#94a3b8;border:1px solid #475569}
.btn-ghost:hover{background:#334155;color:#e2e8f0}
.provider-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.provider-name{font-weight:600;font-size:15px}
.provider-url{font-size:12px;color:#64748b;margin-top:2px}
.provider-models{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.model-tag{background:#334155;border-radius:4px;padding:3px 8px;font-size:12px;color:#94a3b8}
.provider-actions{display:flex;gap:6px}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500}
.badge-on{background:#166534;color:#4ade80}
.badge-off{background:#7f1d1d;color:#fca5a5}
.badge-pass{background:#1e3a5f;color:#7dd3fc}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form-grid .full{grid-column:1/-1}
.form-group{display:flex;flex-direction:column;gap:4px}
.form-group label{font-size:12px;color:#94a3b8;font-weight:500}
.form-row{display:flex;gap:8px;align-items:center}
.form-check{display:flex;align-items:center;gap:8px;font-size:13px}
.form-check input[type=checkbox]{width:auto}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;align-items:center;justify-content:center}
.modal-overlay.active{display:flex}
.modal{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;width:90%;max-width:560px}
.modal h3{font-size:16px;margin-bottom:16px}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.toast{position:fixed;bottom:24px;right:24px;background:#334155;color:#e2e8f0;padding:10px 20px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .3s;z-index:200}
.toast.show{opacity:1}
.toast.error{background:#7f1d1d;color:#fca5a5}
.empty{text-align:center;color:#64748b;padding:24px;font-size:14px}
</style>
</head>
<body>
<header>
  <h1>API Hub</h1>
  <div class="status"><span class="dot"></span>Running</div>
</header>
<main>
  <section>
    <h2>Alias Mapping</h2>
    <div class="card" id="aliases-card">
      <div class="alias-row">
        <div class="alias-label haiku">Haiku</div>
        <select id="alias-haiku"></select>
        <span id="alias-haiku-provider" style="font-size:12px;color:#64748b"></span>
      </div>
      <div class="alias-row">
        <div class="alias-label sonnet">Sonnet</div>
        <select id="alias-sonnet"></select>
        <span id="alias-sonnet-provider" style="font-size:12px;color:#64748b"></span>
      </div>
      <div class="alias-row">
        <div class="alias-label opus">Opus</div>
        <select id="alias-opus"></select>
        <span id="alias-opus-provider" style="font-size:12px;color:#64748b"></span>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end">
        <button class="btn-primary" onclick="saveAliases()">Save Aliases</button>
      </div>
    </div>
  </section>

  <section>
    <h2>Providers <button class="btn-primary" onclick="openAddProvider()" style="margin-left:auto">+ Add</button></h2>
    <div id="providers-list"></div>
  </section>
</main>

<div class="modal-overlay" id="provider-modal">
  <div class="modal">
    <h3 id="modal-title">Add Provider</h3>
    <div class="form-grid">
      <div class="form-group">
        <label>Provider Key</label>
        <input id="f-key" placeholder="e.g. deepseek">
      </div>
      <div class="form-group">
        <label>Display Name</label>
        <input id="f-name" placeholder="e.g. DeepSeek">
      </div>
      <div class="form-group full">
        <label>Base URL</label>
        <input id="f-url" placeholder="https://api.deepseek.com/v1">
      </div>
      <div class="form-group full">
        <label>API Key</label>
        <input id="f-key-val" placeholder="sk-... or \${ENV_VAR}">
      </div>
      <div class="form-group full">
        <label>Models (comma separated)</label>
        <input id="f-models" placeholder="deepseek-chat, deepseek-coder">
      </div>
      <div class="form-group">
        <label>Default Model</label>
        <input id="f-default" placeholder="deepseek-chat">
      </div>
      <div class="form-group">
        <label>Prefix (for routing)</label>
        <input id="f-prefix" placeholder="deepseek-">
      </div>
      <div class="form-group">
        <div class="form-check">
          <input type="checkbox" id="f-enabled" checked>
          <label for="f-enabled">Enabled</label>
        </div>
      </div>
      <div class="form-group">
        <div class="form-check">
          <input type="checkbox" id="f-passthrough">
          <label for="f-passthrough">Passthrough (Anthropic format)</label>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="modal-save" onclick="saveProvider()">Save</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
let config = null;
let allModels = [];
let editingProvider = null;

async function load() {
  try {
    const [cfgRes, modelsRes] = await Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/v1/models').then(r => r.json())
    ]);
    config = cfgRes;
    allModels = modelsRes.data || [];
    renderAliases();
    renderProviders();
  } catch(e) {
    toast('Failed to load config', true);
  }
}

function renderAliases() {
  const aliases = config.aliases || {};
  ['haiku','sonnet','opus'].forEach(tier => {
    const sel = document.getElementById('alias-' + tier);
    const provSpan = document.getElementById('alias-' + tier + '-provider');
    sel.innerHTML = '<option value="">(not mapped)</option>';
    const groups = {};
    allModels.forEach(m => {
      if (!groups[m.owned_by]) groups[m.owned_by] = [];
      groups[m.owned_by].push(m.id);
    });
    Object.keys(groups).forEach(provider => {
      const og = document.createElement('optgroup');
      og.label = provider;
      groups[provider].forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id;
        if (aliases[tier] === id) opt.selected = true;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    sel.onchange = () => {
      const v = sel.value;
      const m = allModels.find(x => x.id === v);
      provSpan.textContent = m ? m.owned_by : '';
    };
    const cur = allModels.find(x => x.id === aliases[tier]);
    provSpan.textContent = cur ? cur.owned_by : '';
  });
}

function renderProviders() {
  const list = document.getElementById('providers-list');
  const entries = Object.entries(config.providers);
  if (entries.length === 0) {
    list.innerHTML = '<div class="empty">No providers configured</div>';
    return;
  }
  list.innerHTML = entries.map(([key, p]) => {
    const badges = [
      p.enabled ? '<span class="badge badge-on">ON</span>' : '<span class="badge badge-off">OFF</span>',
      p.passthrough ? '<span class="badge badge-pass">passthrough</span>' : ''
    ].filter(Boolean).join(' ');
    const models = (p.models||[]).map(m => '<span class="model-tag">' + esc(m) + '</span>').join('');
    return '<div class="card">' +
      '<div class="provider-header">' +
        '<div><span class="provider-name">' + esc(p.name || key) + '</span> ' + badges +
        '<div class="provider-url">' + esc(p.baseUrl) + '</div></div>' +
        '<div class="provider-actions">' +
          '<button class="btn-ghost btn-sm" onclick="editProvider(\\'' + esc(key) + '\\')">Edit</button>' +
          '<button class="btn-danger btn-sm" onclick="deleteProvider(\\'' + esc(key) + '\\')">Delete</button>' +
        '</div>' +
      '</div>' +
      '<div class="provider-models">' + models + '</div>' +
    '</div>';
  }).join('');
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

async function saveAliases() {
  const aliases = {};
  ['haiku','sonnet','opus'].forEach(tier => {
    const v = document.getElementById('alias-' + tier).value;
    if (v) aliases[tier] = v;
  });
  try {
    await fetch('/api/aliases', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(aliases) });
    toast('Aliases saved');
    load();
  } catch(e) { toast('Failed to save aliases', true); }
}

function openAddProvider() {
  editingProvider = null;
  document.getElementById('modal-title').textContent = 'Add Provider';
  document.getElementById('f-key').value = '';
  document.getElementById('f-key').disabled = false;
  document.getElementById('f-name').value = '';
  document.getElementById('f-url').value = '';
  document.getElementById('f-key-val').value = '';
  document.getElementById('f-models').value = '';
  document.getElementById('f-default').value = '';
  document.getElementById('f-prefix').value = '';
  document.getElementById('f-enabled').checked = true;
  document.getElementById('f-passthrough').checked = false;
  document.getElementById('provider-modal').classList.add('active');
}

function editProvider(key) {
  editingProvider = key;
  const p = config.providers[key];
  document.getElementById('modal-title').textContent = 'Edit Provider';
  document.getElementById('f-key').value = key;
  document.getElementById('f-key').disabled = true;
  document.getElementById('f-name').value = p.name || '';
  document.getElementById('f-url').value = p.baseUrl || '';
  document.getElementById('f-key-val').value = '';
  document.getElementById('f-key-val').placeholder = p.apiKey || 'Leave blank to keep current';
  document.getElementById('f-models').value = (p.models||[]).join(', ');
  document.getElementById('f-default').value = p.defaultModel || '';
  document.getElementById('f-prefix').value = Array.isArray(p.prefix) ? p.prefix.join(', ') : (p.prefix || '');
  document.getElementById('f-enabled').checked = p.enabled !== false;
  document.getElementById('f-passthrough').checked = !!p.passthrough;
  document.getElementById('provider-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('provider-modal').classList.remove('active');
}

async function saveProvider() {
  const key = document.getElementById('f-key').value.trim();
  const name = document.getElementById('f-name').value.trim();
  const baseUrl = document.getElementById('f-url').value.trim();
  const apiKey = document.getElementById('f-key-val').value.trim();
  const modelsStr = document.getElementById('f-models').value.trim();
  const defaultModel = document.getElementById('f-default').value.trim();
  const prefixStr = document.getElementById('f-prefix').value.trim();
  const enabled = document.getElementById('f-enabled').checked;
  const passthrough = document.getElementById('f-passthrough').checked;

  const models = modelsStr.split(',').map(s => s.trim()).filter(Boolean);
  const prefix = prefixStr.includes(',') ? prefixStr.split(',').map(s => s.trim()).filter(Boolean) : prefixStr;

  if (!key || !name || !baseUrl || models.length === 0 || !defaultModel) {
    toast('Please fill all required fields', true); return;
  }

  try {
    if (editingProvider) {
      const body = { name, baseUrl, models, defaultModel, enabled, passthrough: passthrough || undefined, prefix: prefix || undefined };
      if (apiKey) body.apiKey = apiKey;
      await fetch('/api/config/providers/' + encodeURIComponent(key), {
        method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      toast('Provider updated');
    } else {
      if (!apiKey) { toast('API Key is required for new providers', true); return; }
      await fetch('/api/config/providers', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, baseUrl, apiKey, models, defaultModel, enabled, passthrough: passthrough || undefined, prefix: prefix || undefined })
      });
      toast('Provider added');
    }
    closeModal();
    load();
  } catch(e) { toast('Failed to save provider', true); }
}

async function deleteProvider(key) {
  if (!confirm('Delete provider "' + key + '"?')) return;
  try {
    await fetch('/api/config/providers/' + encodeURIComponent(key), { method: 'DELETE' });
    toast('Provider deleted');
    load();
  } catch(e) { toast('Failed to delete provider', true); }
}

function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => el.className = 'toast', 2500);
}

load();
</script>
</body>
</html>`;
}
