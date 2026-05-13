/**
 * Bundled avatar registry for the "Who Are You?" onboarding gate.
 * 
 * These are pre-built 512x512 icons that new users can select as their
 * profile picture without needing camera/gallery access. They're themed
 * to BeanPool's organic community aesthetic.
 * 
 * For ledger storage, we store the `id` as a reference (e.g., "bundled://bean-green")
 * to avoid bloating the ledger with redundant image data.
 */
import { ImageSourcePropType } from 'react-native';

export interface BundledAvatar {
    id: string;
    label: string;
    source: ImageSourcePropType;
}

export const BUNDLED_AVATARS: BundledAvatar[] = [
    { id: 'bean-green',   label: 'Green Bean',  source: require('../assets/images/avatars/avatar-bean-green.png') },
    { id: 'bean-purple',  label: 'Purple Bean', source: require('../assets/images/avatars/avatar-bean-purple.png') },
    { id: 'leaf',         label: 'Leaf',        source: require('../assets/images/avatars/avatar-leaf.png') },
    { id: 'sprout',       label: 'Sprout',      source: require('../assets/images/avatars/avatar-sprout.png') },
    { id: 'sun',          label: 'Sun',         source: require('../assets/images/avatars/avatar-sun.png') },
    { id: 'moon',         label: 'Moon',        source: require('../assets/images/avatars/avatar-moon.png') },
    { id: 'wave',         label: 'Wave',        source: require('../assets/images/avatars/avatar-wave.png') },
    { id: 'mountain',     label: 'Mountain',    source: require('../assets/images/avatars/avatar-mountain.png') },
    { id: 'fire',         label: 'Fire',        source: require('../assets/images/avatars/avatar-fire.png') },
    { id: 'crystal',      label: 'Crystal',     source: require('../assets/images/avatars/avatar-crystal.png') },
];

/**
 * Resolve a bundled avatar ID to its require'd image source.
 * Returns null if the ID doesn't match any bundled avatar.
 */
export function resolveBundledAvatar(id: string): ImageSourcePropType | null {
    const cleaned = id.replace('bundled://', '');
    const avatar = BUNDLED_AVATARS.find(a => a.id === cleaned);
    return avatar?.source ?? null;
}
