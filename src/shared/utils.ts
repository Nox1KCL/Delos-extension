/**
 * Normalizes video URLs to ensure consistent hashes across different
 * navigation parameters (e.g. YouTube timestamp &t=, playlist &list=, etc.).
 */
export function normalizeVideoUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();

    // YouTube main video URLs (www.youtube.com, youtube.com, m.youtube.com)
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

    // YouTube short links (youtu.be/ID)
    if (host === 'youtu.be') {
      const videoId = u.pathname.replace(/^\/+/, '');
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    // For other video streaming services (Netflix, anime portals, etc.),
    // strip query parameters and hash fragments that vary by session/timestamp
    return `${u.origin}${u.pathname}`;
  } catch {
    return rawUrl;
  }
}
