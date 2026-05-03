import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, FlatList, Image, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { getMarketplaceTransactions, getPosts } from '../utils/db';
import { ReviewModal } from './ReviewModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MyDealsSheetProps {
    visible: boolean;
    identity: { publicKey: string } | null;
    onClose: () => void;
    /** Optional: which sub-tab to default open to */
    initialTab?: 'active' | 'pending' | 'history';
}

export function MyDealsSheet({ visible, identity, onClose, initialTab = 'active' }: MyDealsSheetProps) {
    const [dealsTab, setDealsTab] = useState<'active' | 'pending' | 'history'>(initialTab);
    const [historyFilter, setHistoryFilter] = useState<'all' | 'buying' | 'selling'>('all');
    const [posts, setPosts] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [promptReview, setPromptReview] = useState<{ txId: string; targetPubkey: string; targetCallsign: string } | null>(null);

    useEffect(() => {
        if (visible && identity) {
            loadData();
        }
    }, [visible, identity]);

    useEffect(() => {
        if (initialTab) setDealsTab(initialTab);
    }, [initialTab]);

    const loadData = async () => {
        if (!identity) return;
        try {
            const allPosts = await getPosts();
            setPosts(allPosts);
            const txs = await getMarketplaceTransactions(identity.publicKey);
            setTransactions(txs);
        } catch (e) {
            console.error('MyDealsSheet: failed to load data', e);
        }
    };

    // ── Data derivation ──
    const myPosts = posts.filter(p =>
        identity && (
            p.author_pubkey === identity.publicKey ||
            p.accepted_by === identity.publicKey ||
            transactions.some(t => t.postId === p.id && t.status === 'pending' && (t.buyerPublicKey === identity.publicKey || t.sellerPublicKey === identity.publicKey))
        )
    ).sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const pendingDeals = posts.filter(p => {
        if (!identity) return false;
        if (p.status === 'pending' && (p.author_pubkey === identity.publicKey || p.accepted_by === identity.publicKey)) return true;
        return transactions.some(t => t.postId === p.id && t.status === 'pending');
    });

    const pendingCount = pendingDeals.length;

    const getData = () => {
        if (dealsTab === 'active') return myPosts.filter(p => p.status === 'active');
        if (dealsTab === 'pending') return pendingDeals;
        // History
        let txs = transactions.filter(t => t.status === 'completed' || t.status === 'cancelled' || t.status === 'rejected');
        if (historyFilter === 'buying') txs = txs.filter(t => t.buyerPublicKey === identity?.publicKey);
        if (historyFilter === 'selling') txs = txs.filter(t => t.sellerPublicKey === identity?.publicKey);
        return txs;
    };

    const listData = getData();

    const renderDealItem = ({ item }: { item: any }) => {
        // Transaction items (history + pending tx view)
        if (dealsTab === 'history' || (dealsTab === 'pending' && item.buyerPublicKey)) {
            const isBuyer = item.buyerPublicKey === identity?.publicKey;
            const isCompleted = item.status === 'completed';
            const isPending = item.status === 'pending';
            const needsReview = isCompleted && ((isBuyer && !item.ratedByBuyer) || (!isBuyer && !item.ratedBySeller));
            const partnerCallsign = isBuyer ? item.sellerCallsign : item.buyerCallsign;
            const partnerPubkey = isBuyer ? item.sellerPublicKey : item.buyerPublicKey;

            const card = (
                <View style={[
                    styles.dealCard,
                    !isCompleted && !isPending && { opacity: 0.5 },
                    isPending && { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
                ]}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        {item.coverImage ? (
                            <Image source={{ uri: item.coverImage }} style={styles.dealThumb} />
                        ) : (
                            <View style={[styles.dealThumb, styles.dealThumbFallback]}>
                                <Text style={{ fontSize: 24, opacity: 0.5 }}>{isBuyer ? '🛒' : '🏷️'}</Text>
                            </View>
                        )}
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={[styles.statusBadge, isCompleted && styles.statusCompleted]}>
                                        <Text style={[styles.statusText, isCompleted && styles.statusTextCompleted]}>
                                            {item.status.toUpperCase()}
                                        </Text>
                                    </View>
                                    <Text style={styles.dateText}>
                                        {new Date(item.createdAt).toLocaleDateString()}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={[styles.creditAmount, { color: isBuyer ? '#dc2626' : '#059669' }]} numberOfLines={1}>
                                        {isBuyer ? '- ' : '+ '}{item.credits}
                                    </Text>
                                    <Image source={require('../assets/images/bean.png')} style={styles.beanIcon} />
                                </View>
                            </View>
                            <Text style={styles.dealTitle} numberOfLines={1}>{item.postTitle}</Text>
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <Text style={styles.partnerText}>
                            {isBuyer ? 'Bought from ' : 'Sold to '}
                            <Text style={styles.partnerName}>{partnerCallsign}</Text>
                        </Text>
                        {needsReview && (
                            <Pressable
                                style={styles.reviewBtn}
                                onPress={() => setPromptReview({ txId: item.id, targetPubkey: partnerPubkey, targetCallsign: partnerCallsign })}
                            >
                                <Text style={styles.reviewBtnText}>Leave Review</Text>
                            </Pressable>
                        )}
                    </View>
                </View>
            );

            if (isPending) {
                return (
                    <Pressable onPress={() => { onClose(); router.push({ pathname: '/post/[id]', params: { id: item.postId, txId: item.id } }); }}>
                        {card}
                    </Pressable>
                );
            }
            return card;
        }

        // Active post items
        let coverImage: string | null = null;
        if (item.photos) {
            try { const arr = JSON.parse(item.photos); if (arr.length > 0) coverImage = arr[0]; } catch {}
        }

        return (
            <Pressable onPress={() => { onClose(); router.push(`/post/${item.id}`); }}>
                <View style={[styles.dealCard, item.status === 'pending' && { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        {coverImage ? (
                            <Image source={{ uri: coverImage }} style={styles.dealThumb} />
                        ) : (
                            <View style={[styles.dealThumb, styles.dealThumbFallback]}>
                                <Text style={{ fontSize: 24, opacity: 0.5 }}>📦</Text>
                            </View>
                        )}
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <View style={[styles.typeBadge, item.type === 'offer' ? styles.badgeOffer : styles.badgeNeed]}>
                                    <Text style={styles.typeBadgeText}>{item.type?.toUpperCase()}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.creditAmount} numberOfLines={1}>
                                        {item.credits ?? '?'}
                                    </Text>
                                    <Image source={require('../assets/images/bean.png')} style={styles.beanIcon} />
                                </View>
                            </View>
                            <Text style={styles.dealTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.dateText}>{item.status === 'pending' ? '🤝 In Escrow' : 'Active'}</Text>
                        </View>
                    </View>
                </View>
            </Pressable>
        );
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
                    {/* Handle bar */}
                    <View style={styles.handleBar} />

                    {/* Header */}
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>My Deals</Text>
                        <Pressable onPress={onClose}>
                            <Text style={styles.closeBtn}>✕</Text>
                        </Pressable>
                    </View>

                    {/* Tab bar */}
                    <View style={styles.tabBar}>
                        {[
                            { id: 'active' as const, label: 'Active' },
                            { id: 'pending' as const, label: 'In Progress', badge: pendingCount },
                            { id: 'history' as const, label: 'History' },
                        ].map(tab => (
                            <Pressable
                                key={tab.id}
                                style={[styles.tab, dealsTab === tab.id && styles.tabActive]}
                                onPress={() => setDealsTab(tab.id)}
                            >
                                <Text style={[styles.tabText, dealsTab === tab.id && styles.tabTextActive]}>
                                    {tab.label}
                                </Text>
                                {tab.badge && tab.badge > 0 ? (
                                    <View style={styles.badgeCount}>
                                        <Text style={styles.badgeCountText}>{tab.badge}</Text>
                                    </View>
                                ) : null}
                            </Pressable>
                        ))}
                    </View>

                    {/* History sub-filter */}
                    {dealsTab === 'history' && (
                        <View style={styles.historyFilterRow}>
                            {[{ id: 'all' as const, label: 'All' }, { id: 'buying' as const, label: 'Received' }, { id: 'selling' as const, label: 'Given' }].map(f => (
                                <Pressable
                                    key={f.id}
                                    style={[styles.historyChip, historyFilter === f.id && styles.historyChipActive]}
                                    onPress={() => setHistoryFilter(f.id)}
                                >
                                    <Text style={[styles.historyChipText, historyFilter === f.id && styles.historyChipTextActive]}>
                                        {f.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    )}

                    {/* List */}
                    <FlatList
                        data={listData}
                        keyExtractor={item => item.id}
                        renderItem={renderDealItem}
                        contentContainerStyle={{ paddingBottom: 24 }}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyEmoji}>
                                    {dealsTab === 'history' ? '📜' : dealsTab === 'pending' ? '🤝' : '📋'}
                                </Text>
                                <Text style={styles.emptyTitle}>
                                    {dealsTab === 'history' ? 'No history yet' : dealsTab === 'pending' ? 'No deals in progress' : 'No active posts'}
                                </Text>
                                <Text style={styles.emptySubtext}>
                                    {dealsTab === 'active'
                                        ? 'Post an offer or need to get started!'
                                        : dealsTab === 'pending'
                                        ? 'Accepted deals will appear here.'
                                        : 'Completed deals will show up here.'}
                                </Text>
                                {dealsTab === 'active' && (
                                    <Pressable
                                        style={styles.ctaBtn}
                                        onPress={() => { onClose(); router.push('/'); }}
                                    >
                                        <Text style={styles.ctaBtnText}>+ Create a Post</Text>
                                    </Pressable>
                                )}
                            </View>
                        }
                    />
                </Pressable>
            </Pressable>

            {/* Review Modal */}
            {promptReview && (
                <ReviewModal
                    visible={!!promptReview}
                    txId={promptReview.txId}
                    targetPubkey={promptReview.targetPubkey}
                    targetCallsign={promptReview.targetCallsign}
                    onClose={() => setPromptReview(null)}
                    onSuccess={() => {
                        setPromptReview(null);
                        loadData();
                    }}
                />
            )}
        </Modal>
    );
}

/** Export pending count helper for header badge */
export function usePendingDealsCount(identity: { publicKey: string } | null, posts: any[], transactions: any[]): number {
    if (!identity) return 0;
    return posts.filter(p => {
        if (p.status === 'pending' && (p.author_pubkey === identity.publicKey || p.accepted_by === identity.publicKey)) return true;
        return transactions.some((t: any) => t.postId === p.id && t.status === 'pending');
    }).length;
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingBottom: 40,
        maxHeight: SCREEN_HEIGHT * 0.75,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
    },
    handleBar: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        alignSelf: 'center',
        marginBottom: 12,
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sheetTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: '#1f2937',
    },
    closeBtn: {
        fontSize: 20,
        color: '#9ca3af',
        fontWeight: '700',
        padding: 4,
    },

    // Tab bar
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        flexDirection: 'row',
        gap: 4,
    },
    tabActive: {
        backgroundColor: '#ffffff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#6b7280',
    },
    tabTextActive: {
        color: '#1f2937',
        fontWeight: '800',
    },
    badgeCount: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 8,
    },
    badgeCountText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '900',
    },

    // History sub-filter
    historyFilterRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 16,
    },
    historyChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#d1d5db',
        backgroundColor: '#fff',
    },
    historyChipActive: {
        backgroundColor: '#1f2937',
        borderColor: '#1f2937',
    },
    historyChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4b5563',
    },
    historyChipTextActive: {
        color: '#fff',
    },

    // Deal cards
    dealCard: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
    },
    dealThumb: {
        width: 56,
        height: 56,
        borderRadius: 8,
        backgroundColor: '#e5e7eb',
    },
    dealThumbFallback: {
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dealTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1f2937',
        marginBottom: 2,
    },
    dateText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#9ca3af',
    },
    creditAmount: {
        fontWeight: '900',
        fontSize: 15,
        color: '#8b5cf6',
    },
    beanIcon: {
        width: 14,
        height: 14,
        marginLeft: 2,
        resizeMode: 'contain',
    },
    statusBadge: {
        backgroundColor: '#e5e7eb',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    statusCompleted: {
        backgroundColor: '#d1fae5',
    },
    statusText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#4b5563',
        textTransform: 'uppercase',
    },
    statusTextCompleted: {
        color: '#065f46',
    },
    typeBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeOffer: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    badgeNeed: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.2)',
    },
    typeBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#1f2937',
        letterSpacing: 0.5,
    },
    partnerText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6b7280',
    },
    partnerName: {
        color: '#1f2937',
        fontWeight: '800',
    },
    reviewBtn: {
        backgroundColor: '#fef3c7',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#fde047',
    },
    reviewBtnText: {
        color: '#b45309',
        fontSize: 12,
        fontWeight: '800',
    },

    // Empty state
    emptyState: {
        padding: 32,
        alignItems: 'center',
    },
    emptyEmoji: {
        fontSize: 48,
        opacity: 0.3,
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1f2937',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#6b7280',
        textAlign: 'center',
        marginBottom: 20,
    },
    ctaBtn: {
        backgroundColor: '#8b5cf6',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    ctaBtnText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 14,
    },
});
