export function dashboardHtml(version: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API Hub</title>
<style>
:root {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-hover: #263548;
  --border: #334155;
  --border-hover: #475569;
  --text: #e2e8f0;
  --text-dim: #94a3b8;
  --text-muted: #64748b;
  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --primary-glow: rgba(59, 130, 246, 0.15);
  --danger: #ef4444;
  --danger-hover: #dc2626;
  --success: #22c55e;
  --warning: #f59e0b;
  --cyan: #22d3ee;
  --violet: #a78bfa;
  --orange: #fb923c;
  --radius: 10px;
  --radius-sm: 6px;
  --shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.4);
  --mono: "SF Mono", Monaco, Consolas, "Liberation Mono", monospace;
  --transition: 0.15s ease;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  line-height: 1.6;
  font-size: 14px;
}

/* ── Header ── */
header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 60;
  backdrop-filter: blur(8px);
}
header h1 { font-size: 20px; font-weight: 700; color: #f8fafc; letter-spacing: -0.3px; }
.header-right { display: flex; align-items: center; gap: 18px; font-size: 13px; color: var(--text-dim); }
.header-stat { display: flex; align-items: center; gap: 4px; }
.header-stat b { color: var(--text); font-weight: 600; }

/* ── Dot indicators ── */
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; flex-shrink: 0; }
.dot-ok { background: var(--success); box-shadow: 0 0 6px rgba(34, 197, 94, 0.4); }
.dot-err { background: var(--danger); box-shadow: 0 0 6px rgba(239, 68, 68, 0.4); }
.dot-warn { background: var(--warning); }
.dot-off { background: var(--text-muted); }

/* ── Layout ── */
main { max-width: 1400px; margin: 0 auto; padding: 24px 32px 48px; }
@media (max-width: 960px) { main { padding: 16px 16px 32px; } }
.main-grid { display: grid; grid-template-columns: 1fr 420px; gap: 24px; }
@media (max-width: 960px) { .main-grid { grid-template-columns: 1fr; } }
.main-left { min-width: 0; }
.main-right { min-width: 0; }
section { margin-bottom: 24px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.section-header h2 { font-size: 17px; font-weight: 600; color: #f1f5f9; }

/* ── Cards ── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 12px;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.card:hover { border-color: var(--border-hover); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); }

/* ── Inputs ── */
input[type=text], input[type=password] {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  color: var(--text);
  font-size: 13px;
  width: 100%;
  transition: border-color var(--transition), box-shadow var(--transition);
}
input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-glow);
}

/* ── Buttons ── */
button {
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-hover); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3); }
.btn-primary:active { transform: scale(0.97); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover { background: var(--danger-hover); }
.btn-sm { padding: 5px 12px; font-size: 12px; }
.btn-ghost { background: transparent; color: var(--text-dim); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--border); color: var(--text); }

