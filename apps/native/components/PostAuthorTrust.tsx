import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { getMemberRatings } from '../utils/db';
import { router } from 'expo-router';

/**
 * Trust Tier Thresholds (based on Energy Cycled)
 * Energy = total outbound transaction volume
 */
const TRUST_TIERS = [
    { min: 10000, emoji: '✨', label: 'Elder', color: '#fbbf24', bgColor: 'rgba(251, 191, 36, 0.15)', borderColor: 'rgba(251, 191, 36, 0.3)' },
    { min: 5000,  emoji: '🌳', label: 'Trusted', color: '#059669', bgColor: 'rgba(5, 150, 105, 0.1)', borderColor: 'rgba(5, 150, 105, 0.2)' },
    { min: 1000,  emoji: '🌿', label: 'Member', color: '#6366f1', bgColor: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.2)' },
    { min: 0,     emoji: '🌱', label: 'New', color: '#9ca3af', bgColor: 'rgba(156, 163, 175, 0.1)', borderColor: 'rgba(156, 163, 175, 0.2)' },
] as const;

export function getTrustTier(energyCycled: number = 0) {
    for (const tier of TRUST_TIERS) {
        if (energyCycled >= tier.min) return tier;
    }
    return TRUST_TIERS[TRUST_TIERS.length - 1];
}

export function isElder(energyCycled: number = 0): boolean {
    return energyCycled >= 10000;
}

interface PostAuthorTrustProps {
    pubkey: string;
    callsign: string;
    energyCycled?: number;
    /** 'compact' = grid cards, 'full' = list cards */
    mode?: 'compact' | 'full';
    /** Whether to show navigation to public profile */
    navigable?: boolean;
}

/**
 * Hybrid Trust Display: Tier Badge + Star Rating
 * Tier badge always shows. Star rating only shows when count > 0.
 */
export function PostAuthorTrust({ pubkey, callsign, energyCycled = 0, mode = 'full', navigable = true }: PostAuthorTrustProps) {
    const [ratingInfo, setRatingInfo] = useState<{ average: number; count: number } | null>(null);
    const tier = getTrustTier(energyCycled);

    useEffect(() => {
        if (!pubkey) return;
        getMemberRatings(pubkey)
            .then(r => setRatingInfo({ average: r.average, count: r.count }))
            .catch(() => {});
    }, [pubkey]);

    const handlePress = () => {
        if (navigable && pubkey) {
            router.push({ pathname: '/public-profile', params: { pubkey } });
        }
    };

    const Wrapper = navigable ? Pressable : View;

    if (mode === 'compact') {
        return (
            <Wrapper {...(navigable ? { onPress: handlePress } : {})} style={styles.compactContainer}>
                {/* Tier badge */}
                <View style={[styles.tierBadgeCompact, { backgroundColor: tier.bgColor, borderColor: tier.borderColor }]}>
                    <Text style={styles.tierEmojiCompact}>{tier.emoji}</Text>
                </View>
                {/* Callsign */}
                <Text style={styles.compactCallsign} numberOfLines={1}>{callsign}</Text>
                {/* Stars (only if rated) */}
                {ratingInfo && ratingInfo.count > 0 && (
                    <Text style={styles.compactStars}>
                        {'★'.repeat(Math.min(Math.round(ratingInfo.average), 5))}
                    </Text>
                )}
            </Wrapper>
        );
    }

    // Full mode (list cards)
    return (
        <Wrapper {...(navigable ? { onPress: handlePress } : {})} style={styles.fullContainer}>
            {/* Tier badge with label */}
            <View style={[styles.tierBadgeFull, { backgroundColor: tier.bgColor, borderColor: tier.borderColor }]}>
                <Text style={styles.tierEmojiFull}>{tier.emoji}</Text>
                <Text style={[styles.tierLabelFull, { color: tier.color }]}>{tier.label}</Text>
            </View>
            {/* Callsign */}
            <Text style={styles.fullCallsign} numberOfLines={1}>
                {callsign}
            </Text>
            {/* Star rating (compact inline, only when rated) */}
            {ratingInfo && ratingInfo.count > 0 && (
                <View style={styles.starsContainer}>
                    <Text style={styles.fullStars}>
                        {'★'.repeat(Math.min(Math.round(ratingInfo.average), 5))}
                        {'☆'.repeat(Math.max(0, 5 - Math.round(ratingInfo.average)))}
                    </Text>
                    <Text style={styles.ratingCount}>({ratingInfo.count})</Text>
                </View>
            )}
        </Wrapper>
    );
}

const styles = StyleSheet.create({
    // Compact mode (grid cards)
    compactContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    tierBadgeCompact: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tierEmojiCompact: {
        fontSize: 10,
    },
    compactCallsign: {
        fontSize: 12,
        color: '#6b7280',
        fontWeight: '500',
        flex: 1,
    },
    compactStars: {
        fontSize: 9,
        color: '#fbbf24',
        letterSpacing: -1,
    },

    // Full mode (list cards)
    fullContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    tierBadgeFull: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
    },
    tierEmojiFull: {
        fontSize: 11,
    },
    tierLabelFull: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    fullCallsign: {
        fontSize: 13,
        color: '#4b5563',
        fontWeight: '600',
        flexShrink: 1,
    },
    starsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    fullStars: {
        fontSize: 11,
        color: '#fbbf24',
        letterSpacing: -1,
    },
    ratingCount: {
        fontSize: 10,
        color: '#9ca3af',
        fontWeight: '600',
    },
});
