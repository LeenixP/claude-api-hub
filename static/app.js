// ── Theme ──
function toggleTheme() {
  const html = document.documentElement;
  html.classList.add('theme-transition');
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.querySelector('.theme-toggle').textContent = next === 'dark' ? '\u263E' : '\u2600';
  setTimeout(() => html.classList.remove('theme-transition'), 350);
}
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.querySelector('.theme-toggle');
    if (btn) btn.textContent = saved === 'dark' ? '\u263E' : '\u2600';
  }
})();

// ── Debounce ──
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
const debouncedLoadLogs = debounce(loadLogs, 300);

// ── Stat Animation ──
function animateValue(el, end) {
  const start = parseInt(el.textContent) || 0;
  if (start === end) { el.textContent = end; return; }
  const range = end - start;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / 400, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + range * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Stats ──
function updateStats(logs) {
  const total = logs.length;
  const ok = logs.filter(l => l.status >= 200 && l.status < 300).length;
  const rate = total > 0 ? ((ok / total) * 100).toFixed(1) + '%' : '-';
  const avgMs = total > 0 ? Math.round(logs.reduce((s, l) => s + (l.durationMs || 0), 0) / total) + 'ms' : '-';
  const totalTokens = logs.reduce((s, l) => s + (l.inputTokens || 0) + (l.outputTokens || 0), 0);
  const el = (id) => document.getElementById(id);
  if (el('stat-total-req')) animateValue(el('stat-total-req'), total);
  if (el('stat-success-rate')) el('stat-success-rate').textContent = rate;
  if (el('stat-avg-latency')) el('stat-avg-latency').textContent = avgMs;
  if (el('stat-error-count')) animateValue(el('stat-error-count'), total - ok);
  if (el('stat-total-tokens')) {
    if (totalTokens > 0) {
      el('stat-total-tokens').textContent = totalTokens > 1000 ? (totalTokens / 1000).toFixed(1) + 'K' : totalTokens.toString();
    } else {
      el('stat-total-tokens').textContent = '-';
    }
  }
}

// ── Charts ──
let chartRangeHours = 1;
let chartBuckets = [];
let chartErrBuckets = [];
let chartBucketMs = 0;
let chartCutoff = 0;

function setChartRange(hours, btn) {
  chartRangeHours = hours;
  document.querySelectorAll('#chart-range button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function setupChartTooltip(canvas, tooltip) {
  if (!canvas || !tooltip) return;
  let overlayCanvas = document.getElementById('trend-overlay');
  if (!overlayCanvas) {
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'trend-overlay';
    overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
    canvas.parentElement.appendChild(overlayCanvas);
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const padL = 30, padR = 8, padT = 10, padB = 20;
    const plotW = rect.width - padL - padR;
    const plotH = rect.height - padT - padB;
    const idx = Math.floor(((x - padL) / plotW) * chartBuckets.length);

    // Draw crosshair
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width = rect.width * dpr;
    overlayCanvas.height = rect.height * dpr;
    const octx = overlayCanvas.getContext('2d');
    octx.scale(dpr, dpr);
    octx.clearRect(0, 0, rect.width, rect.height);

    if (idx >= 0 && idx < chartBuckets.length && x >= padL && x <= rect.width - padR) {
      const stepX = plotW / (chartBuckets.length - 1 || 1);
      const snapX = padL + idx * stepX;
      const max = Math.max(...chartBuckets, 1);
      const snapY = padT + plotH - (chartBuckets[idx] / max) * plotH;

      // Vertical line
      octx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      octx.lineWidth = 1;
      octx.setLineDash([3, 3]);
      octx.beginPath(); octx.moveTo(snapX, padT); octx.lineTo(snapX, padT + plotH); octx.stroke();
      // Horizontal line
      octx.beginPath(); octx.moveTo(padL, snapY); octx.lineTo(rect.width - padR, snapY); octx.stroke();
      octx.setLineDash([]);
      // Dot
      octx.beginPath(); octx.arc(snapX, snapY, 4, 0, Math.PI * 2);
      octx.fillStyle = '#3B82F6'; octx.fill();
      octx.strokeStyle = '#fff'; octx.lineWidth = 1.5; octx.stroke();

      const time = new Date(chartCutoff + idx * chartBucketMs);
      const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const ok = chartBuckets[idx] - chartErrBuckets[idx];
      tooltip.innerHTML = '<div style="color:var(--text);font-weight:600;margin-bottom:3px">' + timeStr + '</div>'
        + '<div><span style="color:var(--success)">\u25CF</span> OK: ' + ok + '</div>'
        + '<div><span style="color:var(--danger)">\u25CF</span> Errors: ' + chartErrBuckets[idx] + '</div>'
        + '<div style="color:var(--text-dim);border-top:1px solid var(--border);margin-top:3px;padding-top:3px">Total: ' + chartBuckets[idx] + '</div>';
      tooltip.style.display = 'block';
      const tx = snapX + 16 > rect.width - 130 ? snapX - 140 : snapX + 16;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = Math.max(8, snapY - 30) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  });
  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    const octx = overlayCanvas.getContext('2d');
    octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  });
}

