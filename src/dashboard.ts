export function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>API Hub</title>
<style>
:root{--bg:#0f172a;--surface:#1e293b;--border:#334155;--border-hover:#475569;--text:#e2e8f0;--text-dim:#94a3b8;--text-muted:#64748b;--primary:#3b82f6;--primary-hover:#2563eb;--danger:#ef4444;--danger-hover:#dc2626;--success:#22c55e;--warning:#f59e0b;--cyan:#22d3ee;--violet:#a78bfa;--orange:#fb923c;--radius:8px;--shadow:0 4px 12px rgba(0,0,0,.3)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;line-height:1.5}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:60}
header h1{font-size:18px;font-weight:700;color:#f8fafc;letter-spacing:-.3px}
.header-right{display:flex;align-items:center;gap:16px;font-size:12px;color:var(--text-dim)}
.header-stat{display:flex;align-items:center;gap:4px}
.header-stat b{color:var(--text);font-weight:600}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px}
.dot-ok{background:var(--success)}
.dot-err{background:var(--danger)}
.dot-warn{background:var(--warning)}
.dot-off{background:var(--text-muted)}
main{max-width:1000px;margin:0 auto;padding:20px 24px 40px}
@media(max-width:640px){main{padding:12px}}
section{margin-bottom:28px}
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.section-header h2{font-size:15px;font-weight:600;color:#f1f5f9}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:10px;transition:border-color .15s}
.card:hover{border-color:var(--border-hover)}
select,input[type=text],input[type=password]{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 11px;color:var(--text);font-size:13px;width:100%;transition:border-color .15s}
select:focus,input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 2px rgba(59,130,246,.15)}
button{border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:5px}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-hover)}
.btn-primary:active{transform:scale(.97)}
.btn-danger{background:var(--danger);color:#fff}
.btn-danger:hover{background:var(--danger-hover)}
.btn-sm{padding:4px 10px;font-size:11px}
.btn-ghost{background:transparent;color:var(--text-dim);border:1px solid var(--border)}
.btn-ghost:hover{background:var(--border);color:var(--text)}
.btn-icon{background:none;border:none;color:var(--text-dim);padding:4px;cursor:pointer;border-radius:4px}
.btn-icon:hover{background:var(--border);color:var(--text)}
.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;gap:3px}
.badge-on{background:#166534;color:#4ade80}
.badge-off{background:#7f1d1d;color:#fca5a5}
.badge-openai{background:#064e3b;color:#6ee7b7}
.badge-anthropic{background:#1e3a5f;color:#7dd3fc}
.info-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:20px}
.info-card h3{font-size:13px;font-weight:600;color:#f1f5f9;margin-bottom:10px;display:flex;align-items:center;gap:6px}
.info-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px}
.info-row .label{color:var(--text-dim);min-width:120px;flex-shrink:0}
.info-row code{background:var(--bg);border:1px solid var(--border);padding:2px 7px;border-radius:4px;font-size:11px;color:var(--text);font-family:"SF Mono",Monaco,Consolas,monospace}
.copy-btn{background:var(--border);color:var(--text-dim);border:none;border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;transition:all .15s}
.copy-btn:hover{background:var(--border-hover);color:var(--text)}
.config-block{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 14px;font-size:11px;color:var(--text-dim);font-family:"SF Mono",Monaco,Consolas,monospace;margin-top:8px;position:relative;white-space:pre;line-height:1.6}
.config-block .copy-btn{position:absolute;top:6px;right:6px}
.alias-row{display:grid;grid-template-columns:80px 1fr 110px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)}
.alias-row:last-of-type{border-bottom:none}
.alias-label{font-weight:700;font-size:14px}
.alias-label.haiku{color:var(--cyan)}
.alias-label.sonnet{color:var(--violet)}
.alias-label.opus{color:var(--orange)}
.alias-provider{font-size:11px;color:var(--text-muted);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.combo{position:relative}
.combo-panel{display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border-hover);border-radius:6px;margin-top:3px;max-height:220px;overflow-y:auto;z-index:50;box-shadow:var(--shadow)}
.combo-panel.open{display:block}
.combo-group-label{padding:5px 12px 3px;font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.combo-item{padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:background .1s}
.combo-item:hover{background:var(--border)}
.combo-item .hint{font-size:10px;color:var(--text-muted)}
.provider-header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.provider-info{flex:1;min-width:0}
.provider-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.provider-name{font-weight:600;font-size:14px}
.provider-url{font-size:11px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.provider-actions{display:flex;gap:4px;flex-shrink:0}
.provider-meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;font-size:11px;color:var(--text-muted)}
.provider-meta span{display:flex;align-items:center;gap:3px}
.provider-meta code{background:var(--bg);padding:1px 5px;border-radius:3px;font-size:10px;color:var(--text-dim)}
.provider-models{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.model-tag{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:2px 7px;font-size:11px;color:var(--text-dim)}
.health-dot{margin-left:4px}
.key-ok{color:var(--success)}
.key-warn{color:var(--warning)}
.toggle{position:relative;width:36px;height:20px;cursor:pointer;display:inline-block}
.toggle input{opacity:0;width:0;height:0}
.toggle .slider{position:absolute;inset:0;background:var(--border);border-radius:10px;transition:.2s}
.toggle .slider:before{content:"";position:absolute;height:16px;width:16px;left:2px;bottom:2px;background:#fff;border-radius:50%;transition:.2s}
.toggle input:checked+.slider{background:var(--success)}
.toggle input:checked+.slider:before{transform:translateX(16px)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:640px){.form-grid{grid-template-columns:1fr}}
.form-grid .full{grid-column:1/-1}
.form-group{display:flex;flex-direction:column;gap:3px}
.form-group label{font-size:11px;color:var(--text-dim);font-weight:500}
.form-check{display:flex;align-items:center;gap:7px;font-size:12px}
.form-check input[type=checkbox]{width:auto;accent-color:var(--primary)}
.help-box{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;margin-top:6px;font-size:11px;color:var(--text-dim);line-height:1.6}
.help-box b{display:block;margin-bottom:2px}
.help-box .anthropic{color:#7dd3fc}
.help-box .openai{color:#6ee7b7}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100;align-items:center;justify-content:center;backdrop-filter:blur(2px)}
.modal-overlay.active{display:flex}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;width:92%;max-width:540px;max-height:90vh;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,.4)}
.modal h3{font-size:15px;font-weight:600;margin-bottom:14px}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.log-panel{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);max-height:420px;overflow-y:auto;font-family:"SF Mono",Monaco,Consolas,monospace;font-size:11px}
.log-entry{padding:7px 12px;border-bottom:1px solid rgba(51,65,85,.5);cursor:pointer;transition:background .1s}
.log-entry:hover{background:var(--surface)}
.log-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.log-time{color:var(--text-muted);flex-shrink:0;width:70px}
.log-status{font-weight:700;width:28px;text-align:center}
.log-ok{color:var(--success)}
.log-err{color:#f87171}
.log-model{color:var(--violet)}
.log-arrow{color:var(--text-muted)}
.log-provider{color:var(--cyan)}
.log-proto{color:var(--text-muted);font-size:10px}
.log-dur{color:var(--text-muted);margin-left:auto;flex-shrink:0}
.log-detail{display:none;padding:6px 0 2px;font-size:10px;color:var(--text-dim);border-top:1px dashed var(--border);margin-top:5px}
.log-detail.open{display:block}
.log-detail pre{white-space:pre-wrap;word-break:break-all;max-height:120px;overflow-y:auto;background:var(--bg);padding:6px;border-radius:4px;margin-top:4px}
.log-error{color:#f87171;margin-top:3px}
.log-filter{display:flex;gap:4px}
.log-filter button{font-size:10px;padding:2px 8px}
.log-filter button.active{background:var(--primary);color:#fff}
.toast{position:fixed;bottom:20px;right:20px;padding:10px 18px;border-radius:8px;font-size:12px;opacity:0;transition:all .3s;z-index:200;display:flex;align-items:center;gap:6px;box-shadow:var(--shadow);transform:translateY(10px)}
.toast.show{opacity:1;transform:translateY(0)}
.toast.success{background:#166534;color:#4ade80}
.toast.error{background:#7f1d1d;color:#fca5a5}
.toast.info{background:var(--border);color:var(--text)}
.empty{text-align:center;color:var(--text-muted);padding:20px;font-size:13px}
.loading{text-align:center;color:var(--text-dim);padding:16px;font-size:12px}
.loading::after{content:"";display:inline-block;width:12px;height:12px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .6s linear infinite;margin-left:6px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<header>
  <h1>API Hub</h1>
  <div class="header-right">
    <div class="header-stat" id="stat-providers"></div>
    <div class="header-stat" id="stat-models"></div>
    <div class="header-stat"><span class="dot dot-ok"></span>Running</div>
  </div>
</header>
<main>
  <div class="info-card" id="quick-start">
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
    <div class="section-header">
      <h2>Alias Mapping</h2>
    </div>
    <div class="card" id="aliases-card">
      <div class="alias-row">
        <div class="alias-label haiku">Haiku</div>
        <div class="combo"><input type="text" id="alias-haiku" placeholder="Type or select..." autocomplete="off"><div class="combo-panel" id="panel-haiku"></div></div>
        <div class="alias-provider" id="alias-haiku-provider"></div>
      </div>
      <div class="alias-row">
        <div class="alias-label sonnet">Sonnet</div>
        <div class="combo"><input type="text" id="alias-sonnet" placeholder="Type or select..." autocomplete="off"><div class="combo-panel" id="panel-sonnet"></div></div>
        <div class="alias-provider" id="alias-sonnet-provider"></div>
      </div>
      <div class="alias-row">
        <div class="aliaabel opus">Opus</div>
        <div class="combo"><input type="text" id="alias-opus" placeholder="Type or select..." autocomplete="off"><div class="combo-panel" id="panel-opus"></div></div>
        <div class="alias-provider" id="alias-opus-provider"></div>
      </div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <button class="btn-primary" onclick="saveAliases()">Save</button>
      </div>
    </div>
  </section>

  <section>
    <div class="section-header">
      <h2>Providers</h2>
      <div style="display:flex;gap:6px">
        <button class="btn-ghost btn-sm" onclick="testAllProviders()">Test All</button>
        <button class="btn-primary btn-sm" onclick="openAddProvider()">+ Add</button>
      </div>
    </div>
    <div id="providers-list"><div class="loading">Loading providers</div></div>
  </section>

  <section>
    <div class="section-header">
      <h2>Request Logs</h2>
      <div style="display:flex;gap:6px;align-items:center">
        <div class="log-filter">
          <button class="btn-ghost btn-sm active" data-filter="all" onclick="setLogFilter('all',this)">All</button>
          <button class="btn-ghost btn-sm" data-filter="ok" onclick="setLogFilter('ok',this)">OK</button>
          <button class="btn-ghost btn-sm" data-filter="err" onclick="setLogFilter('err',this)">Errors</button>
        </div>
        <button class="btn-ghost btn-sm" onclick="clearLogs()">Clear</button>
        <button class="btn-ghost btn-sm" onclick="loadLogs()">Refresh</button>
        <button class="btn-ghost btn-sm" id="auto-btn" onclick="toggleAuto()">Auto: OFF</button>
      </div>
    </div>
    <div class="log-panel" id="log-panel"><div class="empty">No logs yet</div></div>
  </section>
</main>

<div class="modal-overlay" id="provider-modal">
  <div class="ml">
    <h3 id="modal-title">Add Provider</h3>
    <div class="form-grid">
      <div class="form-group"><label>Provider Key</label><input type="text" id="f-key" placeholder="e.g. deepseek"></div>
      <div class="form-group"><label>Display Name</label><input type="text" id="f-name" placeholder="e.g. DeepSeek"></div>
      <div class="form-group full"><label>Base URL</label><input type="text" id="f-url" placeholder="https://api.deepseek.com/v1"></div>
      <div class="form-group full"><label>API Key</label><input type="text" id="f-key-val" placeholder="sk-... or \${ENV_VAR}"></div>
      <div class="form-group full"><label>Models (comma separated)</label><input type="text" id="f-models" placeholder="deepseek-chat, deepseek-coder"></div>
      <div class="form-group"><label>Default Model</label><input type="text" id="f-default" placeholder="deepseek-chat"></div>
      <div class="form-group"><label>Prefix (for routing)</label><input type="text" id="f-prefix" placeholder="deepseek-"></div>
      <div class="form-group"><div class="form-check"><input type="checkbox" id="f-enabled" checked><label for="f-enabled">Enabled</label></div></div>
      <div class="form-group"><div class="form-check"><input type="checkbox" id="f-passthrough"><label for="f-passthrough">Passthrough</label></div></div>
      <div class="form-group full">
        <div class="help-box">
          <b class="anthropic">Passthrough ON = Anthropic Messages API</b>
          Direct forward, no translation. Auth: x-api-key. Use for Anthropic API or compatible proxies.<br><br>
          <b class="openai">Passthrough OFF = OpenAI Chat Completions API</b>
          Auto-translated from Anthropic format. Auth: Bearer token. Use for Kimi, MiniMax, GLM, DeepSeek, etc.
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
let config=null,allModels=[],fetchedModels={},editingProvider=null,logFilter='all',autoTimer=null,healthCache={};

async function load(){
  try{
    const[cfgRes,modelsRes]=await Promise.all([fetch('/api/config').then(r=>r.json()),fetch('/v1/models').then(r=>r.json())]);
    config=cfgRes;allModels=modelsRes.data||[];
    updateStats();renderProviders();
    try{fetchedModels=await fetch('/api/fetch-models').then(r=>r.json())}catch(e){fetchedModels={}}
    renderAliases();
  }catch(e){toast('Failed to load config','error')}
}

function updateStats(){
  const pCount=Object.values(config.providers).filter(p=>p.enabled).length;
  const mCount=allModels.length;
  document.getElementById('stat-providers').innerHTML='<b>'+pCount+'</b> providers';
  document.getElementById('stat-models').innerHTML='<b>'+mCount+'</b> models';
}

function renderAliases(){
  const aliases=config.aliases||{};
  ['haiku','sonnet','opus'].forEach(tier=>{
    const input=document.getElementById('alias-'+tier);
    const panel=document.getElementById('panel-'+tier);
    const provSpan=document.getElementById('alias-'+tier+'-provider');
    input.value=aliases[tier]||'';
    function buildPanel(filter){
      let html='';
      Object.entries(fetchedModels).forEach(([provider,models])=>{
        const filtered=(models||[]).filter(id=>!filter||id.toLowerCase().includes(filter.toLowerCase()));
        if(filtered.length===0)return;
        html+='<div class="combo-group-label">'+esc(provider)+'</div>';
        filtered.forEach(id=>{html+='<div class="combo-item" data-value="'+esc(id)+'">'+esc(id)+'<span class="hint">'+esc(provider)+'</span></div>'});
      });
      panel.innerHTML=html||'<div style="padding:8px 12px;color:var(--text-muted);font-size:12px">No models found</div>';
      panel.querySelectorAll('.combo-item').forEach(item=>{
        item.addEventListener('mousedown',e=>{e.preventDefault();input.value=item.dataset.value;panel.classList.remove('open');updateProv()});
      });
    }
    function updateProv(){
      const v=input.value.trim();let found='';
      Object.entries(fetchedModels).forEach(([p,m])=>{if((m||[]).includes(v))found=p});
      provSpan.textContent=found||(v?'custom':'');
    }
    input.addEventListener('focus',()=>{buildPanel(input.value);panel.classList.add('open')});
    input.addEventListener('input',()=>{buildPanel(input.value);panel.classList.add('open');updateProv()});
    input.addEventListener('blur',()=>{setTimeout(()=>panel.classList.remove('open'),150)});
    updateProv();
  });
}

function renderProviders(){
  const list=document.getElementById('providers-list');
  const entries=Object.entries(config.providers);
  if(entries.length===0){list.innerHTML='<div class="empty">No providers configured</div>';return}
  list.innerHTML=entries.map(([key,p])=>{
    const h=healthCache[p.name||key];
    const healthDot=h?'<span class="dot health-dot '+(h.status==='ok'?'dot-ok':h.status==='timeout'?'dot-warn':'dot-err')+'"></span>'+(h.latencyMs?'<span style="font-size:10px;color:var(--text-muted)">'+h.latencyMs+'ms</span>':''):'';

    const enableBadge=p.enabled?'<span class="badge badge-on">ON</span>':'<span class="badge badge-off">OFF</span>';
    const formatBadge=p.passthrough?'<span class="badge badge-anthropic">Anthropic</span>':'<span class="badge badge-openai">OpenAI</span>';
    const models=(p.models||[]).map(m=>'<span class="model-tag">'+esc(m)+'</span>').join('');
    const prefix=p.prefix?(Array.isArray(p.prefix)?p.prefix.join(', '):p.prefix):'-';
    const keyStatus=!p.apiKey||p.apiKey==='***'?'<span class="key-warn">\\u26a0 Missing</span>':'<span class="key-ok">\\u2713 Set</span>';
    return '<div class="card" id="provider-'+esc(key)+'">'
      +'<div class="provider-header">'
        +'<div class="provider-info">'
          +'<div class="provider-title"><span class="provider-name">'+esc(p.name||key)+'</span> '+enableBadge+' '+formatBadge+' '+healthDot+'</div>'
          +'<div class="provider-url">'+esc(p.baseUrl)+'</div>'
        +'</div>'
        +'<div class="provider-actions">'
          +'<button class="btn-ghost btn-sm" onclick="testProvider(\\''+esc(key)+'\\')">Test</button>'
          +'<button class="btn-ghost btn-sm" onclick="editProvider(\\''+esc(key)+'\\')">Edit</button>'
          +'<button class="btn-danger btn-sm" onclick="deleteProvider(\\''+esc(key)+'\\')">Del</button>'
        +'</div>'
      +'</div>'
      +'<div class="provider-meta">'
        +'<span>Prefix: <code>'+esc(prefix)+'</code></span>'
        +'<span>Default: <code>'+esc(p.defaultModel||'-')+'</code></span>'
        +'<span>Key: '+keyStatus+'</span>'
      +'</div>'
      +'<div class="provider-models">'+models+'</div>'
    +'</div>';
  }).join('');
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

async function saveAliases(){
  const aliases={};
  ['haiku','sonnet','opus'].forEach(tier=>{const v=document.getElementById('alias-'+tier).value.trim();if(v)aliases[tier]=v});
  try{
    await fetch('/api/aliases',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(aliases)});
    toast('Aliases saved','success');load();
  }catch(e){toast('Failed to save','error')}
}

async function testProvider(key){
  const p=config.providers[key];
  toast('Testing '+p.name+'...','info');
  try{
    const res=await fetch('/api/health/providers').then(r=>r.json());
    healthCache=res;renderProviders();
    const h=res[p.name||key];
    if(h&&h.status==='ok')toast(p.name+': OK ('+h.latencyMs+'ms)','success');
    else toast(p.name+': '+(h?.error||h?.status||'unknown'),'error');
  }catch(e){toast('Test failed','error')}
}

async function testAllProviders(){
  toast('Testing all providers...','info');
  try{
    healthCache=await fetch('/api/health/providers').then(r=>r.json());
    renderProviders();
    const ok=Object.values(healthCache).filter(h=>h.status==='ok').length; toast(ok+'/'+Object.keys(healthCache).length+' providers OK','success');
  }catch(e){toast('Test failed','error')}
}

function openAddProvider(){
  editingProvider=null;
  document.getElementById('modal-title').textContent='Add Provider';
  ['f-key','f-name','f-url','f-key-val','f-models','f-default','f-prefix'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-key').disabled=false;
  document.getElementById('f-enabled').checked=true;
  document.getElementById('f-passthrough').checked=false;
  document.getElementById('provider-modal').classList.add('active');
}

function editProvider(key){
  editingProvider=key;const p=config.providers[key];
  document.getElementById('modal-title').textContent='Edit: '+p.name;
  document.getElementById('f-key').value=key;document.getElementById('f-key').disabled=true;
  document.getElementById('f-name').value=p.name||'';
  document.getElementById('f-url').value=p.baseUrl||'';
  document.getElementById('f-key-val').value='';
  document.getElementById('f-key-val').placeholder=p.apiKey||'Leave blank to keep';
  document.getElementById('f-models').value=(p.models||[]).join(', ');
  document.getElementById('f-default').value=p.defaultModel||'';
  document.getElementById('f-prefix').value=Array.isArray(p.prefix)?p.prefix.join(', '):(p.prefix||'');
  document.getElementById('f-enabled').checked=p.enabled!==false;
  document.getElementById('f-passthrough').checked=!!p.passthrough;
  document.getElementById('provider-modal').classList.add('active');
}

function closeModal(){document.getElementById('provider-modal').classList.remove('active')}

async function saveProvider(){
  const key=document.getElementById('f-key').value.trim();
  const name=document.getElementById('f-name').value.trim();
  const baseUrl=document.getElementById('f-url').value.trim();
  const apiKey=document.getElementById('f-key-val').value.trim();
  const models=document.getElementById('f-models').value.split(',').map(s=>s.trim()).filter(Boolean);
  const defaultModel=document.getElementById('f-default').value.trim();
  const prefixStr=document.getElementById('f-prefix').value.trim();
  const enabled=document.getElementById('f-enabled').checked;
  const passthrough=document.getElementById('f-passthrough').checked;
  const prefix=prefixStr.includes(',')?prefixStr.split(',').map(s=>s.trim()).filter(Boolean):prefixStr;
  if(!key||!name||!baseUrl||models.length===0||!defaultModel){toast('Fill all required fields','error');return}
  try{
    if(editingProvider){
      const body={name,baseUrl,models,defaultModel,enabled,passthrough:passthrough||undefined,prefix:prefix||undefined};
      if(apiKey)body.apiKey=apiKey;
      await fetch('/api/config/providers/'+encodeURIComponent(key),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      toast('Provider updated','success');
    }else{
      if(!apiKey){toast('API Key required','error');return}
      await fetch('/api/config/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,baseUrl,apiKey,models,defaultModel,enabled,passthrough:passthrough||undefined,prefix:prefix||undefined})});
      toast('Provider added','success');
    }
    closeModal();load();
  }catch(e){toast('Save failed','error')}
}

async function deleteProvider(key){
  if(!confirm('Delete "'+key+'"?'))return;
  try{await fetch('/api/config/providers/'+encodeURIComponent(key),{method:'DELETE'});toast('Deleted','success');load()}catch(e){toast('Delete failed','error')}
}

async function loadLogs(){
  try{
    const logs=await fetch('/api/logs').then(r=>r.json());
    const panel=document.getElementById('log-panel');
    if(!logs||logs.length===0){panel.innerHTML='<div class="empty">No logs yet</div>';return}
    const filtered=logFilter==='all'?logs:logFilter==='ok'?logs.filter(l=>l.status>=200&&l.status<300):logs.filter(l=>l.status>=300);
    if(filtered.length===0){panel.innerHTML='<div class="empty">No matching logs</div>';return}
    panel.innerHTML=filtered.map((l,i)=>{
      const ok=l.status>=200&&l.status<300;
      const time=new Date(l.time).toLocaleTimeString();
      const stream=l.stream?' [stream]':'';
      const arrow=l.originalModel!==l.resolvedModel?' <span class="log-arrow">\\u2192</span> <span class="log-model">'+esc(l.resolvedModel)+'</span>':'';
      const detail='<div class="log-detail" id="log-d-'+i+'">'
        +'<div>Request ID: '+esc(l.requestId||'-')+'</div>'
        +'<div>Target: '+esc(l.targetUrl||'-')+'</div>'
        +(l.error?'<div class="log-error">Error: '+esc(l.error)+'</div>':'')
        +(l.upstreamBody?'<div>Upstream response:<pre>'+esc(l.upstreamBody)+'</pre></div>':'')
        +'</div>';
      return '<div class="log-entry" onclick="toggleLogDetail('+i+')">'
        +'<div class="log-row">'
          +'<span class="log-time">'+esc(time)+'</span>'
          +'<span class="log-status '+(ok?'log-ok':'log-err')+'">'+l.status+'</span>'
          +'<span class="log-model">'+esc(l.originalModel)+'</span>'+arrow
          +' <span class="log-arrow">\\u2192</span> <span class="log-provider">'+esc(l.provider)+'</span>'
          +' <span class="log-proto">['+l.protocol+']'+stream+'</span>'
          +'<span class="log-dur">'+l.durationMs+'ms</span>'
        +'</div>'
        +detail
      +'</div>';
    }).join('');
  }catch(e){}
}

function toggleLogDetail(i){const el=document.getElementById('log-d-'+i);if(el)el.classList.toggle('open')}

function setLogFilter(f,btn){
  logFilter=f;
  document.querySelectorAll('.log-filter button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  loadLogs();
}

async function clearLogs(){
  try{await fetch('/api/logs/clear',{method:'POST'});loadLogs();toast('Logs cleared','success')}catch(e){toast('Clear failed','error')}
}

function toggleAuto(){
  const btn=document.getElementById('auto-btn');
  if(autoTimer){clearInterval(autoTimer);autoTimer=null;btn.textContent='Auto: OFF'}
  else{autoTimer=setInterval(loadLogs,3000);btn.textContent='Auto: ON';loadLogs()}
}

function toast(msg,type){
  const el=document.getElementById('toast');
  el.textContent=msg;el.className='toast show '+(type||'info');
  setTimeout(()=>el.className='toast',2500);
}

function initQuickStart(){
  const url=window.location.origin;
  document.getElementById('gateway-url').textContent=url;
  const snippet=document.getElementById('config-snippet');
  const json=JSON.stringify({env:{ANTHROPIC_BASE_URL:url}},null,2);
  snippet.insertBefore(document.createTextNode(json),snippet.firstChild);
}

function copyText(t){navigator.clipboard.writeText(t).then(()=>toast('Copied','success')).catch(()=>toast('Copy failed','error'))}
function copyConfig(){copyText(JSON.stringify({env:{ANTHROPIC_BASE_URL:window.location.origin}},null,2))}

initQuickStart();load();loadLogs();
</script>
</body>
</html>`;
}
