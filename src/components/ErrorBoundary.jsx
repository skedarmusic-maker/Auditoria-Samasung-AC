import React from 'react';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="min-h-screen bg-black flex items-center justify-center p-6 text-zinc-300 font-mono">
                    <div className="max-w-2xl w-full bg-zinc-900 border border-red-900/50 p-6 rounded-lg shadow-2xl">
                        <div className="flex items-center gap-3 text-red-500 mb-4 border-b border-red-900/30 pb-4">
                            <AlertTriangle size={32} />
                            <h1 className="text-xl font-bold uppercase tracking-wider">System Critical Error</h1>
                        </div>

                        <div className="space-y-4">
                            <p className="text-zinc-400">
                                Ocorreu um erro inesperado durante a renderização. Isso geralmente acontece por dados inválidos ou falhas de processamento.
                            </p>

                            <div className="bg-black/50 p-4 rounded border border-zinc-800 overflow-auto max-h-64">
                                <p className="text-red-400 font-bold mb-2">ERROR: {this.state.error && this.state.error.toString()}</p>
                                <pre className="text-xs text-zinc-600 whitespace-pre-wrap">
                                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                                </pre>
                            </div>

                            <button
                                onClick={() => window.location.reload()}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 uppercase tracking-widest transition-colors"
                            >
                                Reiniciar Sistema
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
