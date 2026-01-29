import React from 'react';
import PropTypes from 'prop-types';

/**
 * Error Boundary Component
 * Catches JavaScript errors in child component tree and displays fallback UI
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/calendar';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-offwhite p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-xl border border-gray-200 p-6">
            <div className="text-center">
              <svg 
                className="mx-auto h-12 w-12 text-red-500 mb-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                />
              </svg>
              
              <h2 className="text-2xl font-bold text-charcoal mb-2">
                Oops! Something went wrong
              </h2>
              
              <p className="text-gray-600 mb-6">
                The application encountered an unexpected error. Please try refreshing the page.
              </p>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mb-4 text-left">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    Error details (development only)
                  </summary>
                  <div className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono text-red-600 overflow-auto max-h-40">
                    <div className="mb-2">
                      <strong>Error:</strong> {this.state.error.toString()}
                    </div>
                    {this.state.errorInfo && (
                      <div>
                        <strong>Stack:</strong>
                        <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
              
              <div className="flex gap-3 justify-center">
                <button
                  onClick={this.handleReset}
                  className="px-6 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-900 transition-colors"
                >
                  Go to Main Page
                </button>
                
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-2 bg-white text-charcoal border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired
};

export default ErrorBoundary;
