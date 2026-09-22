import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeftRight, BadgeCheck, FileBarChart, HandCoins, Receipt, ShieldCheck, Users, Wallet } from 'lucide-react';
import './finance.css';

export type FinanceViewKind = 'summary' | 'transactions' | 'accruals' | 'payouts' | 'products' | 'partners' | 'impact';
type Range = { from?: string; to?: string };
export type Tab = { kind: FinanceViewKind; href: string; label: string };

const API = import.meta.env.VITE_API_URL ?? '';
const navigate = (path: string) => { window.history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

export const adminTabs: Tab[] = [
  { kind: 'summary', href: '/admin/keuangan', label: 'Ringkasan' },
  { kind: 'transactions', href: '/admin/keuangan/transaksi', label: 'Transaksi' },
  { kind: 'accruals', href: '/admin/keuangan/hak', label: 'Hak produsen' },
  { kind: 'payouts', href: '/admin/keuangan/payout', label: 'Payout' },
  { kind: 'products', href: '/admin/laporan/produk', label: 'Laporan produk' },
  { kind: 'partners', href: '/admin/laporan/mitra', label: 'Laporan mitra' },
  { kind: 'impact', href: '/admin/laporan/dampak', label: 'Laporan dampak' },
];

export const nazhirTabs: Tab[] = [
  { kind: 'summary', href: '/nazhir', label: 'Ringkasan' },
  { kind: 'transactions', href: '/nazhir/transaksi', label: 'Transaksi' },
  { kind: 'accruals', href: '/nazhir/hak', label: 'Hak produsen' },
  { kind: 'payouts', href: '/nazhir/payout', label: 'Payout' },
  { kind: 'products', href: '/nazhir/laporan/produk', label: 'Laporan produk' },
  { kind: 'partners', href: '/nazhir/laporan/mitra', label: 'Laporan mitra' },
  { kind: 'impact', href: '/nazhir/laporan/dampak', label: 'Laporan dampak' },
];

export const kindForPath = (path: string, tabs: Tab[]): FinanceViewKind => tabs.find((tab) => tab.href === path)?.kind ?? 'summary';

export function FinanceTabs({ tabs, current }: { tabs: Tab[]; current: FinanceViewKind }) {
  return <nav className="finance-tabs" aria-label="Navigasi finance">
    {tabs.map((tab) => <a key={tab.kind} href={tab.href} className={tab.kind === current ? 'active' : ''} aria-current={tab.kind === current ? 'page' : undefined} onClick={(event) => { event.preventDefault(); navigate(tab.href); }}>{tab.label}</a>)}
  </nav>;
}

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value ?? 0);
const dateTime = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

/** Selalu lewat prefix API agar konsisten dengan modul lain ketika VITE_API_URL di-set. */
async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Permintaan belum berhasil.');
  return data;
}

function useResource<T>(path: string | null): { data: T | null; error: string; loading: boolean } {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: true });
  useEffect(() => {
    if (!path) return;
    let active = true;
    setState({ data: null, error: '', loading: true });
    requestJson(path)
      .then((data) => { if (active) setState({ data: data as T, error: '', loading: false }); })
      .catch((error: Error) => { if (active) setState({ data: null, error: error.message, loading: false }); });
    return () => { active = false; };
  }, [path]);
  return state;
}

function Loading({ label }: { label: string }) { return <div className="portal-state" role="status">{label}</div>; }
function ErrorState({ message }: { message: string }) { return <div className="portal-state error-box" role="alert">{message}</div>; }

function RangeFilter({ range, onChange }: { range: Range; onChange: (range: Range) => void }) {
  return <div className="finance-range">
    <label>Dari<input type="date" aria-label="Dari tanggal" value={range.from ?? ''} onChange={(event) => onChange({ ...range, from: event.target.value || undefined })} /></label>
    <label>Sampai<input type="date" aria-label="Sampai tanggal" value={range.to ?? ''} onChange={(event) => onChange({ ...range, to: event.target.value || undefined })} /></label>
    <button type="button" className="text-link" onClick={() => onChange({})}>Semua periode</button>
  </div>;
}

