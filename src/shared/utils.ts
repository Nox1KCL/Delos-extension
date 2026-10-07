function isIgnoredParam(key: string): boolean {
  const k = key.toLowerCase();
  if (k.startsWith('utm_')) return true;
  const ignored = new Set([
    't',
    'time',
    'start',
    'timestamp',
    'ref',
    'fbclid',
    'gclid',
    '_ga',
    'yclid',
    'token',
    'expires',
    'session',
    'signature',
  ]);
  return ignored.has(k);
}

export function normalizeVideoUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();

    if (
      host === 'www.youtube.com' ||
      host === 'youtube.com' ||
      host === 'm.youtube.com'
    ) {
      const videoId = u.searchParams.get('v');
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    if (host === 'youtu.be') {
      const videoId = u.pathname.replace(/^\/+/, '');
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    const keysToDelete: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (isIgnoredParam(key)) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      u.searchParams.delete(key);
    }

    u.searchParams.sort();
    u.hash = '';
    const cleanPath = u.pathname.replace(/\/+$/, '') || '/';
    const query = u.searchParams.toString();
    return `${u.origin}${cleanPath}${query ? `?${query}` : ''}`;
  } catch {
    return rawUrl;
  }
}
