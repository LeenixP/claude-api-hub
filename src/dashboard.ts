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
.alias-row{display:grid;grid-template-columns:100px 1fr 100px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #334155}
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
.badge-openai{background:#064e3b;color:#6ee7b7}
.badge-anthropic{background:#1e3a5f;color:#7dd3fc}
.info-card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:24px}
.info-card h3{font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:12px}
.info-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px}
.info-row .label{color:#94a3b8;min-width:140px}
.info-row code{background:#334155;padding:3px 8px;border-radius:4px;font-size:12px;color:#e2e8f0;font-family:monospace}
.copy-btn{background:#334155;color:#94a3b8;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer}
.copy-btn:hover{background:#475569;color:#e2e8f0}
.config-block{background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px 14px;font-size:12px;color:#94a3b8;font-family:monospace;margin-top:8px;position:relative;white-space:pre;line-height:1.5}
.config-block .copy-btn{position:absolute;top:6px;right:6px}
.provider-meta{display:flex;flex-wrap:wrap;gap:12px;margin-top:6px;font-size:12px;color:#64748b}
.provider-meta span{display:flex;align-items:center;gap:4px}
.key-ok{color:#4ade80}
.key-warn{color:#fbbf24}
.key-env{color:#7dd3fc}
.help-text{font-size:11px;color:#64748b;margin-top:4px}
.combo{position:relative}
.combo input{width:100%;cursor:text}
.combo-panel{display:none;position:absolute;top:100%;left:0;right:0;background:#1e293b;border:1px solid #475569;border-radius:6px;margin-top:4px;max-height:240px;overflow-y:auto;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.combo-panel.open{display:block}
.combo-group{padding:4px 0}
.combo-group-label{padding:4px 12px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.combo-item{padding:6px 12px;font-size:13px;color:#e2e8f0;cursor:pointer;display:flex;justify-content:space-between}
.combo-item:hover{background:#334155}
.combo-item .provider-hint{font-size:11px;color:#64748b}
.log-panel{background:#0f172a;border:1px solid #334155;border-radius:8px;max-height:400px;overflow-y:auto;font-family:monospace;font-size:12px}
.log-entry{padding:8px 12px;border-bottom:1px solid #1e293b;display:grid;grid-template-columns:160px 1fr;gap:8px;line-height:1.5}
.log-entry:hover{background:#1e293b}
.log-time{color:#64748b;white-space:nowrap}
.log-detail{color:#e2e8f0}
.log-status-ok{color:#4ade80}
.log-status-err{color:#f87171}
.log-model{color:#a78bfa}
.log-provider{color:#22d3ee}
.log-error{color:#f87171;margin-top:2px;font-size:11px}
.log-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.log-header h2{margin-bottom:0}
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
  <div class="info-card">
    <h3>Quick Start</h3>
    <div class="info-row">
      <span class="label">Gateway URL</span>
      <code id="gateway-url"></code>
      <button class="copy-btn" onclick="copyText(document.getElementById('gateway-url').textContent)">Copy</button>
    </div>
    <div class="info-row">
      <span class="label">Config file</span>
      <code>~/.claude/settings.json</code>
    </div>
    <div class="config-block" id="config-snippet"><button class="copy-btn" onclick="copyConfig()">Copy</button></div>
  </div>

  <section>
    <h2>Alias Mapping</h2>
    <div class="card" id="aliases-card">
      <div class="alias-row">
        <div class="alias-label haiku">Haiku</div>
        <div class="combo" id="combo-haiku">
          <input type="text" id="alias-haiku" placeholder="Type or select a model..." autocomplete="off">
          <div class="combo-panel" id="panel-haiku"></div>
        </div>
        <span id="alias-haiku-provider" style="font-size:12px;color:#64748b"></span>
      </div>
      <div class="alias-row">
        <div class="alias-label sonnet">Sonnet</div>
        <div class="combo" id="combo-sonnet">
          <input type="text" id="alias-sonnet" placeholder="Type or select a model..." autocomplete="off">
          <div class="combo-panel" id="panel-sonnet"></div>
        </div>
        <span id="alias-sonnet-provider" style="font-size:12px;color:#64748b"></span>
      </div>
      <div class="alias-row">
        <div class="alias-label opus">Opus</div>
        <div class="combo" id="combo-opus">
          <input type="text" id="alias-opus" placeholder="Type or select a model..." autocomplete="off">
          <div class="combo-panel" id="panel-opus"></div>
        </div>
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

  <section>
    <div class="log-header">
      <h2>Request Logs</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-ghost btn-sm" onclick="loadLogs()">Refresh</button>
        <button class="btn-ghost btn-sm" id="auto-refresh-btn" onclick="toggleAutoRefresh()">Auto: OFF</button>
      </div>
    </div>
    <div class="log-panel" id="log-panel">
      <div class="empty">No logs yet</div>
    </div>
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
        <div class="help-text" style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:8px 10px;margin-top:6px;line-height:1.6">
          <b style="color:#7dd3fc">\\u2611 Checked = Anthropic Messages API</b><br>
          Request body is forwarded as-is, no protocol translation.<br>
          Use for: Anthropic official API, or proxies that accept Anthropic format.<br>
          Auth header: <code style="background:#334155;padding:1px 4px;border-radius:3px">x-api-key</code><br><br>
          <b style="color:#6ee7b7">\\u2610 Unchecked = OpenAI Chat Completions API</b><br>
          Request is auto-translated from Anthropic to OpenAI format.<br>
          Use for: Kimi, MiniMax, GLM, DeepSeek, and any OpenAI-compatible API.<br>
          Auth header: <code style="background:#334155;padding:1px 4px;border-radius:3px">Authorization: Bearer</code>
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
let fetchedModels = {};
let editingProvider = null;

async function load() {
  try {
    const [cfgRes, modelsRes] = await Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/v1/models').then(r => r.json())
    ]);
    config = cfgRes;
    allModels = modelsRes.data || [];
    renderProviders();
    // Fetch real models from provider APIs (may take a moment)
    try {
      fetchedModels = await fetch('/api/fetch-models').then(r => r.json());
    } catch(e) { fetchedModels = {}; }
    renderAliases();
  } catch(e) {
    toast('Failed to load config', true);
  }
}

function renderAliases() {
  const aliases = config.aliases || {};

  ['haiku','sonnet','opus'].forEach(tier => {
    const input = document.getElementById('alias-' + tier);
    const panel = document.getElementById('panel-' + tier);
    const provSpan = document.getElementById('alias-' + tier + '-provider');
    input.value = aliases[tier] || '';

    function buildPanel(filter) {
      let html = '';
      Object.entries(fetchedModels).forEach(([provider, models]) => {
        const filtered = (models || []).filter(id => !filter || id.toLowerCase().includes(filter.toLowerCase()));
        if (filtered.length === 0) return;
        html += '<div class="combo-group"><div class="combo-group-label">' + esc(provider) + '</div>';
        filtered.forEach(id => {
          html += '<div class="combo-item" data-value="' + esc(id) + '">' + esc(id) + '<span class="provider-hint">' + esc(provider) + '</span></div>';
        });
        html += '</div>';
      });
      panel.innerHTML = html || '<div style="padding:8px 12px;color:#64748b;font-size:13px">No models found</div>';
      panel.querySelectorAll('.combo-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = item.dataset.value;
          panel.classList.remove('open');
          updateProvider();
        });
      });
    }

    function updateProvider() {
      const v = input.value.trim();
      let found = '';
      Object.entries(fetchedModels).forEach(([provider, models]) => {
        if ((models || []).includes(v)) found = provider;
      });
      provSpan.textContent = found || (v ? 'custom' : '');
    }

    input.addEventListener('focus', () => { buildPanel(input.value); panel.classList.add('open'); });
    input.addEventListener('input', () => { buildPanel(input.value); panel.classList.add('open'); updateProvider(); });
    input.addEventListener('blur', () => { setTimeout(() => panel.classList.remove('open'), 150); });
    updateProvider();
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
    const enableBadge = p.enabled ? '<span class="badge badge-on">ON</span>' : '<span class="badge badge-off">OFF</span>';
    const formatBadge = p.passthrough
      ? '<span class="badge badge-anthropic">Anthropic API</span>'
      : '<span class="badge badge-openai">OpenAI Compatible</span>';
    const models = (p.models||[]).map(m => '<span class="model-tag">' + esc(m) + '</span>').join('');
    const prefix = p.prefix ? (Array.isArray(p.prefix) ? p.prefix.join(', ') : p.prefix) : '-';
    const keyStatus = !p.apiKey || p.apiKey === '***'
      ? '<span class="key-warn">\\u26a0 Missing</span>'
      : p.apiKey.includes('***')
        ? '<span class="key-ok">\\u2713 Configured</span>'
        : '<span class="key-env">\\u2713 Configured</span>';
    return '<div class="card">' +
      '<div class="provider-header">' +
        '<div><span class="provider-name">' + esc(p.name || key) + '</span> ' + enableBadge + ' ' + formatBadge +
        '<div class="provider-url">' + esc(p.baseUrl) + '</div></div>' +
        '<div class="provider-actions">' +
          '<button class="btn-ghost btn-sm" onclick="editProvider(\\'' + esc(key) + '\\')">Edit</button>' +
          '<button class="btn-danger btn-sm" onclick="deleteProvider(\\'' + esc(key) + '\\')">Delete</button>' +
        '</div>' +
      '</div>' +
      '<div class="provider-meta">' +
        '<span>Prefix: <code>' + esc(prefix) + '</code></span>' +
        '<span>Default: <code>' + esc(p.defaultModel || '-') + '</code></span>' +
        '<span>API Key: ' + keyStatus + '</span>' +
      '</div>' +
      '<div class="provider-models">' + models + '</div>' +
    '</div>';
  }).join('');
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

async function saveAliases() {
  const aliases = {};
  ['haiku','sonnet','opus'].forEach(tier => {
    const v = document.getElementById('alias-' + tier).value.trim();
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

let autoRefreshTimer = null;

async function loadLogs() {
  try {
    const logs = await fetch('/api/logs').then(r => r.json());
    const panel = document.getElementById('log-panel');
    if (!logs || logs.length === 0) {
      panel.innerHTML = '<div class="empty">No logs yet</div>';
      return;
    }
    panel.innerHTML = logs.map(l => {
      const statusClass = l.status >= 200 && l.status < 300 ? 'log-status-ok' : 'log-status-err';
      const time = new Date(l.time).toLocaleTimeString();
      const stream = l.stream ? ' [stream]' : '';
      const errLine = l.error ? '<div class="log-error">Error: ' + esc(l.error) + '</div>' : '';
      return '<div class="log-entry">' +
        '<div class="log-time">' + esc(time) + '</div>' +
        '<div class="log-detail">' +
          '<span class="' + statusClass + '">' + l.status + '</span> ' +
          '<span class="log-model">' + esc(l.originalModel) + '</span>' +
          (l.originalModel !== l.resolvedModel ? ' \\u2192 <span class="log-model">' + esc(l.resolvedModel) + '</span>' : '') +
          ' \\u2192 <span class="log-provider">' + esc(l.provider) + '</span>' +
          ' [' + l.protocol + ']' + stream +
          ' <span style="color:#64748b">' + l.durationMs + 'ms</span>' +
          errLine +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) { /* ignore */ }
}

function toggleAutoRefresh() {
  const btn = document.getElementById('auto-refresh-btn');
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    btn.textContent = 'Auto: OFF';
  } else {
    autoRefreshTimer = setInterval(loadLogs, 3000);
    btn.textContent = 'Auto: ON';
    loadLogs();
  }
}

function initQuickStart() {
  const url = window.location.origin;
  document.getElementById('gateway-url').textContent = url;
  const snippet = document.getElementById('config-snippet');
  const json = JSON.stringify({ env: { ANTHROPIC_BASE_URL: url } }, null, 2);
  snippet.insertBefore(document.createTextNode(json), snippet.firstChild);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied')).catch(() => toast('Copy failed', true));
}

function copyConfig() {
  const url = window.location.origin;
  const json = JSON.stringify({ env: { ANTHROPIC_BASE_URL: url } }, null, 2);
  copyText(json);
}

initQuickStart();
load();
loadLogs();
</script>
</body>
</html>`;
}
