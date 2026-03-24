import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, SafeAreaView, Platform, Alert, Image, TextInput, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect, router } from 'expo-router';
import { getPosts } from '../../utils/db';

export const MARKETPLACE_CATEGORIES = [
    { id: 'all', emoji: '🏷️', label: 'All Categories' },
    { id: 'food', emoji: '🥕', label: 'Food' },
    { id: 'services', emoji: '🤝', label: 'Services' },
    { id: 'labour', emoji: '👷', label: 'Labour' },
    { id: 'tools', emoji: '🛠️', label: 'Tools' },
    { id: 'goods', emoji: '📦', label: 'Goods' },
    { id: 'housing', emoji: '🏠', label: 'Housing' },
    { id: 'transport', emoji: '🚲', label: 'Transport' },
    { id: 'education', emoji: '📚', label: 'Education' },
    { id: 'arts', emoji: '🎨', label: 'Arts' },
    { id: 'health', emoji: '🌿', label: 'Health' },
    { id: 'care', emoji: '❤️', label: 'Care' },
    { id: 'animals', emoji: '🐾', label: 'Animals' },
    { id: 'energy', emoji: '☀️', label: 'Energy' },
    { id: 'general', emoji: '🌱', label: 'General' },
];

export default function MarketScreen() {
    const [filter, setFilter] = useState<'all' | 'needs' | 'offers'>('all');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
    const [posts, setPosts] = useState<any[]>([]);
    const [showFilters, setShowFilters] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('all');

    useEffect(() => {
        loadBlockedUsers();
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadPosts();
        }, [filter])
    );

    const loadPosts = async () => {
        const queryFilter = filter === 'all' ? undefined : { type: filter === 'needs' ? 'need' : 'offer' };
        try {
            const data = await getPosts(queryFilter);
            setPosts(data);
        } catch (e) {
            console.error('Failed to query SQLite Posts', e);
        }
    };

    const loadBlockedUsers = async () => {
        try {
            const data = await SecureStore.getItemAsync('beanpool_blocked_users');
            if (data) setBlockedUsers(JSON.parse(data));
        } catch (e) {
            console.error('Failed to load local blocklist', e);
        }
    };

    const handleBlockUser = (authorName: string) => {
        Alert.alert(
            "Block User",
            `Are you sure you want to block ${authorName}? You will permanently hide all their content across the BeanPool network.`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Block & Hide", 
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const newBlocklist = [...blockedUsers, authorName];
                            await SecureStore.setItemAsync('beanpool_blocked_users', JSON.stringify(newBlocklist));
                            setBlockedUsers(newBlocklist);
                            Alert.alert('Blocked', `${authorName} has been filtered from your Feed.`);
                        } catch (e) {
                            Alert.alert('Hardware Error', 'Could not write to Secure Enclave.');
                        }
                    }
                }
            ]
        );
    };

    const filteredPosts = posts.filter(p => {
        if (blockedUsers.includes(p.author_pubkey)) return false; // UGC Protocol Compliance Layer
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const titleStr = p.title ? p.title.toLowerCase() : '';
            const descStr = p.description ? p.description.toLowerCase() : '';
            if (!titleStr.includes(q) && !descStr.includes(q)) return false;
        }
        return true;
    });

    const HeaderComponent = (
        <View style={styles.header}>
            <View style={styles.searchWrap}>
                <MaterialCommunityIcons name="magnify" size={20} color="#9ca3af" />
                <TextInput 
                    style={styles.searchInput}
                    placeholder="Search market..."
                    placeholderTextColor="#9ca3af"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>
            <View style={styles.headerTop}>
                <Text style={styles.title}>Community Market</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Pressable onPress={() => setShowFilters(!showFilters)} style={[styles.viewToggle, showFilters && { backgroundColor: '#e5e7eb' }]}>
                        <MaterialCommunityIcons name="filter-variant" size={26} color="#4b5563" />
                    </Pressable>
                    <Pressable onPress={() => setViewMode(v => v === 'list' ? 'grid' : 'list')} style={styles.viewToggle}>
                        <MaterialCommunityIcons name={viewMode === 'list' ? 'view-grid-outline' : 'view-list-outline'} size={26} color="#4b5563" />
                    </Pressable>
                </View>
            </View>

            {showFilters && (
                <View style={styles.filtersPanel}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                        {MARKETPLACE_CATEGORIES.map(cat => (
                            <Pressable 
                                key={cat.id} 
                                style={[styles.categoryPill, categoryFilter === cat.id && styles.categoryPillActive]}
                                onPress={() => setCategoryFilter(cat.id)}
                            >
                                <Text style={styles.categoryPillEmoji}>{cat.emoji}</Text>
                                <Text style={[styles.categoryPillText, categoryFilter === cat.id && styles.categoryPillTextActive]}>{cat.label}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            )}

            <View style={styles.tabRow}>
                <Pressable onPress={() => setFilter('all')} style={[styles.tab, filter === 'all' && styles.tabActive]}>
                    <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>All</Text>
                </Pressable>
                <Pressable onPress={() => setFilter('needs')} style={[styles.tab, filter === 'needs' && styles.tabActive]}>
                    <Text style={[styles.tabText, filter === 'needs' && styles.tabTextActive]}>Needs</Text>
                </Pressable>
                <Pressable onPress={() => setFilter('offers')} style={[styles.tab, filter === 'offers' && styles.tabActive]}>
                    <Text style={[styles.tabText, filter === 'offers' && styles.tabTextActive]}>Offers</Text>
                </Pressable>
            </View>
        </View>
    );

    const renderItem = ({ item }: { item: any }) => {
        let coverImage = null;
        if (item.photos) {
            try {
                const arr = JSON.parse(item.photos);
                if (arr.length > 0) coverImage = arr[0];
            } catch {}
        }
        
        const cardAuthor = item.author_callsign || item.author_pubkey?.slice(0, 6) || 'Unknown';

        if (viewMode === 'grid') {
            return (
                <Pressable 
                    style={[styles.card, styles.gridCard]}
                    onPress={() => router.push(`/post/${item.id}`)}
                >
                    <View style={styles.gridImageWrapper}>
                        {coverImage ? (
                            <Image source={{ uri: coverImage }} style={styles.gridImage} />
                        ) : (
                            <View style={[styles.gridImage, styles.gridFallback]}>
                                <Text style={styles.gridFallbackEmoji}>
                                    {MARKETPLACE_CATEGORIES.find(c => c.id === item.category)?.emoji || '📦'}
                                </Text>
                            </View>
                        )}
                        <View style={styles.gridPriceBadge}>
                            <Text style={styles.gridPriceText}>{item.credits} B</Text>
                        </View>
                        <View style={[styles.gridTypeBadge, item.type === 'offer' ? styles.badgeOffer : styles.badgeNeed]}>
                            <Text style={styles.badgeText}>{item.type.toUpperCase()}</Text>
                        </View>
                    </View>
                    <View style={styles.gridTextContent}>
                        <Text style={styles.gridCardTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.gridCardAuthor} numberOfLines={1}>{cardAuthor}</Text>
                    </View>
                </Pressable>
            );
        }

        // List View Return
        return (
            <Pressable 
                style={styles.card}
                onPress={() => router.push(`/post/${item.id}`)}
            >
                {coverImage && (
                    <Image source={{ uri: coverImage }} style={styles.cardCoverImage} />
                )}
                <View style={styles.cardTextContent}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.badge, item.type === 'offer' ? styles.badgeOffer : styles.badgeNeed]}>
                            <Text style={styles.badgeText}>{item.type.toUpperCase()}</Text>
                        </View>
                        <Text style={styles.price}>{item.credits} Ʀ</Text>
                    </View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardAuthor}>By {cardAuthor}</Text>
                    <View style={styles.cardFooter}>
                        <Pressable style={styles.actionBtn}>
                            <MaterialCommunityIcons name="chat-outline" size={16} color="#aaa" />
                            <Text style={styles.actionText}>Message</Text>
                        </Pressable>
                        <Pressable style={styles.reportBtn} onPress={() => handleBlockUser(cardAuthor)}>
                            <MaterialCommunityIcons name="shield-off-outline" size={18} color="#ef4444" />
                        </Pressable>
                    </View>
                </View>
            </Pressable>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={{ padding: 16, paddingBottom: 0 }}>
                {HeaderComponent}
            </View>
            <FlatList
                key={viewMode}
                numColumns={viewMode === 'grid' ? 2 : 1}
                data={filteredPosts}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
                showsVerticalScrollIndicator={false}
            />
            <Pressable style={styles.fab} onPress={() => router.push('/new-post')}>
                <MaterialCommunityIcons name="plus" size={30} color="#fff" />
            </Pressable>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f9fafb' },
    listContent: { padding: 16, paddingBottom: 100 },
    filtersPanel: { backgroundColor: '#f9fafb', borderRadius: 16, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb' },
    categoryScroll: { gap: 10, paddingRight: 20 },
    categoryPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, marginRight: 8 },
    categoryPillActive: { backgroundColor: 'rgba(139, 92, 246, 0.1)', borderColor: '#8b5cf6' },
    categoryPillEmoji: { fontSize: 16, marginRight: 6 },
    categoryPillText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
    categoryPillTextActive: { color: '#8b5cf6' },
    header: { marginBottom: 24, paddingTop: Platform.OS === 'android' ? 24 : 0 },
    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 24, paddingHorizontal: 16, height: 44, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: '#e5e7eb' },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#1f2937' },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 32, fontWeight: '800', color: '#1f2937', letterSpacing: -0.5 },
    viewToggle: { padding: 8, backgroundColor: '#f3f4f6', borderRadius: 12 },
    tabRow: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 12, padding: 4 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    tabActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    tabText: { color: '#6b7280', fontWeight: '700', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
    tabTextActive: { color: '#1f2937' },
    card: { 
        backgroundColor: '#ffffff', 
        borderRadius: 20, 
        marginBottom: 20, 
        borderWidth: 1, 
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        overflow: 'hidden'
    },
    gridRow: { gap: 16 },
    gridCard: { flex: 1, marginBottom: 16 },
    gridImageWrapper: { position: 'relative', width: '100%', aspectRatio: 1 },
    gridImage: { width: '100%', height: '100%' },
    gridFallback: { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
    gridFallbackEmoji: { fontSize: 32, opacity: 0.3 },
    gridPriceBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(17,24,39,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    gridPriceText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
    gridTypeBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: '#ffffff' },
    gridTextContent: { padding: 12 },
    gridCardTitle: { fontSize: 14, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
    gridCardAuthor: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
    cardCoverImage: {
        width: '100%',
        height: 180,
        backgroundColor: '#f3f4f6'
    },
    cardTextContent: {
        padding: 20
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    badgeOffer: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)' },
    badgeNeed: { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)' },
    badgeText: { fontSize: 11, fontWeight: '800', color: '#1f2937', letterSpacing: 0.5 },
    price: { fontSize: 16, fontWeight: '800', color: '#8b5cf6' },
    cardTitle: { fontSize: 20, fontWeight: '700', color: '#1f2937', marginBottom: 6, letterSpacing: -0.3 },
    cardAuthor: { fontSize: 14, color: '#6b7280', marginBottom: 20, fontWeight: '500' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 16 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    actionText: { color: '#4b5563', fontSize: 14, fontWeight: '600' },
    reportBtn: { padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 10 },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#8b5cf6',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#8b5cf6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
    }
});
