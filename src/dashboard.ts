interface DashProvider {
  name: string;
  config: { baseUrl: string; defaultModel: string; models: string[]; enabled: boolean };
}

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #0f1117;
  color: #c9d1d9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

a { color: #58a6ff; text-decoration: none; }
a:hover { text-decoration: underline; }

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

header {
  text-align: center;
  padding: 40px 0 32px;
}

h1 {
  font-size: 2.4rem;
  font-weight: 700;
  background: linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 8px;
}

.subtitle {
  color: #8b949e;
  font-size: 1rem;
}

h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: #e6edf3;
  margin: 32px 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge {
  font-size: 0.72rem;
  font-weight: 500;
  background: #21262d;
  border: 1px solid #30363d;
  color: #8b949e;
  padding: 2px 8px;
  border-radius: 20px;
}

/* Stats bar */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 8px;
}

.stat {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
  padding: 18px 16px;
  text-align: center;
}

.stat-num {
  font-size: 1.8rem;
  font-weight: 700;
  color: #58a6ff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 2.2rem;
}

.stat-label {
  font-size: 0.78rem;
  color: #8b949e;
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Provider grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
  padding: 16px;
  transition: border-color 0.2s;
}

.card:hover { border-color: #58a6ff44; }

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.card-head strong {
  color: #e6edf3;
  font-size: 0.95rem;
  flex: 1;
}

.latency {
  font-size: 0.75rem;
  color: #8b949e;
  font-family: "SFMono-Regular", Consolas, monospace;
}

.card-meta {
  font-size: 0.8rem;
  color: #8b949e;
  margin-bottom: 4px;
  word-break: break-all;
}

.card-meta code {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 0.78rem;
  color: #bc8cff;
  font-family: "SFMono-Regular", Consolas, monospace;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.tag {
  font-size: 0.72rem;
  padding: 3px 8px;
  border-radius: 20px;
  border: 1px solid #30363d;
  backgroun262d;
  color: #8b949e;
  cursor: pointer;
  transition: all 0.15s;
  font-family: "SFMono-Regular", Consolas, monospace;
}

.tag:hover {
  border-color: #58a6ff;
  color: #58a6ff;
  background: #58a6ff11;
}

/* Dot indicator */
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #30363d;
  display: inline-block;
  flex-shrink: 0;
  transition: background 0.3s;
}

.dot.green { background: #3fb950; box-shadow: 0 0 6px #3fb95066; }
.dot.red   { background: #f85149; box-shadow: 0 0 6px #f8514966; }

/* Test panel */
.test-panel {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
  padding: 16px;
}

.test-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

select, input[type="text"] {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  padding: 8px 12px;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.2s;
}

select:focus, input[type="text"]:focus {
  border-color: #58a6ff;
}

select { min-width: 220px; }
input[type="text"] { flex: 1; min-width: 200px; }

button {
  background: #238636;
  border: 1a043;
  border-radius: 6px;
  color: #fff;
  padding: 8px 20px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

button:hover { background: #2ea043; }
button:disabled { background: #21262d; border-color: #30363d; color: #8b949e; cursor: not-allowed; }

.test-output {
  margin-top: 14px;
  min-height: 60px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 12px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.82rem;
  white-space: pre-wrap;
  word-break: break-word;
  color: #c9d1d9;
  display: none;
}

.test-output.visible { display: block; }

.test-meta {
  font-size: 0.75rem;
  color: #8b949e;
  margin-top: 8px;
  display: flex;
  gap: 16px;
}

.test-meta span { display: flex; align-items: center; gap: 4px; }

/* Log panel */
.log-panel {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
  overflow: hidden;
}

.log-entries {
  max-height: 260px;
  overflow-y: auto;
}

.log-entries::-webkit-scrollbar { width: 6px; }
.log-entries::-webkit-scrollbar-track { background: ; }
.log-entries::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

.log-entry {
  display: grid;
  grid-template-columns: 80px 1fr 60px 80px;
  gap: 12px;
  padding: 9px 16px;
  border-bottom: 1px solid #21262d;
  font-size: 0.8rem;
  align-items: center;
}

.log-entry:last-child { border-bottom: none; }
.log-entry:hover { background: #1c2128; }

.log-time { color: #8b949e; font-family: "SFMono-Regular", Consolas, monospace; }
.log-model { color: #c9d1d9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.75rem; }
.log-status { text-align: center; font-weight: 600; font-family: "SFMono-Regular", Consolas, monospace; }
.log-status.ok  { color: #3fb950; }
.log-status.err { color: #f85149; }
.log-dur { color: #8b949e; text-align: right; font-family: "SFMono-Regular", Consolas, monospace; }

.log-empty {
  padding: 24px 16px;
  color: #8b949e;
  font-size: 0.82rem;
  text-align: center;
}

/* Endpoints */
.endpoints {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
  overflow: hidden;
}

.ep {
  display: flex;
  align-items: center;px;
  padding: 11px 16px;
  border-bottom: 1px solid #21262d;
  font-size: 0.85rem;
}

.ep:last-child { border-bottom: none; }

.method {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  font-family: "SFMono-Regular", Consolas, monospace;
  min-width: 44px;
  text-align: center;
}

.method.post { background: #1f3a5f; color: #58a6ff; border: 1px solid #1f6feb; }
.method.get  { background: #1a3a2a; color: #3fb950; border: 1px solid #2ea043; }

.ep-path {
  font-family: "SFMono-Regular", Consolas, monospace;
  color: #e6edf3;
  font-size: 0.82rem;
}

.ep-desc { color: #8b949e; font-size: 0.8rem; margin-left: auto; }

/* Quick start */
.qs {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qs-label {
  font-size: 0.82rem;
  color: #8b949e;
  margin-top: 8px;
}

.qs-label:first-child { margin-top: 0; }

.qs code {
  display: block;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 10px 14px;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.82rem;
  color: #c9d1d9;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  position: relative;
}

.qs code:hover {
  border-color: #58a6ff;
  background: #58a6ff08;
}

.qs code::after {
  content: "click to copy";
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.68rem;
  color: #8b949e;
  opacity: 0;
  transition: opacity 0.2s;
}

.qs code:hover::after { opacity: 1; }
.qs code.copied { border-color: #3fb950; color: #3fb950; }

footer {
  text-align: center;
  margin-top: 48px;
  color: #8b949e;
  font-size: 0.8rem;
}

@media (max-width: 640px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .grid  { grid-template-columns: 1fr; }
  .test-row { flex-direction: column; }
  select { min-width: unset; width: 100%; }
  .log-entry { grid-template-columns: 70px 1fr 50px 60px; gap: 8px; }
  .ep-desc { display: none; }
  h1 { font-size: 1.8rem; }
}
`;

function JS(providerJson: string): string {
  return `
const PROVIDERS = ${providerJson};
let reqCount = 0;
let logCount = 0;

function checkHealth() {
  const badge = document.getElementById('health-badge');
  PROVIDERS.forEach((p, i) => {
    const dot = document.getElementById('dot-' + i);
    const lat = document.getElementById('latency-' + i);
    const t0 = Date.now();
    fetch('/health')    .then(r => {
        const ms = Date.now() - t0;
        if (dot) { dot.className = 'dot ' + (r.ok ? 'green' : 'red'); }
        if (lat) { lat.textContent = ms + 'ms'; }
        if (badge && i === 0) { badge.textContent = r.ok ? 'healthy' : 'degraded'; }
      })
      .catch(() => {
        if (dot) { dot.className = 'dot red'; }
        if (badge && i === 0) { badge.textContent = 'unreachable'; }
      });
  });
}

function testModel(model) {
  const sel = document.getElementById('test-model');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === model) { sel.selectedIndex = i; break; }
    }
  }
  document.getElementById('test-input') && document.getElementById('test-input').focus();
}

function runTest() {
  const sel   = document.getElementById('test-model');
  const input = document.getElementById('test-input');
  const out   = document.getElementById('test-output');
  const btn   = document.getElementById('test-btn');
  const meta  = document.getElementById('test-meta');

  if (!sel || !input || !out || !btn) return;

  const model = sel.value;
  const text  = input.value.trim();
  if (!text) return;

  btn.diled = true;
  btn.textContent = 'Sendin;
  out.className = 'test-output visible';
  out.textContent = 'Waiting for response...';
  if (meta) meta.innerHTML = '';

  const t0 = Date.now();

  fetch('/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'dashboard', 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: text }]
    })
  })
  .then(r => {
    const ms = Date.now() - t0;
    addLog(model, r.status, ms);
    return r.json().then(data => ({ data, status: r.status, ms }));
  })
  .then(({ data, status, ms }) => {
    if (data.content && data.content[0]) {
      out.textContent = data.content[0].text || JSON.stringify(data, null, 2);
    } else if (data.error) {
      out.textContent = 'Error: ' + (data.error.message || JSON.stringify(data.error));
    } else {
      out.textContent = JSON.stringify(data, null, 2);
    }
    if (meta) {
      const usage = data.usage || {};
      meta.innerHTML =
        '<span>Time: ' + ms + 'ms</span>' +
        '<span>Status: ' + status + '</span>' +
        (usage.input_tokens  ? '<span>In: '  + usage.input_tokens  + ' tok</span>' : '') +
        (usage.output_tokens ? '<span>Out: ' + usage.output_tokens + ' tok</span>' : '');
    }
  })
  .catch(err => {
    const ms = Date.now() - t0;
    addLog(model, 0, ms);
    out.textContent = 'Request failed: ' + err.message;
  })
  .finally(() => {
    btn.disabled = false;
    btn.textContent = 'Send';
  });
}

function addLog(model, status, ms) {
  reqCount++;
  logCount++;
  const countEl = document.getElementById('req-count');
  if (countEl) countEl.textContent = reqCount;
  const logCountEl = document.getElementById('log-count');
  if (logCountEl) logCountEl.textContent = logCount;

  const entries = document.getElementById('log-entries');
  if (!entries) return;

  const empty = entries.querySelector('.log-empty');
  if (empty) empty.remove();

  const now = new Date();
  const time = now.toTimeString().slice(0, 8);
  const ok = status >= 200 && status < 300;

  const row = document.createElement('div');
  row.className = 'log-entry';
  row.innerHTML =
    '<span class="log-time">' + time + '</span>' +
    '<span class="log-model">' + model + '</span>' +
    '<span class="log-status ' + (ok ? 'ok' : 'err') + '">' + (status || 'ERR') + '</span>' +
    '<span class="log-dur">' + ms + 'ms</span>';

  entries.insertBefore(row, entries.firstChild);

  // Keep max 50 entries
  const rows = entries.querySelectorAll('.log-entry');
  if (rows.length > 50) rows[rows.length - 1].remove();
}

function copyText(el) {
  const text = el.textContent || el.innerText;
  navigator.clipboard.writeText(text.replace(/click to copy$/, '').trim()).then(() => {
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1500);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChilta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1500);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setInterval(checkHealth, 30000);

  const input = document.getElementById('test-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runTest(); }
    });
  }
});
`;
}

export function dashboardHtml(providers: DashProvider[], host: string): string {
  const totalModels = providers.reduce((s, p) => s + p.config.models.length, 0);

  const providerCards = providers.map((p, i) => {
    const modelTags = p.config.models.map(m =>
      `<span class="tag model-tag" onclick="testModel('${m.replace(/'/g, "\\'")}')">${m}</span>`
    ).join('');
    return `<div class="card" id="provider-${i}">
      <div class="card-head">
        <span class="dot" id="dot-${i}"></span>
        <strong>${p.name}</strong>
        <span class="latency" id="latency-${i}"></span>
      </div>
      <div class="card-meta">${p.config.baseUrl}</div>
      <div class="card-meta">Default: <code>${p.config.defaultModel}</code></div>
      <div class="tags">${modelTags}</div>
    </div>`;
  }).join('');

  const modelOptions = providers
    .flatMap(p => p.config.models)
    .map(m => `<option value="${m}">${m}</option>`)
    .join('');

  const providerJson = JSON.stringify(providers.map(p => ({
    name: p.name, baseUrl: p.config.baseUrl, models: p.config.models,
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude API Hub</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Claude API Hub</h1>
    <div class="subtitle">Multi-provider API gateway for Claude Code</div>
  </header>

  <div class="stats">
    <div class="stat">
      <div class="stat-num">${providers.length}</div>
      <div class="stat-label">Providers</div>
    </div>
    <div class="stat">
      <div class="stat-num">${totalModels}</div>
      <div class="stat-label">Models</div>
    </div>
    <div class="stat">
      <div class="stat-num" id="req-count">0</div>
      <div class="stat-label">Requests</di </div>
    <div class="stat">
      <div class="stat-num"><span class="dot" id="gateway-dot"></span></div>
      <div class="stat-label">Gateway</div>
    </div>
  </div>

  <h2>Providers <span class="badge" id="health-badge">checking...</span></h2>
  <div class="grid">${providerCards}</div>

  <h2>Test Model <span class="badge">interactive</span></h2>
  <div class="test-panel">
    <div class="test-row">
      <select id="test-model">${modelOptions}</select>
      <input id="test-input" type="text" placeholder="Type a message..." value="Hellone sentence.">
      <button id= onclick="runTest()">Send</button>
    </div>
    <div class="test-output" id="test-output"></div>
    <div class="test-meta" id="test-meta"></div>
  </div>

  <h2>Request Log <span class="badge" id="log-count">0</span></h2>
  <div class="log-panel">
    <div class="log-entries" id="log-entries">
      <div class="log-empty">No requests yet. Test a model above or use the API.</div>
    </div>
  </div>

  <h2>API Endpoints</h2>
  <div class="endpoints">
    <div class="ep">
      <span class="method post">POST</span>
      <span class="ep-path">/v1/messages</span>
      <span class="ep-desc Messages API</span>
    </div>
    <div class="ep">
      <span class="method get">GET</span>
      <span class="ep-path">/v1/models</span>
      <span class="ep-desc">List all models</span>
    </div>
    <div class="ep">
      <span class="method get">GET</span>
      <span class="ep-path">/health</span>
      <span class="ep-desc">Health check</span>
    </div>
  </div>

  <h2>Quick Start</h2>
  <div class="qs">
    <div class="qs-label">1. Set gateway URL in Claude Code:</div>
    <code onclick="copyText(this)">ANTHROPIC_BASE_URL=http://${host}</code>
    <div class="qs-label">2. Use any model:</div>
    <code onclick="copyText(this)">claude --model ${providers[0]?.config.models[0] ?? 'your-model'} -p "hello"</code>
    <code onclick="copyText(this)">claude --model ${providers[0]?.config.defaultModel ?? 'default-model'} -p "hello"</code>
    <code onclick="copyText(this)">ANTHROPIC_BASE_URL=http://${host} claude -p "hello"</code>
  </div>

  <footer><a href="https://github.com/LeenixP/claude-api-hub">GitHub</a> &middot; claude-api-hub</footer>
</div>
<script>${JS(providerJson)}</script>
</body>
</html>`;
}
