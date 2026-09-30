/**
 * Centralized Robohash configuration and avatar URL utilities.
 * Configured to use the self-hosted Robohash instance on Render.
 */
export const ROBOHASH_BASE_URL: string = 'https://robohash-i7n8.onrender.com';

/**
 * Builds a deterministic robot avatar URL for a given seed.
 */
export function getRobohashAvatarUrl(seed: string, size = '150x150'): string {
  const cleanSeed = encodeURIComponent(
    (seed || 'agent')
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_-]/g, '') || 'agent'
  );
  return `${ROBOHASH_BASE_URL}/${cleanSeed}.png?size=${size}`;
}

/**
 * Normalizes any avatar URL:
 * - Rewrites old robohash.org references to the new self-hosted instance
 * - Removes unnecessary gravatar parameter
 * - Keeps size and clean query params intact
 */
export function normalizeAvatarUrl(avatar?: string, fallbackSeed?: string): string {
  if (!avatar || typeof avatar !== 'string') {
    return getRobohashAvatarUrl(fallbackSeed || 'agent');
  }

  // If it's a robohash URL (either robohash.org or self-hosted)
  if (avatar.includes('robohash.org') || avatar.includes('robohash-i7n8.onrender.com')) {
    try {
      const parsed = new URL(avatar.startsWith('http') ? avatar : `https://${avatar}`);
      const filename = parsed.pathname.replace(/^\/+/, ''); // e.g. "seed.png" or "seed"
      const seed = filename.replace(/\.png$/i, '') || fallbackSeed || 'agent';
      const sizeParam = parsed.searchParams.get('size') || '150x150';
      return `${ROBOHASH_BASE_URL}/${encodeURIComponent(seed)}.png?size=${sizeParam}`;
    } catch {
      const match = avatar.match(/robohash[^/]*\/([^/?#]+)/i);
      const seed = match ? match[1].replace(/\.png$/i, '') : fallbackSeed || 'agent';
      return `${ROBOHASH_BASE_URL}/${encodeURIComponent(seed)}.png?size=150x150`;
    }
  }

  return avatar;
}
