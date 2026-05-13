/**
 * MemberAvatar — Universal avatar component for BeanPool.
 * 
 * Design Rule: Every callsign gets an avatar. If there's a name displayed,
 * there's an avatar beside it.
 * 
 * Handles:
 * - Remote image URLs (with cache-busting)
 * - Base64 data URIs
 * - Bundled avatar references
 * - Letter-initial fallback when no image is available
 */
import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { avatarUri } from '../utils/image-processing';

// Consistent color palette for letter-initial fallbacks
const FALLBACK_COLORS = [
    '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#6366f1', '#14b8a6',
] as const;

function getColorForPubkey(pubkey: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(pubkey.length, 8); i++) {
        hash = pubkey.charCodeAt(i) + ((hash << 5) - hash);
    }
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

interface MemberAvatarProps {
    avatarUrl: string | null | undefined;
    pubkey: string;
    callsign: string;
    /** Avatar diameter in pixels. Default: 36 */
    size?: number;
    /** ISO timestamp of last profile update — used for cache-busting */
    updatedAt?: string | null;
    /** Border radius override. Default: size/2 (circle). Use lower value for rounded square. */
    borderRadius?: number;
}

export function MemberAvatar({
    avatarUrl,
    pubkey,
    callsign,
    size = 36,
    updatedAt,
    borderRadius,
}: MemberAvatarProps) {
    const radius = borderRadius ?? size / 2;
    const uri = avatarUri(avatarUrl, pubkey, updatedAt);
    const fontSize = Math.max(Math.round(size * 0.42), 10);

    if (uri) {
        return (
            <Image
                source={{ uri }}
                style={[
                    styles.image,
                    { width: size, height: size, borderRadius: radius },
                ]}
            />
        );
    }

    // Letter-initial fallback with deterministic color
    const bgColor = getColorForPubkey(pubkey);
    const initial = (callsign || '?').charAt(0).toUpperCase();

    return (
        <View
            style={[
                styles.fallback,
                {
                    width: size,
                    height: size,
                    borderRadius: radius,
                    backgroundColor: bgColor + '20', // 12% opacity bg
                },
            ]}
        >
            <Text
                style={[
                    styles.fallbackText,
                    { fontSize, color: bgColor },
                ]}
            >
                {initial}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    image: {
        backgroundColor: '#f3f4f6',
    },
    fallback: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackText: {
        fontWeight: '800',
    },
});
