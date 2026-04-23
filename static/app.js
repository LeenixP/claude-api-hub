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
let currentProviderType = 'standard';
let oauthCredsPath = null;
let oauthPollingTimer = null;
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
  overlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:linear-gradient(135deg,#1e1b4b 0%,#312e81 30%,#4c1d95 70%,#581c87 100%);display:flex;align-items:center;justify-content:center;padding:20px';

  const loginStyle = document.createElement('style');
  loginStyle.textContent = '@keyframes fadeInLogin{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}'
    + '@keyframes shakeLogin{0%,100%{transform:translateX(0)}25%{transform:translateX(-10px)}75%{transform:translateX(10px)}}'
    + '#login-password:focus{border-color:#3b82f6 !important;box-shadow:0 0 0 3px rgba(59,130,246,0.25) !important}'
    + '#login-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 25px rgba(59,130,246,0.4)}'
    + '#login-btn:active:not(:disabled){transform:translateY(0)}'
    + '#login-btn:disabled{background:#94a3b8 !important;cursor:not-allowed;transform:none !important;box-shadow:none !important}'
    + '.login-spinner{display:inline-block;width:16px;height:16px;border:2px solid #fff;border-radius:50%;border-top-color:transparent;animation:loginSpin 0.8s linear infinite;margin-right:8px;vertical-align:middle}'
    + '@keyframes loginSpin{to{transform:rotate(360deg)}}';
  overlay.appendChild(loginStyle);

  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:420px;padding:48px;animation:fadeInLogin 0.5s ease';

  card.innerHTML = '<div style="text-align:center;margin-bottom:32px">'
      + '<div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#3b82f6,#6366f1);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">'
        + '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>'
      + '</div>'
      + '<h2 style="font-size:28px;font-weight:700;color:#1e293b;margin-bottom:6px">API Hub</h2>'
      + '<p style="font-size:16px;color:#64748b">Enter password to continue</p>'
    + '</div>'
    + '<form id="login-form" autocomplete="on">'
      + '<div style="margin-bottom:20px">'
        + '<label style="display:block;margin-bottom:8px;color:#334155;font-size:14px;font-weight:500">Password</label>'
        + '<input type="password" id="login-password" placeholder="Enter your password" autocomplete="current-password" '
          + 'style="width:100%;height:48px;padding:0 16px;background:#f8fafc;border:2px solid #e2e8f0;border-radius:10px;color:#1e293b;font-size:16px;outline:none;transition:all 0.3s ease;box-sizing:border-box">'
      + '</div>'
      + '<div id="login-error" style="display:none;color:#ef4444;font-size:14px;margin-bottom:16px;text-align:center"></div>'
      + '<button type="submit" id="login-btn" style="width:100%;height:48px;background:linear-gradient(135deg,#3b82f6 0%,#6366f1 100%);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.3s ease">'
        + 'Sign In'
      + '</button>'
    + '</form>'
    + '<div style="text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0">'
      + '<p style="font-size:13px;color:#94a3b8">Claude API Hub Gateway</p>'
    + '</div>';

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const pwdInput = document.getElementById('login-password');
  if (pwdInput) pwdInput.focus();

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = document.getElementById('login-password').value.trim();
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    if (!pwd) { errEl.textContent = 'Please enter a password'; errEl.style.display = 'block'; return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="login-spinner"></span>Signing in...';
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
        localStorage.setItem('adminTokenTime', Date.now().toString());
        authRequired = false;
        overlay.remove();
        startDashboard();
      } else {
        errEl.textContent = data.message || 'Incorrect password';
        errEl.style.display = 'block';
        errEl.style.animation = 'shakeLogin 0.3s ease-in-out';
        setTimeout(() => { errEl.style.animation = ''; }, 300);
        btn.disabled = false; btn.innerHTML = 'Sign In';
        document.getElementById('login-password').value = '';
        document.getElementById('login-password').focus();
      }
    } catch (err) {
      errEl.textContent = 'Connection failed';
      errEl.style.display = 'block';
      btn.disabled = false; btn.innerHTML = 'Sign In';
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
      ? '<button class="badge badge-on" onclick="event.stopPropagation();toggleEnabled(\x27' + esc(key) + '\x27)" title="Click to disable">ON</button>'
      : '<button class="badge badge-off" onclick="event.stopPropagation();toggleEnabled(\x27' + esc(key) + '\x27)" title="Click to enable">OFF</button>';
    const formatBadge = (p.authMode === 'oauth')
      ? '<span class="badge badge-anthropic" style="font-size:11px">Kiro</span>'
      : '<span class="badge ' + (p.passthrough ? 'badge-anthropic' : 'badge-openai') + '">'
        + (p.passthrough ? 'Anthropic' : 'OpenAI') + '</span>';
    const configModels = p.models || [];
    const apiModels = fetchedModels[p.name || key] || [];
    const allProviderModels = [...new Set([...apiModels, ...configModels])];
    const models = allProviderModels.map(m => '<span class="model-tag">' + esc(m) + '</span>').join('');
    const prefix = p.prefix ? (Array.isArray(p.prefix) ? p.prefix.join(', ') : p.prefix) : '-';
    const keyStatus = (p.authMode === 'oauth')
      ? '<span class="badge badge-anthropic" style="font-size:11px;padding:1px 6px">OAuth</span>'
      : (!p.apiKey || p.apiKey === '***')
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
          + '<button class="btn-ghost btn-sm" onclick="testProvider(\x27' + esc(key) + '\x27)">Test</button>'
          + '<button class="btn-ghost btn-sm" onclick="editProvider(\x27' + esc(key) + '\x27)">Edit</button>'
          + '<button class="btn-danger btn-sm" onclick="deleteProvider(\x27' + esc(key) + '\x27)">Del</button>'
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
  toast('Testing ' + (p.name || key) + '...', 'info');
  const start = Date.now();
  try {
    const res = await apiFetch('/api/test-provider/' + encodeURIComponent(key), { method: 'POST' });
    const data = await res.json();
    const latency = data.latencyMs || (Date.now() - start);
    if (data.success) {
      healthCache[p.name || key] = { status: 'ok', latencyMs: latency };
      toast(p.name + ': Test passed (' + latency + 'ms, model: ' + data.model + ')', 'success');
    } else {
      healthCache[p.name || key] = { status: 'error', latencyMs: latency, error: data.error };
      toast(p.name + ': ' + (data.error || 'Test failed'), 'error');
    }
  } catch (e) {
    healthCache[p.name || key] = { status: 'error', latencyMs: Date.now() - start, error: e.message };
    toast(p.name + ': ' + e.message, 'error');
  }
  renderProviders();
}

