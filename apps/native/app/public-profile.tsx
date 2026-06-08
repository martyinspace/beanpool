import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MemberAvatar } from '../components/MemberAvatar';
import { getMemberProfile, getMemberRatings, getMemberPosts, getBalance, getRatingsGiven, getFriendsLocal } from '../utils/db';
import { useIdentity } from './IdentityContext';
import { ReviewModal } from '../components/ReviewModal';

export default function PublicProfileScreen() {
    const { publicKey, callsign } = useLocalSearchParams();
    const { identity } = useIdentity();

    const [profile, setProfile] = useState<any>(null);
    const [ratings, setRatings] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [activePosts, setActivePosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'listings' | 'reviews' | 'given'>('listings');
    const [balanceInfo, setBalanceInfo] = useState<any>(null);
    const [given, setGiven] = useState<any[]>([]);
    const [friendsCount, setFriendsCount] = useState(0);
    const [guardianCount, setGuardianCount] = useState(0);
    const [editingReview, setEditingReview] = useState<any | null>(null);

    const pubKeyStr = Array.isArray(publicKey) ? publicKey[0] : publicKey;
    const isSelf = !!identity?.publicKey && identity.publicKey === pubKeyStr;
    const callsignStr = (Array.isArray(callsign) ? callsign[0] : callsign) || (isSelf ? identity?.callsign : undefined);

    useEffect(() => {
        if (!pubKeyStr) return;
        setLoading(true);
        Promise.all([
            getMemberProfile(pubKeyStr).catch(() => null),
            getMemberRatings(pubKeyStr).catch(() => null),
            getMemberPosts(pubKeyStr).catch(() => []),
            isSelf ? getBalance(pubKeyStr).catch(() => null) : Promise.resolve(null),
            isSelf ? getRatingsGiven(pubKeyStr).catch(() => []) : Promise.resolve([]),
            isSelf ? getFriendsLocal(pubKeyStr).catch(() => []) : Promise.resolve([]),
        ]).then(([prof, rat, posts, bal, givenRatings, friends]) => {
            if (prof) setProfile(prof);
            if (rat) {
                setStats({ average: rat.average, count: rat.count, asProvider: rat.asProvider, asReceiver: rat.asReceiver });
                setRatings(rat.ratings || []);
            }
            if (posts) setActivePosts(posts);
            if (bal) setBalanceInfo(bal);
            if (givenRatings) setGiven(givenRatings);
            if (Array.isArray(friends)) {
                setFriendsCount(friends.length);
                setGuardianCount(friends.filter((f: any) => f.isGuardian).length);
            }
            setLoading(false);
        });
    }, [pubKeyStr, isSelf]);

    const renderStars = (avg: number) => {
        const rounded = Math.round(avg || 0);
        return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable 
                    onPress={() => {
                        if (router.canGoBack()) {
                            router.back();
                        } else {
                            router.replace('/(tabs)/people');
                        }
                    }} 
                    style={styles.backButton}
                >
                    <Text style={styles.backText}>←</Text>
                    <Text style={styles.backTextLabel}>Back</Text>
                </Pressable>
                <Text style={styles.headerTitle}>{isSelf ? 'My Profile' : 'Trust Profile'}</Text>
                {isSelf ? (
                    <Pressable style={styles.editBtn} onPress={() => router.push({ pathname: '/(tabs)/settings', params: { section: 'profile' } })}>
                        <MaterialCommunityIcons name="pencil" size={15} color="#10b981" />
                        <Text style={styles.editBtnText}>Edit</Text>
                    </Pressable>
                ) : (
                    <View style={{ width: 60 }} />
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Banner */}
                <View style={styles.banner}>
                    <View style={styles.avatarRing}>
                        <MemberAvatar avatarUrl={profile?.avatar_url} pubkey={pubKeyStr} callsign={callsignStr || '?'} size={80} />
                    </View>
                    <View style={styles.nameRow}>
                        <Text style={styles.callsignText} numberOfLines={1}>{callsignStr}</Text>
                        <MaterialCommunityIcons name="check-decagram" size={22} color="#10b981" style={{ marginLeft: 6, marginTop: 2, flexShrink: 0 }} />
                    </View>
                    <Text style={styles.pubkeyText}>{pubKeyStr?.slice(0, 16)}...</Text>
                    {profile?.joined_at && (
                        <Text style={styles.joinedText} numberOfLines={1}>📅 Joined {new Date(profile.joined_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
                    )}
                    {profile?.bio && (
                        <Text style={styles.bioText}>"{profile.bio}"</Text>
                    )}
                </View>

                {/* Trust summary (self only) — links to the full Ledger */}
                {isSelf && balanceInfo && (
                    <Pressable style={styles.trustCard} onPress={() => router.push('/(tabs)/ledger')}>
                        <View style={styles.trustLeft}>
                            <Text style={styles.trustEmoji} allowFontScaling={false}>{balanceInfo.tier?.emoji || '🌱'}</Text>
                            <View style={{ flexShrink: 1 }}>
                                <Text style={styles.trustTierName} numberOfLines={1}>{balanceInfo.tier?.name || 'Member'}</Text>
                                <Text style={styles.trustSub} numberOfLines={1}>{Math.round(balanceInfo.earnedCredit || 0)} trust points</Text>
                            </View>
                        </View>
                        <View style={styles.trustRight}>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.trustBalance}>{balanceInfo.balance >= 0 ? '+' : ''}{(balanceInfo.balance ?? 0).toFixed(1)}</Text>
                                <Text style={styles.trustSub}>Beans</Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={22} color="#9ca3af" />
                        </View>
                    </Pressable>
                )}

                {/* Quick stats (self) — tappable through to the relevant screens */}
                {isSelf && (
                    <View style={styles.statStrip}>
                        <Pressable style={styles.statTile} onPress={() => router.push({ pathname: '/(tabs)/people', params: { view: 'friends' } })}>
                            <Text style={styles.statTileNum} numberOfLines={1}>{friendsCount}</Text>
                            <Text style={styles.statTileLabel} numberOfLines={1}>Friends</Text>
                        </Pressable>
                        <View style={styles.statDivider} />
                        <View style={styles.statTile}>
                            <Text style={styles.statTileNum} numberOfLines={1}>{balanceInfo?.trustStats?.tradeCount ?? 0}</Text>
                            <Text style={styles.statTileLabel} numberOfLines={1}>Trades</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <Pressable style={styles.statTile} onPress={() => router.push({ pathname: '/(tabs)/people', params: { view: 'guardians' } })}>
                            <Text style={[styles.statTileNum, guardianCount >= 3 ? { color: '#10b981' } : guardianCount === 0 ? { color: '#ef4444' } : null]} numberOfLines={1}>{guardianCount}/5</Text>
                            <Text style={styles.statTileLabel} numberOfLines={1}>Guardians{guardianCount >= 3 ? ' ✓' : ''}</Text>
                        </Pressable>
                    </View>
                )}

                {loading ? (
                    <ActivityIndicator size="large" color="#10b981" style={{ marginTop: 40 }} />
                ) : (
                    <>
                        {/* Stats grid */}
                        {stats && stats.count > 0 && (
                            <View style={styles.statsGrid}>
                                <View style={styles.statBoxOverall}>
                                    <Text style={styles.starRating} allowFontScaling={false} numberOfLines={1}>{renderStars(stats.average)}</Text>
                                    <Text style={styles.statValueOverall} numberOfLines={1}>{stats.average.toFixed(1)}</Text>
                                    <Text style={styles.statLabelOverall} numberOfLines={1}>OVERALL</Text>
                                </View>
                                <View style={styles.statBoxProvider}>
                                    <MaterialCommunityIcons name="inbox-arrow-up" size={26} color="#10b981" />
                                    <Text style={styles.statValueProvider} numberOfLines={1}>{stats.asProvider?.average.toFixed(1) || '-'}</Text>
                                    <Text style={styles.statLabelProvider} numberOfLines={1} adjustsFontSizeToFit>AS PROVIDER</Text>
                                </View>
                                <View style={styles.statBoxReceiver}>
                                    <MaterialCommunityIcons name="inbox-arrow-down" size={26} color="#6366f1" />
                                    <Text style={styles.statValueReceiver} numberOfLines={1}>{stats.asReceiver?.average.toFixed(1) || '-'}</Text>
                                    <Text style={styles.statLabelReceiver} numberOfLines={1} adjustsFontSizeToFit>AS RECEIVER</Text>
                                </View>
                            </View>
                        )}

                        {/* Tabs */}
                        <View style={styles.tabBar}>
                            <Pressable
                                style={[styles.tab, activeTab === 'listings' && styles.tabActive]}
                                onPress={() => setActiveTab('listings')}
                            >
                                <Text style={[styles.tabText, activeTab === 'listings' && styles.tabTextActive]} numberOfLines={1} allowFontScaling={false}>
                                    Listings {activePosts.length > 0 ? `(${activePosts.length})` : ''}
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[styles.tab, activeTab === 'reviews' && styles.tabActive]}
                                onPress={() => setActiveTab('reviews')}
                            >
                                <Text style={[styles.tabText, activeTab === 'reviews' && styles.tabTextActive]} numberOfLines={1} allowFontScaling={false}>
                                    {isSelf ? 'Received' : 'Reviews'} {ratings.length > 0 ? `(${ratings.length})` : ''}
                                </Text>
                            </Pressable>
                            {isSelf && (
                                <Pressable
                                    style={[styles.tab, activeTab === 'given' && styles.tabActive]}
                                    onPress={() => setActiveTab('given')}
                                >
                                    <Text style={[styles.tabText, activeTab === 'given' && styles.tabTextActive]} numberOfLines={1} allowFontScaling={false}>
                                        Given {given.length > 0 ? `(${given.length})` : ''}
                                    </Text>
                                </Pressable>
                            )}
                        </View>

                        {/* Listings tab */}
                        {activeTab === 'listings' && (
                            <View style={styles.tabContent}>
                                {activePosts.length === 0 ? (
                                    <View style={styles.emptyCard}>
                                        <Text style={styles.emptyIcon}>🛒</Text>
                                        <Text style={styles.emptyText}>No active listings.</Text>
                                    </View>
                                ) : (
                                    activePosts.map((p, i) => {
                                        let coverImage: string | null = null;
                                        if (p.photos) {
                                            try {
                                                const arr = Array.isArray(p.photos) ? p.photos : JSON.parse(p.photos);
                                                if (arr.length > 0) coverImage = arr[0];
                                            } catch {}
                                        }
                                        return (
                                            <Pressable key={p.id || i} onPress={() => router.push(`/post/${p.id}`)}>
                                                <View style={styles.dealCard}>
                                                    <View style={{ flexDirection: 'row', gap: 12 }}>
                                                        {coverImage && typeof coverImage === 'string' && coverImage.trim() !== '' && coverImage !== 'null' && coverImage !== 'undefined' ? (
                                                            <Image source={{ uri: coverImage }} style={styles.dealThumb} />
                                                        ) : (
                                                            <View style={[styles.dealThumb, styles.dealThumbFallback]}>
                                                                <Text style={{ fontSize: 24, opacity: 0.4 }}>📦</Text>
                                                            </View>
                                                        )}
                                                        <View style={{ flex: 1, justifyContent: 'center' }}>
                                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                                                <View style={[styles.typeBadge, p.type === 'offer' ? styles.badgeOffer : styles.badgeNeed]}>
                                                                    <Text style={styles.typeBadgeText}>{p.type?.toUpperCase()}</Text>
                                                                </View>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                                    <Text style={styles.creditAmount}>{p.credits ?? '?'}</Text>
                                                                    <Image source={require('../assets/images/bean.png')} style={styles.beanIcon} />
                                                                </View>
                                                            </View>
                                                            <Text style={styles.dealTitle} numberOfLines={1}>{p.title}</Text>
                                                            <Text style={styles.dealDateText}>Active</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                            </Pressable>
                                        );
                                    })
                                )}
                            </View>
                        )}

                        {/* Reviews tab */}
                        {activeTab === 'reviews' && (
                            <View style={styles.tabContent}>
                                {ratings.length === 0 ? (
                                    <View style={styles.emptyCard}>
                                        <Text style={styles.emptyIcon}>🌱</Text>
                                        <Text style={styles.emptyText}>No reviews yet.</Text>
                                    </View>
                                ) : (
                                    ratings.map((r, i) => (
                                        <View key={i} style={styles.reviewCard}>
                                            <View style={styles.reviewHeader}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                                    <Text style={styles.starText} allowFontScaling={false} numberOfLines={1}>{renderStars(r.stars)}</Text>
                                                    <View style={[styles.roleBadge, { flexShrink: 1 }, r.role === 'provider' ? styles.roleBadgeProvider : styles.roleBadgeReceiver]}>
                                                        <Text style={[styles.roleText, r.role === 'provider' ? styles.roleTextProvider : styles.roleTextReceiver]} numberOfLines={1}>
                                                            {r.role === 'provider' ? 'Provided Service' : 'Received Service'}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Text style={styles.dateText}>
                                                    {new Date(r.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase()}
                                                </Text>
                                            </View>
                                            {r.comment ? (
                                                <Text style={styles.commentText}>"{r.comment}"</Text>
                                            ) : (
                                                <Text style={styles.noCommentText}>No comment provided.</Text>
                                            )}
                                        </View>
                                    ))
                                )}
                            </View>
                        )}
                        {/* Reviews I've given (self only) */}
                        {isSelf && activeTab === 'given' && (
                            <View style={styles.tabContent}>
                                {given.length === 0 ? (
                                    <View style={styles.emptyCard}>
                                        <Text style={styles.emptyIcon}>✍️</Text>
                                        <Text style={styles.emptyText}>You haven't reviewed anyone yet.</Text>
                                    </View>
                                ) : (
                                    given.map((r, i) => (
                                        <View key={r.id || i} style={styles.reviewCard}>
                                            <View style={styles.reviewHeader}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                    <MemberAvatar avatarUrl={r.target_avatar} pubkey={r.target_pubkey} callsign={r.target_callsign || '?'} size={28} />
                                                    <Text style={styles.givenName} numberOfLines={1}>{r.target_callsign || `${r.target_pubkey?.slice(0, 8)}…`}</Text>
                                                </View>
                                                <Text style={styles.dateText}>
                                                    {new Date(r.created_at || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase()}
                                                </Text>
                                            </View>
                                            <Text style={styles.starText} allowFontScaling={false} numberOfLines={1}>{renderStars(r.stars)}</Text>
                                            {r.comment ? (
                                                <Text style={styles.commentText}>"{r.comment}"</Text>
                                            ) : (
                                                <Text style={styles.noCommentText}>No comment provided.</Text>
                                            )}
                                            
                                            {/* Edit review button */}
                                            {r.transaction_id && (
                                                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                                                    <Pressable
                                                        style={({ pressed }) => [
                                                            styles.editReviewBtn,
                                                            pressed && { opacity: 0.8 }
                                                        ]}
                                                        onPress={() => setEditingReview({
                                                            txId: r.transaction_id,
                                                            targetPubkey: r.target_pubkey,
                                                            targetCallsign: r.target_callsign || 'Partner'
                                                        })}
                                                    >
                                                        <MaterialCommunityIcons name="pencil" size={12} color="#4b5563" style={{ marginRight: 4 }} />
                                                        <Text style={styles.editReviewBtnText}>Edit Review</Text>
                                                    </Pressable>
                                                </View>
                                            )}
                                        </View>
                                    ))
                                )}
                            </View>
                        )}
                    </>
                )}
            </ScrollView>

            {editingReview && (
                <ReviewModal
                    visible={!!editingReview}
                    txId={editingReview.txId}
                    targetPubkey={editingReview.targetPubkey}
                    targetCallsign={editingReview.targetCallsign}
                    onClose={() => setEditingReview(null)}
                    onSuccess={async () => {
                        setEditingReview(null);
                        if (identity?.publicKey) {
                            const givenRatings = await getRatingsGiven(identity.publicKey).catch(() => []);
                            setGiven(givenRatings);
                        }
                    }}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ffffff',
        borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    },
    backButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingRight: 8 },
    backText: { color: '#1f2937', fontSize: 20, fontWeight: 'bold' },
    backTextLabel: { color: '#1f2937', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
    headerTitle: { color: '#111827', fontSize: 17, fontWeight: '800' },

    scrollContent: { paddingBottom: 48 },

    // Banner
    banner: {
        alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24,
        backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    },
    avatarRing: {
        width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: '#10b981',
        overflow: 'hidden', marginBottom: 14,
        shadowColor: '#10b981', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    callsignText: { fontSize: 24, fontWeight: '800', color: '#111827' },
    pubkeyText: {
        fontSize: 12, color: '#9ca3af', fontFamily: 'Courier',
        backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 6, marginBottom: 4, overflow: 'hidden',
    },
    bioText: { marginTop: 10, fontSize: 14, color: '#6b7280', fontStyle: 'italic', textAlign: 'center', lineHeight: 20 },
    joinedText: { fontSize: 12, color: '#9ca3af', fontWeight: '600', marginTop: 6 },

    // Quick stats strip (self)
    statStrip: { flexDirection: 'row', backgroundColor: '#ffffff', marginHorizontal: 16, marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 14, alignItems: 'center' },
    statTile: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    statTileNum: { fontSize: 20, fontWeight: '900', color: '#111827' },
    statTileLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', marginTop: 2 },
    statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#e5e7eb', marginVertical: 4 },

    // Stats
    statsGrid: { flexDirection: 'row', padding: 16, gap: 10, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    statBoxOverall: {
        flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
        borderRadius: 14, padding: 12, alignItems: 'center',
    },
    statBoxProvider: {
        flex: 1, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
        borderRadius: 14, padding: 12, alignItems: 'center',
    },
    statBoxReceiver: {
        flex: 1, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe',
        borderRadius: 14, padding: 12, alignItems: 'center',
    },
    starRating: { fontSize: 13, color: '#fbbf24', marginBottom: 4, letterSpacing: -1 },
    statValueOverall: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 2 },
    statLabelOverall: { fontSize: 9, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
    statValueProvider: { fontSize: 18, fontWeight: '800', color: '#10b981', marginBottom: 2, marginTop: 4 },
    statLabelProvider: { fontSize: 9, fontWeight: '700', color: '#10b981', textTransform: 'uppercase', letterSpacing: 0.5 },
    statValueReceiver: { fontSize: 18, fontWeight: '800', color: '#6366f1', marginBottom: 2, marginTop: 4 },
    statLabelReceiver: { fontSize: 9, fontWeight: '700', color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.5 },

    // Tabs
    tabBar: {
        flexDirection: 'row', backgroundColor: '#ffffff',
        borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 16,
    },
    tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: '#10b981' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
    tabTextActive: { color: '#10b981', fontWeight: '800' },
    tabContent: { padding: 16 },

    // Empty
    emptyCard: {
        backgroundColor: '#ffffff', padding: 32, borderRadius: 14, alignItems: 'center',
        borderWidth: 1, borderColor: '#e5e7eb',
    },
    emptyIcon: { fontSize: 32, opacity: 0.4, marginBottom: 8 },
    emptyText: { color: '#9ca3af', fontWeight: '600', fontSize: 14 },

    // Deal cards
    dealCard: {
        backgroundColor: '#ffffff', borderRadius: 14, padding: 12,
        marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    dealThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f3f4f6' },
    dealThumbFallback: { alignItems: 'center', justifyContent: 'center' },
    dealTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 2 },
    dealDateText: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
    creditAmount: { fontWeight: '900', fontSize: 15, color: '#8b5cf6' },
    beanIcon: { width: 14, height: 14, marginLeft: 2, resizeMode: 'contain' },
    typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
    badgeOffer: { backgroundColor: '#10b981' },
    badgeNeed: { backgroundColor: '#ea580c' },
    typeBadgeText: { fontSize: 10, fontWeight: '800', color: '#000000', letterSpacing: 0.5 },

    // Review cards
    reviewCard: {
        backgroundColor: '#ffffff', padding: 16, borderRadius: 14,
        borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    starText: { fontSize: 14, color: '#fbbf24', letterSpacing: -1 },
    roleBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
    roleBadgeProvider: { backgroundColor: 'rgba(16, 185, 129, 0.12)' },
    roleBadgeReceiver: { backgroundColor: 'rgba(99, 102, 241, 0.12)' },
    roleText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
    roleTextProvider: { color: '#059669' },
    roleTextReceiver: { color: '#4f46e5' },
    dateText: { fontSize: 10, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0, marginLeft: 8 },
    commentText: {
        fontSize: 14, color: '#374151', fontStyle: 'italic', lineHeight: 20,
        backgroundColor: '#f9fafb', padding: 12, borderRadius: 8,
    },
    noCommentText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },

    // Edit button (self)
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' },
    editBtnText: { color: '#10b981', fontSize: 14, fontWeight: '800' },

    // Trust summary card (self) → links to Ledger
    trustCard: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#ffffff', marginHorizontal: 16, marginTop: 16, padding: 14,
        borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    trustLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    trustEmoji: { fontSize: 30 },
    trustTierName: { fontSize: 17, fontWeight: '800', color: '#111827' },
    trustSub: { fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 1 },
    trustRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 },
    trustBalance: { fontSize: 16, fontWeight: '900', color: '#059669' },

    // Given reviews
    givenName: { fontSize: 14, fontWeight: '800', color: '#111827', flexShrink: 1 },
    editReviewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderColor: '#d1d5db',
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    editReviewBtnText: {
        color: '#4b5563',
        fontSize: 11,
        fontWeight: '700',
    },
});
