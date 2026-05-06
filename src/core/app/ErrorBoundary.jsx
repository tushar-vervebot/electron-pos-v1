import React from 'react';

/**
 * ErrorBoundary — wraps plugin slots and plugin-provided components.
 * If a plugin crashes, this boundary catches the error and renders a fallback
 * instead of breaking the entire application.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          padding: '8px 12px',
          background: '#450a0a',
          border: '1px solid #7f1d1d',
          borderRadius: 6,
          color: '#fca5a5',
          fontSize: 12,
        }}>
          ⚠ Plugin component error
          {this.props.showDetail && (
            <pre style={{ marginTop: 4, fontSize: 10, opacity: 0.7 }}>
              {this.state.error?.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
