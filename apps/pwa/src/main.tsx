import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Error boundary to catch and display React rendering errors
class ErrorBoundary extends Component<
    { children: ReactNode },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('React error boundary caught:', error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '100vh',
                    padding: '2rem',
                    color: '#ef4444',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                }}>
                    <h1>⚠️ BeanPool Error</h1>
                    <p style={{ color: '#888', margin: '1rem 0' }}>
                        The app failed to load. Error details:
                    </p>
                    <pre style={{
                        background: '#1a1a1a',
                        padding: '1rem',
                        borderRadius: '8px',
                        maxWidth: '90vw',
                        overflow: 'auto',
                        fontSize: '0.8rem',
                        color: '#ff6b6b',
                    }}>
                        {this.state.error.message}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

console.log('[BeanPool] Mounting React app...');

try {
    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </StrictMode>
    );
    console.log('[BeanPool] React mounted successfully');
} catch (err) {
    console.error('[BeanPool] FATAL:', err);
    const root = document.getElementById('root');
    if (root) {
        root.innerHTML = `<div style="color: #ef4444; padding: 2rem; font-family: monospace; text-align: center;">
            <h1>⚠️ BeanPool failed to start</h1>
            <pre style="color: #ff6b6b; margin-top: 1rem;">${(err as Error).message}</pre>
        </div>`;
    }
}
