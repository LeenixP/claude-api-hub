import { Component } from 'preact';
import type { ComponentChildren } from 'preact';

interface Props { children: ComponentChildren }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:16px">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p style="font-size:16px;font-weight:600;color:var(--color-text)">Something went wrong</p>
          <p style="font-size:13px;color:var(--color-text-dim)">An unexpected error occurred.</p>
          <button class="btn btn-primary" onClick={() => { this.setState({ hasError: false }); location.reload(); }}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}