async function testAllProviders() {
  toast('Testing all providers...', 'info');
  const entries = Object.entries(config.providers).filter(([, p]) => p.enabled);
  await Promise.all(entries.map(([key]) => testProvider(key)));
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
  if (currentProviderType === 'kiro') {
    toast('Fetching Kiro models...', 'info');
    try {
      const res = await apiFetch('/api/oauth/kiro/models');
      if (!res.ok) { toast('Failed to fetch Kiro models', 'error'); return; }
      const json = await res.json();
      const models = json.models || [];
      if (models.length === 0) { toast('No models found', 'error'); return; }
      let added = 0;
      models.forEach(m => {
        if (!modalModels.includes(m)) { modalModels.push(m); added++; }
      });
      renderModelTags();
      toast('Added ' + added + ' Kiro models (total: ' + modalModels.length + ')', 'success');
    } catch (e) {
      toast('Fetch failed: ' + e.message, 'error');
    }
    return;
  }
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

// ── Provider Type & OAuth ──
function switchProviderType(type) {
  currentProviderType = type;
  const apiKeySection = document.getElementById('auth-apikey-section');
  const oauthSection = document.getElementById('auth-oauth-section');
  if (type === 'kiro') {
    apiKeySection.style.display = 'none';
    oauthSection.style.display = '';
    if (!document.getElementById('f-url').value) {
      document.getElementById('f-url').value = 'https://q.us-east-1.amazonaws.com';
    }
    if (!editingProvider && !document.getElementById('f-prefix').value) {
      document.getElementById('f-prefix').value = 'kiro-';
    }
  } else {
    apiKeySection.style.display = '';
    oauthSection.style.display = 'none';
  }
}

function updateOAuthStatus(state, message) {
  const el = document.getElementById('oauth-status');
  const btn = document.getElementById('btn-refresh-creds');
  el.className = 'oauth-status oauth-status-' + state;
  if (state === 'pending') {
    el.innerHTML = '<span class="oauth-spinner"></span> ' + esc(message);
    document.querySelectorAll('.oauth-btn').forEach(b => b.disabled = true);
    btn.style.display = 'none';
  } else if (state === 'success') {
    el.innerHTML = '&#10003; ' + esc(message);
    document.querySelectorAll('.oauth-btn').forEach(b => b.disabled = false);
    btn.style.display = '';
  } else if (state === 'error') {
    el.innerHTML = '&#10007; ' + esc(message);
    document.querySelectorAll('.oauth-btn').forEach(b => b.disabled = false);
    btn.style.display = 'none';
  } else {
    el.innerHTML = esc(message);
    document.querySelectorAll('.oauth-btn').forEach(b => b.disabled = false);
    btn.style.display = 'none';
  }
}

async function startKiroOAuth(method) {
  const region = document.getElementById('f-kiro-region').value || 'us-east-1';
  const startUrl = document.getElementById('f-kiro-start-url').value.trim() || undefined;
  updateOAuthStatus('pending', 'Opening authorization window...');

  try {
    const res = await apiFetch('/api/oauth/kiro/auth-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, region, startUrl })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      updateOAuthStatus('error', err.error?.message || 'Failed to start OAuth');
      return;
    }
    const data = await res.json();

    const popup = window.open(data.authUrl, '_blank', 'width=600,height=700,scrollbars=yes');

    // Detect popup close and cancel OAuth if user closes it without completing
    if (popup) {
      const closeChecker = setInterval(() => {
        if (popup.closed) {
          clearInterval(closeChecker);
          // Wait 3 seconds for backend polling to complete before cancelling
          setTimeout(() => {
            if (!oauthCredsPath) {
              apiFetch('/api/oauth/kiro/cancel', { method: 'POST' }).catch(() => {});
              if (oauthPollingTimer) { clearInterval(oauthPollingTimer); oauthPollingTimer = null; }
              updateOAuthStatus('idle', 'Not authorized');
            }
          }, 3000);
        }
      }, 1000);
    }

    if (data.authInfo && data.authInfo.method === 'builder-id') {
      updateOAuthStatus('pending', 'Waiting for device authorization... Enter code: ' + (data.authInfo.userCode || ''));
    } else {
      updateOAuthStatus('pending', 'Waiting for authorization...');
    }

    // Start polling for result
    if (oauthPollingTimer) clearInterval(oauthPollingTimer);
    let attempts = 0;
    oauthPollingTimer = setInterval(async () => {
      attempts++;
      if (attempts > 120) { // 4 min timeout
        clearInterval(oauthPollingTimer);
        oauthPollingTimer = null;
        updateOAuthStatus('error', 'Authorization timed out');
        return;
      }
      try {
        const r = await apiFetch('/api/oauth/kiro/result');
        const result = await r.json();
        if (result.success && result.credsPath) {
          clearInterval(oauthPollingTimer);
          oauthPollingTimer = null;
          oauthCredsPath = result.credsPath;
          updateOAuthStatus('success', 'Authorized (expires: ' + new Date(result.creds.expiresAt).toLocaleTimeString() + ')');
        } else if (result.error && result.error !== 'No pending OAuth result') {
          // Only stop on real errors, not "no pending result" (means still in progress)
          clearInterval(oauthPollingTimer);
          oauthPollingTimer = null;
          updateOAuthStatus('error', result.error);
        }
        // Otherwise keep polling
      } catch (e) {
        // ignore polling errors, keep trying
      }
    }, 2000);
  } catch (e) {
    updateOAuthStatus('error', e.message);
  }
}

async function refreshKiroCreds() {
  if (!oauthCredsPath) {
    toast('No credentials to refresh', 'error');
    return;
  }
  toast('Refreshing credentials...', 'info');
  try {
    const res = await apiFetch('/api/oauth/kiro/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credsPath: oauthCredsPath })
    });
    if (res.ok) {
      const data = await res.json();
      updateOAuthStatus('success', 'Refreshed (expires: ' + new Date(data.expiresAt).toLocaleTimeString() + ')');
      toast('Credentials refreshed', 'success');
    } else {
      const err = await res.json().catch(() => ({}));
      updateOAuthStatus('error', 'Refresh failed: ' + (err.error?.message || 'Unknown error'));
      toast('Refresh failed', 'error');
    }
  } catch (e) {
    toast('Refresh failed: ' + e.message, 'error');
  }
}