/* ── Badges ── */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  gap: 3px;
  transition: all var(--transition);
}
.badge-on { background: #166534; color: #4ade80; }
.badge-off { background: #7f1d1d; color: #fca5a5; }
.badge-openai { background: #064e3b; color: #6ee7b7; cursor: pointer; }
.badge-openai:hover { background: #065f46; }
.badge-anthropic { background: #1e3a5f; color: #7dd3fc; cursor: pointer; }
.badge-anthropic:hover { background: #1e4d7f; }

/* ── Quick Start ── */
.info-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 24px;
}
.info-card h3 { font-size: 15px; font-weight: 600; color: #f1f5f9; margin-bottom: 14px; }
.setup-steps { display: flex; flex-direction: column; gap: 14px; }
.setup-step { display: flex; gap: 14px; align-items: flex-start; }
.step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: #fff; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.step-content { flex: 1; min-width: 0; }
.step-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.step-desc { font-size: 13px; color: var(--text-dim); margin-bottom: 6px; }
.step-code { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 13px; color: var(--text-dim); font-family: var(--mono); position: relative; white-space: pre; line-height: 1.6; overflow-x: auto; }
.step-code .copy-btn { position: absolute; top: 6px; right: 6px; }
.info-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
.info-row .label { color: var(--text-dim); min-width: 120px; flex-shrink: 0; }
.info-row code {
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text);
  font-family: var(--mono);
}
.copy-btn {
  background: var(--border);
  color: var(--text-dim);
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition);
}
.copy-btn:hover { background: var(--border-hover); color: var(--text); }
.config-block {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--mono);
  margin-top: 8px;
  position: relative;
  white-space: pre;
  line-height: 1.6;
}
.config-block .copy-btn { position: absolute; top: 6px; right: 6px; }

/* ── Alias Mapping ── */
.alias-row {
  display: grid;
  grid-template-columns: 80px 1fr 120px;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.alias-row:last-of-type { border-bottom: none; }
.alias-label { font-weight: 700; font-size: 16px; }
.alias-label.haiku { color: var(--cyan); }
.alias-label.sonnet { color: var(--violet); }
.alias-label.opus { color: var(--orange); }
.alias-provider {
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Combo dropdown ── */
.combo { position: relative; }
.combo-panel {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border-hover);
  border-radius: var(--radius-sm);
  margin-top: 3px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 50;
  box-shadow: var(--shadow-lg);
}
.combo-panel.open { display: block; }
.combo-group-label {
  padding: 6px 12px 3px;
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.combo-item {
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background var(--transition);
}
.combo-item:hover, .combo-item.active { background: var(--border); }
.combo-item .hint { font-size: 10px; color: var(--text-muted); }

/* ── Provider cards ── */
.provider-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.provider-info { flex: 1; min-width: 0; }
.provider-title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.provider-name { font-weight: 600; font-size: 16px; }
.provider-url {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.provider-actions { display: flex; gap: 4px; flex-shrink: 0; }
.provider-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-muted);
}
.provider-meta span { display: flex; align-items: center; gap: 4px; }
.provider-meta code {
  background: var(--bg);
  padding: 2px 7px;
  border-radius: 3px;
  font-size: 12px;
  color: var(--text-dim);
  font-family: var(--mono);
}
.provider-models { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.model-tag {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-dim);
}
.health-dot { margin-left: 4px; }
.health-ms { font-size: 10px; color: var(--text-muted); margin-left: 2px; }
.key-ok { color: var(--success); }
.key-warn { color: var(--warning); }

/* ── Modal ── */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(3px);
}
.modal-overlay.active { display: flex; }
.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 92%;
  max-width: 560px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}
.modal h3 { font-size: 18px; font-weight: 600; margin-bottom: 18px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
.form-grid .full { grid-column: 1 / -1; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: 12px; color: var(--text-dim); font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
.form-check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.form-check input[type=checkbox] { width: auto; accent-color: var(--primary); }

/* ── Log panel ── */
.log-panel {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  font-family: var(--mono);
  font-size: 12px;
}
.main-right { position: sticky; top: 70px; align-self: start; }
.log-entry {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(51, 65, 85, 0.4);
  cursor: pointer;
  transition: background var(--transition);
}
.log-entry:hover { background: var(--surface); }
.log-row { display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap; }
.log-time { color: var(--text-muted); flex-shrink: 0; width: 72px; }
.log-status { font-weight: 700; width: 30px; text-align: center; }
.log-ok { color: var(--success); }
.log-err { color: #f87171; }
.log-model { color: var(--violet); }
.log-arrow { color: var(--text-muted); }
.log-provider { color: var(--cyan); }
.log-proto { color: var(--text-muted); font-size: 10px; }
.log-dur { color: var(--text-muted); margin-left: auto; flex-shrink: 0; }
.log-detail {
  display: none;
  padding: 8px 0 4px;
  font-size: 11px;
  color: var(--text-dim);
  border-top: 1px dashed var(--border);
  margin-top: 6px;
  line-height: 1.7;
}
.log-detail.open { display: block; }
.log-detail pre {
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 150px;
  overflow-y: auto;
  background: var(--surface);
  padding: 8px;
  border-radius: var(--radius-sm);
  margin-top: 4px;
  border: 1px solid var(--border);
}
.log-error { color: #f87171; margin-top: 4px; }
.log-filter { display: flex; gap: 4px; }
.log-filter button { font-size: 12px; padding: 4px 10px; }
.log-filter button.active { background: var(--primary); color: #fff; border-color: var(--primary); }

/* ── Toast ── */
.toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 13px 18px;
  border-radius: 8px;
  font-size: 13px;
  opacity: 0;
  transition: all 0.3s;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: var(--shadow);
  transform: translateY(10px);
  pointer-events: none;
}
.toast.show { opacity: 1; transform: translateY(0); pointer-events: auto; }
.toast.success { background: #166534; color: #4ade80; }
.toast.error { background: #7f1d1d; color: #fca5a5; }
.toast.info { background: var(--surface); color: var(--text); border: 1px solid var(--border); }

/* ── Utilities ── */
.empty { text-align: center; color: var(--text-muted); padding: 28px; font-size: 14px; }
.loading { text-align: center; color: var(--text-dim); padding: 20px; font-size: 12px; }
.loading::after {
  content: "";
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-left: 8px;
  vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>

<header>
  <h1>API Hub <span style="font-size:11px;font-weight:400;color:var(--text-muted);margin-left:6px">v${version}</span></h1>
  <div class="header-right">
    <div class="header-stat" id="stat-providers"></div>
    <div class="header-stat" id="stat-models"></div>
    <div class="header-stat"><span class="dot dot-ok"></span>Running</div>
  </div>
</header>

<main>
  <div class="info-card">
    <h3>Quick Start</h3>
    <div class="setup-steps">
      <div class="setup-step">
        <div class="step-num">1</div>
        <div class="step-content">
          <div class="step-title">Gateway URL</div>
          <div class="step-desc">Your API Hub is running at:</div>
          <div style="display:flex;align-items:center;gap:8px">
            <code id="gateway-url" style="background:var(--bg);border:1px solid var(--border);padding:4px 10px;border-radius:4px;font-family:var(--mono);font-size:13px"></code>
            <button class="copy-btn" onclick="copyText(document.getElementById('gateway-url').textContent)">Copy</button>
          </div>
        </div>
      </div>
      <div class="setup-step">
        <div class="step-num">2</div>
        <div class="step-content">
          <div class="step-title">Configure Claude Code</div>
          <div class="step-desc">Add to <code style="background:var(--bg);padding:2px 6px;border-radius:3px;font-size:12px">~/.claude/settings.json</code> env section:</div>
          <div class="step-code" id="config-snippet"><button class="copy-btn" onclick="copyConfig()">Copy</button></div>
        </div>
      </div>
      <div class="setup-step">
        <div class="step-num">3</div>
        <div class="step-content">
          <div class="step-title">Restart Claude Code</div>
          <div class="step-desc">Reopen Claude Code. All requests will route through this gateway.</div>
        </div>
      </div>
    </div>
  </div>

  <div class="main-grid">
    <div class="main-left">
      <!-- Alias Mapping -->
      <section>
        <div class="section-header"><h2>Alias Mapping</h2></div>
        <div style="font-size:12px;color:var(--text-muted);margin:-12px 0 14px">Map haiku/sonnet/opus to any provider model.</div>
        <div class="card" id="aliases-card">
          <div class="alias-row">
            <div class="alias-label haiku">Haiku</div>
            <div class="combo">
              <input type="text" id="alias-haiku" placeholder="Type or select a model..." autocomplete="off">
              <div class="combo-panel" id="panel-haiku"></div>
            </div>
            <div class="alias-provider" id="alias-haiku-provider"></div>
          </div>
          <div class="alias-row">
            <div class="alias-label sonnet">Sonnet</div>
            <div class="combo">
              <input type="text" id="alias-sonnet" placeholder="Type or select a model..." autocomplete="off">
              <div class="combo-panel" id="panel-sonnet"></div>
            </div>
            <div class="alias-provider" id="alias-sonnet-provider"></div>
          </div>
          <div class="alias-row">
            <div class="alias-label opus">Opus</div>
            <div class="combo">
              <input type="text" id="alias-opus" placeholder="Type or select a model..." autocomplete="off">
              <div class="combo-panel" id="panel-opus"></div>
            </div>
            <div class="alias-provider" id="alias-opus-provider"></div>
          </div>
          <div style="margin-top: 12px; display: flex; justify-content: flex-end;">
            <button class="btn-primary" onclick="saveAliases()">Save Aliases</button>
          </div>
        </div>
      </section>

      <!-- Providers -->
      <section>
        <div class="section-header">
          <h2>Providers</h2>
          <div style="display: flex; gap: 6px;">
            <button class="btn-ghost btn-sm" onclick="testAllProviders()">Test All</button>
            <button class="btn-primary btn-sm" onclick="openAddProvider()">+ Add</button>
          </div>
        </div>
        <div id="providers-list"><div class="loading">Loading providers</div></div>
      </section>
    </div>

    <div class="main-right">
      <!-- Request Logs -->
      <section>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:17px;font-weight:600;color:#f1f5f9">Request Logs</h2>
          <button class="btn-ghost btn-sm" id="file-log-btn" onclick="toggleFileLog()">File Log: OFF</button>
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:12px">
          <div class="log-filter">
            <button class="btn-ghost btn-sm active" onclick="setLogFilter('all', this)">All</button>
            <button class="btn-ghost btn-sm" onclick="setLogFilter('ok', this)">OK</button>
            <button class="btn-ghost btn-sm" onclick="setLogFilter('err', this)">Errors</button>
          </div>
          <button class="btn-ghost btn-sm" onclick="clearLogs()">Clear</button>
        </div>
        <div class="log-panel" id="log-panel"><div class="empty">No logs yet</div></div>
      </section>

  </div>
</main>

<footer style="text-align:center;padding:16px 24px;font-size:12px;color:var(--text-muted);border-top:1px solid var(--border)">
  API Hub v${version} &middot; <a href="https://github.com/LeenixP/claude-api-hub" target="_blank" style="color:var(--primary);text-decoration:none">GitHub</a>


</footer>

<!-- Provider Modal -->
<div class="modal-overlay" id="provider-modal">
  <div class="modal">
    <h3 id="modal-title">Add Provider</h3>
    <div class="form-grid">
      <div class="form-group">
        <label>ID <span style="font-weight:400;color:var(--text-muted)">(unique key for routing)</span></label>
        <input type="text" id="f-key" placeholder="e.g. deepseek">
      </div>
      <div class="form-group">
        <label>Display Name</label>
        <input type="text" id="f-name" placeholder="e.g. DeepSeek">
      </div>
      <div class="form-group full">
        <label>Base URL</label>
        <input type="text" id="f-url" placeholder="https://api.deepseek.com/v1">
      </div>
      <div class="form-group full">
        <label>API Key</label>
        <input type="text" id="f-key-val" placeholder="sk-... or \${ENV_VAR}">
      </div>
      <div class="form-group full">
        <label>Models</label>
        <div id="f-models-tags" style="display:flex;flex-wrap:wrap;gap:5px;min-height:32px;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px"></div>
        <div style="display:flex;gap:6px">
          <input type="text" id="f-model-input" placeholder="Type model name and press Enter" style="flex:1">
          <button class="btn-ghost btn-sm" type="button" onclick="addModelTag()">Add</button>
          <button class="btn-ghost btn-sm" type="button" onclick="fetchAndAddModels()">Fetch from API</button>
        </div>
      </div>
      <div class="form-group">
        <label>Default Model</label>
        <input type="text" id="f-default" placeholder="deepseek-chat">
      </div>
      <div class="form-group">
        <label>Prefix <span style="font-weight:400;color:var(--text-muted)">(for routing)</span></label>
        <input type="text" id="f-prefix" placeholder="deepseek-">
      </div>
      <div class="form-group">
        <div class="form-check">
          <input type="checkbox" id="f-enabled" checked>
          <label for="f-enabled">Enabled</label>
        </div>

      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveProvider()">Save</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>


<script>
// ── State ──
let config = null;
let allModels = [];
let fetchedModels = {};
let editingProvider = null;
let logFilter = 'all';
let healthCache = {};

// ── Init ──
async function load() {
  try {
    const [cfgRes, modelsRes] = await Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/v1/models').then(r => r.json())
    ]);
    config = cfgRes;
    allModels = modelsRes.data || [];
    updateStats();
    renderProviders();
    try {
      fetchedModels = await fetch('/api/fetch-models').then(r => r.json());
    } catch (e) {
      fetchedModels = {};
    }
    renderProviders();
    renderAliases();
  } catch (e) {
    toast('Failed to load config', 'error');
  }
}

function updateStats() {
  const pCount = Object.values(config.providers).filter(p => p.enabled).length;
  const mCount = allModels.length;
  document.getElementById('stat-providers').innerHTML = '<b>' + pCount + '</b> providers';
  document.getElementById('stat-models').innerHTML = '<b>' + mCount + '</b> models';
}

// ── Alias Mapping ──
function getProviderModels() {
  const result = {};
  Object.entries(config.providers).forEach(([key, p]) => {
    if (!p.enabled) return;
    const name = p.name || key;
    const configModels = p.models || [];
    const apiModels = fetchedModels[name] || [];
    result[name] = [...new Set([...apiModels, ...configModels])];
  });
  return result;
}

function renderAliases() {
  const aliases = config.aliases || {};
  const providerModels = getProviderModels();
  ['haiku', 'sonnet', 'opus'].forEach(tier => {
    const input = document.getElementById('alias-' + tier);
    const panel = document.getElementById('panel-' + tier);
    const provSpan = document.getElementById('alias-' + tier + '-provider');
    input.value = aliases[tier] || '';

    function buildPanel(filter) {
      let html = '';
      Object.entries(providerModels).forEach(([provider, models]) => {

        const filtered = (models || []).filter(id =>
          !filter || id.toLowerCase().includes(filter.toLowerCase())
        );
        if (filtered.length === 0) return;
        html += '<div class="combo-group-label">' + esc(provider) + '</div>';
        filtered.forEach(id => {
          html += '<div class="combo-item" data-value="' + esc(id) + '">'
            + esc(id) + '<span class="hint">' + esc(provider) + '</span></div>';
        });
      });
      panel.innerHTML = html || '<div style="padding:10px 12px;color:var(--text-muted)">No models found</div>';
      panel.querySelectorAll('.combo-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = item.dataset.value;
          panel.classList.remove('open');
          updateProv();
        });
      });
    }

    function updateProv() {
      const v = input.value.trim();
      let found = '';
      Object.entries(providerModels).forEach(([p, m]) => {
        if ((m || []).includes(v)) found = p;
      });
      provSpan.textContent = found || (v ? 'custom' : '');
    }


    input.addEventListener('focus', () => { buildPanel(input.value); panel.classList.add('open'); });
    input.addEventListener('input', () => { buildPanel(input.value); panel.classList.add('open'); updateProv(); });
    input.addEventListener('blur', () => { setTimeout(() => panel.classList.remove('open'), 180); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { panel.classList.remove('open'); input.blur(); }
    });
    updateProv();
  });
}

async function saveAliases() {
  const aliases = {};
  ['haiku', 'sonnet', 'opus'].forEach(tier => {
    const v = document.getElementById('alias-' + tier).value.trim();
    if (v) aliases[tier] = v;
  });
  try {
    await fetch('/api/aliases', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aliases)
    });
    toast('Aliases saved', 'success');
    load();
  } catch (e) {
    toast('Failed to save', 'error');
  }
}

// ── Providers ──
function renderProviders() {
  const list = document.getElementById('providers-list');
  const entries = Object.entries(config.providers);
  if (entries.length === 0) {
    list.innerHTML = '<div class="empty">No providers configured</div>';
    return;
  }
  list.innerHTML = entries.map(([key, p]) => {
    const h = healthCache[p.name || key];
    const healthDot = h
      ? '<span class="dot health-dot ' + (h.status === 'ok' ? 'dot-ok' : h.status === 'timeout' ? 'dot-warn' : 'dot-err') + '"></span>'
        + (h.latencyMs ? '<span class="health-ms">' + h.latencyMs + 'ms</span>' : '')
      : '';
    const enableBadge = p.enabled
      ? '<span class="badge badge-on">ON</span>'
      : '<span class="badge badge-off">OFF</span>';
    const formatBadge = '<button class="badge ' + (p.passthrough ? 'badge-anthropic' : 'badge-openai')
      + '" onclick="event.stopPropagation();toggleProtocol(\\'' + esc(key) + '\\')" title="Click to switch">'
      + (p.passthrough ? 'Anthropic' : 'OpenAI') + '</button>';
    const configModels = p.models || [];
    const apiModels = fetchedModels[p.name || key] || [];
    const allProviderModels = [...new Set([...apiModels, ...configModels])];
    const models = allProviderModels.map(m => '<span class="model-tag">' + esc(m) + '</span>').join('');
    const prefix = p.prefix ? (Array.isArray(p.prefix) ? p.prefix.join(', ') : p.prefix) : '-';
    const keyStatus = (!p.apiKey || p.apiKey === '***')
      ? '<span class="key-warn">\\u26a0 Missing</span>'
      : '<span class="key-ok">\\u2713 Set</span>';

    return '<div class="card" id="provider-' + esc(key) + '">'
      + '<div class="provider-header">'
        + '<div class="provider-info">'
          + '<div class="provider-title">'
            + '<span class="provider-name">' + esc(p.name || key) + '</span> '
            + enableBadge + ' ' + formatBadge + ' ' + healthDot
          + '</div>'
          + '<div class="provider-url">' + esc(p.baseUrl) + '</div>'
        + '</div>'
        + '<div class="provider-actions">'
          + '<button class="btn-ghost btn-sm" onclick="testProvider(\\'' + esc(key) + '\\')">Test</button>'
          + '<button class="btn-ghost btn-sm" onclick="editProvider(\\'' + esc(key) + '\\')">Edit</button>'
          + '<button class="btn-danger btn-sm" onclick="deleteProvider(\\'' + esc(key) + '\\')">Del</button>'
        + '</div>'
      + '</div>'
      + '<div class="provider-meta">'
        + '<span>Prefix: <code>' + esc(prefix) + '</code></span>'
        + '<span>Default: <code>' + esc(p.defaultModel || '-') + '</code></span>'
        + '<span>Key: ' + keyStatus + '</span>'
      + '</div>'
      + '<div class="provider-models">' + models + '</div>'
    + '</div>';
  }).join('');
}

// ── Provider Test ──
async function testProvider(key) {
  const p = config.providers[key];
  const model = p.defaultModel || (p.models && p.models[0]);
  if (!model) { toast('No model configured', 'error'); return; }
  toast('Testing ' + p.name + ' (' + model + ')...', 'info');
  const start = Date.now();
  try {
    const res = await fetch('/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
        max_tokens: 16,
        stream: false
      })
    });
    const latency = Date.now() - start;
    const body = await res.json();
    healthCache[p.name || key] = {
      status: res.ok ? 'ok' : 'error',
      latencyMs: latency,
      error: res.ok ? undefined : (body?.error?.message || '' + res.status)
    };

    renderProviders();
    if (res.ok) {
      const text = (body.content || []).map(b => b.text || '').join('').slice(0, 80);
      toast(p.name + ': OK (' + latency + 'ms) — "' + text + '"', 'success');
    } else {
      toast(p.name + ': ' + res.status + ' ' + (body?.error?.message || ''), 'error');
    }
  } catch (e) {
    healthCache[p.name || key] = { status: 'error', latencyMs: Date.now() - start, error: e.message };
    renderProviders();
    toast(p.name + ': ' + e.message, 'error');
  }
}

