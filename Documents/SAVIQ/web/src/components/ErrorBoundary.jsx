import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ui.error_boundary', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      componentStack: info?.componentStack,
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      timestamp: new Date().toISOString(),
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-page flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 bg-expense-bg rounded-2xl">
              <AlertCircle className="w-12 h-12 text-expense" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold font-heading text-text-primary mb-2">
              Something went wrong. Please refresh.
            </h1>
            <p className="text-text-secondary text-sm leading-relaxed">
              The page hit an unexpected error.
            </p>
          </div>

          {this.state.error?.message && (
            <div className="bg-surface rounded-xl p-4 text-left">
              <p className="text-xs font-mono text-text-secondary break-words">
                {this.state.error.message}
              </p>
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-semibold hover:bg-brand-hover transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }
}
