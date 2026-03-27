import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, SafeAreaView, Platform, Alert, Image, TextInput, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect, router } from 'expo-router';
import { getPosts } from '../../utils/db';
import { useIdentity } from '../IdentityContext';
import { RadiusPickerModal } from '../../components/RadiusPickerModal';

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

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1); 
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
}

export default function MarketScreen() {
    const { identity } = useIdentity();
    const [filter, setFilter] = useState<'all' | 'needs' | 'offers'>('all');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
    const [posts, setPosts] = useState<any[]>([]);
    const [showFilters, setShowFilters] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [showMine, setShowMine] = useState(false);
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [radiusKm, setRadiusKm] = useState<number | null>(null);
    const [locationCenter, setLocationCenter] = useState<{lat: number, lng: number} | null>(null);
    const [showRadiusPicker, setShowRadiusPicker] = useState(false);

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

    const [activeTab, setActiveTab] = useState<'feed' | 'deals'>('feed');

    const pendingDeals = posts.filter(p => 
        p.status === 'pending' && 
        identity && 
        (p.author_pubkey === identity.publicKey || p.accepted_by === identity.publicKey)
    );

    const myMarketPosts = posts.filter(p => 
        identity && 
        (p.author_pubkey === identity.publicKey || p.accepted_by === identity.publicKey)
    ).sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const filteredPosts = activeTab === 'deals' ? myMarketPosts : posts.filter(p => {
        // Only active posts belong in the Global Feed
        if (p.status !== 'active') return false;
        
        if (blockedUsers.includes(p.author_pubkey)) return false;
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (showMine && identity && p.author_pubkey !== identity.publicKey) return false;
        
        // Location filter (Mullumbimby default for now inline with other hardcoded areas)
        if (radiusKm && p.lat && p.lng) {
            const centerLat = locationCenter ? locationCenter.lat : -28.5523;
            const centerLng = locationCenter ? locationCenter.lng : 153.4991;
            const dist = getDistanceInKm(centerLat, centerLng, p.lat, p.lng);
            if (dist > radiusKm) return false;
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const titleStr = p.title ? p.title.toLowerCase() : '';
            const descStr = p.description ? p.description.toLowerCase() : '';
            if (!titleStr.includes(q) && !descStr.includes(q)) return false;
        }
        return true;
    });

    const selectedCategory = MARKETPLACE_CATEGORIES.find(c => c.id === categoryFilter);

    const HeaderComponent = (
        <View>
            {/* Top Segmented Control (Feed vs Deals) */}
            <View style={styles.tabContainer}>
                <Pressable 
                    style={[styles.tabBtn, activeTab === 'feed' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('feed')}
                >
                    <Text style={[styles.tabBtnText, activeTab === 'feed' && styles.tabBtnTextActive]}>Global Feed</Text>
                </Pressable>
                <Pressable 
                    style={[styles.tabBtn, activeTab === 'deals' && styles.tabBtnActive]}
                    onPress={() => setActiveTab('deals')}
                >
                    <Text style={[styles.tabBtnText, activeTab === 'deals' && styles.tabBtnTextActive]}>My Market</Text>
                    {pendingDeals.length > 0 && (
                        <View style={styles.dealBadge}>
                            <Text style={styles.dealBadgeText}>{pendingDeals.length}</Text>
                        </View>
                    )}
                </Pressable>
            </View>

            {/* Search row + filter/view toggles */}
            {activeTab === 'feed' && (
                <View style={[styles.searchRow, { marginTop: 12 }]}>
                    <View style={styles.searchWrap}>
                        <Text style={{ opacity: 0.4, fontSize: 14 }}>🔍</Text>
                        <TextInput 
                            style={styles.searchInput}
                            placeholder="Search..."
                            placeholderTextColor="#9ca3af"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                    <Pressable 
                        onPress={() => setShowFilters(!showFilters)} 
                        style={[styles.iconBtn, showFilters && styles.iconBtnActive]}
                    >
                        <MaterialCommunityIcons name="filter-variant" size={20} color={showFilters ? '#fff' : '#6b7280'} />
                    </Pressable>
                    <Pressable 
                        onPress={() => setViewMode(v => v === 'list' ? 'grid' : 'list')} 
                        style={styles.iconBtn}
                    >
                        <MaterialCommunityIcons name={viewMode === 'list' ? 'view-grid-outline' : 'view-list-outline'} size={20} color="#6b7280" />
                    </Pressable>
                </View>
            )}

            {/* Collapsible Filter Panel */}
            {showFilters && (
                <View style={styles.filtersPanel}>
                    {/* Location Radius + Category Dropdown row */}
                    <View style={styles.filterTopRow}>
                        {radiusKm ? (
                            <View style={[styles.locationBtn, { backgroundColor: '#fef3c7', borderColor: '#fde047', paddingRight: 0 }]}>
                                <Pressable 
                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                    onPress={() => setShowRadiusPicker(true)}
                                >
                                    <Text style={styles.locationIcon}>📍</Text>
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#b45309' }}>
                                        {radiusKm}km Radius
                                    </Text>
                                </Pressable>
                                <Pressable 
                                    style={{ paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: 1, borderLeftColor: '#fde047' }}
                                    onPress={() => setRadiusKm(null)}
                                >
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#b45309' }}>✕</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <Pressable 
                                style={styles.locationBtn}
                                onPress={() => setShowRadiusPicker(true)}
                            >
                                <Text style={styles.locationIcon}>📍</Text>
                                <View>
                                    <Text style={styles.locationText}>Location</Text>
                                    <Text style={styles.locationSubtext}>Radius</Text>
                                </View>
                            </Pressable>
                        )}

                        <Pressable 
                            style={styles.categoryDropdown} 
                            onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
                        >
                            <Text style={{ fontSize: 16 }}>{selectedCategory?.emoji || '🏷️'}</Text>
                            <Text style={styles.categoryDropdownText}>{selectedCategory?.label || 'All Categories'}</Text>
                            <Text style={{ color: '#9ca3af', fontSize: 12 }}>▼</Text>
                        </Pressable>
                    </View>

                    {/* Category dropdown list */}
                    {showCategoryDropdown && (
                        <View style={styles.categoryList}>
                            <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator>
                                {MARKETPLACE_CATEGORIES.map(cat => (
                                    <Pressable 
                                        key={cat.id}
                                        style={[styles.categoryItem, categoryFilter === cat.id && styles.categoryItemActive]}
                                        onPress={() => { setCategoryFilter(cat.id); setShowCategoryDropdown(false); }}
                                    >
                                        <Text style={{ fontSize: 16, marginRight: 8 }}>{cat.emoji}</Text>
                                        <Text style={[styles.categoryItemText, categoryFilter === cat.id && styles.categoryItemTextActive]}>{cat.label}</Text>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Type pills row */}
                    <View style={styles.pillRow}>
                        <Pressable 
                            onPress={() => setFilter('all')} 
                            style={[styles.pill, filter === 'all' && styles.pillAllActive]}
                        >
                            <Text style={[styles.pillText, filter === 'all' && styles.pillTextActive]}>All</Text>
                        </Pressable>
                        <Pressable 
                            onPress={() => setFilter('offers')} 
                            style={[styles.pill, styles.pillFlex, filter === 'offers' && styles.pillOfferActive]}
                        >
                            <Text style={[styles.pillText, filter === 'offers' && styles.pillTextActive]}>🟢 Offers</Text>
                        </Pressable>
                        <Pressable 
                            onPress={() => setFilter('needs')} 
                            style={[styles.pill, styles.pillFlex, filter === 'needs' && styles.pillNeedActive]}
                        >
                            <Text style={[styles.pillText, filter === 'needs' && styles.pillTextActive]}>🟠 Needs</Text>
                        </Pressable>
                        <Pressable 
                            onPress={() => setShowMine(!showMine)}
                            style={[styles.pill, styles.pillFlex, showMine && styles.pillMineActive]}
                        >
                            <Text style={[styles.pillText, showMine && styles.pillTextActive]}>👤 My Listings</Text>
                        </Pressable>
                    </View>
                </View>
            )}
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
        
        const priceLabel = item.price_type === 'hourly' ? '/hr' : 
                           item.price_type === 'daily' ? '/day' : 
                           item.price_type === 'weekly' ? '/wk' : 
                           item.price_type === 'monthly' ? '/mo' : '';

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
                            <Text style={styles.gridPriceText}>{item.credits}{priceLabel} B</Text>
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
                        <Text style={styles.price}>{item.credits}{priceLabel} Ʀ</Text>
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
            {/* Page title banner */}
            <View style={styles.topBar}>
                <Text style={styles.topTitle}>Marketplace</Text>
            </View>
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
            <Pressable style={styles.fab} onPress={() => router.push('/')}>
                <Text style={{ color: '#fff', fontSize: 30, fontWeight: '300', marginTop: -2 }}>+</Text>
            </Pressable>

            <RadiusPickerModal
                visible={showRadiusPicker}
                initialRadius={radiusKm}
                initialLat={locationCenter?.lat}
                initialLng={locationCenter?.lng}
                onApply={(r, lat, lng) => {
                    setRadiusKm(r);
                    setLocationCenter({ lat, lng });
                    setShowRadiusPicker(false);
                }}
                onReset={() => {
                    setRadiusKm(null);
                    setLocationCenter(null);
                    setShowRadiusPicker(false);
                }}
                onCancel={() => setShowRadiusPicker(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f9fafb' },
    topBar: { padding: 16, paddingBottom: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    topTitle: { fontSize: 28, fontWeight: '800', color: '#1f2937', letterSpacing: -0.5 },
    listContent: { padding: 16, paddingBottom: 100 },

    // Tabs
    tabContainer: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 4 },
    tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8, flexDirection: 'row', gap: 6 },
    tabBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    tabBtnText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
    tabBtnTextActive: { color: '#1f2937', fontWeight: '800' },
    dealBadge: { backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
    dealBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '900' },

    // Search row
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 24, paddingHorizontal: 14, height: 40, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1f2937', fontWeight: '500' },
    iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
    iconBtnActive: { backgroundColor: '#1f2937', borderColor: '#1f2937' },

    // Filter panel
    filtersPanel: { backgroundColor: 'rgba(249,250,251,0.6)', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginBottom: 12 },
    filterTopRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    locationBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 10, paddingHorizontal: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
    locationIcon: { fontSize: 18 },
    locationText: { fontSize: 13, fontWeight: '700', color: '#4b5563' },
    locationSubtext: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
    categoryDropdown: { flex: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 10, paddingHorizontal: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
    categoryDropdownText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#4b5563' },
    categoryList: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 12, overflow: 'hidden' },
    categoryItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    categoryItemActive: { backgroundColor: '#f0f4ff' },
    categoryItemText: { fontSize: 14, fontWeight: '600', color: '#4b5563' },
    categoryItemTextActive: { color: '#6366f1', fontWeight: '800' },

    // Type filter pills
    pillRow: { flexDirection: 'row', gap: 6 },
    pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
    pillFlex: { flex: 1, alignItems: 'center' as const },
    pillText: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textAlign: 'center' as const },
    pillTextActive: { color: '#ffffff' },
    pillAllActive: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
    pillOfferActive: { backgroundColor: '#059669', borderColor: '#047857' },
    pillNeedActive: { backgroundColor: '#c26749', borderColor: '#b45c3f' },
    pillMineActive: { backgroundColor: '#7c3aed', borderColor: '#6d28d9' },

    // Cards
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
    cardCoverImage: { width: '100%', height: 180, backgroundColor: '#f3f4f6' },
    cardTextContent: { padding: 20 },
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
