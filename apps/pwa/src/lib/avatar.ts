/**
 * PWA avatar URL resolver.
 * 
 * Maps bundled:// protocol references (stored in the ledger) to local
 * static asset paths served from /avatars/. Falls through for regular
 * URLs, data URIs, and null values.
 */

const BUNDLED_MAP: Record<string, string> = {
    'bean-green':  '/avatars/avatar_bean_green.jpg',
    'bean-purple': '/avatars/avatar_bean_purple.jpg',
    'leaf':        '/avatars/avatar_leaf.jpg',
    'sprout':      '/avatars/avatar_sprout.jpg',
    'sun':         '/avatars/avatar_sun.jpg',
    'moon':        '/avatars/avatar_moon.jpg',
    'wave':        '/avatars/avatar_wave.jpg',
    'mountain':    '/avatars/avatar_mountain.jpg',
    'fire':        '/avatars/avatar_fire.jpg',
    'crystal':     '/avatars/avatar_crystal.jpg',
};

export function resolveAvatarUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('bundled://')) {
        const id = url.replace('bundled://', '');
        return BUNDLED_MAP[id] || null;
    }
    return url;
}
