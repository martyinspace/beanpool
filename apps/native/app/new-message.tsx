import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, TextInput,
    KeyboardAvoidingView, Platform, Image, ActivityIndicator
} from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIdentity } from './IdentityContext';
import { getDb, createConversationApi, getRecentChatMembers, getFriendsLocal } from '../utils/db';

export default function NewMessageScreen() {
    const { identity } = useIdentity();
    const [searchQuery, setSearchQuery] = useState('');
    const [allMembers, setAllMembers] = useState<any[]>([]);
    const [friendPubkeys, setFriendPubkeys] = useState<Set<string>>(new Set());
    const [recents, setRecents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState<string | null>(null);

    // Load members, friends, and recents on mount
    useEffect(() => {
        if (!identity?.publicKey) return;
        
        const load = async () => {
            setLoading(true);
            try {
                const database = await getDb();
                
                // Load all community members (excluding self)
                const members = await database.getAllAsync<any>(
                    `SELECT public_key, callsign, avatar_url, joined_at 
                     FROM members 
                     WHERE public_key != ? AND (status IS NULL OR status != 'pruned')
                       AND public_key NOT LIKE 'escrow_%' AND public_key NOT LIKE 'project_%'
                     ORDER BY callsign COLLATE NOCASE ASC`,
                    [identity.publicKey]
                );
                setAllMembers(members);

                // Load friends set
                const friends = await getFriendsLocal(identity.publicKey);
                setFriendPubkeys(new Set(friends.map((f: any) => f.publicKey)));

                // Load recents
                const recentMembers = await getRecentChatMembers(identity.publicKey, 8);
                setRecents(recentMembers);
            } catch (e) {
                console.error('[NewMessage] Load error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [identity?.publicKey]);

    // Debounced filtered + sorted results
    const filteredMembers = useMemo(() => {
        let list = allMembers;

        // Apply search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(m => 
                m.callsign?.toLowerCase().includes(q) || 
                m.public_key?.toLowerCase().includes(q)
            );
        }

        // Sort: friends first, then alphabetical
        return list.sort((a, b) => {
            const aFriend = friendPubkeys.has(a.public_key) ? 0 : 1;
            const bFriend = friendPubkeys.has(b.public_key) ? 0 : 1;
            if (aFriend !== bFriend) return aFriend - bFriend;
            return (a.callsign || '').localeCompare(b.callsign || '');
        });
    }, [allMembers, searchQuery, friendPubkeys]);

    const handleSelectMember = useCallback(async (pubkey: string) => {
        if (!identity?.publicKey || creating) return;
        setCreating(pubkey);
        try {
            const apiConv = await createConversationApi('dm', [identity.publicKey, pubkey], identity.publicKey);
            router.replace(`/chat/${apiConv.id}`);
        } catch (e: any) {
            console.error('[NewMessage] Create conversation error:', e);
            setCreating(null);
        }
    }, [identity?.publicKey, creating]);

    const formatJoinDate = (dateStr: string | null) => {
        if (!dateStr) return 'Member';
        try {
            const d = new Date(dateStr);
            const now = new Date();
            const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 1) return 'Joined today';
            if (diffDays < 7) return `Joined ${diffDays}d ago`;
            if (diffDays < 30) return `Joined ${Math.floor(diffDays / 7)}w ago`;
            return `Joined ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
        } catch {
            return 'Member';
        }
    };

    const renderMemberCard = ({ item }: { item: any }) => {
        const isFriend = friendPubkeys.has(item.public_key);
        const isCreating = creating === item.public_key;
        
        return (
            <Pressable 
                style={[styles.memberCard, isCreating && styles.memberCardActive]}
                onPress={() => handleSelectMember(item.public_key)}
                disabled={!!creating}
            >
                <View style={styles.memberAvatar}>
                    {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
                    ) : (
                        <Text style={styles.avatarInitial}>
                            {(item.callsign || '?').charAt(0).toUpperCase()}
                        </Text>
                    )}
                    {isFriend && (
                        <View style={styles.friendBadge}>
                            <Text style={styles.friendBadgeText}>★</Text>
                        </View>
                    )}
                </View>
                <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                        <Text style={styles.memberName} numberOfLines={1}>{item.callsign || 'Unknown'}</Text>
                        {isFriend && <Text style={styles.friendLabel}>Friend</Text>}
                    </View>
                    <Text style={styles.memberMeta} numberOfLines={1}>
                        {item.public_key?.substring(0, 8).toUpperCase()} · {formatJoinDate(item.joined_at)}
                    </Text>
                </View>
                {isCreating ? (
                    <ActivityIndicator size="small" color="#8b5cf6" />
                ) : (
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#d1d5db" />
                )}
            </Pressable>
        );
    };

    const renderRecentCard = ({ item }: { item: any }) => {
        const isFriend = friendPubkeys.has(item.publicKey);
        const isCreating = creating === item.publicKey;
        
        return (
            <Pressable 
                style={styles.recentChip}
                onPress={() => handleSelectMember(item.publicKey)}
                disabled={!!creating}
            >
                <View style={styles.recentAvatar}>
                    {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.recentAvatarImage} />
                    ) : (
                        <Text style={styles.recentAvatarText}>
                            {(item.callsign || '?').charAt(0).toUpperCase()}
                        </Text>
                    )}
                </View>
                <Text style={styles.recentName} numberOfLines={1}>{item.callsign}</Text>
                {isFriend && <Text style={styles.recentStar}>★</Text>}
            </Pressable>
        );
    };

    const showRecents = !searchQuery.trim() && recents.length > 0;

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView 
                style={styles.container} 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Pressable style={styles.backBtn} onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={24} color="#1f2937" />
                    </Pressable>
                    <Text style={styles.title}>New Message</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Search Input — at the TOP, autoFocus */}
                <View style={styles.searchContainer}>
                    <MaterialCommunityIcons name="magnify" size={20} color="#9ca3af" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by callsign or public key..."
                        placeholderTextColor="#9ca3af"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus={true}
                        returnKeyType="search"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {searchQuery.length > 0 && (
                        <Pressable onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                            <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
                        </Pressable>
                    )}
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#8b5cf6" />
                        <Text style={styles.loadingText}>Loading community...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredMembers}
                        keyExtractor={item => item.public_key}
                        renderItem={renderMemberCard}
                        contentContainerStyle={styles.list}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        ListHeaderComponent={
                            <>
                                {/* Recents Section */}
                                {showRecents && (
                                    <View style={styles.recentsSection}>
                                        <Text style={styles.sectionTitle}>💬 Recent Conversations</Text>
                                        <FlatList
                                            data={recents}
                                            keyExtractor={item => item.publicKey}
                                            renderItem={renderRecentCard}
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.recentsList}
                                        />
                                    </View>
                                )}

                                {/* Directory Header */}
                                <View style={styles.directoryHeader}>
                                    <Text style={styles.sectionTitle}>
                                        {searchQuery ? `🔍 Results` : '🏘️ Community'}
                                    </Text>
                                    <Text style={styles.memberCount}>
                                        {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}
                                    </Text>
                                </View>
                            </>
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="account-search-outline" size={48} color="#d1d5db" />
                                <Text style={styles.emptyText}>
                                    {searchQuery ? 'No members match your search.' : 'No community members found.'}
                                </Text>
                            </View>
                        }
                    />
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#ffffff' },
    container: { flex: 1 },
    header: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' 
    },
    backBtn: { padding: 8, borderRadius: 12, backgroundColor: '#f3f4f6' },
    title: { fontSize: 18, fontWeight: '800', color: '#1f2937', letterSpacing: -0.3 },

    searchContainer: { 
        flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 12, 
        backgroundColor: '#f3f4f6', borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e5e7eb'
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#1f2937', fontWeight: '500' },
    clearBtn: { padding: 4 },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { color: '#9ca3af', fontSize: 14, fontWeight: '500' },

    list: { paddingBottom: 100 },

    // Recents
    recentsSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    recentsList: { gap: 12, paddingTop: 12 },
    recentChip: { alignItems: 'center', width: 72 },
    recentAvatar: { 
        width: 52, height: 52, borderRadius: 26, backgroundColor: '#f3f4f6', 
        justifyContent: 'center', alignItems: 'center', marginBottom: 6,
        borderWidth: 2, borderColor: '#e5e7eb'
    },
    recentAvatarImage: { width: 52, height: 52, borderRadius: 26 },
    recentAvatarText: { fontSize: 20, fontWeight: 'bold', color: '#6b7280' },
    recentName: { fontSize: 11, fontWeight: '600', color: '#4b5563', textAlign: 'center' },
    recentStar: { fontSize: 10, color: '#f59e0b', marginTop: 1 },

    // Directory
    directoryHeader: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 
    },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: '#6b7280', letterSpacing: 0.3, textTransform: 'uppercase' },
    memberCount: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },

    // Member Cards
    memberCard: { 
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, 
        borderBottomWidth: 1, borderBottomColor: '#f9fafb' 
    },
    memberCardActive: { backgroundColor: '#f5f3ff' },
    memberAvatar: { position: 'relative', marginRight: 14 },
    avatarImage: { width: 48, height: 48, borderRadius: 24 },
    avatarInitial: { 
        width: 48, height: 48, borderRadius: 24, backgroundColor: '#f3f4f6', 
        textAlign: 'center', lineHeight: 48, fontSize: 20, fontWeight: 'bold', color: '#6b7280',
        overflow: 'hidden'
    },
    friendBadge: { 
        position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, 
        backgroundColor: '#f59e0b', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' 
    },
    friendBadgeText: { fontSize: 10, color: '#fff', fontWeight: '800' },
    memberInfo: { flex: 1 },
    memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    memberName: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
    friendLabel: { fontSize: 10, fontWeight: '800', color: '#f59e0b', backgroundColor: '#fffbeb', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
    memberMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2, fontWeight: '500' },

    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyText: { marginTop: 12, fontSize: 14, color: '#9ca3af', fontWeight: '500' },
});
