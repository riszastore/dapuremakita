import { useEffect, useState } from "react";
import { assetUrl, STATIC_PREVIEW } from "./runtime";

export type SiteContent = {
  logoUrl: string;
  faviconUrl: string;
  heroImageUrl: string;
  headerHomeLabel: string;
  headerAboutLabel: string;
  headerProductsLabel: string;
  headerStoriesLabel: string;
  headerImpactLabel: string;
  headerLoginLabel: string;
  heroEyebrow: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  heroPrimaryLabel: string;
  heroSecondaryLabel: string;
  heroQuote: string;
  heroSupportTitle: string;
  heroSupportText: string;
  categoriesEyebrow: string;
  categoriesTitle: string;
  productsEyebrow: string;
  productsTitle: string;
  impactTitle: string;
  impactDescription: string;
  footerDescription: string;
  footerShopLabel: string;
  footerProcessLabel: string;
  footerWaqfLabel: string;
  footerPartnerLabel: string;
  footerWorkspaceLabel: string;
};

export const defaultSiteContent: SiteContent = {
  logoUrl: assetUrl("/images/logo-dapuremakita.webp"),
  faviconUrl: assetUrl("/images/vapicon.ico"),
  heroImageUrl: assetUrl("/images/hero.webp"),
  headerHomeLabel: "Beranda",
  headerAboutLabel: "Tentang Kami",
  headerProductsLabel: "Produk",
  headerStoriesLabel: "Cerita Mitra",
  headerImpactLabel: "Dampak",
  headerLoginLabel: "Masuk",
  heroEyebrow: "Gerakan Pemberdayaan Usaha Rumahan",
  heroTitle: "Temukan karya",
  heroAccent: "dari dapur mereka.",
  heroDescription:
    "Setiap produk di Dapuremakita dibuat oleh emak-emak pelaku usaha rumahan yang kami dampingi agar lebih siap, lebih percaya diri, dan makin berdaya.",
  heroPrimaryLabel: "Lihat Produk",
  heroSecondaryLabel: "Dukung Program",
  heroQuote: "“Dari dapur kecil, lahir kisah besar untuk keluarga.”",
  heroSupportTitle: "Bersama, kita kuatkan",
  heroSupportText: "usaha rumahan di seluruh Indonesia.",
  categoriesEyebrow: "Jelajahi Kategori",
  categoriesTitle: "Temukan karya dari dapur mereka.",
  productsEyebrow: "Pilihan Minggu Ini",
  productsTitle: "Produk yang punya cerita.",
  impactTitle: "Gambaran dampak yang ingin kita hadirkan bersama.",
  impactDescription:
    "Target program ini menunjukkan arah pertumbuhan yang ingin dicapai bersama mitra dan pendukung.",
  footerDescription:
    "Membantu usaha rumahan menjadi lebih siap, lebih dipercaya, dan lebih mudah ditemukan.",
  footerShopLabel: "Belanja produk",
  footerProcessLabel: "Cara kami bekerja",
  footerWaqfLabel: "Wakaf produktif",
  footerPartnerLabel: "Jadi mitra",
  footerWorkspaceLabel: "Ruang kerja",
};

const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
let cached: SiteContent | null = null;
export function useSiteContent() {
  const [content, setContent] = useState<SiteContent>(
    cached ?? defaultSiteContent,
  );
  useEffect(() => {
    if (STATIC_PREVIEW || cached) return;
    fetch(API + "/public/site-content")
      .then(async (response) => {
        if (!response.ok) throw new Error("content");
        return response.json();
      })
      .then((data) => {
        cached = { ...defaultSiteContent, ...data.content };
        setContent(cached!);
      })
      .catch(() => undefined);
  }, []);
  return content;
}
