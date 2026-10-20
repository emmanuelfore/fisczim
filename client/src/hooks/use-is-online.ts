import { useState, useEffect } from 'react';
import { setOnlineState } from '@/lib/online-state';

export function useIsOnline(): boolean {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const checkConnection = async () => {
        try {
            // Heartbeat check to actual API. In the desktop shell the UI is
            // served from a local origin, so the base must be absolute.
            const base =
                (typeof window !== 'undefined' && (window as any).electronAPI?.apiBaseUrl) ||
                import.meta.env.VITE_API_URL ||
                '';
            const res = await fetch(`${base}/api/health`, { method: 'HEAD', cache: 'no-store' });
            return res.ok;
        } catch {
            return false;
        }
    };

    const setOnline = (v: boolean) => {
        setIsOnline(v);
        setOnlineState(v);
    };

    useEffect(() => {
        const handleOnline = async () => {
            const hasActualInternet = await checkConnection();
            setOnline(hasActualInternet);
        };
        const handleOffline = () => setOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial check
        handleOnline();

        // Periodic heartbeat every 30s
        const timer = setInterval(handleOnline, 120000); // 120s was 30s

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(timer);
        };
    }, []);

    return isOnline;
}