let tokenBuckets = { input: [], output: [], bucketMs: 0, cutoff: 0 };

function setupTokenTooltip(canvas) {
  if (!canvas) return;
  let tip = document.getElementById('token-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'token-tooltip';
    tip.style.cssText = 'display:none;position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:11px;pointer-events:none;z-index:10;box-shadow:var(--shadow)';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(tip);
  }

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padL = 8, padR = 8;
    const plotW = rect.width - padL - padR;
    const count = tokenBuckets.input.length;
    if (count === 0) { tip.style.display = 'none'; return; }
    const barW = plotW / count;
    const idx = Math.floor((x - padL) / barW);
    if (idx < 0 || idx >= count) { tip.style.display = 'none'; return; }

    const inTok = tokenBuckets.input[idx];
    const outTok = tokenBuckets.output[idx];
    const time = new Date(tokenBuckets.cutoff + idx * tokenBuckets.bucketMs);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    tip.innerHTML = '<div style="color:var(--text);font-weight:600;margin-bottom:3px">' + timeStr + '</div>'
      + '<div><span style="color:rgba(34,211,238,0.9)">\u25CF</span> Input: ' + inTok.toLocaleString() + '</div>'
      + '<div><span style="color:rgba(168,85,250,0.9)">\u25CF</span> Output: ' + outTok.toLocaleString() + '</div>';
    tip.style.display = 'block';
    const tx = Math.min(x + 12, rect.width - 120);
    tip.style.left = tx + 'px';
    tip.style.top = '8px';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

function drawTrendChart(logs) {
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;

  const now = Date.now();
  const rangeMs = chartRangeHours * 3600000;
  chartCutoff = now - rangeMs;
  const bucketCount = Math.min(60, chartRangeHours * 12);
  chartBucketMs = rangeMs / bucketCount;
  chartBuckets = new Array(bucketCount).fill(0);
  chartErrBuckets = new Array(bucketCount).fill(0);

  for (const l of logs) {
    const t = new Date(l.time).getTime();
    if (t < chartCutoff) continue;
    const idx = Math.min(Math.floor((t - chartCutoff) / chartBucketMs), bucketCount - 1);
    chartBuckets[idx]++;
    if (l.status >= 300) chartErrBuckets[idx]++;
  }

  const max = Math.max(...chartBuckets, 1);
  const padL = 30, padR = 8, padT = 10, padB = 20;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const stepX = plotW / (bucketCount - 1 || 1);

  ctx.clearRect(0, 0, w, h);
  const style = getComputedStyle(document.documentElement);
  const gridColor = style.getPropertyValue('--border').trim();
  const textMuted = style.getPropertyValue('--text-muted').trim();

  // Y-axis grid + labels
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) {
    const y = padT + (plotH / 3) * i;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = textMuted;
    ctx.fillText(Math.round(max - (max / 3) * i).toString(), padL - 6, y + 3);
  }

  // X-axis time labels
  ctx.textAlign = 'center';
  const labelCount = Math.min(6, bucketCount);
  const labelStep = Math.floor(bucketCount / labelCount);
  for (let i = 0; i < bucketCount; i += labelStep) {
    const x = padL + i * stepX;
    const time = new Date(chartCutoff + i * chartBucketMs);
    ctx.fillStyle = textMuted;
    ctx.fillText(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x, h - 4);
  }

  // Area chart - success (blue gradient)
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  for (let i = 0; i < bucketCount; i++) {
    const x = padL + i * stepX;
    const y = padT + plotH - (chartBuckets[i] / max) * plotH;
    if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(padL + (bucketCount - 1) * stepX, padT + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
  grad.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Line on top
  ctx.beginPath();
  for (let i = 0; i < bucketCount; i++) {
    const x = padL + i * stepX;
    const y = padT + plotH - (chartBuckets[i] / max) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#3B82F6';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Error area (red gradient)
  const hasErrors = chartErrBuckets.some(v => v > 0);
  if (hasErrors) {
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    for (let i = 0; i < bucketCount; i++) {
      const x = padL + i * stepX;
      const y = padT + plotH - (chartErrBuckets[i] / max) * plotH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + (bucketCount - 1) * stepX, padT + plotH);
    ctx.closePath();
    const errGrad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    errGrad.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    errGrad.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
    ctx.fillStyle = errGrad;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < bucketCount; i++) {
      const x = padL + i * stepX;
      const y = padT + plotH - (chartErrBuckets[i] / max) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Dots on data points
  for (let i = 0; i < bucketCount; i++) {
    if (chartBuckets[i] === 0) continue;
    const x = padL + i * stepX;
    const y = padT + plotH - (chartBuckets[i] / max) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#3B82F6';
    ctx.fill();
  }
}

// ── Token Chart ──
function drawTokenChart(logs) {
  const canvas = document.getElementById('token-chart');
  const totalEl = document.getElementById('token-total');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;

  const now = Date.now();
  const style = getComputedStyle(document.documentElement);
  const rangeMs = chartRangeHours * 3600000;
  const cutoff = now - rangeMs;
  const bucketCount = Math.min(30, chartRangeHours * 6);
  const bucketMs = rangeMs / bucketCount;
  const inputTokens = new Array(bucketCount).fill(0);
  const outputTokens = new Array(bucketCount).fill(0);

  // Token data is not in logs by default, use durationMs as proxy if no token data
  let hasTokenData = false;
  for (const l of logs) {
    const t = new Date(l.time).getTime();
    if (t < cutoff) continue;
    const idx = Math.min(Math.floor((t - cutoff) / bucketMs), bucketCount - 1);
    if (l.inputTokens) { inputTokens[idx] += l.inputTokens; hasTokenData = true; }
    if (l.outputTokens) { outputTokens[idx] += l.outputTokens; hasTokenData = true; }
    if (!hasTokenData) {
      inputTokens[idx] += Math.round(l.durationMs / 10);
      outputTokens[idx] += Math.round(l.durationMs / 5);
    }
  }

  const totalIn = inputTokens.reduce((a, b) => a + b, 0);
  const totalOut = outputTokens.reduce((a, b) => a + b, 0);
  tokenBuckets = { input: inputTokens, output: outputTokens, bucketMs, cutoff };
  if (totalEl) {
    totalEl.textContent = hasTokenData
      ? 'In: ' + totalIn.toLocaleString() + ' / Out: ' + totalOut.toLocaleString()
      : 'Estimated from latency';
  }

  const maxVal = Math.max(...inputTokens.map((v, i) => v + outputTokens[i]), 1);
  const padL = 8, padR = 8, padT = 6, padB = 6;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const barW = plotW / bucketCount;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < bucketCount; i++) {
    const x = padL + i * barW;
    const inH = (inputTokens[i] / maxVal) * plotH;
    const outH = (outputTokens[i] / maxVal) * plotH;
    const bw = Math.max(Math.min(barW * 0.5, 8), 2);
    const bx = x + (barW - bw) / 2;

    // Output tokens (top, violet)
    if (outH > 0) {
      ctx.fillStyle = 'rgba(168, 85, 250, 0.7)';
      ctx.beginPath();
      ctx.roundRect(bx, padT + plotH - inH - outH, bw, outH, 1.5);
      ctx.fill();
    }

    // Input tokens (bottom, cyan)
    if (inH > 0) {
      ctx.fillStyle = 'rgba(34, 211, 238, 0.7)';
      ctx.beginPath();
      ctx.roundRect(bx, padT + plotH - inH, bw, inH, 1.5);
      ctx.fill();
    }
  }

  // Legend dots inline
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  const ly = padT + 4;
  ctx.fillStyle = 'rgba(34, 211, 238, 0.9)';
  ctx.beginPath(); ctx.arc(padL + 4, ly, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = style.getPropertyValue('--text-muted').trim();
  ctx.fillText('Input', padL + 11, ly + 3);
  ctx.fillStyle = 'rgba(168, 85, 250, 0.9)';
  ctx.beginPath(); ctx.arc(padL + 48, ly, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = style.getPropertyValue('--text-muted').trim();
  ctx.fillText('Output', padL + 55, ly + 3);
}

let chartInitialized = false;

// ── State ──
let config = null;
let allModels = [];
let fetchedModels = {};
let editingProvider = null;
let logFilter = 'all';
let healthCache = {};
let adminToken = localStorage.getItem('adminToken') || '';
let authRequired = false;

function apiHeaders(extra) {
  const h = extra || {};
  if (adminToken) h['x-admin-token'] = adminToken;
  return h;
}

function showLoginPage() {
  if (document.getElementById('login-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'login-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:var(--bg);display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:40px;width:100%;max-width:380px;box-shadow:var(--shadow-lg);animation:fadeInLogin 0.4s ease">'
    + '<div style="text-align:center;margin-bottom:28px">'
      + '<div style="width:56px;height:56px;border-radius:14px;background:var(--primary-glow);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px">'
        + '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
      + '</div>'
      + '<h2 style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:4px">API Hub</h2>'
      + '<p style="font-size:13px;color:var(--text-muted)">Enter admin password to continue</p>'
    + '</div>'
    + '<form id="login-form" autocomplete="on">'
      + '<div style="margin-bottom:16px">'
        + '<input type="password" id="login-password" placeholder="Password" autocomplete="current-password" '
          + 'style="width:100%;padding:11px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;outline:none;transition:border-color 0.15s">'
      + '</div>'
      + '<div id="login-error" style="display:none;color:var(--danger);font-size:13px;margin-bottom:12px;text-align:center"></div>'
      + '<button type="submit" id="login-btn" style="width:100%;padding:11px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;transition:all 0.15s">'
        + 'Sign In'
      + '</button>'
    + '</form>'
  + '</div>';
  document.body.appendChild(overlay);

  const style = document.createElement('style');
  style.textContent = '@keyframes fadeInLogin{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}';
  overlay.appendChild(style);

  const pwdInput = document.getElementById('login-password');
  if (pwdInput) pwdInput.focus();

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = document.getElementById('login-password').value.trim();
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    if (!pwd) { errEl.textContent = 'Please enter a password'; errEl.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Signing in...';
    errEl.style.display = 'none';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        adminToken = data.token;
        localStorage.setItem('adminToken', data.token);
        authRequired = false;
        overlay.remove();
        load();
      } else {
        errEl.textContent = data.message || 'Incorrect password';
        errEl.style.display = 'block';
        btn.disabled = false; btn.textContent = 'Sign In';
        document.getElementById('login-password').value = '';
        document.getElementById('login-password').focus();
      }
    } catch (err) {
      errEl.textContent = 'Connection failed';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });
}

async function apiFetch(url, options) {
  if (authRequired && !adminToken) return new Response('{}', { status: 401 });
  const opts = options || {};
  opts.headers = apiHeaders(opts.headers || {});
  const res = await fetch(url, opts);
  if (res.status === 401) {
    if (adminToken) {
      adminToken = '';
      localStorage.removeItem('adminToken');
    }
    authRequired = true;
    showLoginPage();
  }
  return res;
}

// ── Init ──
async function load() {
  try {
    const cfgRes = await apiFetch('/api/config');
    if (!cfgRes.ok) return;
    config = await cfgRes.json();
    const modelsRes = await fetch('/v1/models');
    allModels = modelsRes.ok ? (await modelsRes.json()).data || [] : [];
    updateHeaderStats();
    renderProviders();
    try {
      const fmRes = await apiFetch('/api/fetch-models');
      fetchedModels = fmRes.ok ? await fmRes.json() : {};
    } catch (e) {
      fetchedModels = {};
    }
    renderProviders();
    renderAliases();
  } catch (e) {
    toast('Failed to load config', 'error');
  }
}

function updateHeaderStats() {
  if (!config || !config.providers) return;
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
  const timeouts = config.tierTimeouts || {};
  const defaultTimeout = Math.round((config.streamTimeoutMs || 300000) / 1000);
  const providerModels = getProviderModels();
  ['haiku', 'sonnet', 'opus'].forEach(tier => {
    const input = document.getElementById('alias-' + tier);
    const panel = document.getElementById('panel-' + tier);
    const provSpan = document.getElementById('alias-' + tier + '-provider');
    const timeoutInput = document.getElementById('timeout-' + tier);
    input.value = aliases[tier] || '';
    if (timeoutInput) {
      const tierVal = timeouts[tier]?.timeoutMs;
      timeoutInput.value = Math.round((tierVal || config.streamTimeoutMs || 300000) / 1000);
    }

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
  const tierTimeouts = {};
  ['haiku', 'sonnet', 'opus'].forEach(tier => {
    const v = document.getElementById('alias-' + tier).value.trim();
    if (v) aliases[tier] = v;
    const t = document.getElementById('timeout-' + tier).value.trim();
    if (t && parseInt(t) > 0) {
      const ms = parseInt(t) * 1000;
      tierTimeouts[tier] = { timeoutMs: ms, streamTimeoutMs: ms, streamIdleTimeoutMs: ms };
    }
  });
  try {
    await apiFetch('/api/aliases', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aliases)
    });
    if (Object.keys(tierTimeouts).length > 0) {
      await apiFetch('/api/tier-timeouts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tierTimeouts)
      });
    }
    toast('Aliases & timeouts saved', 'success');
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
      ? '<button class="badge badge-on" onclick="event.stopPropagation();toggleEnabled(\\'' + esc(key) + '\\')" title="Click to disable">ON</button>'
      : '<button class="badge badge-off" onclick="event.stopPropagation();toggleEnabled(\\'' + esc(key) + '\\')" title="Click to enable">OFF</button>';
    const formatBadge = '<button class="badge ' + (p.passthrough ? 'badge-anthropic' : 'badge-openai')
      + '" onclick="event.stopPropagation();toggleProtocol(\\'' + esc(key) + '\\')" title="Click to switch">'
      + (p.passthrough ? 'Anthropic' : 'OpenAI') + '</button>';
    const configModels = p.models || [];
    const apiModels = fetchedModels[p.name || key] || [];
    const allProviderModels = [...new Set([...apiModels, ...configModels])];
    const models = allProviderModels.map(m => '<span class="model-tag">' + esc(m) + '</span>').join('');
    const prefix = p.prefix ? (Array.isArray(p.prefix) ? p.prefix.join(', ') : p.prefix) : '-';
    const keyStatus = (!p.apiKey || p.apiKey === '***')
      ? '<span class="key-warn">\u26a0 Missing</span>'
      : '<span class="key-ok">\u2713 Set</span>';

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
    await apiFetch('/api/config/providers/' + encodeURIComponent(key), {
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

async function toggleEnabled(key) {
  const p = config.providers[key];
  const newVal = !p.enabled;
  try {
    await apiFetch('/api/config/providers/' + encodeURIComponent(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newVal })
    });
    toast(p.name + ': ' + (newVal ? 'Enabled' : 'Disabled'), 'success');
    load();
  } catch (e) {
    toast('Toggle failed', 'error');
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
  if (!baseUrl) { toast('Enter Base URL first', 'error'); return; }
  const existingProvider = editingProvider ? config.providers[editingProvider] : null;
  const realKey = apiKey || (existingProvider ? existingProvider.apiKey : '');
  if (!realKey || realKey === '***') { toast('Enter API Key first', 'error'); return; }
  const isPassthrough = existingProvider ? existingProvider.passthrough : false;
  toast('Fetching models...', 'info');
  try {
    const res = await apiFetch('/api/probe-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey: realKey, passthrough: isPassthrough })
    });
    if (!res.ok) { toast('Fetch failed: HTTP ' + res.status, 'error'); return; }
    const json = await res.json();
    const models = json.models || [];
    if (models.length === 0) { toast('No models found', 'error'); return; }
    let added = 0;
    models.forEach(m => {
      if (!modalModels.includes(m)) { modalModels.push(m); added++; }
    });
    renderModelTags();
    toast('Added ' + added + ' models (total: ' + modalModels.length + ')', 'success');
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
      await apiFetch('/api/config/providers/' + encodeURIComponent(key), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      toast('Provider updated', 'success');
    } else {
      if (!apiKey) { toast('API Key is required for new providers', 'error'); return; }
      await apiFetch('/api/config/providers', {
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
    await apiFetch('/api/config/providers/' + encodeURIComponent(key), { method: 'DELETE' });
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
    const logs = await apiFetch('/api/logs').then(r => r.json());
    cachedLogs = logs || [];
    updateStats(cachedLogs);
    drawTrendChart(logs || []);
    drawTokenChart(logs || []);
    if (!chartInitialized) {
      chartInitialized = true;
      setupChartTooltip(document.getElementById('trend-chart'), document.getElementById('chart-tooltip'));
      setupTokenTooltip(document.getElementById('token-chart'));
    }
    const panel = document.getElementById('log-panel');
    if (!logs || logs.length === 0) {
      panel.innerHTML = '<div class="empty">No logs yet</div>';
      return;
    }
    const searchEl = document.getElementById('log-search');
    const search = searchEl ? searchEl.value.toLowerCase() : '';
    let filtered = logFilter === 'all' ? logs
      : logFilter === 'ok' ? logs.filter(l => l.status >= 200 && l.status < 300)
      : logs.filter(l => l.status >= 300);
    if (search) {
      filtered = filtered.filter(l =>
        (l.provider || '').toLowerCase().includes(search)
        || (l.claudeModel || '').toLowerCase().includes(search)
        || (l.resolvedModel || '').toLowerCase().includes(search)
        || (l.requestId || '').toLowerCase().includes(search)
      );
    }
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
        ? esc(cm) + ' \u2192 ' + esc(l.resolvedModel)
        : esc(cm);

      const detail = '<div class="log-detail' + (isOpen ? ' open' : '') + '" id="log-d-' + i + '" onclick="event.stopPropagation()">'
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
          + '<span class="log-arrow">\u2192</span><span class="log-provider">' + esc(l.provider) + '</span>'
          + '<span class="log-dur">' + l.durationMs + 'ms</span>'
        + '</div>'
        + detail
      + '</div>';
    }).join('');
  } catch (e) { /* ignore */ }
}

function toggleLogDetail(i, entry) {
  const sel = window.getSelection();
  if (sel && sel.toString().length > 0) return;
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
    await apiFetch('/api/logs/clear', { method: 'POST' });
    loadLogs();
    toast('Logs cleared', 'success');
  } catch (e) {
    toast('Clear failed', 'error');
  }
}

async function toggleFileLog() {
  try {
    const res = await apiFetch('/api/logs/file-toggle', { method: 'PUT' }).then(r => r.json());
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
    const res = await apiFetch('/api/logs/file-status').then(r => r.json());
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

// ── SSE Real-time Updates ──
let sseSource = null;
let sseConnected = false;
let cachedLogs = [];

function initSSE() {
  if (sseSource) sseSource.close();
  sseSource = new EventSource('/api/events');
  sseSource.addEventListener('log', (e) => {
    try {
      const entry = JSON.parse(e.data);
      cachedLogs.unshift(entry);
      if (cachedLogs.length > 200) cachedLogs.length = 200;
      sseConnected = true;
      renderIncrementalLog(entry);
      updateStats(cachedLogs);
      drawTrendChart(cachedLogs);
      drawTokenChart(cachedLogs);
    } catch {}
  });
  sseSource.onerror = () => { sseConnected = false; };
}

function renderIncrementalLog(entry) {
  const panel = document.getElementById('log-panel');
  if (!panel) return;
  const empty = panel.querySelector('.empty');
  if (empty) panel.innerHTML = '';

  const searchEl = document.getElementById('log-search');
  const search = searchEl ? searchEl.value.toLowerCase() : '';
  if (search) {
    const match = (entry.provider || '').toLowerCase().includes(search)
      || (entry.claudeModel || '').toLowerCase().includes(search)
      || (entry.resolvedModel || '').toLowerCase().includes(search)
      || (entry.requestId || '').toLowerCase().includes(search);
    if (!match) return;
  }
  if (logFilter === 'ok' && entry.status >= 300) return;
  if (logFilter === 'err' && entry.status < 300) return;

  const ok = entry.status >= 200 && entry.status < 300;
  const cm = entry.claudeModel || '';
  const model = cm !== entry.resolvedModel
    ? esc(cm) + ' → ' + esc(entry.resolvedModel)
    : esc(cm);
  const uid = 'sse-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  const div = document.createElement('div');
  div.className = 'log-entry';
  div.dataset.rid = entry.requestId || '';
  div.onclick = function() {
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;
    const el = document.getElementById('log-d-' + uid);
    if (!el) return;
    el.classList.toggle('open');
    if (entry.requestId) {
      if (el.classList.contains('open')) openLogIds.add(entry.requestId);
      else openLogIds.delete(entry.requestId);
    }
  };
  div.innerHTML = '<div class="log-row">'
    + '<span class="log-status ' + (ok ? 'log-ok' : 'log-err') + '">' + entry.status + '</span>'
    + '<span class="log-model" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px" title="' + model + '">' + model + '</span>'
    + '<span class="log-arrow">→</span><span class="log-provider">' + esc(entry.provider) + '</span>'
    + '<span class="log-dur">' + entry.durationMs + 'ms</span>'
    + '</div>'
    + '<div class="log-detail" id="log-d-' + uid + '" onclick="event.stopPropagation()">'
      + '<div><b>Request ID:</b> ' + esc(entry.requestId || '-') + '</div>'
      + '<div><b>Time:</b> ' + new Date(entry.time).toLocaleString() + '</div>'
      + '<div><b>Provider:</b> ' + esc(entry.provider) + ' [' + esc(entry.protocol) + ']</div>'
      + '<div><b>Model:</b> ' + model + '</div>'
      + '<div><b>Stream:</b> ' + (entry.stream ? 'Yes' : 'No') + ' | <b>Duration:</b> ' + entry.durationMs + 'ms</div>'
      + (entry.error ? '<div class="log-error"><b>Error:</b> ' + esc(entry.error) + '</div>' : '')
    + '</div>';
  panel.insertBefore(div, panel.firstChild);
  while (panel.children.length > 200) panel.removeChild(panel.lastChild);
}

// ── QPS Stats ──
async function loadStats() {
  try {
    const res = await apiFetch('/api/stats');
    if (!res.ok) return;
    const stats = await res.json();
    const el = document.getElementById('stat-qps');
    if (el) el.textContent = stats.qps > 0 ? stats.qps.toFixed(1) : '-';
  } catch (e) { /* ignore */ }
}

// ── Page Navigation ──
function switchPage(page) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const section = document.getElementById('page-' + page);
  const tab = document.querySelector('.nav-tab[data-page="' + page + '"]');
  if (section) section.classList.add('active');
  if (tab) tab.classList.add('active');
  window.location.hash = page;
  if (page === 'config') loadConfigEditor();
}

function initRouter() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  const valid = ['dashboard', 'config', 'guide'];
  switchPage(valid.includes(hash) ? hash : 'dashboard');
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  const valid = ['dashboard', 'config', 'guide'];
  if (valid.includes(hash)) switchPage(hash);
});

// ── Config Editor ──
let configEditorCache = '';

async function loadConfigEditor() {
  const editor = document.getElementById('config-editor');
  const status = document.getElementById('config-status');
  if (!editor) return;
  try {
    const res = await apiFetch('/api/config');
    if (!res.ok) { status.textContent = 'Failed to load'; return; }
    const data = await res.json();
    const json = JSON.stringify(data, null, 2);
    editor.value = json;
    configEditorCache = json;
    status.textContent = 'Loaded from server';
    status.style.color = 'var(--text-muted)';
    editor.style.borderColor = 'var(--success)';
    setTimeout(() => { editor.style.borderColor = 'var(--border)'; }, 1500);
  } catch (e) {
    status.textContent = 'Load error: ' + e.message;
    status.style.color = 'var(--danger)';
  }
}

function validateJson() {
  const editor = document.getElementById('config-editor');
  const status = document.getElementById('config-status');
  if (!editor) return;
  const val = editor.value.trim();
  if (!val) {
    editor.style.borderColor = 'var(--border)';
    status.textContent = 'Empty';
    status.style.color = 'var(--text-muted)';
    return false;
  }
  try {
    JSON.parse(val);
    editor.style.borderColor = 'var(--success)';
    status.textContent = 'Valid JSON';
    status.style.color = 'var(--success)';
    return true;
  } catch (e) {
    editor.style.borderColor = 'var(--danger)';
    status.textContent = 'Invalid JSON: ' + e.message.replace('JSON.parse: ', '');
    status.style.color = 'var(--danger)';
    return false;
  }
}

async function saveConfigEditor() {
  if (!validateJson()) {
    toast('Fix JSON errors before saving', 'error');
    return;
  }
  const editor = document.getElementById('config-editor');
  try {
    const body = JSON.parse(editor.value);
    const res = await apiFetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast('Save failed: ' + (err.error?.message || res.status), 'error');
      return;
    }
    configEditorCache = editor.value;
    toast('Configuration saved & reloaded', 'success');
    load();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
}

function resetConfigEditor() {
  const editor = document.getElementById('config-editor');
  if (!editor) return;
  if (configEditorCache) {
    editor.value = configEditorCache;
    validateJson();
    toast('Reset to server config', 'info');
  } else {
    loadConfigEditor();
  }
}

function exportConfig() {
  const editor = document.getElementById('config-editor');
  if (!editor || !editor.value.trim()) { toast('Nothing to export', 'error'); return; }
  const blob = new Blob([editor.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'api-hub-config-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Config exported', 'success');
}

function importConfig(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const editor = document.getElementById('config-editor');
    if (!editor) return;
    try {
      const parsed = JSON.parse(e.target.result);
      editor.value = JSON.stringify(parsed, null, 2);
      validateJson();
      toast('File imported — review and click Save', 'info');
    } catch (err) {
      toast('Invalid JSON file', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ── Guide Page ──
function copyGuideCode(btn) {
  const pre = btn.closest('.guide-code-block').querySelector('.guide-code');
  if (pre) copyText(pre.textContent);
}

function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  item.classList.toggle('open');
}

// ── Boot ──
initQuickStart();
initRouter();
load();
loadLogs();
loadFileLogStatus();
loadStats();
initSSE();
setInterval(() => { if (!sseConnected) loadLogs(); }, 5000);
setInterval(loadStats, 3000);
