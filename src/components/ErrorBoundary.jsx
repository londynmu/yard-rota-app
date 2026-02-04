import React from 'react';
import PropTypes from 'prop-types';

// Session storage key to track reload attempts and prevent infinite loops
const CHUNK_ERROR_RELOAD_KEY = 'chunk_error_reload_timestamp';
const RELOAD_COOLDOWN_MS = 10000; // 10 seconds cooldown between reloads

/**
 * Check if the error is a chunk loading error (dynamic import failed)
 * This typically happens after a new deployment when old chunk files are no longer available
 */
const isChunkLoadError = (error) => {
  if (!error) return false;
  
  const errorString = error.toString().toLowerCase();
  const errorMessage = (error.message || '').toLowerCase();
  
  // Common patterns for chunk loading errors
  const patterns = [
    'loading chunk',
    'loading css chunk',
    'dynamically imported module',
    'failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'chunkloaderror',
    'loading module',
    'failed to load module script',
  ];
  
  return patterns.some(pattern => 
    errorString.includes(pattern) || errorMessage.includes(pattern)
  );
};

/**
 * Check if we can safely reload the page (not in a reload loop)
 */
const canReloadSafely = () => {
  const lastReloadTime = sessionStorage.getItem(CHUNK_ERROR_RELOAD_KEY);
  
  if (!lastReloadTime) return true;
  
  const timeSinceLastReload = Date.now() - parseInt(lastReloadTime, 10);
  return timeSinceLastReload > RELOAD_COOLDOWN_MS;
};

/**
 * Mark that we're about to reload due to chunk error
 */
const markReloadAttempt = () => {
  sessionStorage.setItem(CHUNK_ERROR_RELOAD_KEY, Date.now().toString());
};

/**
 * Error Boundary Component
 * Catches JavaScript errors in child component tree and displays fallback UI
 * Automatically handles chunk loading errors by refreshing the page
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      isChunkError: false
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    const chunkError = isChunkLoadError(error);
    return { 
      hasError: true,
      isChunkError: chunkError
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    const chunkError = isChunkLoadError(error);
    
    this.setState({
      error,
      errorInfo,
      isChunkError: chunkError
    });
    
    // If it's a chunk loading error and we can safely reload, do it automatically
    if (chunkError && canReloadSafely()) {
      console.log('[ErrorBoundary] Chunk loading error detected, reloading page...');
      markReloadAttempt();
      // Small delay to ensure the log is visible
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, isChunkError: false });
    window.location.href = '/calendar';
  };
  
  handleReload = () => {
    // Clear the reload tracking so user can manually trigger reload
    sessionStorage.removeItem(CHUNK_ERROR_RELOAD_KEY);
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Special UI for chunk loading errors (typically after deployment)
      if (this.state.isChunkError) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-offwhite p-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-xl border border-gray-200 p-6">
              <div className="text-center">
                <svg 
                  className="mx-auto h-12 w-12 text-blue-500 mb-4 animate-spin" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                  />
                </svg>
                
                <h2 className="text-2xl font-bold text-charcoal mb-2">
                  App Update Available
                </h2>
                
                <p className="text-gray-600 mb-6">
                  A new version of the app is available. The page will refresh automatically to load the latest version.
                </p>
                
                <p className="text-sm text-gray-500 mb-6">
                  If the page doesn&apos;t refresh automatically, please click the button below.
                </p>
                
                <button
                  onClick={this.handleReload}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  Refresh Now
                </button>
              </div>
            </div>
          </div>
        );
      }
      
      // Standard error UI
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
                  onClick={this.handleReload}
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
