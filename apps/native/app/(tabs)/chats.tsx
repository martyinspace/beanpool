import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, Platform } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIdentity } from '../IdentityContext';
import { getConversations, createConversationApi, syncMessages } from '../../utils/db';

export default function ChatsScreen() {
    const { identity } = useIdentity();
    const [conversations, setConversations] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'all' | 'transactions' | 'direct'>('all');

    // Partition conversations into "Action Required" and regular
    const { actionRequired, regularConversations } = React.useMemo(() => {
        let list = conversations;
        if (activeTab === 'transactions') list = conversations.filter(c => !!c.postId);
        if (activeTab === 'direct') list = conversations.filter(c => !c.postId);
        
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
        
        if (activeTab === 'transactions') {
            regular = regular.sort((a, b) => {
                const isAActive = ['active', 'pending'].includes(a.postStatus || '');
                const isBActive = ['active', 'pending'].includes(b.postStatus || '');
                if (isAActive && !isBActive) return -1;
                if (!isAActive && isBActive) return 1;
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            });
        }
        return { actionRequired, regularConversations: regular };
    }, [conversations, activeTab]);

    useFocusEffect(
        React.useCallback(() => {
            if (identity?.publicKey) {
                getConversations(identity.publicKey).then(setConversations).catch(console.error);
                
                // Background sync messages
                syncMessages(identity.publicKey).then(() => {
                    getConversations(identity.publicKey).then(setConversations).catch(console.error);
                });
            }
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
            onPress={() => router.push(`/chat/${item.id}`)}
        >
            <View style={styles.actionCardHeader}>
                <View style={styles.actionIconContainer}>
                    <MaterialCommunityIcons name="lock-outline" size={20} color="#fff" />
                </View>
                <View style={styles.actionCardInfo}>
                    <Text style={styles.actionCardTitle} numberOfLines={1}>{item.postTitle || 'Transaction'}</Text>
                    <Text style={styles.actionCardPeer}>{item.peer}</Text>
                </View>
                {item.pendingAmount && (
                    <View style={styles.actionAmountBadge}>
                        <Text style={styles.actionAmountText}>Ʀ{item.pendingAmount}</Text>
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
                onPress={() => router.push(`/chat/${item.id}`)}
            >
                {activeTab === 'transactions' && item.postId ? (
                    <View style={[styles.avatar, styles.avatarMarketplace]}>
                        <MaterialCommunityIcons name="shopping-outline" size={24} color="#059669" />
                        <View style={styles.overlayAvatar}>
                            <Text style={styles.overlayAvatarText}>{item.peer.charAt(0).toUpperCase()}</Text>
                        </View>
                    </View>
                ) : (
                    <View style={[styles.avatar, item.postId && styles.avatarMarketplace]}>
                        {item.postId ? (
                            <MaterialCommunityIcons name="shopping-outline" size={24} color="#059669" />
                        ) : (
                            <Text style={styles.avatarText}>{item.peer.charAt(0).toUpperCase()}</Text>
                        )}
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
                                        onPress={() => router.push('/market')}
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

});