type Summary = {
  producerShareBps: number;
  omzet: { productRupiah: number; shippingRupiah: number; totalRupiah: number; orderCount: number; itemCount: number; quantitySold: number };
  hakProdusen: { accruedRupiah: number; availableRupiah: number; reservedRupiah: number; paidRupiah: number; pendingRupiah: number; partnerCount: number; accrualCount: number };
  margin: { totalRupiah: number; productRupiah: number; shippingRupiah: number };
  payout: { pendingAmountRupiah: number; completedAmountRupiah: number; pendingCount: number; completedCount: number; cancelledCount: number };
  breakdown: { ordersByStatus: Array<{ status: string; count: number }>; distinctProducts: number };
  checks: { identityHold: boolean; marginNonNegative: boolean; payoutWithinHak: boolean };
};

type TransactionRow = { kind: 'ORDER' | 'PAYOUT'; id: string; reference: string; date: string; party: string; amountRupiah: number; status: string };
type Page<T> = { items: T[]; page: number; limit: number; total: number; totalPages: number };
type AccrualRow = { id: string; amountRupiah: number; status: string; createdAt: string; partner: { id: string; name: string }; order: { orderNumber: string }; orderItem: { productNameSnapshot: string; quantity: number; lineTotalRupiah: number } };
type PayoutRow = { id: string; reference: string; amountRupiah: number; status: string; createdAt: string; note: string | null; partner: { id: string; name: string }; accruals?: Array<{ id: string; amountRupiah: number; status: string; orderItem: { productNameSnapshot: string; quantity: number } }> };
type ProductRow = { slug: string; name: string; quantity: number; itemCount: number; omzetRupiah: number; hakProdusenRupiah: number; hppTotalRupiah: number; hppKnown: boolean; marginRupiah: number; producerSurplusRupiah: number | null; partner: { name: string } | null; status: string | null };
type PartnerRow = { partner: { id: string; name: string; slug: string; status: string }; itemCount: number; quantitySold: number; omzetRupiah: number; hakProdusenRupiah: number; hakAvailableRupiah: number; hakReservedRupiah: number; hakPaidRupiah: number; marginRupiah: number; payoutCompletedCount: number; payoutCompletedRupiah: number };
type Impact = {
  totals: { omzetRupiah: number; hakProdusenRupiah: number; marginRupiah: number; payoutPaidRupiah: number; payoutPendingRupiah: number };
  reach: { orderCount: number; orderItemCount: number; quantitySold: number; distinctProducts: number; partnersWithHak: number; partnersPaid: number; activeProducts: number; categories: number };
  fulfilment: { ordersByStatus: Array<{ status: string; count: number }>; itemsByProductionStatus: Array<{ status: string; count: number }> };
  provinces: Array<{ province: string; orderCount: number; omzetRupiah: number }>;
  checks: { identityHold: boolean; marginNonNegative: boolean; payoutWithinHak: boolean };
};

const withRange = (path: string, range: Range) => {
  const query = new URLSearchParams();
  if (range.from) query.set('from', range.from);
  if (range.to) query.set('to', range.to);
  const suffix = query.toString();
  return suffix ? `${path}${path.includes('?') ? '&' : '?'}${suffix}` : path;
};

