export interface DashProvider {
  name: string;
  config: {
    baseUrl: string;
    defaultModel: string;
    models: string[];
    enabled: boolean;
    prefix?: string | string[];
  };
}

const CSS: string = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #0f1117;
  color: #e6edf3;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  min-height: 100vh;
  padding: 24px;
}
a { color: #58a6ff; text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 1200px; margin: 0 auto; }
.header { text-align: center; padding: 40px 0 32px; }
.header h1 {
  font-size: 2.4rem;
  font-weight: 700;
  background: linear-gradient(135deg, #58a6ff, #bc8cff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 8px;
}
.header p { color: #8b949e; font-size: 1rem; }
.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}
.stat-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  transition: border-color 0.2s;
}
.stat-card:hover { border-color: #58a6ff; }
.stat-value { font-size: 2rem; font-weight: 700; color: #58a6ff; }
.stat-label { color: #8b949e; font-size: 0.85rem; margin-top: 4px; }
.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3fb950;
  margin-right: 6px;
  animation: pulse 2s infinite;
}
.status-dot.yellow { background: #d29922; animation: none; }
.status-dot.red { background: #f85149; animation: none; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.section { margin-bottom: 32px; }
.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #e6edf3;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #30363d;
}
.providers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.provider-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 20px;
  transition: border-color 0.2s, transform 0.2s;
}
.provider-card:hover { border-color: #58a6ff; transform: translateY(-2px); }
.provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.provider-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.provider-name { font-weight: 600; font-size: 1rem; }
.provider-latency { color: #8b949e; font-size: 0.8rem; }
.provider-actions { display: flex; gap: 6px; }
.btn-small {
  background: transparent;
  border: 1px solid #30363d;
  color: #8b949e;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-small:hover { border-color: #58a6ff; color: #58a6ff; }
.btn-small.danger:hover { border-color: #f85149; color: #f85149; }
.provider-url {
  color: #8b949e;
  font-size: 0.82rem;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.default-model {
  display: inline-block;
  background: rgba(188, 140, 255, 0.15);
  color: #bc8cff;
  border: 1px solid rgba(188, 140, 255, 0.3);
  border-radius: 6px;
  padding: 2px 8px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.78rem;
  margin-bottom: 12px;
}
.model-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.model-tag {
  background: rgba(88, 166, 255, 0.1);
  color: #58a6ff;
  border: 1px solid rgba(88, 166, 255, 0.2);
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  font-family: "SFMono-Regular", Consolas, monospace;
}
.model-tag:hover { background: rgba(88, 166, 255, 0.25); border-color: #58a6ff; }
.panel {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 24px;
}
.form-row { display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-end; }
.form-group { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.form-group label { color: #8b949e; font-size: 0.85rem; }
.form-group input, .form-group select {
  background: #0f1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #e6edf3;
  padding: 8px 12px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
}
.form-group input:focus, .form-group select:focus { border-color: #58a6ff; }
.form-group select option { background: #161b22; }
.btn {
  background: #238636;
  border: 1px solid #2ea043;
  color: #fff;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn:hover { background: #2ea043; }
.btn.secondary {
  background: transparent;
  border-color: #30363d;
  color: #8b949e;
}
.btn.secondary:hover { border-color: #58a6ff; color: #58a6ff; }
.btn.danger { background: #da3633; border-color: #f85149; }
.btn.danger:hover { background: #f85149; }
.response-area {
  background: #0f1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 16px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 80px;
  max-height: 400px;
  overflow-y: auto;
  color: #e6edf3;
  display: none;
}
.meta-bar {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  color: #8b949e;
  font-size: 0.8rem;
}
.meta-item span { color: #e6edf3; }
.log-table {
  width: 100%;
  border-collapse: collapse;
}
.log-header {
  display: grid;
  grid-template-columns: 120px 1fr 16px 1fr 100px 60px 70px;
  gap: 8px;
  padding: 8px 12px;
  color: #8b949e;
  font-size: 0.8rem;
  border-bottom: 1px solid #30363d;
}
.log-row {
  display: grid;
  grid-template-columns: 120px 1fr 16px 1fr 100px 60px 70px;
  gap: 8px;
  padding: 8px 12px;
  font-size: 0.82rem;
  border-bottom: 1px solid #21262d;
  transition: background 0.15s;
}
.log-row:hover { background: rgba(88, 166, 255, 0.05); }
.log-body { max-height: 300px; overflow-y: auto; }
.log-empty { color: #8b949e; text-align: center; padding: 24px; font-size: 0.9rem; }
.badge {
  display: inline-block;
  border-radius: 20px;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 600;
}
.badge.post { background: rgba(88, 166, 255, 0.15); color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.3); }
.badge.get { background: rgba(63, 185, 80, 0.15); color: #3fb950; border: 1px solid rgba(63, 185, 80, 0.3); }
.badge.ok { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
.badge.err { background: rgba(248, 81, 73, 0.15); color: #f85149; }
.endpoints-list { display: flex; flex-direction: column; gap: 8px; }
.endpoint-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #0f1117;
  border: 1px solid #21262d;
  border-radius: 8px;
}
.endpoint-path {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.85rem;
  color: #e6edf3;
  flex: 1;
}
.endpoint-desc { color: #8b949e; font-size: 0.82rem; }
.code-block {
  background: #0f1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 16px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.82rem;
  color: #e6edf3;
  white-space: pre;
  overflow-x: auto;
  cursor: pointer;
  position: relative;
  transition: border-color 0.2s;
}
.code-block:hover { border-color: #58a6ff; }
.code-block::after {
  content: "click to copy";
  position: absolute;
  top: 8px;
  right: 10px;
  color: #8b949e;
  font-size: 0.72rem;
}
.code-block.copied::after { content: "copied!"; color: #3fb950; }
.code-blocks { display: flex; flex-direction: column; gap: 12px; }
.code-label { color: #8b949e; font-size: 0.82rem; margin-bottom: 4px; }
.alias-table { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.alias-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #21262d; }
.alias-row input, .alias-row select {
  background: #0f1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #e6edf3;
  padding: 6px 10px;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}
.alias-row input:focus, .alias-row select:focus { border-color: #58a6ff; }
.alias-row select option { background: #161b22; }
.alias-row input { flex: 1; }
.alias-row select { flex: 2; }
.arrow { color: #8b949e; font-size: 1rem; flex-shrink: 0; }
.alias-actions { display: flex; gap: 8px; margin-top: 12px; }
.aliased { background: rgba(210, 153, 34, 0.15); color: #d29922; border-radius: 4px; padding: 1px 5px; }
.quick-cmd {
  background: #0f1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px 16px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.82rem;
  color: #e6edf3;
  white-space: pre;
  overflow-x: auto;
  cursor: pointer;
  position: relative;
  transition: border-color 0.2s;
  margin-bottom: 8px;
}
.quick-cmd:hover { border-color: #58a6ff; }
.quick-cmd::after {
  content: "click to copy";
  position: absolute;
  top: 8px;
  right: 10px;
  color: #8b949e;
  font-size: 0.72rem;
}
.quick-cmd.copied::after { content: "copied!"; color: #3fb950; }
.alias-summary {
  background: rgba(88, 166, 255, 0.05);
  border: 1px solid rgba(88, 166, 255, 0.2);
  border-radius: 10px;
  padding: 16px 20px;
  margin-top: 16px;
}
.alias-summary-title { color: #58a6ff; font-size: 0.85rem; font-weight: 600; margin-bottom: 10px; }
.alias-summary-row { display: flex; gap: 8px; align-items: center; font-size: 0.85rem; margin-bottom: 6px; }
.alias-summary-key { font-family: "SFMono-Regular", Consolas, monospace; color: #bc8cff; min-width: 60px; }
.alias-summary-val { font-family: "SFMono-Regular", Consolas, monospace; color: #3fb950; }
.alias-summary-note { color: #8b949e; font-size: 0.78rem; margin-top: 10px; }
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 100;
  align-items: center;
  justify-content: center;
}
.modal-overlay.active { display: flex; }
.modal {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 28px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 20px;
  color: #e6edf3;
}
.modal-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.modal-form-group label { color: #8b949e; font-size: 0.85rem; }
.modal-form-group input {
  background: #0f1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #e6edf3;
  padding: 8px 12px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}
.modal-form-group input:focus { border-color: #58a6ff; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
.footer {
  text-align: center;
  padding: 32px 0 16px;
  color: #8b949e;
  font-size: 0.85rem;
  border-top: 1px solid #21262d;
  margin-top: 32px;
}
@media (max-width: 768px) {
  .stats-bar { grid-template-columns: repeat(2, 1fr); }
  .form-row { flex-direction: column; }
  .log-header, .log-row { grid-template-columns: 90px 1fr 14px 1fr 70px 50px 60px; font-size: 0.72rem; }
}
`;

function jsScript(providerJson: string): string {
  return `
<script>
var providers = ${providerJson};
var requestCount = 0;
var logEntries = [];

function checkHealth() {
  fetch('/health').then(function(r) { return r.json(); }).then(function(data) {
    var dots = document.querySelectorAll('.health-dot');
    dots.forEach(function(dot) {
      dot.className = 'status-dot';
    });
    providers.forEach(function(p) {
      var t0 = Date.now();
      fetch(p.config.baseUrl + '/health', { signal: AbortSignal.timeout(5000) })
        .then(function() {
          var ms = Date.now() - t0;
          var dot = document.getElementById('dot-' + p.name);
          var lat = document.getElementById('lat-' + p.name);
          if (dot) dot.className = 'status-dot';
          if (lat) lat.textContent = ms + 'ms';
        })
        .catch(function() {
          var dot = document.getElementById('dot-' + p.name);
          if (dot) dot.className = 'status-dot red';
        });
    });
  }).catch(function() {
    document.querySelectorAll('.health-dot').forEach(function(d) {
      d.className = 'status-dot yellow';
    });
  });
}

function testModel(model) {
  var sel = document.getElementById('model-select');
  if (sel) sel.value = model;
}

function runTest() {
  var model = document.getElementById('model-select').value;
  var prompt = document.getElementById('test-input').value.trim();
  if (!prompt) return;
  var respArea = document.getElementById('response-area');
  var metaBar = document.getElementById('meta-bar');
  respArea.style.display = 'block';
  respArea.textContent = 'Sending...';
  var t0 = Date.now();
  fetch('/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  }).then(function(r) {
    var status = r.status;
    return r.json().then(function(data) {
      var ms = Date.now() - t0;
      var text = '';
      if (data.content && data.content[0]) {
        text = data.content[0].text || JSON.stringify(data, null, 2);
      } else {
        text = JSON.stringify(data, null, 2);
      }
      respArea.textContent = text;
      var tokens = data.usage ? (data.usage.input_tokens + '+' + data.usage.output_tokens) : '-';
      document.getElementById('meta-time').textContent = ms + 'ms';
      document.getElementById('meta-status').textContent = status;
      document.getElementById('meta-tokens').textContent = tokens;
      metaBar.style.display = 'flex';
      addLog(model, model, '', status, ms);
    });
  }).catch(function(err) {
    var ms = Date.now() - t0;
    respArea.textContent = 'Error: ' + err.message;
    addLog(model, model, '', 'ERR', ms);
  });
}

function addLog(originalModel, resolvedModel, provider, status, ms) {
  requestCount++;
  document.getElementById('req-count').textContent = requestCount;
  var entry = {
    time: new Date().toLocaleTimeString(),
    original: originalModel,
    resolved: resolvedModel,
    provider: provider || '',
    status: status,
    ms: ms,
    aliased: originalModel !== resolvedModel
  };
  logEntries.unshift(entry);
  if (logEntries.length > 50) logEntries.pop();
  renderLog();
}

function renderLog() {
  var body = document.getElementById('log-body');
  if (!body) return;
  if (logEntries.length === 0) {
    body.innerHTML = '<div class="log-empty">No requests yet</div>';
    return;
  }
  body.innerHTML = logEntries.map(function(e) {
    var statusClass = (e.status === 200 || e.status === '200') ? 'ok' : 'err';
    var resolvedHtml = e.aliased
      ? '<span class="aliased" title="alias applied">' + e.resolved + '</span>'
      : '<span style="font-family:monospace;font-size:0.8rem">' + e.resolved + '</span>';
    return '<div class="log-row">' +
      '<span>' + e.time + '</span>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;font-size:0.8rem">' + e.original + '</span>' +
      '<span style="color:#8b949e">→</span>' +
      resolvedHtml +
      '<span style="color:#8b949e;font-size:0.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e.provider + '</span>' +
      '<span><span class="badge ' + statusClass + '">' + e.status + '</span></span>' +
      '<span>' + e.ms + 'ms</span>' +
      '</div>';
  }).join('');
}

function refreshRequestLog() {
  fetch('/api/requests').then(function(r) {
    if (!r.ok) return;
    return r.json();
  }).then(function(data) {
    if (!data || !Array.isArray(data)) return;
    logEntries = data.slice(0, 50).map(function(e) {
      return {
        time: e.time || new Date(e.timestamp).toLocaleTimeString(),
        original: e.originalModel || e.model || '',
        resolved: e.resolvedModel || e.model || '',
        provider: e.provider || '',
        status: e.status,
        ms: e.duration || e.ms || 0,
        aliased: (e.originalModel && e.resolvedModel && e.originalModel !== e.resolvedModel)
      };
    });
    requestCount = logEntries.length;
    document.getElementById('req-count').textContent = requestCount;
    renderLog();
  }).catch(function() {});
}

function copyText(el) {
  var text = el.dataset.copy || el.textContent;
  navigator.clipboard.writeText(text).then(function() {
    el.classList.add('copied');
    setTimeout(function() { el.classList.remove('copied'); }, 1500);
  });
}

function showAddProvider() {
  document.getElementById('provider-modal').classList.add('active');
}

function hideAddProvider() {
  document.getElementById('provider-modal').classList.remove('active');
  document.getElementById('provider-form').reset();
  document.getElementById('edit-mode').value = '';
  document.getElementById('modal-title').textContent = 'Add Provider';
  document.getElementById('save-btn-text').textContent = 'Save Provider';
}

function saveProvider() {
  var name = document.getElementById('prov-name').value.trim();
  var baseUrl = document.getElementById('prov-url').value.trim();
  var apiKey = document.getElementById('prov-key').value.trim();
  var models = document.getElementById('prov-models').value.trim().split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var defaultModel = document.getElementById('prov-default').value.trim();
  var prefix = document.getElementById('prov-prefix').value.trim();
  var editMode = document.getElementById('edit-mode').value;
  if (!name || !baseUrl || models.length === 0) {
    alert('Name, Base URL, and at least one model are required.');
    return;
  }
  var payload = { name: name, baseUrl: baseUrl, apiKey: apiKey, models: models, defaultModel: defaultModel || models[0], prefix: prefix || undefined };
  var url = editMode ? '/api/config/providers/' + encodeURIComponent(editMode) : '/api/config/providers';
  var method = editMode ? 'PUT' : 'POST';
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(r) {
    if (r.ok) { location.reload(); } else { return r.json().then(function(d) { alert('Error: ' + (d.error && d.error.message || 'Unknown error')); }); }
  }).catch(function(err) { alert('Error: ' + err.message); });
}

function deleteProvider(name) {
  if (!confirm('Delete provider "' + name + '"? This cannot be undone.')) return;
  fetch('/api/config/providers/' + encodeURIComponent(name), { method: 'DELETE' })
    .then(function(r) {
      if (r.ok) { location.reload(); } else { return r.json().then(function(d) { alert('Error: ' + (d.error && d.error.message || 'Unknown error')); }); }
    }).catch(function(err) { alert('Error: ' + err.message); });
}

function editProvider(name) {
  var p = providers.find(function(x) { return x.name === name; });
  if (!p) return;
  document.getElementById('prov-name').value = p.name;
  document.getElementById('prov-url').value = p.config.baseUrl;
  document.getElementById('prov-key').value = '';
  document.getElementById('prov-models').value = p.config.models.join(', ');
  document.getElementById('prov-default').value = p.config.defaultModel;
  var prefix = Array.isArray(p.config.prefix) ? p.config.prefix.join(', ') : (p.config.prefix || '');
  document.getElementById('prov-prefix').value = prefix;
  document.getElementById('edit-mode').value = name;
  document.getElementById('modal-title').textContent = 'Edit Provider';
  document.getElementById('save-btn-text').textContent = 'Update Provider';
  showAddProvider();
}

// --- Alias functions ---
var allModelOptions = (function() {
  var opts = [];
  providers.forEach(function(p) {
    p.config.models.forEach(function(m) {
      opts.push({ value: m, label: m + ' (' + p.name + ')' });
    });
  });
  return opts;
})();

function buildModelSelect(selectedValue) {
  return '<select>' + allModelOptions.map(function(o) {
    return '<option value="' + o.value + '"' + (o.value === selectedValue ? ' selected' : '') + '>' + o.label + '</option>';
  }).join('') + '</select>';
}

function addAliasRow(source, target) {
  var table = document.getElementById('alias-table');
  var row = document.createElement('div');
  row.className = 'alias-row';
  row.innerHTML =
    '<input type="text" placeholder="source model (e.g. claude-3-haiku)" value="' + (source || '') + '" />' +
    '<span class="arrow">→</span>' +
    buildModelSelect(target || '') +
    '<button class="btn-small danger" onclick="removeAliasRow(this)">Remove</button>';
  table.appendChild(row);
}

function removeAliasRow(btn) {
  btn.closest('.alias-row').remove();
}

function loadAliases() {
  fetch('/api/aliases').then(function(r) {
    if (!r.ok) return;
    return r.json();
  }).then(function(data) {
    if (!data) return;
    var table = document.getElementById('alias-table');
    table.innerHTML = '';
    var aliases = data.aliases || data;
    if (typeof aliases === 'object' && !Array.isArray(aliases)) {
      Object.keys(aliases).forEach(function(src) {
        addAliasRow(src, aliases[src]);
      });
    } else if (Array.isArray(aliases)) {
      aliases.forEach(function(a) { addAliasRow(a.source || a.from, a.target || a.to); });
    }
    updateAliasSummary(aliases);
  }).catch(function() {});
}

function saveAliases() {
  var rows = document.querySelectorAll('#alias-table .alias-row');
  var aliases = {};
  rows.forEach(function(row) {
    var src = row.querySelector('input').value.trim();
    var tgt = row.querySelector('select').value;
    if (src && tgt) aliases[src] = tgt;
  });
  fetch('/api/aliases', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aliases: aliases })
  }).then(function(r) {
    if (r.ok) {
      updateAliasSummary(aliases);
      var btn = document.getElementById('save-aliases-btn');
      if (btn) { btn.textContent = 'Saved!'; setTimeout(function() { btn.textContent = 'Save Aliases'; }, 1500); }
    } else {
      alert('Failed to save aliases');
    }
  }).catch(function(err) { alert('Error: ' + err.message); });
}

function updateAliasSummary(aliases) {
  var keys = ['haiku', 'sonnet', 'opus'];
  keys.forEach(function(k) {
    var el = document.getElementById('alias-sum-' + k);
    if (!el) return;
    var found = '';
    if (aliases && typeof aliases === 'object' && !Array.isArray(aliases)) {
      Object.keys(aliases).forEach(function(src) {
        if (src.toLowerCase().indexOf(k) !== -1) found = aliases[src];
      });
    }
    el.textContent = found || '(not set)';
    el.style.color = found ? '#3fb950' : '#8b949e';
  });
}

document.addEventListener('DOMContentLoaded', function() {
  checkHealth();
  setInterval(checkHealth, 30000);
  renderLog();
  loadAliases();
  refreshRequestLog();
  setInterval(refreshRequestLog, 5000);
  var input = document.getElementById('test-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runTest(); }
    });
  }
});
</script>`;
}

export function dashboardHtml(providers: DashProvider[], host: string): string {
  const totalModels = providers.reduce((sum, p) => sum + p.config.models.length, 0);
  const firstProvider = providers[0];
  const firstModel = firstProvider ? firstProvider.config.models[0] : 'claude-3-5-sonnet-20241022';
  const providerJson = JSON.stringify(providers);

  const providerCards = providers.map(p => {
    const prefix = Array.isArray(p.config.prefix)
      ? p.config.prefix.join(', ')
      : (p.config.prefix || '');
    const modelTags = p.config.models.map(m =>
      `<span class="model-tag" onclick="testModel('${m}')">${m}</span>`
    ).join('');
    return `
    <div class="provider-card">
      <div class="provider-header">
        <div class="provider-name-row">
          <span class="status-dot health-dot" id="dot-${p.name}"></span>
          <span class="provider-name">${p.name}</span>
          <span class="provider-latency" id="lat-${p.name}">--</span>
        </div>
        <div class="provider-actions">
          <button class="btn-small" onclick="editProvider('${p.name}')">Edit</button>
          <button class="btn-small danger" onclick="deleteProvider('${p.name}')">Delete</button>
        </div>
      </div>
      <div class="provider-url" title="${p.config.baseUrl}">${p.config.baseUrl}</div>
      <div class="default-model">${p.config.defaultModel}</div>
      ${prefix ? `<div style="color:#8b949e;font-size:0.78rem;margin-bottom:8px">prefix: ${prefix}</div>` : ''}
      <div class="model-tags">${modelTags}</div>
    </div>`;
  }).join('');

  const modelOptions = providers.flatMap(p =>
    p.config.models.map(m => `<option value="${m}">${m} (${p.name})</option>`)
  ).join('');

  const endpoints = [
    { method: 'GET', path: '/', desc: 'Dashboard UI' },
    { method: 'GET', path: '/health', desc: 'Health check' },
    { method: 'GET', path: '/v1/models', desc: 'List available models' },
    { method: 'POST', path: '/v1/messages', desc: 'Send messages (Anthropic-compatible)' },
    { method: 'POST', path: '/api/config/providers', desc: 'Add a provider' },
    { method: 'GET', path: '/api/config/providers', desc: 'List providers' },
  ];

  const endpointRows = endpoints.map(e => `
    <div class="endpoint-row">
      <span class="badge ${e.method.toLowerCase()}">${e.method}</span>
      <span class="endpoint-path">${e.path}</span>
      <span class="endpoint-desc">${e.desc}</span>
    </div>`).join('');

  const curlExample = `curl http://${host}/v1/messages \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${firstModel}",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;

  const sdkExample = `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "http://${host}",
  apiKey: "any-key",
});

const msg = await client.messages.create({
  model: "${firstModel}",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(msg.content[0].text);`;

  const quickLaunchRows = providers.map(p => {
    const cmd = `claude --model ${p.config.defaultModel} -p "your prompt"`;
    return `<div>
          <div class="code-label">${p.name}</div>
          <pre class="quick-cmd" onclick="copyText(this)">${cmd}</pre>
        </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude API Hub</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">

  <div class="header">
    <h1>Claude API Hub</h1>
    <p>Unified gateway for multiple Claude API providers</p>
  </div>

  <div class="stats-bar">
    <div class="stat-card">
      <div class="stat-value">${providers.length}</div>
      <div class="stat-label">Providers</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${totalModels}</div>
      <div class="stat-label">Models</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="req-count">0</div>
      <div class="stat-label">Requests</div>
    </div>
    <div class="stat-card">
      <div class="stat-value"><span class="status-dot"></span>Online</div>
      <div class="stat-label">Gateway Status</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Providers</div>
    <div class="providers-grid">
      ${providerCards}
    </div>
    <div style="margin-top:16px">
      <button class="btn secondary" onclick="showAddProvider()">+ Add Provider</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Test Model</div>
    <div class="panel">
      <div class="form-row">
        <div class="form-group">
          <label>Model</label>
          <select id="model-select">${modelOptions}</select>
        </div>
        <div class="form-group" style="flex:3">
          <label>Prompt</label>
          <input type="text" id="test-input" placeholder="Enter a message and press Enter or click Send..." />
        </div>
        <button class="btn" onclick="runTest()">Send</button>
      </div>
      <pre class="response-area" id="response-area"></pre>
      <div class="meta-bar" id="meta-bar" style="display:none">
        <span class="meta-item">Time: <span id="meta-time">-</span></span>
        <span class="meta-item">Status: <span id="meta-status">-</span></span>
        <span class="meta-item">Tokens: <span id="meta-tokens">-</span></span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Model Aliases</div>
    <div class="panel">
      <div id="alias-table" class="alias-table"></div>
      <div class="alias-actions">
        <button class="btn secondary" onclick="addAliasRow('','')">+ Add Alias</button>
        <button class="btn" id="save-aliases-btn" onclick="saveAliases()">Save Aliases</button>
      </div>
      <div class="alias-summary">
        <div class="alias-summary-title">Current Alias Config</div>
        <div class="alias-summary-row">
          <span class="alias-summary-key">haiku</span>
          <span style="color:#8b949e">→</span>
          <span class="alias-summary-val" id="alias-sum-haiku">(not set)</span>
        </div>
        <div class="alias-summary-row">
          <span class="alias-summary-key">sonnet</span>
          <span style="color:#8b949e">→</span>
          <span class="alias-summary-val" id="alias-sum-sonnet">(not set)</span>
        </div>
        <div class="alias-summary-row">
          <span class="alias-summary-key">opus</span>
          <span style="color:#8b949e">→</span>
          <span class="alias-summary-val" id="alias-sum-opus">(not set)</span>
        </div>
        <div class="alias-summary-note">OMC sub-agents using haiku/sonnet/opus will be automatically routed to these models.</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Request Log</div>
    <div class="panel" style="padding:0">
      <div class="log-header">
        <span>Time</span>
        <span>Original Model</span>
        <span></span>
        <span>Resolved Model</span>
        <span>Provider</span>
        <span>Status</span>
        <span>Duration</span>
      </div>
      <div class="log-body" id="log-body">
        <div class="log-empty">No requests yet</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">API Endpoints</div>
    <div class="panel">
      <div class="endpoints-list">${endpointRows}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Quick Start</div>
    <div class="panel">
      <div class="code-blocks">
        <div>
          <div class="code-label">Claude CLI — Quick Launch</div>
          ${quickLaunchRows}
        </div>
        <div>
          <div class="code-label">cURL</div>
          <pre class="code-block" onclick="copyText(this)" data-copy="${curlExample.replace(/"/g, '&quot;')}">${curlExample}</pre>
        </div>
        <div>
          <div class="code-label">Anthropic SDK (Node.js)</div>
          <pre class="code-block" onclick="copyText(this)" data-copy="${sdkExample.replace(/"/g, '&quot;')}">${sdkExample}</pre>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <a href="https://github.com" target="_blank">GitHub</a> &mdash; Claude API Hub
  </div>

</div>

<div class="modal-overlay" id="provider-modal">
  <div class="modal">
    <div class="modal-title" id="modal-title">Add Provider</div>
    <form id="provider-form" onsubmit="return false">
      <input type="hidden" id="edit-mode" value="" />
      <div class="modal-form-group">
        <label>Name</label>
        <input type="text" id="prov-name" placeholder="e.g. openrouter" />
      </div>
      <div class="modal-form-group">
        <label>Base URL</label>
        <input type="text" id="prov-url" placeholder="https://openrouter.ai/api" />
      </div>
      <div class="modal-form-group">
        <label>API Key</label>
        <input type="password" id="prov-key" placeholder="sk-..." />
      </div>
      <div class="modal-form-group">
        <label>Models (comma-separated)</label>
        <input type="text" id="prov-models" placeholder="claude-3-5-sonnet-20241022, claude-3-haiku-20240307" />
      </div>
      <div class="modal-form-group">
        <label>Default Model</label>
        <input type="text" id="prov-default" placeholder="claude-3-5-sonnet-20241022" />
      </div>
      <div class="modal-form-group">
        <label>Prefix (optional)</label>
        <input type="text" id="prov-prefix" placeholder="e.g. openrouter/" />
      </div>
      <div class="modal-actions">
        <button class="btn secondary" type="button" onclick="hideAddProvider()">Cancel</button>
        <button class="btn" type="button" onclick="saveProvider()"><span id="save-btn-text">Save Provider</span></button>
      </div>
    </form>
  </div>
</div>

${jsScript(providerJson)}
</body>
</html>`;
}
