// Centralized API base and fetch helper to support local dev and GitHub Pages

// Returns the API base URL. Priority:
// 1) build-time env REACT_APP_API_URL
// 2) runtime override via window.__API_BASE__ (from public/gh-pages-env.js)
// 3) empty string for local proxy (CRA setupProxy)
export function getApiBase() {
  const envBase = process.env.REACT_APP_API_URL;
  // eslint-disable-next-line no-undef
  const runtimeBase = typeof window !== 'undefined' ? (window.__API_BASE__ || '') : '';
  return envBase || runtimeBase || '';
}

// Prefixes URL with API base if it's a relative path
export function withApiBase(url) {
  const base = getApiBase();
  if (!url) return url;
  const isAbsolute = /^https?:\/\//i.test(url);
  if (isAbsolute) return url;
  // If we have a base, prefix it; else leave relative for local proxy
  return base ? `${base}${url}` : url;
}

// Wrapper around fetch that applies API base to relative URLs
export async function apiFetch(url, options = {}) {
  const fullUrl = withApiBase(url);
  return fetch(fullUrl, options);
}