function SummaryPanel({ base, range }: { base: string; range: Range }) {
  const { data, error, loading } = useResource<{ summary: Summary }>(withRange(`${base}/summary`, range));
  if (loading) return <Loading label="Memuat ringkasan finance..." />;
  if (error) return <ErrorState message={error} />;
  const summary = data?.summary;
  if (!summary) return <ErrorState message="Ringkasan belum tersedia." />;
  return <section aria-label="Ringkasan finance">
    <section className="metric-grid" aria-label="Metrik finance">
      <div className="metric"><span>Omzet</span><strong>{money(summary.omzet.totalRupiah)}</strong><small>{summary.omzet.orderCount} order sah</small></div>
      <div className="metric"><span>Hak produsen</span><strong>{money(summary.hakProdusen.accruedRupiah)}</strong><small>{money(summary.hakProdusen.availableRupiah)} tersedia</small></div>
      <div className="metric"><span>Margin Dapuremakita</span><strong>{money(summary.margin.totalRupiah)}</strong><small>share mitra {summary.producerShareBps / 100}%</small></div>
      <div className="metric"><span>Payout dibayar</span><strong>{money(summary.payout.completedAmountRupiah)}</strong><small>{summary.payout.completedCount} payout selesai</small></div>
    </section>
    <section className="list-panel" aria-label="Rincian finance">
      <h2>Rincian</h2>
      <div className="summary-row"><span>Omzet produk</span><strong>{money(summary.omzet.productRupiah)}</strong></div>
      <div className="summary-row"><span>Omzet pengiriman</span><strong>{money(summary.omzet.shippingRupiah)}</strong></div>
      <div className="summary-row"><span>Item terjual</span><strong>{summary.omzet.quantitySold} unit dari {summary.omzet.itemCount} item</strong></div>
      <div className="summary-row"><span>Hak tersedia / ditahan / dibayar</span><strong>{money(summary.hakProdusen.availableRupiah)} · {money(summary.hakProdusen.reservedRupiah)} · {money(summary.hakProdusen.paidRupiah)}</strong></div>
      <div className="summary-row"><span>Payout tertunda</span><strong>{money(summary.payout.pendingAmountRupiah)}</strong></div>
      <div className="summary-row"><span>Mitra penerima hak</span><strong>{summary.hakProdusen.partnerCount}</strong></div>
    </section>
    <section className="list-panel" aria-label="Status order sah">
      <h2>Status order sah</h2>
      {summary.breakdown.ordersByStatus.length === 0 ? <p className="empty-state">Belum ada order sah.</p> : summary.breakdown.ordersByStatus.map((row) => <div className="summary-row" key={row.status}><span>{row.status}</span><strong>{row.count}</strong></div>)}
    </section>
    <ul className="finance-checks">
      <li className={summary.checks.identityHold ? 'ok' : 'bad'}><BadgeCheck size={16} /> {summary.checks.identityHold ? 'Omzet = hak produsen + margin' : 'Identitas omzet tidak konsisten'}</li>
      <li className={summary.checks.marginNonNegative ? 'ok' : 'bad'}><ShieldCheck size={16} /> {summary.checks.marginNonNegative ? 'Margin tidak negatif' : 'Margin negatif'}</li>
      <li className={summary.checks.payoutWithinHak ? 'ok' : 'bad'}><HandCoins size={16} /> {summary.checks.payoutWithinHak ? 'Payout tidak melebihi hak' : 'Payout melebihi hak'}</li>
    </ul>
  </section>;
}

