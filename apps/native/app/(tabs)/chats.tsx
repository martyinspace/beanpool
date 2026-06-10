import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, Platform, Image, TextInput, DeviceEventEmitter } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIdentity } from '../IdentityContext';
import { getConversations, createConversationApi, syncMessages } from '../../utils/db';
import { MemberAvatar } from '../../components/MemberAvatar';

export default function ChatsScreen() {
    const { identity } = useIdentity();
    const [conversations, setConversations] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'all' | 'transactions' | 'direct'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'recent' | 'unread' | 'credits_desc' | 'credits_asc'>('recent');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'completed'>('all');
    const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all');
    const [showOptions, setShowOptions] = useState(false);

    // Partition conversations into "Action Required" and regular
    const { actionRequired, regularConversations } = React.useMemo(() => {
        let list = conversations;
        
        // Tab filter (Transactions / Direct / All)
        if (activeTab === 'transactions') list = list.filter(c => !!c.postId);
        if (activeTab === 'direct') list = list.filter(c => !c.postId);
        
        // 1. Text Search Filter
        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(c => {
                const matchPeer = (c.peer || '').toLowerCase().includes(q);
                const matchTitle = (c.postTitle || '').toLowerCase().includes(q);
                const matchMsg = (c.lastMessage || '').toLowerCase().includes(q);
                return matchPeer || matchTitle || matchMsg;
            });
        }

        // 2. Read State Filter
        if (readFilter === 'unread') {
            list = list.filter(c => c.unread > 0);
        }

        // 3. Post Status Filter (only relevant for posts / transactions)
        if (statusFilter !== 'all') {
            list = list.filter(c => c.postStatus === statusFilter);
        }

        // Partition Action Required
        const actionRequired = list.filter(item => {
            // User is the payer and the post is pending (they need to release credits)
            if (item.postStatus === 'pending' && item.isPayer) return true;
            // User is the payee and escrow was just funded (they need to fulfill)
            if (item.lastMsgType === 'system' && item.lastSysType === 'ESCROW_FUNDED' && item.isPayee) return true;
            // Review needed after release
            if (item.lastMsgType === 'system' && item.lastSysType === 'ESCROW_RELEASED' && !item.hasRated) return true;
            return false;
        });

        let regular = list.filter(item => !actionRequired.includes(item));
        
        // 4. Advanced Sorting
        regular = [...regular].sort((a, b) => {
            // Standard tab transactions sorting (active posts first)
            if (activeTab === 'transactions' && sortBy === 'recent') {
                const isAActive = ['active', 'pending'].includes(a.postStatus || '');
                const isBActive = ['active', 'pending'].includes(b.postStatus || '');
                if (isAActive && !isBActive) return -1;
                if (!isAActive && isBActive) return 1;
            }

            if (sortBy === 'unread') {
                // Prioritize unread messages
                if (a.unread > 0 && b.unread === 0) return -1;
                if (a.unread === 0 && b.unread > 0) return 1;
            } else if (sortBy === 'credits_desc') {
                const credA = a.postCredits || a.pendingAmount || 0;
                const credB = b.postCredits || b.pendingAmount || 0;
                if (credA !== credB) return credB - credA;
            } else if (sortBy === 'credits_asc') {
                const credA = a.postCredits || a.pendingAmount || 0;
                const credB = b.postCredits || b.pendingAmount || 0;
                if (credA !== credB) return credA - credB;
            }

            // Fallback: raw timestamp
            const timeA = a.rawTimestamp ? new Date(a.rawTimestamp).getTime() : 0;
            const timeB = b.rawTimestamp ? new Date(b.rawTimestamp).getTime() : 0;
            return timeB - timeA;
        });

        return { actionRequired, regularConversations: regular };
    }, [conversations, activeTab, searchQuery, sortBy, statusFilter, readFilter]);

    const resetFilters = () => {
        setSearchQuery('');
        setSortBy('recent');
        setStatusFilter('all');
        setReadFilter('all');
    };

    const activeFiltersCount = (sortBy !== 'recent' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (readFilter !== 'all' ? 1 : 0);

    useFocusEffect(
        React.useCallback(() => {
            let active = true;

            const loadData = () => {
                if (identity?.publicKey && active) {
                    getConversations(identity.publicKey)
                        .then(res => {
                            if (active) setConversations(res);
                        })
                        .catch(console.error);
                }
            };

            loadData();

            // Background sync messages
            if (identity?.publicKey) {
                syncMessages(identity.publicKey).then(() => {
                    loadData();
                });
            }

            const sub = DeviceEventEmitter.addListener('sync_data_updated', loadData);

            const wsSub = DeviceEventEmitter.addListener('ws_activity', () => {
                if (identity?.publicKey && active) {
                    syncMessages(identity.publicKey).then(() => {
                        loadData();
                    });
                }
            });

            return () => {
                active = false;
                sub.remove();
                wsSub.remove();
            };
        }, [identity])
    );



    const getActionLabel = (item: any) => {
        if (item.postStatus === 'pending' && item.isPayer) return '🔓 Release Credits';
        if (item.lastSysType === 'ESCROW_FUNDED' && item.isPayee) return '📦 Fulfill Order';
        if (item.lastSysType === 'ESCROW_RELEASED') return '⭐ Leave Review';
        return '⚡ Action Required';
    };

    const renderActionCard = ({ item }: { item: any }) => (
        <Pressable 
            style={styles.actionCard}
            onPress={() => {
                if (item.lastSysType === 'ESCROW_RELEASED' && !item.hasRated) {
                    router.push({ pathname: `/chat/${item.id}`, params: { triggerReview: 'true' } });
                } else {
                    router.push(`/chat/${item.id}`);
                }
            }}
        >
            <View style={styles.actionCardHeader}>
                <View style={styles.actionIconContainer}>
                    <MemberAvatar avatarUrl={item.peerAvatar} pubkey={item.peerPubkey || ''} callsign={item.peer} size={28} />
                </View>
                <View style={styles.actionCardInfo}>
                    <Text style={styles.actionCardTitle} numberOfLines={1}>{item.postTitle || 'Transaction'}</Text>
                    <Text style={styles.actionCardPeer}>{item.peer}</Text>
                </View>
                {item.pendingAmount && (
                    <View style={styles.actionAmountBadge}>
                        <Text style={styles.actionAmountText}>{item.pendingAmount} 🫘</Text>
                    </View>
                )}
            </View>
            <View style={styles.actionCardFooter}>
                <Text style={styles.actionLabel}>{getActionLabel(item)}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
            </View>
        </Pressable>
    );

    const renderItem = ({ item }: { item: any }) => {
        const needsAction = (
            (item.lastMsgType === 'system' && item.lastSysType === 'ESCROW_RELEASED' && !item.hasRated) ||
            (item.postStatus === 'pending' && item.isPayer)
        );
        
        return (
            <Pressable 
                style={[styles.chatRow, needsAction && styles.chatRowActionNeeded]}
                onPress={() => {
                    if (item.lastMsgType === 'system' && item.lastSysType === 'ESCROW_RELEASED' && !item.hasRated) {
                        router.push({ pathname: `/chat/${item.id}`, params: { triggerReview: 'true' } });
                    } else {
                        router.push(`/chat/${item.id}`);
                    }
                }}
            >
                {item.postId && item.postPhoto && typeof item.postPhoto === 'string' && item.postPhoto.trim() !== '' && item.postPhoto !== 'null' && item.postPhoto !== 'undefined' ? (
                    <View style={styles.avatarComposite}>
                        {/* Post photo as primary (rounded square) */}
                        <Image source={{ uri: item.postPhoto }} style={styles.postPhotoAvatar} />
                        {/* Peer profile overlay (small circle) */}
                        <View style={styles.overlayAvatarWrap}>
                            <MemberAvatar avatarUrl={item.peerAvatar} pubkey={item.peerPubkey || ''} callsign={item.peer} size={20} />
                        </View>
                    </View>
                ) : item.postId ? (
                    <View style={styles.avatarComposite}>
                        <View style={[styles.avatar, styles.avatarMarketplace]}>
                            <MaterialCommunityIcons name="shopping-outline" size={24} color="#059669" />
                        </View>
                        <View style={styles.overlayAvatarWrap}>
                            <MemberAvatar avatarUrl={item.peerAvatar} pubkey={item.peerPubkey || ''} callsign={item.peer} size={20} />
                        </View>
                    </View>
                ) : (
                    <View style={styles.avatarWrapper}>
                        <MemberAvatar avatarUrl={item.peerAvatar} pubkey={item.peerPubkey || ''} callsign={item.peer} size={44} />
                    </View>
                )}
                
                <View style={styles.chatDetails}>
                    <View style={styles.chatHeader}>
                        <Text style={[styles.peerName, item.unread > 0 && styles.peerNameUnread]}>{item.peer}</Text>
                        <Text style={[styles.timestamp, item.unread > 0 && styles.timestampUnread]}>{item.timestamp}</Text>
                    </View>
                    
                    {item.postTitle && (
                        <View style={styles.contextRow}>
                            <Text style={styles.contextPostTitle} numberOfLines={1}>{item.postTitle}</Text>
                            {item.postStatus && (
                                <View style={[styles.statusPill, 
                                    item.postStatus === 'active' ? { backgroundColor: '#dbeafe' } : 
                                    item.postStatus === 'pending' ? { backgroundColor: '#d1fae5' } : 
                                    { backgroundColor: '#f3f4f6' }
                                ]}>
                                    <Text style={[styles.statusPillText,
                                        item.postStatus === 'active' ? { color: '#1d4ed8' } : 
                                        item.postStatus === 'pending' ? { color: '#047857' } : 
                                        { color: '#4b5563' }
                                    ]}>
                                        {item.postStatus === 'pending' ? 'ESCROW' : item.postStatus.toUpperCase()}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                    
                    <View style={styles.messageRow}>
                        {needsAction ? (
                            <Text style={styles.actionNeededText} numberOfLines={1}>
                                <MaterialCommunityIcons name="star-outline" size={14} color="#f59e0b" /> Review Needed
                            </Text>
                        ) : (
                            <Text style={[styles.lastMessage, item.unread > 0 && styles.lastMessageUnread]} numberOfLines={1}>
                                {item.lastMessage}
                            </Text>
                        )}
                        {item.unread > 0 && (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadCount}>{item.unread}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </Pressable>
        );
    };

    const ListHeader = () => (
        <>
            {actionRequired.length > 0 && (
                <View style={styles.actionSection}>
                    <View style={styles.actionSectionHeader}>
                        <MaterialCommunityIcons name="lightning-bolt" size={18} color="#059669" />
                        <Text style={styles.actionSectionTitle}>Action Required</Text>
                        <View style={styles.actionCountBadge}>
                            <Text style={styles.actionCountText}>{actionRequired.length}</Text>
                        </View>
                    </View>
                    {actionRequired.map(item => (
                        <View key={item.id}>
                            {renderActionCard({ item })}
                        </View>
                    ))}
                </View>
            )}
        </>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={[styles.header, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Text style={styles.title}>Inbox</Text>
                <Pressable style={styles.newChatBtn} onPress={() => {
                    if (Platform.OS === 'web') {
                        const val = window.prompt("Enter PubKey or Callsign:");
                        if (val) router.push(`/chat/${val}`);
                    } else {
                        router.push('/new-message');
                    }
                }}>
                    <MaterialCommunityIcons name="pencil-outline" size={24} color="#8b5cf6" />
                </Pressable>
            </View>

            {/* Search, Sort, and Filter row */}
            <View style={styles.searchBarRow}>
                <View style={styles.searchContainer}>
                    <MaterialCommunityIcons name="magnify" size={20} color="#9ca3af" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search chats, posts, partners..."
                        placeholderTextColor="#9ca3af"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.trim() !== '' && (
                        <Pressable onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                            <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
                        </Pressable>
                    )}
                </View>
                <Pressable 
                    style={[styles.optionsToggleBtn, (showOptions || activeFiltersCount > 0) && styles.optionsToggleBtnActive]}
                    onPress={() => setShowOptions(!showOptions)}
                >
                    <MaterialCommunityIcons name="tune-variant" size={20} color={showOptions || activeFiltersCount > 0 ? '#ffffff' : '#4b5563'} />
                    {activeFiltersCount > 0 && (
                        <View style={styles.filterBadge}>
                            <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
                        </View>
                    )}
                </Pressable>
            </View>

            {/* Collapsible sort and filter options drawer */}
            {showOptions && (
                <View style={styles.optionsDrawer}>
                    {/* Sort Section */}
                    <Text style={styles.optionsLabel}>Sort by</Text>
                    <View style={styles.chipsRow}>
                        <Pressable 
                            style={[styles.chip, sortBy === 'recent' && styles.chipActive]} 
                            onPress={() => setSortBy('recent')}
                        >
                            <Text style={[styles.chipText, sortBy === 'recent' && styles.chipTextActive]}>⇅ Recent</Text>
                        </Pressable>
                        <Pressable 
                            style={[styles.chip, sortBy === 'unread' && styles.chipActive]} 
                            onPress={() => setSortBy('unread')}
                        >
                            <Text style={[styles.chipText, sortBy === 'unread' && styles.chipTextActive]}>✉ Unread</Text>
                        </Pressable>
                        <Pressable 
                            style={[styles.chip, sortBy === 'credits_desc' && styles.chipActive]} 
                            onPress={() => setSortBy('credits_desc')}
                        >
                            <Text style={[styles.chipText, sortBy === 'credits_desc' && styles.chipTextActive]}>🫘 Credits: High</Text>
                        </Pressable>
                        <Pressable 
                            style={[styles.chip, sortBy === 'credits_asc' && styles.chipActive]} 
                            onPress={() => setSortBy('credits_asc')}
                        >
                            <Text style={[styles.chipText, sortBy === 'credits_asc' && styles.chipTextActive]}>🫘 Credits: Low</Text>
                        </Pressable>
                    </View>

                    {/* Status Filter Section */}
                    {activeTab !== 'direct' && (
                        <>
                            <Text style={styles.optionsLabel}>Post Status</Text>
                            <View style={styles.chipsRow}>
                                <Pressable 
                                    style={[styles.chip, statusFilter === 'all' && styles.chipActive]} 
                                    onPress={() => setStatusFilter('all')}
                                >
                                    <Text style={[styles.chipText, statusFilter === 'all' && styles.chipTextActive]}>● All</Text>
                                </Pressable>
                                <Pressable 
                                    style={[styles.chip, statusFilter === 'active' && styles.chipActive]} 
                                    onPress={() => setStatusFilter('active')}
                                >
                                    <Text style={[styles.chipText, statusFilter === 'active' && styles.chipTextActive]}>● Active</Text>
                                </Pressable>
                                <Pressable 
                                    style={[styles.chip, statusFilter === 'pending' && styles.chipActive]} 
                                    onPress={() => setStatusFilter('pending')}
                                >
                                    <Text style={[styles.chipText, statusFilter === 'pending' && styles.chipTextActive]}>● Escrow</Text>
                                </Pressable>
                                <Pressable 
                                    style={[styles.chip, statusFilter === 'completed' && styles.chipActive]} 
                                    onPress={() => setStatusFilter('completed')}
                                >
                                    <Text style={[styles.chipText, statusFilter === 'completed' && styles.chipTextActive]}>● Completed</Text>
                                </Pressable>
                            </View>
                        </>
                    )}

                    {/* Read State Filter Section */}
                    <Text style={styles.optionsLabel}>Read Status</Text>
                    <View style={styles.chipsRow}>
                        <Pressable 
                            style={[styles.chip, readFilter === 'all' && styles.chipActive]} 
                            onPress={() => setReadFilter('all')}
                        >
                            <Text style={[styles.chipText, readFilter === 'all' && styles.chipTextActive]}>✓ All</Text>
                        </Pressable>
                        <Pressable 
                            style={[styles.chip, readFilter === 'unread' && styles.chipActive]} 
                            onPress={() => setReadFilter('unread')}
                        >
                            <Text style={[styles.chipText, readFilter === 'unread' && styles.chipTextActive]}>✉ Unread Only</Text>
                        </Pressable>
                    </View>

                    {/* Reset Footer */}
                    <View style={styles.optionsFooter}>
                        <Pressable style={styles.resetBtn} onPress={resetFilters}>
                            <Text style={styles.resetBtnText}>Reset Defaults</Text>
                        </Pressable>
                        <Pressable style={styles.closeBtn} onPress={() => setShowOptions(false)}>
                            <Text style={styles.closeBtnText}>✕ Close</Text>
                        </Pressable>
                    </View>
                </View>
            )}

            <View style={styles.tabContainer}>
                <Pressable style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]} onPress={() => setActiveTab('all')}>
                    <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>All</Text>
                </Pressable>
                <Pressable style={[styles.tabBtn, activeTab === 'transactions' && styles.tabBtnActive]} onPress={() => setActiveTab('transactions')}>
                    <Text style={[styles.tabBtnText, activeTab === 'transactions' && styles.tabBtnTextActive]}>Transactions</Text>
                </Pressable>
                <Pressable style={[styles.tabBtn, activeTab === 'direct' && styles.tabBtnActive]} onPress={() => setActiveTab('direct')}>
                    <Text style={[styles.tabBtnText, activeTab === 'direct' && styles.tabBtnTextActive]}>Direct</Text>
                </Pressable>
            </View>

            <FlatList
                data={regularConversations}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                ListHeaderComponent={ListHeader}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    actionRequired.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            {activeTab === 'transactions' ? (
                                <>
                                    <MaterialCommunityIcons name="storefront-outline" size={48} color="#d1d5db" />
                                    <Text style={styles.emptyText}>No active transactions yet.</Text>
                                    <Pressable
                                        onPress={() => router.push('/')}
                                        style={{ marginTop: 12, backgroundColor: '#8b5cf6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                                    >
                                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Browse Market</Text>
                                    </Pressable>
                                </>
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="message-outline" size={48} color="#d1d5db" />
                                    <Text style={styles.emptyText}>No active P2P connections found.</Text>
                                </>
                            )}
                        </View>
                    ) : null
                }
            />


        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    title: { fontSize: 32, fontWeight: '800', color: '#1f2937', letterSpacing: -0.5 },
    newChatBtn: { padding: 8, backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 12 },
    list: { paddingBottom: 100 },
    chatRow: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f9fafb', alignItems: 'center' },
    chatRowActionNeeded: { backgroundColor: '#fffbeb', borderLeftWidth: 4, borderLeftColor: '#f59e0b', paddingLeft: 12 },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    avatarText: { fontSize: 20, fontWeight: 'bold', color: '#6b7280' },
    avatarWrapper: { width: 50, height: 50, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    overlayAvatar: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#4b5563', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
    overlayAvatarText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    chatDetails: { flex: 1 },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    peerName: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
    peerNameUnread: { color: '#111827', fontWeight: '900' },
    timestamp: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
    timestampUnread: { color: '#8b5cf6', fontWeight: '700' },
    messageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
    lastMessage: { fontSize: 14, color: '#6b7280', flex: 1, paddingRight: 16 },
    lastMessageUnread: { color: '#111827', fontWeight: '600' },
    actionNeededText: { fontSize: 13, color: '#d97706', fontWeight: '700', flex: 1 },
    unreadBadge: { backgroundColor: '#8b5cf6', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    unreadCount: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
    contextRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    contextPostTitle: { fontSize: 13, color: '#4b5563', fontWeight: '500', flex: 1, marginRight: 8 },
    statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    avatarMarketplace: { backgroundColor: '#d1fae5' },
    avatarComposite: { width: 50, height: 50, marginRight: 16 },
    postPhotoAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#e5e7eb' },
    overlayAvatarWrap: { position: 'absolute', bottom: -3, right: -3, borderWidth: 2, borderColor: '#fff', borderRadius: 12, overflow: 'hidden' },
    tabContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 8 },
    tabBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#f3f4f6' },
    tabBtnActive: { backgroundColor: '#1f2937' },
    tabBtnText: { color: '#4b5563', fontSize: 14, fontWeight: '600' },
    tabBtnTextActive: { color: '#fff' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
    emptyText: { marginTop: 16, fontSize: 15, color: '#9ca3af', fontWeight: '500' },

    // Action Required Section
    actionSection: { margin: 12, padding: 16, backgroundColor: '#f0fdf4', borderRadius: 16, borderWidth: 1, borderColor: '#bbf7d0' },
    actionSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
    actionSectionTitle: { fontSize: 15, fontWeight: '800', color: '#166534', letterSpacing: 0.3 },
    actionCountBadge: { backgroundColor: '#059669', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
    actionCountText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    actionCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: '#e5e7eb' },
    actionCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    actionIconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    actionCardInfo: { flex: 1 },
    actionCardTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
    actionCardPeer: { fontSize: 13, color: '#6b7280', marginTop: 1 },
    actionAmountBadge: { backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    actionAmountText: { fontSize: 14, fontWeight: '800', color: '#059669' },
    actionCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
    actionLabel: { fontSize: 14, fontWeight: '700', color: '#059669' },

    searchBarRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, gap: 10, alignItems: 'center' },
    searchContainer: { flex: 1, flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, alignItems: 'center', paddingHorizontal: 10, height: 42 },
    searchIcon: { marginRight: 6 },
    searchInput: { flex: 1, fontSize: 15, color: '#1f2937', height: '100%', paddingVertical: 0 },
    clearBtn: { padding: 4 },
    optionsToggleBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
    optionsToggleBtnActive: { backgroundColor: '#8b5cf6' },
    filterBadge: { position: 'absolute', top: -3, right: -3, backgroundColor: '#ea580c', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#ffffff' },
    filterBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },

    optionsDrawer: { backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', padding: 16 },
    optionsLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
    chipActive: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
    chipText: { color: '#4b5563', fontSize: 13, fontWeight: '600' },
    chipTextActive: { color: '#ffffff' },
    optionsFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 12 },
    resetBtn: { paddingVertical: 4 },
    resetBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
    closeBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#e5e7eb' },
    closeBtnText: { color: '#4b5563', fontSize: 13, fontWeight: '700' },

});
