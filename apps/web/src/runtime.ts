const baseUrl = import.meta.env.BASE_URL || "/";
const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
export const STATIC_PREVIEW = import.meta.env.VITE_STATIC_PREVIEW === "true";

export function assetUrl(path: string) {
  if (!path.startsWith("/")) return path;
  return `${normalizedBase}${path.slice(1)}`;
}

export function routePath(pathname: string) {
  const basePath = normalizedBase === "/" ? "" : normalizedBase.slice(0, -1);
  if (basePath && pathname.startsWith(basePath)) {
    const stripped = pathname.slice(basePath.length);
    return stripped || "/";
  }
  return pathname || "/";
}

export function browserPath(path: string) {
  if (/^(https?:|mailto:|tel:)/.test(path)) return path;
  const [pathname, suffix = ""] = path.split(/(?=[?#])/u, 2);
  const clean = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const base = normalizedBase === "/" ? "/" : normalizedBase;
  const joined = clean ? `${base}${clean}` : base;
  return `${joined}${suffix}`;
}