function TransactionsPanel({ base, range }: { base: string; range: Range }) {
  const { data, error, loading } = useResource<Page<TransactionRow>>(withRange(`${base}/transactions?page=1&limit=20`, range));
  if (loading) return <Loading label="Memuat riwayat transaksi..." />;
  if (error) return <ErrorState message={error} />;
  const items = data?.items ?? [];
  return <section className="list-panel" aria-label="Riwayat transaksi">
    <h2>Riwayat transaksi</h2>
    <p className="eyebrow">{data?.total ?? 0} dokumen finansial</p>
    {items.length === 0 ? <p className="empty-state">Belum ada transaksi sah.</p> : <div className="finance-table-wrap"><table className="finance-table">
      <thead><tr><th scope="col">Jenis</th><th scope="col">Referensi</th><th scope="col">Waktu</th><th scope="col">Pihak</th><th scope="col">Nilai</th><th scope="col">Status</th></tr></thead>
      <tbody>{items.map((row) => <tr key={`${row.kind}-${row.id}`}>
        <td>{row.kind === 'ORDER' ? <Receipt size={15} /> : <HandCoins size={15} />} {row.kind === 'ORDER' ? 'Order' : 'Payout'}</td>
        <td>{row.reference}</td>
        <td>{dateTime(row.date)}</td>
        <td>{row.party}</td>
        <td>{money(row.amountRupiah)}</td>
        <td><span className="status-badge">{row.status}</span></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

function AccrualsPanel({ base }: { base: string }) {
  const { data, error, loading } = useResource<Page<AccrualRow> & { totals: Array<{ status: string; count: number; amountRupiah: number }> }>(`${base}/accruals?page=1&limit=20`);
  if (loading) return <Loading label="Memuat hak produsen..." />;
  if (error) return <ErrorState message={error} />;
  const items = data?.items ?? [];
  return <section className="list-panel" aria-label="Hak produsen">
    <h2>Hak produsen</h2>
    {(data?.totals ?? []).map((total) => <div className="summary-row" key={total.status}><span>{total.status}</span><strong>{total.count} item · {money(total.amountRupiah)}</strong></div>)}
    {items.length === 0 ? <p className="empty-state">Belum ada hak produsen.</p> : <div className="finance-table-wrap"><table className="finance-table">
      <thead><tr><th scope="col">Order</th><th scope="col">Produk</th><th scope="col">Mitra</th><th scope="col">Nilai item</th><th scope="col">Hak</th><th scope="col">Status</th></tr></thead>
      <tbody>{items.map((row) => <tr key={row.id}>
        <td>{row.order.orderNumber}</td>
        <td>{row.orderItem.productNameSnapshot} × {row.orderItem.quantity}</td>
        <td>{row.partner.name}</td>
        <td>{money(row.orderItem.lineTotalRupiah)}</td>
        <td>{money(row.amountRupiah)}</td>
        <td><span className="status-badge">{row.status}</span></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

function PayoutPanel({ base, canWrite }: { base: string; canWrite: boolean }) {
  const list = useResource<Page<PayoutRow>>(`${base}/payouts?page=1&limit=20`);
  const partners = useResource<{ items: Array<{ id: string; name: string }> }>(canWrite ? `/api/admin/partners?page=1&limit=100` : null);
  const [partnerId, setPartnerId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const items = list.data?.items ?? [];

  const act = useCallback(async (path: string) => {
    setBusy(true); setMessage('');
    try { await requestJson(path, { method: 'POST', headers: { 'Content-Type': 'application/json' } }); setMessage('Payout diperbarui.'); window.dispatchEvent(new CustomEvent('finance:reload')); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }, []);

  async function createPayout(event: FormEvent) {
    event.preventDefault();
    if (!partnerId) return;
    setBusy(true); setMessage('');
    try {
      const result = (await requestJson(`${base}/payouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: `payout-${crypto.randomUUID()}`, partnerId }) }) as { payout: { reference: string; amountRupiah: number } });
      setMessage(`Payout ${result.payout.reference} dibuat senilai ${money(result.payout.amountRupiah)}.`);
      window.dispatchEvent(new CustomEvent('finance:reload'));
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  if (list.loading) return <Loading label="Memuat payout..." />;
  if (list.error) return <ErrorState message={list.error} />;
  return <section className="list-panel" aria-label="Payout">
    <h2>Payout</h2>
    <p className="eyebrow">Nilai payout dihitung server dari hak produsen yang tersedia; klien tidak mengirim nominal.</p>
    {canWrite && <form className="portal-form inline-form" onSubmit={createPayout}>
      <label>Mitra<select aria-label="Pilih mitra" required value={partnerId} onChange={(event) => setPartnerId(event.target.value)}><option value="">Pilih mitra</option>{(partners.data?.items ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
      <button className="button primary" disabled={busy || !partnerId}>{busy ? 'Memproses...' : 'Buat payout dari hak tersedia'}</button>
    </form>}
    {message && <p role="status">{message}</p>}
    {items.length === 0 ? <p className="empty-state">Belum ada payout.</p> : <div className="finance-table-wrap"><table className="finance-table">
      <thead><tr><th scope="col">Referensi</th><th scope="col">Mitra</th><th scope="col">Nilai</th><th scope="col">Dibuat</th><th scope="col">Status</th>{canWrite && <th scope="col">Aksi</th>}</tr></thead>
      <tbody>{items.map((payout) => <tr key={payout.id}>
        <td>{payout.reference}</td>
        <td>{payout.partner.name}</td>
        <td>{money(payout.amountRupiah)}</td>
        <td>{dateTime(payout.createdAt)}</td>
        <td><span className="status-badge">{payout.status}</span></td>
        {canWrite && <td className="row-actions">{payout.status === 'PENDING' && <>
          <button type="button" className="text-link" disabled={busy} onClick={() => { void act(`${base}/payouts/${payout.id}/complete`); }}>Tandai dibayar</button>
          <button type="button" className="text-link" disabled={busy} onClick={() => { void act(`${base}/payouts/${payout.id}/cancel`); }}>Batalkan</button>
        </>}</td>}
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

function ProductReport({ base, range }: { base: string; range: Range }) {
  const { data, error, loading } = useResource<{ items: ProductRow[]; total: number }>(withRange(`${base}/reports/products?limit=50`, range));
  if (loading) return <Loading label="Memuat laporan produk..." />;
  if (error) return <ErrorState message={error} />;
  const items = data?.items ?? [];
  return <section className="list-panel" aria-label="Laporan produk">
    <h2>Laporan produk</h2>
    <p className="eyebrow">{data?.total ?? 0} produk terjual pada periode ini</p>
    {items.length === 0 ? <p className="empty-state">Belum ada penjualan sah.</p> : <div className="finance-table-wrap"><table className="finance-table">
      <thead><tr><th scope="col">Produk</th><th scope="col">Mitra</th><th scope="col">Terjual</th><th scope="col">Omzet</th><th scope="col">HPP</th><th scope="col">Hak produsen</th><th scope="col">Margin</th></tr></thead>
      <tbody>{items.map((row) => <tr key={row.slug}>
        <td>{row.name}<small>{row.slug}</small></td>
        <td>{row.partner?.name ?? '-'}</td>
        <td>{row.quantity} unit</td>
        <td>{money(row.omzetRupiah)}</td>
        <td>{row.hppKnown ? money(row.hppTotalRupiah) : 'HPP belum tercatat'}</td>
        <td>{money(row.hakProdusenRupiah)}</td>
        <td>{money(row.marginRupiah)}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

function PartnerReport({ base, range }: { base: string; range: Range }) {
  const { data, error, loading } = useResource<{ items: PartnerRow[]; total: number }>(withRange(`${base}/reports/partners?limit=50`, range));
  if (loading) return <Loading label="Memuat laporan mitra..." />;
  if (error) return <ErrorState message={error} />;
  const items = data?.items ?? [];
  return <section className="list-panel" aria-label="Laporan mitra">
    <h2>Laporan mitra</h2>
    <p className="eyebrow">{data?.total ?? 0} mitra</p>
    {items.length === 0 ? <p className="empty-state">Belum ada mitra.</p> : <div className="finance-table-wrap"><table className="finance-table">
      <thead><tr><th scope="col">Mitra</th><th scope="col">Item</th><th scope="col">Omzet kontribusi</th><th scope="col">Hak produsen</th><th scope="col">Tersedia</th><th scope="col">Dibayar</th><th scope="col">Payout</th></tr></thead>
      <tbody>{items.map((row) => <tr key={row.partner.id}>
        <td>{row.partner.name}<small>{row.partner.status}</small></td>
        <td>{row.itemCount} item · {row.quantitySold} unit</td>
        <td>{money(row.omzetRupiah)}</td>
        <td>{money(row.hakProdusenRupiah)}</td>
        <td>{money(row.hakAvailableRupiah)}</td>
        <td>{money(row.hakPaidRupiah)}</td>
        <td>{row.payoutCompletedCount}× {money(row.payoutCompletedRupiah)}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

function ImpactReport({ base, range }: { base: string; range: Range }) {
  const { data, error, loading } = useResource<Impact>(withRange(`${base}/reports/impact`, range));
  if (loading) return <Loading label="Memuat laporan dampak..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <ErrorState message="Laporan dampak belum tersedia." />;
  return <section aria-label="Laporan dampak">
    <section className="metric-grid" aria-label="Dampak ekonomi">
      <div className="metric"><span>Omzet</span><strong>{money(data.totals.omzetRupiah)}</strong></div>
      <div className="metric"><span>Hak produsen</span><strong>{money(data.totals.hakProdusenRupiah)}</strong></div>
      <div className="metric"><span>Margin</span><strong>{money(data.totals.marginRupiah)}</strong></div>
      <div className="metric"><span>Payout dibayar</span><strong>{money(data.totals.payoutPaidRupiah)}</strong></div>
    </section>
    <section className="metric-grid" aria-label="Jangkauan dampak">
      <div className="metric"><span>Order sah</span><strong>{data.reach.orderCount}</strong></div>
      <div className="metric"><span>Unit terjual</span><strong>{data.reach.quantitySold}</strong></div>
      <div className="metric"><span>Mitra berhak</span><strong>{data.reach.partnersWithHak}</strong></div>
      <div className="metric"><span>Mitra dibayar</span><strong>{data.reach.partnersPaid}</strong></div>
    </section>
    <section className="list-panel" aria-label="Sebaran provinsi">
      <h2>Sebaran dampak per provinsi</h2>
      {data.provinces.length === 0 ? <p className="empty-state">Belum ada data provinsi.</p> : data.provinces.map((row) => <div className="summary-row" key={row.province}><span>{row.province} · {row.orderCount} order</span><strong>{money(row.omzetRupiah)}</strong></div>)}
    </section>
    <section className="list-panel" aria-label="Status pemenuhan">
      <h2>Pemenuhan order</h2>
      {data.fulfilment.ordersByStatus.map((row) => <div className="summary-row" key={row.status}><span>{row.status}</span><strong>{row.count}</strong></div>)}
      {data.fulfilment.itemsByProductionStatus.map((row) => <div className="summary-row" key={row.status}><span>Produksi {row.status}</span><strong>{row.count}</strong></div>)}
    </section>
  </section>;
}

export function FinanceView({ base, kind, tabs, canWrite, viewer }: { base: string; kind: FinanceViewKind; tabs?: Tab[]; canWrite: boolean; viewer: string }) {
  const [range, setRange] = useState<Range>({});
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const listener = () => setReloadKey((key) => key + 1);
    window.addEventListener('finance:reload', listener);
    return () => window.removeEventListener('finance:reload', listener);
  }, []);

  const titles: Record<FinanceViewKind, [string, string, typeof FileBarChart]> = {
    summary: ['Ringkasan finance', 'Omzet, hak produsen, margin, dan payout', HandCoins],
    transactions: ['Riwayat transaksi', 'Order sah dan payout yang tercatat di buku finance', Receipt],
    accruals: ['Hak produsen', 'Akresi hak per item order yang telah sah', Wallet],
    payouts: ['Payout', 'Pencairan hak produsen ke mitra', ArrowLeftRight],
    products: ['Laporan produk', 'Omzet, HPP, hak produsen, dan margin per produk', FileBarChart],
    partners: ['Laporan mitra', 'Kontribusi dan hak tiap mitra', Users],
    impact: ['Laporan dampak', 'Angka ekonomi dan jangkauan ekosistem', BadgeCheck],
  };
  const [title, subtitle, Icon] = titles[kind];
  const showRange = kind !== 'accruals' && kind !== 'payouts';

  let panel: ReactNode;
  if (kind === 'summary') panel = <SummaryPanel base={base} range={range} />;
  else if (kind === 'transactions') panel = <TransactionsPanel base={base} range={range} />;
  else if (kind === 'accruals') panel = <AccrualsPanel base={base} />;
  else if (kind === 'payouts') panel = <PayoutPanel key={reloadKey} base={base} canWrite={canWrite} />;
  else if (kind === 'products') panel = <ProductReport base={base} range={range} />;
  else if (kind === 'partners') panel = <PartnerReport base={base} range={range} />;
  else panel = <ImpactReport base={base} range={range} />;

  return <div className="finance-view">
    <div className="portal-heading finance-heading">
      <div><p className="eyebrow"><Icon size={15} /> {viewer}</p><h2>{title}</h2><p className="lede">{subtitle}</p></div>
      {showRange && <RangeFilter range={range} onChange={setRange} />}
    </div>
    {tabs && <FinanceTabs tabs={tabs} current={kind} />}
    {canWrite ? null : <p className="finance-readonly" role="note"><ShieldCheck size={15} /> Tampilan baca-sahaja: seluruh perhitungan dan pencatatan dilakukan oleh server.</p>}
    {panel}
  </div>;
}
