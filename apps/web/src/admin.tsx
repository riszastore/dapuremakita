import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, PackageCheck, ShieldCheck, Users } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';
const navigate = (path: string) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Permintaan belum berhasil.');
  return data as T;
}

function Loading() { return <div className="portal-state" role="status">Memuat admin...</div>; }
function ErrorState({ message }: { message: string }) { return <div className="portal-state error-box" role="alert">{message}</div>; }

export function AdminApp({ path }: { path: string }) {
  const [currentUser, setCurrentUser] = useState<{ role: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    request<{ user?: { role: string; name: string } }>('/auth/me')
      .then((data) => {
        if (!data.user || !['SUPER_ADMIN', 'CURATOR', 'OPERATIONS'].includes(data.user.role)) {
          setError('Akses admin terbatas untuk tim yang berwenang.');
          return;
        }
        setCurrentUser(data.user);
      })
      .catch(() => setError('Sesi admin belum dapat dipastikan.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!currentUser) return <ErrorState message="Identitas admin belum tersedia." />;

  const area = path.split('/').filter(Boolean)[1] ?? 'dashboard';
  const nav = [
    ['/admin', 'Dashboard', LayoutDashboard],
    ['/admin/mitra', 'Mitra', Users],
    ['/admin/pengajuan', 'Pengajuan', PackageCheck],
  ] as const;

  const render: Record<string, ReactNode> = {
    dashboard: <AdminDashboard user={currentUser} />,
    mitra: <PartnerList />,
    pengajuan: <SubmissionList />,
  };

  return <div className="portal-shell"><header className="portal-header"><a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }}>dapuremakita</a><nav className="portal-nav open" aria-label="Navigasi admin">{nav.map(([href, label, Icon]) => <a key={href} className={path === href ? 'active' : ''} href={href} onClick={(event) => { event.preventDefault(); navigate(href); }}><Icon size={17} />{label}</a>)}<button onClick={() => { void request('/auth/logout', { method: 'POST', headers: { Origin: window.location.origin } }).then(() => navigate('/login')); }}><ShieldCheck size={17} />Keluar</button></nav></header><main className="portal-main"><div className="portal-heading"><p className="eyebrow">Admin & kurasi</p><h1>{currentUser?.name ?? 'Tim admin'}</h1></div>{render[area] ?? render.dashboard}</main></div>;
}

function AdminDashboard({ user }: { user: { name: string; role: string } }) {
  const [data, setData] = useState<{ stats?: { partners: number; submissions: number; activeProducts: number; pendingPartners: number }; queue?: Array<{ id: string; name: string; status: string; updatedAt: string }> } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    request<{ stats: { partners: number; submissions: number; activeProducts: number; pendingPartners: number }; queue: Array<{ id: string; name: string; status: string; updatedAt: string }> }>('/api/admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  return <><section className="metric-grid" aria-label="Ringkasan dashboard"><div className="metric"><span>Mitra</span><strong>{data.stats?.partners ?? 0}</strong></div><div className="metric"><span>Pengajuan</span><strong>{data.stats?.submissions ?? 0}</strong></div><div className="metric"><span>Produk aktif</span><strong>{data.stats?.activeProducts ?? 0}</strong></div><div className="metric"><span>Pending</span><strong>{data.stats?.pendingPartners ?? 0}</strong></div></section><section className="list-panel"><h2>Antrean kurasi</h2>{!data.queue?.length ? <p className="empty-state">Belum ada antrean.</p> : <div className="submission-list">{data.queue.map((item) => <div className="submission-card" key={item.id}><strong>{item.name}</strong><small>{item.status} · {new Date(item.updatedAt).toLocaleDateString('id-ID')}</small></div>)}</div>}</section><p className="eyebrow">Masuk sebagai {user.role}</p></>;
}

function PartnerList() {
  const [data, setData] = useState<{ items?: Array<{ id: string; name: string; status: string; slug: string }> } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    request<{ items: Array<{ id: string; name: string; status: string; slug: string }> }>('/api/admin/partners?page=1&limit=20').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  return <section className="list-panel"><h2>Daftar mitra</h2>{!data.items?.length ? <p className="empty-state">Tidak ada mitra.</p> : <div className="submission-list">{data.items.map((partner) => <div className="submission-card" key={partner.id}><strong>{partner.name}</strong><small>{partner.slug} · {partner.status}</small></div>)}</div>}</section>;
}

function SubmissionList() {
  const [data, setData] = useState<{ items?: Array<{ id: string; name: string; status: string; description: string }> } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    request<{ items: Array<{ id: string; name: string; status: string; description: string }> }>('/api/admin/submissions?page=1&limit=20').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;
  return <section className="list-panel"><h2>Antrean pengajuan</h2>{!data.items?.length ? <p className="empty-state">Tidak ada pengajuan.</p> : <div className="submission-list">{data.items.map((item) => <div className="submission-card" key={item.id}><strong>{item.name}</strong><small>{item.status}</small><p>{item.description}</p></div>)}</div>}</section>;
}