async function testAllProviders() {
  toast('Testing all providers...', 'info');
  const entries = Object.entries(config.providers).filter(([, p]) => p.enabled);
  await Promise.all(entries.map(([key]) => testProvider(key)));
}

async function toggleProtocol(key) {
  const p = config.providers[key];
  const newVal = !p.passthrough;
  try {
    await fetch('/api/config/providers/' + encodeURIComponent(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passthrough: newVal })
    });
    toast(p.name + ': ' + (newVal ? 'Anthropic API' : 'OpenAI Compatible'), 'success');
    load();
  } catch (e) {
    toast('Switch failed', 'error');
  }
}

// ── Model Tags ──
let modalModels = [];

function renderModelTags() {
  const container = document.getElementById('f-models-tags');
  container.innerHTML = modalModels.map((m, i) =>
    '<span class="model-tag" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px">'
    + esc(m)
    + '<span style="cursor:pointer;color:var(--text-muted);font-size:14px;line-height:1" onclick="removeModelTag(' + i + ')">&times;</span>'
    + '</span>'
  ).join('');
}

function addModelTag() {
  const input = document.getElementById('f-model-input');
  const val = input.value.trim();
  if (val && !modalModels.includes(val)) {
    modalModels.push(val);
    renderModelTags();
  }
  input.value = '';
  input.focus();
}

