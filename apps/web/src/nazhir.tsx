import { useEffect, useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { FinanceView, kindForPath, nazhirTabs } from './finance';

const API = import.meta.env.VITE_API_URL ?? '';
const navigate = (path: string) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };
const request = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Permintaan belum berhasil.');
  return data as { user?: { name: string; email: string; role: string } };
};

function Forbidden({ message }: { message: string }) {
  return <div className="portal-state error-box" role="alert">{message}</div>;
}

/** Dashboard Nazhir: seluruh panel memakai endpoint read-only /api/nazhir/finance. */
export function NazhirApp({ path }: { path: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    request('/auth/me')
      .then((data) => {
        if (data.user?.role === 'NAZHIR_VIEWER') { setUser(data.user); setState('ready'); }
        else setState('forbidden');
      })
      .catch((error: Error) => setState(error.message.includes('Authentication') ? 'forbidden' : 'error'));
  }, []);

  if (state === 'loading') return <div className="portal-state" role="status">Memuat dashboard nazhir...</div>;
  if (state === 'forbidden') return <Forbidden message="Dashboard ini hanya untuk akun Nazhir Viewer." />;
  if (state === 'error') return <Forbidden message="Sesi nazhir belum dapat dipastikan." />;

  const current = kindForPath(path, nazhirTabs);
  const logout = () => {
    void request('/auth/logout', { method: 'POST', headers: { Origin: window.location.origin } })
      .catch(() => undefined)
      .finally(() => navigate('/login'));
  };

  return <div className="portal-shell">
    <header className="portal-header">
      <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }}>dapuremakita</a>
      <nav className="portal-nav open" aria-label="Navigasi nazhir">
        <span className="nazhir-badge"><ShieldCheck size={17} /> Nazhir · baca saja</span>
        <button type="button" onClick={logout}><LogOut size={17} />Keluar</button>
      </nav>
    </header>
    <main className="portal-main">
      <div className="portal-heading">
        <p className="eyebrow">Dashboard nazhir</p>
        <h1>{user?.name ?? 'Nazhir Viewer'}</h1>
        <p className="lede">Ringkasan keuangan dan dampak untuk pemantauan {user?.email}.</p>
      </div>
      <FinanceView base="/api/nazhir/finance" kind={current} tabs={nazhirTabs} canWrite={false} viewer="Nazhir Viewer" />
    </main>
  </div>;
}
