import { type FormEvent, useEffect, useState } from 'react';
import { api } from './api';

interface DemoCustomer {
  id: string;
  name: string;
  lifeStage: string;
}

export function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [customers, setCustomers] = useState<DemoCustomer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<DemoCustomer[]>('/demo-customers', null)
      .then((list) => {
        setCustomers(list);
        setCustomerId(list[0]?.id ?? '');
      })
      .catch(() => setError('The API is not reachable. Is `yarn dev` running?'));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { token } = await api<{ token: string }>('/login', null, { method: 'POST', body: { customerId } });
      onLogin(token);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <img src="/kbc-logo.svg" alt="KBC" width={56} height={56} />
        <h1>Financial Twin</h1>
        <p className="muted">Pick one of the synthetic demo customers.</p>
        <div className="customer-list" role="radiogroup" aria-label="Demo customer">
          {customers.map((c) => (
            <label key={c.id} className={`customer-option ${customerId === c.id ? 'selected' : ''}`}>
              <input type="radio" name="customer" id={`customer-${c.id}`} value={c.id} checked={customerId === c.id} onChange={() => setCustomerId(c.id)} />
              <strong>{c.name}</strong>
              <span className="muted">{c.lifeStage}</span>
            </label>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={!customerId}>Log in</button>
      </form>
    </div>
  );
}