// ── Provider CRUD ──
function openAddProvider() {
  editingProvider = null;
  currentProviderType = 'standard';
  oauthCredsPath = null;
  if (oauthPollingTimer) { clearInterval(oauthPollingTimer); oauthPollingTimer = null; }
  modalModels = [];
  document.getElementById('modal-title').textContent = 'Add Provider';
  ['f-key', 'f-name', 'f-url', 'f-key-val', 'f-default', 'f-prefix', 'f-model-input'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-key').disabled = false;
  document.getElementById('f-enabled').checked = true;
  document.getElementById('f-provider-type').value = 'standard';
  document.getElementById('f-kiro-region').value = 'us-east-1';
  document.getElementById('f-kiro-start-url').value = '';
  switchProviderType('standard');
  updateOAuthStatus('idle', 'Not authorized');
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

  // Detect provider type
  const isKiro = (p.providerType === 'kiro') || (p.authMode === 'oauth') || (p.baseUrl && p.baseUrl.includes('amazonaws.com'));
  currentProviderType = isKiro ? 'kiro' : 'standard';
  oauthCredsPath = p.kiroCredsPath || null;
  document.getElementById('f-provider-type').value = currentProviderType;
  document.getElementById('f-kiro-region').value = p.kiroRegion || 'us-east-1';
  document.getElementById('f-kiro-start-url').value = p.kiroStartUrl || '';
  // Set protocol radio
  const protoRadio = document.querySelectorAll('input[name="f-protocol"]');
  protoRadio.forEach(r => { r.checked = (r.value === 'anthropic') ? !!p.passthrough : !p.passthrough; });
  switchProviderType(currentProviderType);

  if (isKiro && p.kiroCredsPath) {
    // Check OAuth credential status
    updateOAuthStatus('pending', 'Checking credentials...');
    apiFetch('/api/oauth/kiro/status?credsPath=' + encodeURIComponent(p.kiroCredsPath))
      .then(r => r.json())
      .then(status => {
        if (status.valid) {
          updateOAuthStatus('success', 'Authorized (expires: ' + new Date(status.expiresAt).toLocaleTimeString() + ')');
        } else if (status.canRefresh) {
          updateOAuthStatus('error', 'Expired - click Refresh');
        } else {
          updateOAuthStatus('error', 'Invalid credentials');
        }
      })
      .catch(() => updateOAuthStatus('error', 'Failed to check status'));
  } else if (isKiro) {
    updateOAuthStatus('idle', 'Not authorized');
  }

  renderModelTags();
  document.getElementById('provider-modal').classList.add('active');
}

function closeModal() {
  if (oauthPollingTimer) { clearInterval(oauthPollingTimer); oauthPollingTimer = null; }
  // Cancel any pending OAuth on the backend
  if (currentProviderType === 'kiro' && !oauthCredsPath) {
    apiFetch('/api/oauth/kiro/cancel', { method: 'POST' }).catch(() => {});
  }
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
  const isKiro = currentProviderType === 'kiro';
  const protocol = document.querySelector('input[name="f-protocol"]:checked')?.value || 'openai';
  const kiroRegion = document.getElementById('f-kiro-region').value;
  const kiroStartUrl = document.getElementById('f-kiro-start-url').value.trim();

  if (!key || !name || !baseUrl || models.length === 0 || !defaultModel) {
    toast('Please fill all required fields', 'error');
    return;
  }
  if (isKiro && !oauthCredsPath) {
    toast('Please complete OAuth authorization first', 'error');
    return;
  }
  if (!isKiro && !editingProvider && !apiKey) {
    toast('API Key is required for new providers', 'error');
    return;
  }

  try {
    if (editingProvider) {
      const body = { name, baseUrl, models, defaultModel, enabled, prefix: prefix || '' };
      if (apiKey) body.apiKey = apiKey;
      if (isKiro) {
        body.authMode = 'oauth';
        body.providerType = 'kiro';
        body.kiroRegion = kiroRegion;
        body.kiroStartUrl = kiroStartUrl;
        body.kiroCredsPath = oauthCredsPath;
        body.passthrough = false;
      } else {
        body.passthrough = (protocol === 'anthropic');
      }
      await apiFetch('/api/config/providers/' + encodeURIComponent(key), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      toast('Provider updated', 'success');
    } else {
      const body = { name, baseUrl, models, defaultModel, enabled, prefix: prefix || '' };
      if (isKiro) {
        body.authMode = 'oauth';
        body.providerType = 'kiro';
        body.kiroRegion = kiroRegion;
        body.kiroStartUrl = kiroStartUrl;
        body.kiroCredsPath = oauthCredsPath;
        body.passthrough = false;
        body.apiKey = '';
      } else {
        body.apiKey = apiKey;
        body.passthrough = (protocol === 'anthropic');
      }
      await apiFetch('/api/config/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
  if (page === 'config') {
    switchConfigMode(configMode);
  }
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
let configMode = localStorage.getItem('configMode') || 'ui';

function switchConfigMode(mode) {
  configMode = mode;
  localStorage.setItem('configMode', mode);
  document.getElementById('btn-config-ui').classList.toggle('active', mode === 'ui');
  document.getElementById('btn-config-json').classList.toggle('active', mode === 'json');
  document.getElementById('config-ui-mode').style.display = mode === 'ui' ? '' : 'none';
  document.getElementById('config-json-mode').style.display = mode === 'json' ? '' : 'none';
  if (mode === 'ui') loadConfigUI();
  else loadConfigEditor();
}

function loadConfigUI() {
  if (!config) return;
  const el = id => document.getElementById(id);
  if (el('cfg-port')) el('cfg-port').value = config.port || 9800;
  if (el('cfg-host')) el('cfg-host').value = config.host || '0.0.0.0';
  if (el('cfg-log-level')) el('cfg-log-level').value = config.logLevel || 'info';
  if (el('cfg-password')) el('cfg-password').value = '';
  if (el('cfg-rate-limit')) el('cfg-rate-limit').value = config.rateLimitRpm || 0;
  if (el('cfg-trust-proxy')) el('cfg-trust-proxy').checked = !!config.trustProxy;
  if (el('cfg-token-refresh')) el('cfg-token-refresh').value = config.tokenRefreshMinutes || 30;
  if (el('cfg-stream-timeout')) el('cfg-stream-timeout').value = Math.round((config.streamTimeoutMs || 300000) / 1000);
  if (el('cfg-stream-idle')) el('cfg-stream-idle').value = Math.round((config.streamIdleTimeoutMs || 120000) / 1000);
  if (el('cfg-max-response')) el('cfg-max-response').value = config.maxResponseBytes ? Math.round(config.maxResponseBytes / 1048576) : 10;
  if (el('cfg-cors')) el('cfg-cors').value = (config.corsOrigins || []).join(', ');

  // Populate default provider dropdown
  const dpSelect = el('cfg-default-provider');
  if (dpSelect) {
    const providers = Object.keys(config.providers || {});
    dpSelect.innerHTML = providers.map(k =>
      '<option value="' + esc(k) + '"' + (k === config.defaultProvider ? ' selected' : '') + '>' + esc(k) + '</option>'
    ).join('');
  }
}

async function saveConfigUI() {
  const el = id => document.getElementById(id);
  const updates = {
    port: parseInt(el('cfg-port').value) || 9800,
    host: el('cfg-host').value.trim() || '0.0.0.0',
    logLevel: el('cfg-log-level').value,
    defaultProvider: el('cfg-default-provider').value,
    rateLimitRpm: parseInt(el('cfg-rate-limit').value) || 0,
    trustProxy: el('cfg-trust-proxy').checked,
    tokenRefreshMinutes: parseInt(el('cfg-token-refresh').value) || 30,
    streamTimeoutMs: (parseInt(el('cfg-stream-timeout').value) || 300) * 1000,
    streamIdleTimeoutMs: (parseInt(el('cfg-stream-idle').value) || 120) * 1000,
    maxResponseBytes: (parseInt(el('cfg-max-response').value) || 10) * 1048576,
  };

  const corsVal = el('cfg-cors').value.trim();
  if (corsVal) {
    updates.corsOrigins = corsVal.split(',').map(s => s.trim()).filter(Boolean);
  }

  const pwd = el('cfg-password').value;
  if (pwd) updates.password = pwd;

  // Merge with existing config (preserve providers, aliases, etc.)
  const merged = { ...config, ...updates };

  try {
    const res = await apiFetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged)
    });
    if (res.ok) {
      toast('Configuration saved', 'success');
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast('Save failed: ' + (err.error?.message || res.status), 'error');
    }
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
}

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
const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

async function boot() {
  // Check if password is required
  let required = false;
  try {
    const res = await fetch('/api/auth/check');
    const data = await res.json();
    required = data.required === true;
  } catch { /* no auth check = no password */ }

  if (!required) {
    startDashboard();
    return;
  }

  // Check saved session
  const savedToken = localStorage.getItem('adminToken');
  const savedTime = parseInt(localStorage.getItem('adminTokenTime') || '0');
  if (savedToken && (Date.now() - savedTime < SESSION_DURATION)) {
    adminToken = savedToken;
    startDashboard();
    return;
  }

  // Clear expired session
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminTokenTime');
  adminToken = '';

  // Show login page
  showLoginPage();
}

function startDashboard() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.remove();
  initQuickStart();
  initRouter();
  load();
  // Charts need visible canvas with dimensions; delay until layout completes
  setTimeout(() => {
    loadLogs();
    loadFileLogStatus();
    loadStats();
  }, 150);
  initSSE();

  // Auto-expire session after 30 min
  setTimeout(() => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminTokenTime');
    adminToken = '';
    authRequired = true;
    showLoginPage();
  }, SESSION_DURATION);
}

boot();
setInterval(() => { if (!sseConnected) loadLogs(); }, 5000);
setInterval(loadStats, 3000);
window.addEventListener('resize', debounce(() => {
  if (cachedLogs.length > 0) {
    drawTrendChart(cachedLogs);
    drawTokenChart(cachedLogs);
  }
}, 200));

// Redraw charts when canvas becomes visible (e.g. after login overlay removal)
const _chartObserver = new ResizeObserver(() => {
  const tc = document.getElementById('trend-chart');
  if (cachedLogs.length > 0 && tc && tc.getBoundingClientRect().width > 0) {
    drawTrendChart(cachedLogs);
    drawTokenChart(cachedLogs);
    if (!chartInitialized) {
      chartInitialized = true;
      setupChartTooltip(tc, document.getElementById('chart-tooltip'));
      setupTokenTooltip(document.getElementById('token-chart'));
    }
  }
});
const _tc = document.getElementById('trend-chart');
const _tkc = document.getElementById('token-chart');
if (_tc) _chartObserver.observe(_tc);
if (_tkc) _chartObserver.observe(_tkc);
