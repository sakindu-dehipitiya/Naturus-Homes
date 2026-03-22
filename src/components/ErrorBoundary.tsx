import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    let message = 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.error) {
        message = parsed.error;
      }
    } catch (e) {
      message = error.message || message;
    }
    return { hasError: true, errorMessage: message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Oops, something went wrong</h2>
            <p className="text-gray-600 mb-6">
              {this.state.errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
