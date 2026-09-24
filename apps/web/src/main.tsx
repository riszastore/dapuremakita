import { StrictMode, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Leaf,
  Menu,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import "./styles.css";
import "./batch2.css";
import { Portal, setPortalSessionUser } from "./portal";
import { AdminApp } from "./admin";
import {
  CartPage,
  CheckoutPage,
  OrderStatusPage,
  PaymentPage,
  PartnerOrders,
  AdminOrders,
} from "./order";
import { addCartItem } from "./order";
import { NazhirApp } from "./nazhir";
import { useSiteContent, type SiteContent } from "./site-content";
import { assetUrl, browserPath, routePath, STATIC_PREVIEW } from "./runtime";

type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  description: string;
  imageUrl: string;
  category: { name: string; slug: string };
  partner: { name: string; slug: string } | null;
};
type Category = { name: string; slug: string; description?: string };
const demoCategories: Category[] = [
  {
    name: "Camilan Rumahan",
    slug: "camilan-rumahan",
    description: "Keripik, stik, kue kering, dan kudapan khas.",
  },
  {
    name: "Sambal & Lauk Siap Makan",
    slug: "sambal-lauk",
    description: "Rasa rumahan yang praktis dan penuh cerita.",
  },
  {
    name: "Minuman & Racikan",
    slug: "minuman-racikan",
    description: "Minuman sehat, herbal, dan racikan khas.",
  },
  {
    name: "Bahan & Kebutuhan Dapur",
    slug: "kebutuhan-dapur",
    description: "Produk pilihan untuk dapur keluarga.",
  },
  {
    name: "Kreasi Lainnya",
    slug: "kreasi-lainnya",
    description: "Kerajinan, hampers, dan produk kreatif.",
  },
];
const demoProducts: Product[] = [
  {
    id: "demo-1",
    name: "Keripik Pisang Keju",
    slug: "demo-keripik-pisang",
    price: 25000,
    description:
      "Camilan renyah dari pisang pilihan, membantu penghasilan keluarga.",
    imageUrl: assetUrl("/images/products/keripik-pisang.webp"),
    category: { name: "Camilan", slug: "camilan-rumahan" },
    partner: { name: "Ibu Siti · Bandung", slug: "ibu-siti" },
  },
  {
    id: "demo-2",
    name: "Sambal Kecombrang",
    slug: "demo-sambal-kecombrang",
    price: 28000,
    description:
      "Resep keluarga yang kini dikemas lebih rapi untuk pasar lebih luas.",
    imageUrl: assetUrl("/images/products/sambal-kecombrang.webp"),
    category: { name: "Sambal", slug: "sambal-lauk" },
    partner: { name: "Bu Rina · Lembang", slug: "bu-rina" },
  },
  {
    id: "demo-3",
    name: "Serbuk Jahe Rempah",
    slug: "demo-jahe-rempah",
    price: 32000,
    description:
      "Minuman sehat untuk keluarga, dibuat dari rempah alami pilihan.",
    imageUrl: assetUrl("/images/products/jahe-rempah.webp"),
    category: { name: "Minuman", slug: "minuman-racikan" },
    partner: { name: "Ibu Yani · Cimahi", slug: "ibu-yani" },
  },
  {
    id: "demo-4",
    name: "Kue Kering Nastar",
    slug: "demo-nastar",
    price: 40000,
    description:
      "Kue kering rumahan dengan bahan pilihan dan tampilan profesional.",
    imageUrl: assetUrl("/images/products/nastar.webp"),
    category: { name: "Camilan", slug: "camilan-rumahan" },
    partner: { name: "Ibu Dewi · Bandung", slug: "ibu-dewi" },
  },
  {
    id: "demo-5",
    name: "Sirup Rosella",
    slug: "demo-rosella",
    price: 27000,
    description: "Rasa segar dari bunga rosella, baik untuk keluarga.",
    imageUrl: assetUrl("/images/products/sirup-rosella.webp"),
    category: { name: "Minuman", slug: "minuman-racikan" },
    partner: { name: "Ibu Lina · Garut", slug: "ibu-lina" },
  },
];

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
const meta: Record<string, [string, string]> = {
  "/": [
    "Dapuremakita | Kurasi produk lokal bermakna",
    "Dapuremakita mempertemukan produk lokal terpilih, cerita pembuatnya, dan ekosistem yang tumbuh bersama.",
  ],
  "/katalog": [
    "Katalog | Dapuremakita",
    "Jelajahi produk lokal yang telah melewati proses kurasi Dapuremakita.",
  ],
  "/tentang": [
    "Tentang | Dapuremakita",
    "Mengenal cara Dapuremakita membangun ekosistem produk lokal yang bertanggung jawab.",
  ],
  "/kurasi": [
    "Kurasi | Dapuremakita",
    "Proses kurasi yang menjaga mutu, cerita, dan kesiapan tumbuh produk lokal.",
  ],
  "/mitra": [
    "Mitra | Dapuremakita",
    "Mitra pembuat dan penggerak ekosistem Dapuremakita.",
  ],
  "/wakaf-produktif": [
    "Wakaf Produktif | Dapuremakita",
    "Skema wakaf produktif untuk penguatan aset dan kapasitas usaha komunitas.",
  ],
  "/kemitraan": [
    "Kemitraan | Dapuremakita",
    "Mari membangun kemitraan yang adil dan bertumbuh bersama.",
  ],
};
async function getJson<T>(path: string): Promise<T> {
  if (STATIC_PREVIEW) {
    if (path === "/public/categories")
      return { categories: demoCategories } as T;
    if (path.startsWith("/public/products/")) {
      const slug = decodeURIComponent(path.split("/").pop() ?? "");
      const product = demoProducts.find((item) => item.slug === slug);
      if (!product) throw new Error("not-found");
      return { product } as T;
    }
    if (path.startsWith("/public/products?")) {
      const url = new URL(path, "https://preview.dapuremakita.local");
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const category = url.searchParams.get("category") ?? "";
      const limit = Number(url.searchParams.get("limit") ?? 12);
      const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
      const filtered = demoProducts.filter((product) =>
        (!search || `${product.name} ${product.description}`.toLowerCase().includes(search)) &&
        (!category || product.category.slug === category),
      );
      const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
      const start = (page - 1) * limit;
      return { items: filtered.slice(start, start + limit), totalPages } as T;
    }
  }
  const response = await fetch(apiUrl(path));
  if (!response.ok)
    throw new Error(
      response.status === 404 ? "not-found" : "Gagal memuat data.",
    );
  return response.json();
}
function useRoute() {
  const [path, setPath] = useState(routePath(window.location.pathname));
  useEffect(() => {
    const update = () => setPath(routePath(window.location.pathname));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return path;
}
function navigate(path: string) {
  window.history.pushState({}, "", browserPath(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function Brand({ content }: { content: SiteContent }) {
  return (
    <a
      className="brand brand-logo-link"
      href={browserPath("/")}
      onClick={(event) => {
        event.preventDefault();
        navigate("/");
      }}
    >
      <img
        src={content.logoUrl}
        alt="Dapuremakita"
        className="brand-logo-image"
      />
    </a>
  );
}
function Nav({
  open,
  setOpen,
  content,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  content: SiteContent;
}) {
  const links = [
    ["/", content.headerHomeLabel],
    ["/katalog", content.headerProductsLabel],
    ["/mitra", content.headerStoriesLabel],
    ["/#dampak", content.headerImpactLabel],
    ["/tentang", content.headerAboutLabel],
  ];
  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Brand content={content} />
          <nav
            id="site-nav"
            className={open ? "site-nav open" : "site-nav"}
            aria-label="Navigasi utama"
          >
            {links.map(([href, label]) => (
              <a
                key={href}
                href={browserPath(href)}
                onClick={(event) => {
                  event.preventDefault();
                  if (href === "/#dampak") {
                    navigate("/");
                    window.setTimeout(
                      () =>
                        document
                          .getElementById("dampak")
                          ?.scrollIntoView({ behavior: "smooth" }),
                      0,
                    );
                  } else {
                    navigate(href);
                  }
                  setOpen(false);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="header-tools">
            <label className="header-search">
              <Search size={17} />
              <span className="sr-only">Cari produk</span>
              <input
                placeholder="Cari produk atau mitra..."
                aria-label="Cari produk atau mitra"
              />
            </label>
            <a
              className="header-cart"
              href={browserPath("/cart")}
              aria-label="Buka keranjang"
              onClick={(event) => {
                event.preventDefault();
                navigate("/cart");
                setOpen(false);
              }}
            >
              <ShoppingBag size={19} />
              <span>2</span>
            </a>
            <a
              className="header-login"
              href={browserPath("/login")}
              onClick={(e) => {
                e.preventDefault();
                navigate("/login");
              }}
            >
              {content.headerLoginLabel}
            </a>
            <button
              className="menu-button"
              aria-expanded={open}
              aria-controls="site-nav"
              aria-label={open ? "Tutup menu" : "Buka menu"}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
function Layout({
  children,
  content,
}: {
  children: React.ReactNode;
  content: SiteContent;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Nav open={open} setOpen={setOpen} content={content} />
      {children}
      <footer>
        <div className="footer-brand">
          <Brand content={content} />
          <p>{content.footerDescription}</p>
        </div>
        <div className="footer-links">
          <a
            href={browserPath("/katalog")}
            onClick={(e) => {
              e.preventDefault();
              navigate("/katalog");
            }}
          >
            {content.footerShopLabel}
          </a>
          <a
            href={browserPath("/kurasi")}
            onClick={(e) => {
              e.preventDefault();
              navigate("/kurasi");
            }}
          >
            {content.footerProcessLabel}
          </a>
          <a
            href={browserPath("/wakaf-produktif")}
            onClick={(e) => {
              e.preventDefault();
              navigate("/wakaf-produktif");
            }}
          >
            {content.footerWaqfLabel}
          </a>
          <a
            href={browserPath("/kemitraan")}
            onClick={(e) => {
              e.preventDefault();
              navigate("/kemitraan");
            }}
          >
            {content.footerPartnerLabel}
          </a>
          <a
            href={browserPath("/login")}
            onClick={(e) => {
              e.preventDefault();
              navigate("/login");
            }}
          >
            {content.footerWorkspaceLabel}
          </a>
        </div>
      </footer>
    </>
  );
}
function ProductCard({ product }: { product: Product }) {
  const initials = product.name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return (
    <article className="product-card">
      <button
        className="product-image"
        onClick={() => navigate(`/katalog/${product.slug}`)}
        aria-label={`Lihat ${product.name}`}
      >
        <span className="product-fallback" aria-hidden="true">
          {initials}
        </span>
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        )}
        <span className="product-overlay">
          Lihat produk <ArrowRight size={16} />
        </span>
      </button>
      <div className="product-copy">
        <div className="product-meta">
          <span className="tag">{product.category.name}</span>
          {product.partner && (
            <span className="maker">oleh {product.partner.name}</span>
          )}
        </div>
        <h3>
          <a
            href={browserPath(`/katalog/${product.slug}`)}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/katalog/${product.slug}`);
            }}
          >
            {product.name}
          </a>
        </h3>
        <p>{product.description}</p>
        <div className="product-footer">
          <strong>{rupiah(product.price)}</strong>
          <button
            className="quick-cart"
            type="button"
            aria-label={`Tambah ${product.name} ke keranjang`}
            onClick={() => {
              addCartItem({
                productId: product.id,
                slug: product.slug,
                name: product.name,
                price: product.price,
              });
              navigate("/cart");
            }}
          >
            <ShoppingBag size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}
function Products({
  featured = false,
  category = "",
}: {
  featured?: boolean;
  category?: string;
}) {
  const [state, setState] = useState<{
    products: Product[];
    loading: boolean;
    demo: boolean;
  }>({ products: [], loading: true, demo: false });
  useEffect(() => {
    const query = new URLSearchParams({ limit: featured ? "3" : "12" });
    if (category) query.set("category", category);
    getJson<{ items: Product[] }>(`/public/products?${query}`)
      .then((data) =>
        setState({
          products: data.items.length ? data.items : demoProducts,
          loading: false,
          demo: !data.items.length,
        }),
      )
      .catch(() =>
        setState({ products: demoProducts, loading: false, demo: true }),
      );
  }, [featured, category]);
  if (state.loading)
    return (
      <div role="status" className="state">
        Menyiapkan produk pilihan...
      </div>
    );
  return (
    <>
      <div className="product-grid">
        {state.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {state.demo && (
        <p className="demo-note">
          Tampilan contoh program ideal · data produk akan diganti otomatis saat
          katalog operasional aktif.
        </p>
      )}
    </>
  );
}
function Categories() {
  const visuals = [
    assetUrl("/images/categories/camilan-rumahan.webp"),
    assetUrl("/images/categories/sambal-lauk.webp"),
    assetUrl("/images/categories/minuman-racikan.webp"),
    assetUrl("/images/categories/kebutuhan-dapur.webp"),
    assetUrl("/images/categories/kreasi-lainnya.webp"),
  ];
  return (
    <div className="category-visual-grid">
      {demoCategories.map((category, index) => (
        <a
          className="category-visual-card"
          href={browserPath("/katalog")}
          key={category.slug}
          onClick={(event) => {
            event.preventDefault();
            navigate("/katalog");
          }}
        >
          <img
            src={visuals[index]}
            alt={category.name}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
          <div>
            <strong>{category.name}</strong>
            <small>{category.description}</small>
            <ArrowRight size={15} />
          </div>
        </a>
      ))}
    </div>
  );
}
function Home({ content }: { content: SiteContent }) {
  const homeProducts = demoProducts;

  return (
    <main className="market-home">
      <section className="market-hero">
        <div className="market-hero-copy">
          <span className="hero-label">{content.heroEyebrow}</span>
          <h1>
            {content.heroTitle} <em>{content.heroAccent}</em>
          </h1>
          <p>{content.heroDescription}</p>
          <div className="market-actions">
            <a
              className="button primary"
              href={browserPath("/katalog")}
              onClick={(e) => {
                e.preventDefault();
                navigate("/katalog");
              }}
            >
              {content.heroPrimaryLabel} <ArrowRight size={17} />
            </a>
            <a
              className="button market-secondary"
              href={browserPath("/kemitraan")}
              onClick={(e) => {
                e.preventDefault();
                navigate("/kemitraan");
              }}
            >
              {content.heroSecondaryLabel}
            </a>
          </div>
        </div>
        <div className="market-hero-media">
          <img
            src={content.heroImageUrl}
            alt="Pelaku usaha rumahan Dapuremakita sedang menyiapkan produk"
          />
          <blockquote>{content.heroQuote}</blockquote>
          <div className="hero-support-chip">
            <Sparkles size={20} />
            <span>
              <strong>{content.heroSupportTitle}</strong>
              <small>{content.heroSupportText}</small>
            </span>
          </div>
        </div>

        <div className="market-trust">
          <article>
            <Leaf size={20} />
            <div>
              <strong>Produk Terpercaya</strong>
              <small>terkurasi & berkualitas</small>
            </div>
          </article>
          <article>
            <Sparkles size={20} />
            <div>
              <strong>Langsung dari Mitra</strong>
              <small>usaha rumahan</small>
            </div>
          </article>
          <article>
            <ShieldCheck size={20} />
            <div>
              <strong>Hadirkan Dampak</strong>
              <small>untuk keluarga</small>
            </div>
          </article>
          <article>
            <ShieldCheck size={20} />
            <div>
              <strong>Transparan & Aman</strong>
              <small>pembayaran & pengiriman</small>
            </div>
          </article>
        </div>
      </section>

      <section className="market-section">
        <div className="market-heading">
          <div>
            <span>{content.categoriesEyebrow}</span>
            <h2>{content.categoriesTitle}</h2>
          </div>
          <a
            href={browserPath("/katalog")}
            onClick={(e) => {
              e.preventDefault();
              navigate("/katalog");
            }}
          >
            Lihat semua kategori <ArrowRight size={15} />
          </a>
        </div>
        <Categories />
      </section>

      <section className="market-section products-block">
        <div className="market-heading">
          <div>
            <span>{content.productsEyebrow}</span>
            <h2>{content.productsTitle}</h2>
          </div>
          <a
            href={browserPath("/katalog")}
            onClick={(e) => {
              e.preventDefault();
              navigate("/katalog");
            }}
          >
            Lihat semua produk <ArrowRight size={15} />
          </a>
        </div>
        <div className="market-product-grid">
          {homeProducts.map((product, index) => {
            const homepageImages = [
              assetUrl("/images/products/keripik-pisang.webp"),
              assetUrl("/images/products/sambal-kecombrang.webp"),
              assetUrl("/images/products/jahe-rempah.webp"),
              assetUrl("/images/products/nastar.webp"),
              assetUrl("/images/products/sirup-rosella.webp"),
            ];
            const imageSrc =
              product.imageUrl || homepageImages[index % homepageImages.length];
            return (
              <article className="market-product-card" key={product.id}>
                <div className="market-product-image">
                  <img
                    src={imageSrc}
                    alt={product.name}
                    loading="lazy"
                    onError={(event) => {
                      const fallback =
                        homepageImages[index % homepageImages.length];
                      if (
                        event.currentTarget.dataset.fallbackApplied === "true"
                      ) {
                        event.currentTarget.style.visibility = "hidden";
                        return;
                      }
                      event.currentTarget.dataset.fallbackApplied = "true";
                      event.currentTarget.src = fallback;
                    }}
                  />
                  <span>
                    {
                      [
                        "Produk Terlaris",
                        "Produk Unggulan",
                        "Baru",
                        "Produk Unggulan",
                        "Pilihan Sehat",
                      ][index]
                    }
                  </span>
                </div>
                <div className="market-product-copy">
                  <h3>{product.name}</h3>
                  <small>
                    {product.partner
                      ? "oleh " + product.partner.name
                      : "Mitra Dapuremakita"}
                  </small>
                  <div className="market-price-row">
                    <strong>{rupiah(product.price)}</strong>
                    <span>
                      ★ 4.{8 - (index % 2)} ({64 + index * 12})
                    </span>
                  </div>
                  <p>{product.description}</p>
                  <button
                    aria-label={"Tambah " + product.name + " ke keranjang"}
                    onClick={() => {
                      addCartItem({
                        productId: product.id,
                        slug: product.slug,
                        name: product.name,
                        price: product.price,
                      });
                    }}
                  >
                    <ShoppingBag size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="market-impact" id="dampak">
        <div className="market-impact-head">
          <h2>{content.impactTitle}</h2>
          <p>{content.impactDescription}</p>
        </div>
        <div className="market-impact-grid">
          <article>
            <strong>128</strong>
            <span>Mitra Usaha Rumahan</span>
            <small>target program</small>
          </article>
          <article>
            <strong>320+</strong>
            <span>Produk Tersedia</span>
            <small>target program</small>
          </article>
          <article>
            <strong>12.500+</strong>
            <span>Pesanan Terkirim</span>
            <small>target program</small>
          </article>
          <article>
            <strong>850+</strong>
            <span>Keluarga Terbantu</span>
            <small>target program</small>
          </article>
        </div>
      </section>

      <section className="market-bottom">
        <article className="market-testimonial">
          <img src={assetUrl("/images/mentoring.webp")} alt="Mitra Dapuremakita" />
          <div>
            <blockquote>
              “Dulu saya hanya jualan di lingkungan rumah. Sekarang produk saya
              bisa dikenal lebih luas. Alhamdulillah, penghasilan keluarga jadi
              lebih stabil.”
            </blockquote>
            <strong>Ilustrasi perjalanan mitra</strong>
            <small>Gambaran dampak pendampingan Dapuremakita</small>
          </div>
        </article>
        <article className="market-cta">
          <img src={assetUrl("/images/hero.webp")} alt="Aktivitas dapur Dapuremakita" />
          <div>
            <h3>Mari terus kuatkan usaha rumahan di Indonesia.</h3>
            <p>
              Dukung dengan berbelanja, menjadi mitra, atau berkolaborasi
              bersama kami.
            </p>
            <div>
              <a
                className="button primary"
                href={browserPath("/katalog")}
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/katalog");
                }}
              >
                Lihat Produk
              </a>
              <a
                className="button market-dark-outline"
                href={browserPath("/kemitraan")}
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/kemitraan");
                }}
              >
                Dukung Program
              </a>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
function Catalog() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>(demoCategories);
  const [data, setData] = useState<{
    items: Product[];
    totalPages: number;
  } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    getJson<{ categories: Category[] }>("/public/categories")
      .then((result) => {
        if (result.categories.length) setCategories(result.categories);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    setError(false);
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ limit: "12", page: String(page) });
      if (search.trim()) query.set("search", search.trim());
      if (category) query.set("category", category);
      getJson<{ items: Product[]; totalPages: number }>(
        `/public/products?${query}`,
      )
        .then((result) => {
          const useCuratedProducts = !search.trim() && !category && page === 1;
          setData(
            useCuratedProducts
              ? { items: demoProducts, totalPages: 1 }
              : result,
          );
        })
        .catch(() => setError(true));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, category, page]);
  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }
  function updateCategory(value: string) {
    setCategory(value);
    setPage(1);
  }
  return (
    <main className="section catalog">
      <div className="page-intro">
        <p className="eyebrow">Katalog terbuka</p>
        <h1>
          Temukan yang <em>berarti.</em>
        </h1>
        <p className="lede">
          Semua yang hadir di sini telah melewati proses kurasi bersama
          pembuatnya.
        </p>
      </div>
      <div className="filters">
        <label className="search-field">
          <Search size={18} />
          <span className="sr-only">Cari produk</span>
          <input
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Cari nama atau cerita produk..."
          />
        </label>
        <label>
          <span className="sr-only">Pilih kategori</span>
          <select
            aria-label="Pilih kategori"
            value={category}
            onChange={(e) => updateCategory(e.target.value)}
          >
            <option value="">Semua kategori</option>
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div role="alert" className="state error-box">
          Katalog belum dapat dimuat. Coba lagi beberapa saat.
        </div>
      ) : !data ? (
        <div role="status" className="state">
          Memuat katalog...
        </div>
      ) : data.items.length ? (
        <>
          <div className="product-grid">
            {data.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div className="pagination" aria-label="Pagination katalog">
            <button
              className="button"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <span>
              Halaman {page} dari {data.totalPages || 1}
            </span>
            <button
              className="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
            </button>
          </div>
        </>
      ) : (
        <div className="state">
          Belum ada produk yang cocok dengan pencarian ini.
        </div>
      )}
    </main>
  );
}
function CategoryPage({ slug }: { slug: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
    "loading",
  );
  useEffect(() => {
    getJson<{ categories: Category[] }>("/public/categories")
      .then((data) => {
        setCategories(data.categories);
        setState(
          data.categories.some((category) => category.slug === slug)
            ? "ready"
            : "missing",
        );
      })
      .catch(() => setState("error"));
  }, [slug]);
  const category = categories.find((item) => item.slug === slug);
  useEffect(() => {
    if (category) {
      document.title = `${category.name} | Katalog | Dapuremakita`;
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute(
          "content",
          `Produk aktif kategori ${category.name} di Dapuremakita.`,
        );
    }
  }, [category]);
  if (state === "loading")
    return (
      <main className="state page-state" role="status">
        Memuat kategori...
      </main>
    );
  if (state === "missing") return <NotFound title="Kategori tidak ditemukan" />;
  if (state === "error")
    return (
      <main className="state page-state error-box" role="alert">
        Kategori belum dapat dimuat.
      </main>
    );
  return (
    <main className="section catalog">
      <div className="page-intro">
        <p className="eyebrow">Kategori</p>
        <h1>{category?.name}</h1>
        <p className="lede">
          Produk aktif yang telah dikurasi dalam kategori ini.
        </p>
      </div>
      <Products category={slug} />
    </main>
  );
}
function ProductDetail({ slug }: { slug: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    getJson<{ product: Product }>(`/public/products/${slug}`)
      .then((data) => {
        setProduct(data.product);
        setState("ready");
      })
      .catch((error) =>
        setState(error.message === "not-found" ? "missing" : "error"),
      );
  }, [slug]);
  useEffect(() => {
    if (product) {
      document.title = `${product.name} | Dapuremakita`;
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", `${product.name}: ${product.description}`);
    }
  }, [product]);
  if (state === "loading")
    return (
      <main className="state page-state" role="status">
        Memuat detail produk...
      </main>
    );
  if (state === "missing") return <NotFound title="Produk tidak ditemukan" />;
  if (state === "error")
    return (
      <main className="state page-state error-box" role="alert">
        Detail produk belum dapat dimuat.
      </main>
    );
  const initials =
    product?.name
      .split(" ")
      .map((word) => word[0])
      .join("") ?? "";
  return (
    <main className="detail section">
      <button className="back-link" onClick={() => navigate("/katalog")}>
        ← Kembali ke katalog
      </button>
      <div className="detail-grid">
        <div className="detail-art detail-photo">
          <span className="detail-fallback" aria-hidden="true">
            {initials}
          </span>
          {product?.imageUrl && (
            <img
              src={product.imageUrl}
              alt={product.name}
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
        <div className="detail-copy">
          <a
            className="tag"
            href={browserPath(`/kategori/${product?.category.slug}`)}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/kategori/${product?.category.slug}`);
            }}
          >
            {product?.category.name}
          </a>
          <h1>{product?.name}</h1>
          <p className="detail-price">{rupiah(product?.price ?? 0)}</p>
          <p className="lede">{product?.description}</p>
          {product?.partner && (
            <div className="maker-story">
              <span className="maker-avatar">
                {product.partner.name.slice(0, 1)}
              </span>
              <p>
                Dibuat oleh <strong>{product.partner.name}</strong>
                <small>Mitra yang tumbuh bersama ekosistem Dapuremakita.</small>
              </p>
            </div>
          )}
          <div className="detail-assurance">
            <span>
              <ShieldCheck size={16} /> Produk aktif & terkurasi
            </span>
            <span>
              <Leaf size={16} /> Mendukung usaha rumah tangga
            </span>
          </div>
          <button
            className="button primary detail-cta"
            onClick={() => {
              if (product)
                addCartItem({
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  price: product.price,
                });
              navigate("/cart");
            }}
          >
            Tambah ke keranjang <ShoppingBag size={17} />
          </button>
        </div>
      </div>
    </main>
  );
}
const content: Record<
  string,
  { eyebrow: string; title: string; paragraphs: string[]; points?: string[] }
> = {
  "/tentang": {
    eyebrow: "Tentang kami",
    title: "Membuat ruang untuk yang baik.",
    paragraphs: [
      "Dapuremakita adalah ruang kurasi dan kolaborasi untuk produk lokal yang dibuat dengan perhatian. Kami percaya nilai sebuah produk tidak berhenti di benda yang sampai ke tangan kita, tetapi juga ada pada relasi yang membentuknya.",
      "Kami bekerja bersama pembuat, komunitas, dan mitra pendukung agar proses tumbuh terasa lebih sehat: dengan standar yang terbuka, komunikasi yang jujur, dan keputusan yang menghormati kapasitas setiap pihak.",
    ],
  },
  "/kurasi": {
    eyebrow: "Proses kurasi",
    title: "Pelan-pelan, dengan standar yang jelas.",
    paragraphs: [
      "Kurasi kami dimulai dari percakapan. Kami mengenal pembuat, sumber bahan, cara kerja, dan alasan di balik produk. Dari sana, kami melihat mutu, konsistensi, kesiapan operasional, serta cerita yang layak disampaikan tanpa dibesar-besarkan.",
    ],
    points: [
      "Percakapan awal dan pemetaan kebutuhan",
      "Tinjauan mutu, keamanan, dan kesiapan pemenuhan",
      "Pendampingan perbaikan sebelum produk ditampilkan",
      "Evaluasi berkala bersama mitra",
    ],
  },
  "/wakaf-produktif": {
    eyebrow: "Wakaf produktif",
    title: "Aset yang terus memberi manfaat.",
    paragraphs: [
      "Wakaf produktif mengarahkan aset wakaf agar dikelola secara produktif, sehingga manfaatnya dapat mengalir dalam jangka panjang. Dalam ekosistem Dapuremakita, pendekatan ini dapat mendukung ruang produksi, peralatan, atau kapasitas usaha yang dikelola secara amanah.",
      "Skema, tata kelola, dan penyaluran manfaat perlu dibahas bersama nazhir serta pihak berwenang. Kami tidak menjanjikan imbal hasil; fokusnya adalah kebermanfaatan, transparansi, dan keberlanjutan pengelolaan.",
    ],
  },
  "/kemitraan": {
    eyebrow: "Kemitraan",
    title: "Mari tumbuh dengan cara yang adil.",
    paragraphs: [
      "Kami terbuka untuk pembuat produk, pemilik ruang, komunitas, lembaga, dan pendukung yang ingin membangun kerja sama jangka panjang. Bentuknya dapat berupa produk, distribusi, pendampingan, pembiayaan, atau pengetahuan.",
      "Setiap kemitraan dimulai dari kebutuhan yang nyata dan ruang lingkup yang disepakati bersama. Ceritakan konteks Anda, lalu kita cari bentuk kolaborasi yang masuk akal.",
    ],
  },
  "/mitra": {
    eyebrow: "Mitra ekosistem",
    title: "Banyak tangan, satu niat baik.",
    paragraphs: [
      "Mitra adalah pembuat, pengolah, perajin, komunitas, dan lembaga yang membuat ekosistem ini hidup. Kami menjaga hubungan ini sebagai kerja bersama, bukan sekadar daftar pemasok.",
      "Di sisi publik, kami hanya menampilkan produk yang telah berstatus aktif. Di sisi kerja internal, proses review dan pendampingan membantu mitra menyiapkan produk dengan lebih matang.",
    ],
  },
};
function StoryPage({ path }: { path: string }) {
  const item = content[path];
  return (
    <main className="story section">
      <p className="eyebrow">{item.eyebrow}</p>
      <h1>{item.title}</h1>
      <div className="story-body">
        {item.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {item.points && (
          <ul>
            {item.points.map((point) => (
              <li key={point}>
                <ShieldCheck size={18} />
                {point}
              </li>
            ))}
          </ul>
        )}
      </div>
      <a
        className="button primary"
        href={browserPath("/kemitraan")}
        onClick={(e) => {
          e.preventDefault();
          navigate("/kemitraan");
        }}
      >
        Mulai percakapan <ArrowRight size={17} />
      </a>
    </main>
  );
}
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; role?: string } | null>(
    null,
  );
  useEffect(() => {
    fetch(apiUrl("/auth/me"), { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const current = (await response.json()).user;
        setUser(current);
        if (current.role === "PARTNER") {
          setPortalSessionUser(current);
          navigate("/portal/mitra");
        } else if (current.role === "NAZHIR_VIEWER") {
          navigate("/nazhir");
        } else navigate("/admin");
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(apiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) setMessage(data.error ?? "Login gagal");
    else if (data.user.role === "PARTNER") {
      setPortalSessionUser(data.user);
      navigate("/portal/mitra");
    } else if (data.user.role === "NAZHIR_VIEWER") {
      navigate("/nazhir");
    } else navigate("/admin");
  }
  if (loading)
    return (
      <main className="state page-state" role="status">
        Memeriksa sesi...
      </main>
    );
  return (
    <main className="login-page">
      <div>
        <p className="eyebrow">Ruang kerja</p>
        <h1>
          Selamat datang
          <br />
          <em>kembali.</em>
        </h1>
        <p className="lede">
          Akses untuk mengelola perjalanan produk dan kemitraan.
        </p>
      </div>
      {user ? (
        <div className="login-panel">
          <h2>Halo, {user.name}</h2>
          <p>Anda sudah masuk ke ruang kerja.</p>
        </div>
      ) : (
        <form className="login-panel" onSubmit={submit}>
          <h2>Masuk ke ruang kerja</h2>
          <label>
            Email
            <input
              aria-label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Kata sandi
            <input
              aria-label="Kata sandi"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && (
            <p className="error-box" role="alert">
              {message}
            </p>
          )}
          <button className="button primary" disabled={!email || !password}>
            Masuk <ArrowRight size={17} />
          </button>
        </form>
      )}
    </main>
  );
}
function NotFound({ title = "Halaman tidak ditemukan" }: { title?: string }) {
  return (
    <main className="state page-state">
      <p className="eyebrow">404</p>
      <h1>{title}</h1>
      <p>Halaman yang Anda cari tidak tersedia.</p>
      <button className="button primary" onClick={() => navigate("/")}>
        Kembali ke beranda
      </button>
    </main>
  );
}
export function App() {
  const path = useRoute();
  const siteContent = useSiteContent();
  useEffect(() => {
    const [title, description] = meta[path] ?? [
      "Tidak ditemukan | Dapuremakita",
      "Halaman Dapuremakita tidak ditemukan.",
    ];
    document.title = title;
    let node = document.querySelector('meta[name="description"]');
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute("name", "description");
      document.head.appendChild(node);
    }
    node.setAttribute("content", description);
  }, [path]);
  useEffect(() => {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = siteContent.faviconUrl;
  }, [siteContent.faviconUrl]);
  if (path === "/login") return <Login />;
  if (path === "/cart") return <CartPage />;
  if (path === "/checkout") return <CheckoutPage />;
  if (path.startsWith("/checkout/") && path.endsWith("/bayar"))
    return <PaymentPage orderNumber={path.split("/")[2] ?? ""} />;
  if (path.startsWith("/order/"))
    return <OrderStatusPage orderNumber={path.split("/")[2] ?? ""} />;
  if (path === "/portal/mitra/pesanan") return <PartnerOrders />;
  if (path === "/admin/orders") return <AdminOrders />;
  if (path.startsWith("/nazhir")) return <NazhirApp path={path} />;
  if (path.startsWith("/portal/mitra")) return <Portal path={path} />;
  if (path.startsWith("/admin")) return <AdminApp path={path} />;
  let page: React.ReactNode;
  if (path === "/") page = <Home content={siteContent} />;
  else if (path === "/katalog") page = <Catalog />;
  else if (path.startsWith("/katalog/"))
    page = <ProductDetail slug={path.split("/")[2] ?? ""} />;
  else if (path.startsWith("/kategori/"))
    page = <CategoryPage slug={path.split("/")[2] ?? ""} />;
  else if (content[path]) page = <StoryPage path={path} />;
  else page = <NotFound />;
  return <Layout content={siteContent}>{page}</Layout>;
}
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
