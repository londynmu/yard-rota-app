import { useEffect, useState } from 'react';

const getConnectionInfo = () => {
  const conn = navigator?.connection || navigator?.mozConnection || navigator?.webkitConnection;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType || null,
    downlink: conn.downlink || null,
    rtt: conn.rtt || null,
    saveData: !!conn.saveData,
  };
};

export default function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator?.onLine ?? true);
  const [connection, setConnection] = useState(() => getConnectionInfo());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleConnectionChange = () => setConnection(getConnectionInfo());

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const conn = navigator?.connection || navigator?.mozConnection || navigator?.webkitConnection;
    if (conn && conn.addEventListener) {
      conn.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (conn && conn.removeEventListener) {
        conn.removeEventListener('change', handleConnectionChange);
      }
    };
  }, []);

  return { isOnline, connection };
}
