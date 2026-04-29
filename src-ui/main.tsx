import { render } from 'preact';
import { App } from './app.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';

window.onerror = function(m, u, l) {
  const a = document.getElementById('app');
  if (a) a.innerHTML = '<div style="max-width:700px;margin:40px auto;padding:24px;border-radius:12px;background:#fff;color:#1a1d23;font-family:system-ui,sans-serif;font-size:14px;box-shadow:0 2px 20px rgba(0,0,0,0.3)"><strong style="color:#d1242f">Application Error</strong><pre style="margin:12px 0 0;font-size:12px;color:#656d76;white-space:pre-wrap">' + String(m).replace(/</g, '&lt;') + ' at line ' + l + '</pre></div>';
};

const root = document.getElementById('app');
if (root) {
  render(<ErrorBoundary><App /></ErrorBoundary>, root);
}