function removeModelTag(i) {
  modalModels.splice(i, 1);
  renderModelTags();
}

async function fetchAndAddModels() {
  const baseUrl = document.getElementById('f-url').value.trim();
  const apiKey = document.getElementById('f-key-val').value.trim();
  const key = document.getElementById('f-key').value.trim();
  if (!baseUrl) { toast('Enter Base URL first', 'error'); return; }
  const existingProvider = editingProvider ? config.providers[editingProvider] : null;
  const realKey = apiKey || (existingProvider ? existingProvider.apiKey : '');
  if (!realKey || realKey === '***') { toast('Enter API Key first', 'error'); return; }
  toast('Fetching models...', 'info');
  try {
    const isPassthrough = existingProvider ? existingProvider.passthrough : false;
    let url, headers;
    if (isPassthrough) {
      url = baseUrl + '/v1/models';
      headers = { 'x-api-key': realKey, 'anthropic-version': '2023-06-01' };
    } else {
      url = baseUrl + '/models';
      headers = { 'Authorization': 'Bearer ' + realKey };
    }
    const res = await fetch('/api/health/providers').then(r => r.json());
    const name = existingProvider ? (existingProvider.name || key) : key;
    if (fetchedModels[name]) {
      fetchedModels[name].forEach(m => { if (!modalModels.includes(m)) modalModels.push(m); });
    }
    renderModelTags();
    toast('Models fetched', 'success');
  } catch (e) {
    toast('Fetch failed: ' + e.message, 'error');
  }
}

