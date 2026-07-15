export function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.search = [...u.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((sp, [k, v]) => {
        sp.set(k, v);
        return sp;
      }, new URLSearchParams())
      .toString();
    let path = u.pathname;
    if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString();
  } catch {
    return null;
  }
}

export function matchesPattern(pathname: string, pattern: string): boolean {
  const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${re}$`).test(pathname);
}

export function isAllowedByPatterns(
  url: string,
  include: string[],
  exclude: string[],
): boolean {
  try {
    const { pathname } = new URL(url);
    if (exclude.length > 0 && exclude.some((p) => matchesPattern(pathname, p)))
      return false;
    if (include.length > 0 && !include.some((p) => matchesPattern(pathname, p)))
      return false;
    return true;
  } catch {
    return false;
  }
}

export function isSameDomain(urlA: string, urlB: string): boolean {
  try {
    return new URL(urlA).hostname === new URL(urlB).hostname;
  } catch {
    return false;
  }
}
