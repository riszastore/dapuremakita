import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { ImageUp, Save, ExternalLink } from "lucide-react";
import { defaultSiteContent, type SiteContent } from "./site-content";
import "./site-content-admin.css";

const API = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API + path, { credentials: "include", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Permintaan belum berhasil.");
  return data as T;
}

type Field = [keyof SiteContent, string, "text" | "textarea"];
const sections: Array<{ title: string; description: string; fields: Field[] }> =
  [
    {
      title: "Header",
      description: "Label navigasi dan tombol masuk.",
      fields: [
        ["headerHomeLabel", "Beranda", "text"],
        ["headerProductsLabel", "Produk", "text"],
        ["headerStoriesLabel", "Cerita mitra", "text"],
        ["headerImpactLabel", "Dampak", "text"],
        ["headerAboutLabel", "Tentang", "text"],
        ["headerLoginLabel", "Tombol masuk", "text"],
      ],
    },
    {
      title: "Hero",
      description: "Konten utama yang pertama dilihat pengunjung.",
      fields: [
        ["heroEyebrow", "Label kecil", "text"],
        ["heroTitle", "Judul utama", "text"],
        ["heroAccent", "Aksen judul", "text"],
        ["heroDescription", "Deskripsi", "textarea"],
        ["heroPrimaryLabel", "Tombol utama", "text"],
        ["heroSecondaryLabel", "Tombol sekunder", "text"],
        ["heroQuote", "Kutipan hero", "textarea"],
        ["heroSupportTitle", "Judul dukungan", "text"],
        ["heroSupportText", "Teks dukungan", "text"],
      ],
    },
    {
      title: "Body",
      description: "Judul section kategori, produk, dan dampak.",
      fields: [
        ["categoriesEyebrow", "Label kategori", "text"],
        ["categoriesTitle", "Judul kategori", "text"],
        ["productsEyebrow", "Label produk", "text"],
        ["productsTitle", "Judul produk", "text"],
        ["impactTitle", "Judul dampak", "textarea"],
        ["impactDescription", "Deskripsi dampak", "textarea"],
      ],
    },
    {
      title: "Footer",
      description: "Deskripsi brand dan label tautan footer.",
      fields: [
        ["footerDescription", "Deskripsi footer", "textarea"],
        ["footerShopLabel", "Belanja produk", "text"],
        ["footerProcessLabel", "Cara kami bekerja", "text"],
        ["footerWaqfLabel", "Wakaf produktif", "text"],
        ["footerPartnerLabel", "Jadi mitra", "text"],
        ["footerWorkspaceLabel", "Ruang kerja", "text"],
      ],
    },
  ];

export function SiteContentManager() {
  const [form, setForm] = useState<SiteContent>(defaultSiteContent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    request<{ content: SiteContent }>("/api/admin/site-content")
      .then((data) => setForm({ ...defaultSiteContent, ...data.content }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const dirtySummary = useMemo(
    () => "Perubahan akan langsung dipakai halaman publik setelah disimpan.",
    [],
  );
  const update = (key: keyof SiteContent, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const data = await request<{ content: SiteContent }>(
        "/api/admin/site-content",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Origin: window.location.origin,
          },
          body: JSON.stringify(form),
        },
      );
      setForm({ ...defaultSiteContent, ...data.content });
      setMessage("Konten situs berhasil disimpan.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: "logo" | "favicon" | "hero", file?: File) {
    if (!file) return;
    setMessage("");
    setError("");
    const body = new FormData();
    body.append("file", file);
    try {
      const data = await request<{ url: string }>(
        "/api/admin/site-content/assets/" + kind,
        { method: "POST", headers: { Origin: window.location.origin }, body },
      );
      const key =
        kind === "logo"
          ? "logoUrl"
          : kind === "favicon"
            ? "faviconUrl"
            : "heroImageUrl";
      update(key, data.url);
      setMessage(
        "Aset berhasil diunggah. Klik Simpan Perubahan untuk menerapkannya.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading)
    return (
      <div className="portal-state" role="status">
        Memuat pengelola konten...
      </div>
    );
  return (
    <form className="cms-shell" onSubmit={save}>
      <div className="cms-toolbar">
        <div>
          <h2>Konten Situs</h2>
          <p>{dirtySummary}</p>
        </div>
        <div className="cms-toolbar-actions">
          <a className="cms-preview" href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Preview situs
          </a>
          <button className="button primary" type="submit" disabled={saving}>
            <Save size={16} />
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>
      {message && (
        <div className="cms-message" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="error-box cms-alert" role="alert">
          {error}
        </div>
      )}
      <section className="cms-card">
        <div className="cms-card-heading">
          <div>
            <h3>Brand & Media</h3>
            <p>Logo, favicon, dan gambar hero.</p>
          </div>
        </div>
        <div className="cms-assets">
          <AssetEditor
            label="Logo"
            value={form.logoUrl}
            accept="image/png,image/webp,image/jpeg"
            onUpload={(e) => void upload("logo", e.target.files?.[0])}
          />
          <AssetEditor
            label="Favicon"
            value={form.faviconUrl}
            accept="image/x-icon,image/png,.ico"
            onUpload={(e) => void upload("favicon", e.target.files?.[0])}
          />
          <AssetEditor
            label="Hero"
            value={form.heroImageUrl}
            accept="image/png,image/webp,image/jpeg"
            onUpload={(e) => void upload("hero", e.target.files?.[0])}
          />
        </div>
      </section>
      {sections.map((section) => (
        <section className="cms-card" key={section.title}>
          <div className="cms-card-heading">
            <div>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </div>
          </div>
          <div className="cms-fields">
            {section.fields.map(([key, label, type]) => (
              <label
                className={type === "textarea" ? "cms-field wide" : "cms-field"}
                key={key}
              >
                <span>{label}</span>
                {type === "textarea" ? (
                  <textarea
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    rows={3}
                  />
                ) : (
                  <input
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ))}
      <div className="cms-bottom-save">
        <button className="button primary" type="submit" disabled={saving}>
          <Save size={16} />
          {saving ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>
    </form>
  );
}

function AssetEditor({
  label,
  value,
  accept,
  onUpload,
}: {
  label: string;
  value: string;
  accept: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <article className="cms-asset">
      <div className="cms-asset-preview">
        {label === "Favicon" ? (
          <img className="favicon-preview" src={value} alt="Preview favicon" />
        ) : (
          <img src={value} alt={"Preview " + label} />
        )}
      </div>
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
        <label className="cms-upload">
          <ImageUp size={16} />
          Ganti {label}
          <input type="file" accept={accept} onChange={onUpload} />
        </label>
      </div>
    </article>
  );
}
