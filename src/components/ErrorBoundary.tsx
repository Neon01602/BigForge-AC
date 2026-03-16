import React, { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong. Please try refreshing the page.";
      
      try {
        // Check if it's our custom Firestore error JSON
        const parsedError = JSON.parse(this.state.error?.message || "");
        if (parsedError.error && parsedError.operationType) {
          errorMessage = `Database Error: ${parsedError.error} during ${parsedError.operationType} on ${parsedError.path || 'unknown path'}.`;
          if (parsedError.error.includes('permission-denied')) {
            errorMessage = "You don't have permission to perform this action or view this data. Please contact an administrator.";
          }
        }
      } catch (e) {
        // Not a JSON error, use default or the error message itself
        if (this.state.error?.message) {
          errorMessage = this.state.error.message;
        }
      }

      return (
        <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-black text-[#141414] mb-4 uppercase tracking-tight">System Error</h1>
            <p className="text-[#141414]/60 mb-8 font-mono text-xs leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={this.handleReset}
              className="w-full py-4 bg-[#141414] text-white font-bold uppercase tracking-widest hover:bg-white hover:text-[#141414] border border-[#141414] transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:shadow-none active:translate-x-1 active:translate-y-1 flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} />
              Reset Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