// Enter key to add model tag
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target && e.target.id === 'f-model-input') {
    e.preventDefault();
    addModelTag();
  }
});

// ── Provider CRUD ──
function openAddProvider() {
  editingProvider = null;
  modalModels = [];
  document.getElementById('modal-title').textContent = 'Add Provider';
  ['f-key', 'f-name', 'f-url', 'f-key-val', 'f-default', 'f-prefix', 'f-model-input'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-key').disabled = false;
  document.getElementById('f-enabled').checked = true;
  renderModelTags();
  document.getElementById('provider-modal').classList.add('active');
}

function editProvider(key) {
  editingProvider = key;
  const p = config.providers[key];
  const apiModels = fetchedModels[p.name || key] || [];
  modalModels = [...new Set([...apiModels, ...(p.models || [])])];
  document.getElementById('modal-title').textContent = 'Edit: ' + (p.name || key);
  document.getElementById('f-key').value = key;
  document.getElementById('f-key').disabled = true;
  document.getElementById('f-name').value = p.name || '';
  document.getElementById('f-url').value = p.baseUrl || '';
  document.getElementById('f-key-val').value = '';
  document.getElementById('f-key-val').placeholder = p.apiKey ? 'Leave blank to keep current' : 'Enter API key';
  document.getElementById('f-default').value = p.defaultModel || '';
  document.getElementById('f-prefix').value = Array.isArray(p.prefix) ? p.prefix.join(', ') : (p.prefix || '');
  document.getElementById('f-enabled').checked = p.enabled !== false;
  document.getElementById('f-model-input').value = '';
  renderModelTags();
  document.getElementById('provider-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('provider-modal').classList.remove('active');
}

// ESC to close modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

async function saveProvider() {
  const key = document.getElementById('f-key').value.trim();
  const name = document.getElementById('f-name').value.trim();
  const baseUrl = document.getElementById('f-url').value.trim();
  const apiKey = document.getElementById('f-key-val').value.trim();
  const models = [...modalModels];
  const defaultModel = document.getElementById('f-default').value.trim();
  const prefixStr = document.getElementById('f-prefix').value.trim();
  const enabled = document.getElementById('f-enabled').checked;
  const prefix = prefixStr.includes(',')
    ? prefixStr.split(',').map(s => s.trim()).filter(Boolean)
    : prefixStr;

  if (!key || !name || !baseUrl || models.length === 0 || !defaultModel) {
    toast('Please fill all required fields', 'error');
    return;
  }

  try {
    if (editingProvider) {
      const body = { name, baseUrl, models, defaultModel, enabled, prefix: prefix || undefined };
      if (apiKey) body.apiKey = apiKey;
      await fetch('/api/config/providers/' + encodeURIComponent(key), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      toast('Provider updated', 'success');
    } else {
      if (!apiKey) { toast('API Key is required for new providers', 'error'); return; }
      await fetch('/api/config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, baseUrl, apiKey, models, defaultModel, enabled, passthrough: false, prefix: prefix || undefined })
      });
      toast('Provider added', 'success');
    }
    closeModal();
    load();
  } catch (e) {
    toast('Save failed', 'error');
  }
}

async function deleteProvider(key) {

  if (!confirm('Delete provider "' + key + '"?')) return;
  try {
    await fetch('/api/config/providers/' + encodeURIComponent(key), { method: 'DELETE' });
    toast('Provider deleted', 'success');
    load();
  } catch (e) {
    toast('Delete failed', 'error');
  }
}

// ── Request Logs ──
let openLogIds = new Set();

async function loadLogs() {
  try {
    const logs = await fetch('/api/logs').then(r => r.json());
    const panel = document.getElementById('log-panel');
    if (!logs || logs.length === 0) {
      panel.innerHTML = '<div class="empty">No logs yet</div>';
      return;
    }
    const filtered = logFilter === 'all' ? logs
      : logFilter === 'ok' ? logs.filter(l => l.status >= 200 && l.status < 300)
      : logs.filter(l => l.status >= 300);
    if (filtered.length === 0) {
      panel.innerHTML = '<div class="empty">No matching logs</div>';
      return;
    }
    panel.innerHTML = filtered.map((l, i) => {
      const ok = l.status >= 200 && l.status < 300;
      const time = new Date(l.time).toLocaleTimeString();
      const isOpen = openLogIds.has(l.requestId);
      const cm = l.claudeModel || '';
      const model = cm !== l.resolvedModel
        ? esc(cm) + ' \\u2192 ' + esc(l.resolvedModel)
        : esc(cm);

      const detail = '<div class="log-detail' + (isOpen ? ' open' : '') + '" id="log-d-' + i + '">'
        + '<div><b>Request ID:</b> ' + esc(l.requestId || '-') + '</div>'
        + '<div><b>Time:</b> ' + new Date(l.time).toLocaleString() + '</div>'
        + '<div><b>Target:</b> ' + esc(l.targetUrl || '-') + '</div>'
        + '<div><b>Provider:</b> ' + esc(l.provider) + ' [' + esc(l.protocol) + ']</div>'
        + '<div><b>Model:</b> ' + model + '</div>'
        + '<div><b>Stream:</b> ' + (l.stream ? 'Yes' : 'No') + ' | <b>Duration:</b> ' + l.durationMs + 'ms</div>'
        + (l.error ? '<div class="log-error"><b>Error:</b> ' + esc(l.error) + '</div>' : '')
        + (l.logFile ? '<div style="margin-top:6px"><b>Full log:</b> <code style="font-size:11px;background:var(--bg);padding:2px 6px;border-radius:3px">' + esc(l.logFile) + '</code></div>' : '')
        + '</div>';

      return '<div class="log-entry" data-rid="' + esc(l.requestId || '') + '" onclick="toggleLogDetail(' + i + ',this)">'
        + '<div class="log-row">'
          + '<span class="log-status ' + (ok ? 'log-ok' : 'log-err') + '">' + l.status + '</span>'
          + '<span class="log-model" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px" title="' + model + '">' + model + '</span>'
          + '<span class="log-arrow">\\u2192</span><span class="log-provider">' + esc(l.provider) + '</span>'
          + '<span class="log-dur">' + l.durationMs + 'ms</span>'
        + '</div>'
        + detail
      + '</div>';
    }).join('');
  } catch (e) { /* ignore */ }
}

function toggleLogDetail(i, entry) {
  const el = document.getElementById('log-d-' + i);
  if (!el) return;
  el.classList.toggle('open');
  const rid = entry ? entry.dataset.rid : '';
  if (rid) {
    if (el.classList.contains('open')) openLogIds.add(rid);
    else openLogIds.delete(rid);
  }
}

function setLogFilter(f, btn) {
  logFilter = f;

  document.querySelectorAll('.log-filter button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadLogs();
}

async function clearLogs() {
  try {
    await fetch('/api/logs/clear', { method: 'POST' });
    loadLogs();
    toast('Logs cleared', 'success');
  } catch (e) {
    toast('Clear failed', 'error');
  }
}

async function toggleFileLog() {
  try {
    const res = await fetch('/api/logs/file-toggle', { method: 'PUT' }).then(r => r.json());
    const btn = document.getElementById('file-log-btn');
    btn.textContent = 'File Log: ' + (res.enabled ? 'ON' : 'OFF');
    btn.style.background = res.enabled ? 'var(--success)' : '';
    btn.style.color = res.enabled ? '#fff' : '';
    btn.style.borderColor = res.enabled ? 'var(--success)' : '';
    toast('File logging ' + (res.enabled ? 'enabled' : 'disabled'), 'success');
  } catch (e) {
    toast('Toggle failed', 'error');
  }
}

async function loadFileLogStatus() {
  try {
    const res = await fetch('/api/logs/file-status').then(r => r.json());
    const btn = document.getElementById('file-log-btn');
    btn.textContent = 'File Log: ' + (res.enabled ? 'ON (' + res.fileCount + ')' : 'OFF');
    btn.style.background = res.enabled ? 'var(--success)' : '';
    btn.style.color = res.enabled ? '#fff' : '';
    btn.style.borderColor = res.enabled ? 'var(--success)' : '';
  } catch (e) {}
}

// ── Utilities ──
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (type || 'info');
  const dur = type === 'error' ? 5000 : 2500;
  setTimeout(() => { el.className = 'toast'; }, dur);
}

function copyText(t) {
  navigator.clipboard.writeText(t)
    .then(() => toast('Copied', 'success'))
    .catch(() => toast('Copy failed', 'error'));
}

function copyConfig() {
  copyText(JSON.stringify({ env: { ANTHROPIC_BASE_URL: window.location.origin } }, null, 2));
}

function initQuickStart() {
  const url = window.location.origin;
  document.getElementById('gateway-url').textContent = url;
  const snippet = document.getElementById('config-snippet');
  const json = JSON.stringify({ env: { ANTHROPIC_BASE_URL: url } }, null, 2);
  snippet.insertBefore(document.createTextNode(json), snippet.firstChild);
}

// ── Boot ──
initQuickStart();
load();
loadLogs();
loadFileLogStatus();
setInterval(loadLogs, 2000);
</script>
</body>
</html>`;
}
