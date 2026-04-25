import { render } from 'preact';
import { App } from './app.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';

const root = document.getElementById('app');
if (root) {
  render(<ErrorBoundary><App /></ErrorBoundary>, root);
}
