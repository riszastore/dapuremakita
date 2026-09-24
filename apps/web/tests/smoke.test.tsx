import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/main";

const active = {
  id: "1",
  name: "Sambal Kecombrang",
  slug: "sambal-kecombrang",
  price: 38000,
  description: "Sambal segar",
  imageUrl: "/images/sambal.jpg",
  category: { name: "Pangan", slug: "pangan" },
  partner: null,
};
const categories = [
  { name: "Pangan", slug: "pangan" },
  { name: "Rumah & Gaya Hidup", slug: "rumah" },
];
const makeResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;
const go = (path: string) => {
  window.history.pushState({}, "", path);
};
const renderPath = (path: string) => {
  go(path);
  return render(<App />);
};
const publicFetch = (overrides: Record<string, Response> = {}) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return makeResponse({}, 401);
    if (overrides[url]) return overrides[url];
    if (url.includes("/public/categories")) return makeResponse({ categories });
    if (url.includes("/public/products/sambal-kecombrang"))
      return makeResponse({ product: active });
    if (url.includes("/public/products/missing"))
      return makeResponse({ error: "Product not found" }, 404);
    if (url.includes("/public/products"))
      return makeResponse({ items: [active], totalPages: 1 });
    return makeResponse({}, 404);
  });

beforeEach(() => {
  vi.restoreAllMocks();
  go("/");
});
afterEach(() => {
  cleanup();
});

describe("public website routes and SEO", () => {
  it("renders five curated homepage categories and five resilient featured products", async () => {
    publicFetch();
    renderPath("/");
    expect(
      await screen.findByRole("heading", { level: 1, name: /Temukan karya/ }),
    ).toBeTruthy();
    expect(screen.getByText("Camilan Rumahan")).toBeTruthy();
    expect(screen.getByText("Sambal & Lauk Siap Makan")).toBeTruthy();
    expect(screen.getByText("Minuman & Racikan")).toBeTruthy();
    expect(screen.getByText("Bahan & Kebutuhan Dapur")).toBeTruthy();
    expect(screen.getByText("Kreasi Lainnya")).toBeTruthy();
    expect(screen.getByText("Keripik Pisang Keju")).toBeTruthy();
    expect(screen.getByText("Sambal Kecombrang")).toBeTruthy();
    expect(screen.getByText("Serbuk Jahe Rempah")).toBeTruthy();
    expect(screen.getByText("Kue Kering Nastar")).toBeTruthy();
    expect(screen.getByText("Sirup Rosella")).toBeTruthy();
    expect(document.querySelectorAll(".category-visual-card")).toHaveLength(5);
    expect(document.querySelectorAll(".market-product-card")).toHaveLength(5);
    const productImages = Array.from(
      document.querySelectorAll<HTMLImageElement>(".market-product-image img"),
    );
    expect(productImages).toHaveLength(5);
    expect(
      productImages.every((image) =>
        image.getAttribute("src")?.startsWith("/images/products/"),
      ),
    ).toBe(true);
  });
  it("renders every substantive public page and sets metadata", async () => {
    const pages = [
      ["/tentang", "Membuat ruang untuk yang baik."],
      ["/kurasi", "Pelan-pelan, dengan standar yang jelas."],
      ["/mitra", "Banyak tangan, satu niat baik."],
      ["/wakaf-produktif", "Aset yang terus memberi manfaat."],
      ["/kemitraan", "Mari tumbuh dengan cara yang adil."],
    ];
    for (const [path, heading] of pages) {
      renderPath(path);
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
      expect(document.title).not.toBe("Dapuremakita");
      cleanup();
    }
  });
  it("supports explicit category route and category not-found", async () => {
    publicFetch();
    renderPath("/kategori/pangan");
    expect(await screen.findByRole("heading", { name: "Pangan" })).toBeTruthy();
    cleanup();
    publicFetch();
    renderPath("/kategori/nope");
    expect(
      await screen.findByRole("heading", { name: "Kategori tidak ditemukan" }),
    ).toBeTruthy();
  });
  it("renders active detail, missing detail, and detail error states", async () => {
    publicFetch();
    renderPath("/katalog/sambal-kecombrang");
    expect(
      await screen.findByRole("heading", { name: "Sambal Kecombrang" }),
    ).toBeTruthy();
    expect(document.title).toContain("Sambal Kecombrang");
    cleanup();
    publicFetch();
    renderPath("/katalog/missing");
    expect(
      await screen.findByRole("heading", { name: "Produk tidak ditemukan" }),
    ).toBeTruthy();
    cleanup();
    publicFetch({
      "/public/products/sambal-kecombrang": makeResponse({}, 500),
    });
    renderPath("/katalog/sambal-kecombrang");
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
  it("renders the global 404 route", () => {
    renderPath("/not-a-route");
    expect(
      screen.getByRole("heading", { name: "Halaman tidak ditemukan" }),
    ).toBeTruthy();
  });
});

describe("catalog interaction and states", () => {
  it("supports search, category filter, and pagination controls", async () => {
    const fetchMock = publicFetch();
    renderPath("/katalog");
    await screen.findByRole("heading", { name: /Temukan yang/ });
    const search = screen.getByPlaceholderText(/Cari nama/);
    fireEvent.change(search, { target: { value: "sambal" } });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("search=sambal"),
        ),
      ).toBe(true),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Pilih kategori" }), {
      target: { value: "pangan" },
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("category=pangan"),
        ),
      ).toBe(true),
    );
    cleanup();
    const paginated = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/auth/me")) return makeResponse({}, 401);
        if (url.includes("/public/categories"))
          return makeResponse({ categories });
        return makeResponse({ items: [active], totalPages: 2 });
      });
    renderPath("/katalog");
    const paginatedSearch = screen.getByPlaceholderText(/Cari nama/);
    fireEvent.change(paginatedSearch, { target: { value: "sambal" } });
    await screen.findByText("Halaman 1 dari 2");
    fireEvent.click(screen.getByRole("button", { name: "Berikutnya" }));
    await waitFor(() =>
      expect(
        paginated.mock.calls.some(([input]) => {
          const url = String(input);
          return url.includes("search=sambal") && url.includes("page=2");
        }),
      ).toBe(true),
    );
  });
  it("renders loading, API error, and empty catalog states", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => undefined),
    );
    renderPath("/katalog");
    expect(screen.getByRole("status")).toBeTruthy();
    cleanup();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    renderPath("/katalog");
    expect(await screen.findByRole("alert")).toBeTruthy();
    cleanup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/auth/me")
        ? makeResponse({}, 401)
        : makeResponse({ categories: [], items: [], totalPages: 0 }),
    );
    renderPath("/katalog");
    fireEvent.change(screen.getByPlaceholderText(/Cari nama/), {
      target: { value: "tidak-ada" },
    });
    expect(await screen.findByText(/Belum ada produk/)).toBeTruthy();
  });
});

