import { useEffect, useState } from 'react';

export function App() {
  const [apiStatus, setApiStatus] = useState('checking…');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { status: string }) => setApiStatus(data.status))
      .catch(() => setApiStatus('unreachable'));
  }, []);

  return (
    <main style={{ padding: 32 }}>
      <img src="/kbc-logo.svg" alt="KBC" width={48} height={48} />
      <h1>Financial Twin</h1>
      <p>API: {apiStatus}</p>
    </main>
  );
}