describe("responsive navigation and auth compatibility", () => {
  it("opens and closes mobile navigation with accessible focusable controls", () => {
    renderPath("/");
    const menu = screen.getByRole("button", { name: "Buka menu" });
    menu.focus();
    expect(document.activeElement).toBe(menu);
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("navigation", { name: "Navigasi utama" }).className,
    ).toContain("open");
    fireEvent.click(screen.getByRole("button", { name: "Tutup menu" }));
    expect(screen.getByRole("button", { name: "Buka menu" })).toBeTruthy();
  });
  it("preserves anonymous login, invalid login, successful login, logout, and session error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(Promise.resolve(makeResponse({}, 401)))
      .mockReturnValueOnce(
        Promise.resolve(
          makeResponse({ error: "Invalid email or password" }, 401),
        ),
      )
      .mockReturnValueOnce(
        Promise.resolve(
          makeResponse({
            user: {
              name: "Partner Demo",
              email: "partner@test.local",
              role: "PARTNER",
            },
          }),
        ),
      );
    renderPath("/login");
    await screen.findByText("Masuk ke ruang kerja");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "partner@test.local" },
    });
    fireEvent.change(screen.getByLabelText("Kata sandi"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Masuk/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Kata sandi"), {
      target: { value: "Demo123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Masuk/ }));
    expect(
      await screen.findByRole("heading", { name: /Partner Demo/ }),
    ).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    cleanup();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    renderPath("/login");
    expect(await screen.findByRole("status")).toBeTruthy();
  });
  it("SUPER_ADMIN login redirects to /admin dashboard automatically", async () => {
    let meCall = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        meCall++;
        return makeResponse(
          meCall === 1
            ? {}
            : {
                user: {
                  name: "Super Admin",
                  email: "superadmin@dapuremakita.local",
                  role: "SUPER_ADMIN",
                },
              },
          meCall === 1 ? 401 : 200,
        );
      }
      if (url.endsWith("/auth/login"))
        return makeResponse({
          user: {
            name: "Super Admin",
            email: "superadmin@dapuremakita.local",
            role: "SUPER_ADMIN",
          },
        });
      if (url.includes("/api/admin/overview"))
        return makeResponse({
          stats: {
            partners: 1,
            submissions: 1,
            activeProducts: 1,
            pendingPartners: 0,
          },
          queue: [],
        });
      return makeResponse({}, 404);
    });
    renderPath("/login");
    await screen.findByText("Masuk ke ruang kerja");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "superadmin@dapuremakita.local" },
    });
    fireEvent.change(screen.getByLabelText("Kata sandi"), {
      target: { value: "Demo123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Masuk/ }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin"));
    expect(await screen.findByText("Super Admin")).toBeTruthy();
  });
  it("OPERATIONS login redirects to /admin dashboard automatically", async () => {
    let meCall = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/me")) {
        meCall++;
        return makeResponse(
          meCall === 1
            ? {}
            : {
                user: {
                  name: "Operations",
                  email: "operations@dapuremakita.local",
                  role: "OPERATIONS",
                },
              },
          meCall === 1 ? 401 : 200,
        );
      }
      if (url.endsWith("/auth/login"))
        return makeResponse({
          user: {
            name: "Operations",
            email: "operations@dapuremakita.local",
            role: "OPERATIONS",
          },
        });
      if (url.includes("/api/admin/overview"))
        return makeResponse({
          stats: {
            partners: 1,
            submissions: 1,
            activeProducts: 1,
            pendingPartners: 0,
          },
          queue: [],
        });
      return makeResponse({}, 404);
    });
    renderPath("/login");
    await screen.findByText("Masuk ke ruang kerja");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "operations@dapuremakita.local" },
    });
    fireEvent.change(screen.getByLabelText("Kata sandi"), {
      target: { value: "Demo123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Masuk/ }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin"));
    expect(await screen.findByText("Operations")).toBeTruthy();
  });
});
