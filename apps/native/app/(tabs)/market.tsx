import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, SafeAreaView, Platform, Alert, Image, TextInput, ScrollView, DeviceEventEmitter } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { getPosts, getMarketplaceTransactions, reportAbuse } from '../../utils/db';
import { useIdentity } from '../IdentityContext';
import { RadiusPickerModal } from '../../components/RadiusPickerModal';
import { CategoryPickerSheet } from '../../components/CategoryPickerSheet';
import { MyDealsSheet, usePendingDealsCount } from '../../components/MyDealsSheet';
import { PostAuthorTrust, isElder } from '../../components/PostAuthorTrust';
import { CurrencyDisplay } from '../../components/CurrencyDisplay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import synonymMap from '../../utils/synonyms.json';

// Build reverse synonym index: given a category/synonym, find all words that map to it
// e.g. "fruit" → ["lemon", "lime", "orange", "apple", ...]
const reverseSynonyms: Record<string, string[]> = {};
for (const [word, syns] of Object.entries(synonymMap)) {
    if (word === '_meta') continue;
    for (const syn of syns as string[]) {
        if (!reverseSynonyms[syn]) reverseSynonyms[syn] = [];
        reverseSynonyms[syn].push(word);
    }
}

/** Expand a search query using synonyms: "fruit" → ["fruit", "lemon", "lime", ...] */
function expandSearchTerms(query: string): string[] {
    const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
    const expanded = new Set<string>(words);
    for (const w of words) {
        // Forward: word → its synonyms (e.g. "lemon" → ["fruit", "citrus"])
        const fwd = (synonymMap as any)[w];
        if (fwd) for (const s of fwd) expanded.add(s);
        // Reverse: word → all words that have it as synonym (e.g. "fruit" → ["lemon", "lime"])
        if (reverseSynonyms[w]) for (const s of reverseSynonyms[w]) expanded.add(s);
        // Also try stemmed forms
        let stem = w;
        if (w.endsWith('ies')) stem = w.slice(0, -3) + 'y';
        else if (w.endsWith('es')) stem = w.slice(0, -2);
        else if (w.endsWith('s') && w.length > 3) stem = w.slice(0, -1);
        else if (w.endsWith('ing') && w.length > 5) stem = w.slice(0, -3);
        if (stem !== w) {
            expanded.add(stem);
            const fwdStem = (synonymMap as any)[stem];
            if (fwdStem) for (const s of fwdStem) expanded.add(s);
            if (reverseSynonyms[stem]) for (const s of reverseSynonyms[stem]) expanded.add(s);
        }
    }
    return [...expanded];
}

export const MARKETPLACE_CATEGORIES = [
    { id: 'all', emoji: '🏷️', label: 'All Categories' },
    { id: 'food', emoji: '🥕', label: 'Food' },
    { id: 'services', emoji: '🤝', label: 'Services' },
    { id: 'labour', emoji: '👷', label: 'Labour' },
    { id: 'tools', emoji: '🛠️', label: 'Tools' },
    { id: 'goods', emoji: '📦', label: 'Goods' },
    { id: 'garden', emoji: '🌻', label: 'Garden' },
    { id: 'housing', emoji: '🏠', label: 'Housing' },
    { id: 'transport', emoji: '🚗', label: 'Transport' },
    { id: 'education', emoji: '📚', label: 'Education' },
    { id: 'arts', emoji: '🎨', label: 'Arts' },
    { id: 'health', emoji: '🌿', label: 'Health' },
    { id: 'care', emoji: '❤️', label: 'Care' },
    { id: 'animals', emoji: '🐾', label: 'Animals' },
    { id: 'tech', emoji: '💻', label: 'Tech' },
    { id: 'energy', emoji: '☀️', label: 'Energy' },
    { id: 'general', emoji: '🌱', label: 'General' },
];

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1); 
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

export default function MarketScreen() {
    const { identity } = useIdentity();
    const [filter, setFilter] = useState<'all' | 'needs' | 'offers'>('all');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
    const [posts, setPosts] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [radiusKm, setRadiusKm] = useState<number | null>(null);
    const [locationCenter, setLocationCenter] = useState<{lat: number, lng: number} | null>(null);
    const [showRadiusPicker, setShowRadiusPicker] = useState(false);
    
    // Deals Sheet
    const [showDealsSheet, setShowDealsSheet] = useState(false);
    const [dealsInitialTab, setDealsInitialTab] = useState<'active' | 'pending' | 'history'>('pending');
    const [myTransactions, setMyTransactions] = useState<any[]>([]);

    const pendingCount = usePendingDealsCount(identity, posts, myTransactions);

    useEffect(() => {
        loadBlockedUsers();
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            loadPosts();
        }, [filter, identity?.publicKey])
    );

    const params = useLocalSearchParams<{ tab?: string, dealsTab?: string }>();

    useEffect(() => {
        if (params.tab === 'deals') {
            setShowDealsSheet(true);
            router.setParams({ tab: '' });
        }
        if (params.dealsTab) {
            setDealsInitialTab(params.dealsTab as any);
            setShowDealsSheet(true);
            router.setParams({ dealsTab: '' });
        }
    }, [params.tab, params.dealsTab]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('sync_data_updated', () => loadPosts());
        return () => sub.remove();
    }, [filter, identity?.publicKey]);

    // Debounced FTS5 server search
    useEffect(() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        
        const q = searchQuery.trim();
        if (!q) {
            setSearchResults(null);
            setIsSearching(false);
            return;
        }
        
        setIsSearching(true);
        searchTimerRef.current = setTimeout(async () => {
            try {
                const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
                if (!anchorUrl) {
                    setSearchResults(null);
                    setIsSearching(false);
                    return;
                }
                const type = filter === 'all' ? '' : filter === 'needs' ? '&type=need' : '&type=offer';
                const cat = categoryFilter !== 'all' ? `&category=${categoryFilter}` : '';
                
                // Expand synonyms so the server's FTS5 'OR' logic can find them
                const expandedQ = expandSearchTerms(q).join(' ');
                
                const res = await fetch(`${anchorUrl}/api/marketplace/posts?q=${encodeURIComponent(expandedQ)}${type}${cat}&limit=50`);
                if (res.ok) {
                    const data = await res.json();
                    // Server returns camelCase MarketplacePost; the UI reads snake_case
                    // (matching local SQLite shape). Normalize and parse photos.
                    const parsed = (Array.isArray(data) ? data : []).map((p: any) => {
                        if (typeof p.photos === 'string') {
                            try { p.photos = JSON.parse(p.photos); } catch { p.photos = []; }
                        }
                        return {
                            ...p,
                            author_pubkey: p.author_pubkey ?? p.authorPublicKey,
                            author_callsign: p.author_callsign ?? p.authorCallsign,
                            author_avatar: p.author_avatar ?? p.authorAvatarUrl ?? null,
                            author_energy_cycled: p.author_energy_cycled ?? p.authorEnergyCycled ?? 0,
                        };
                    });
                    setSearchResults(parsed);
                } else {
                    setSearchResults(null); // Fall back to local filtering
                }
            } catch {
                setSearchResults(null); // Fall back to local filtering
            }
            setIsSearching(false);
        }, 300);

        return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [searchQuery, filter, categoryFilter]);

    const loadPosts = async () => {
        const queryFilter = filter === 'all' ? undefined : { type: filter === 'needs' ? 'need' : 'offer' };
        try {
            const data = await getPosts(queryFilter);
            setPosts(data);
            
            if (identity) {
                const txs = await getMarketplaceTransactions(identity.publicKey);
                setMyTransactions(txs);
            }
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

    const handleContentAction = (targetPubkey: string, authorName: string, postId: string) => {
        Alert.alert(
            "Post Options",
            `What would you like to do regarding this post by ${authorName}?`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Hide Post & Block User", 
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const newBlocklist = [...blockedUsers, targetPubkey];
                            await SecureStore.setItemAsync('beanpool_blocked_users', JSON.stringify(newBlocklist));
                            setBlockedUsers(newBlocklist);
                            Alert.alert('Blocked', `${authorName} has been filtered from your Feed.`);
                        } catch (e) {
                            Alert.alert('Hardware Error', 'Could not write to Secure Enclave.');
                        }
                    }
                },
                {
                    text: "Report Objectionable Content",
                    style: "default",
                    onPress: async () => {
                        if (!identity) return;
                        try {
                            await reportAbuse(identity.publicKey, targetPubkey, 'Objectionable Content via Marketplace', postId);
                            Alert.alert('Report Received', 'Thank you. The community administrators will review this post shortly.');
                        } catch (e: any) {
                            Alert.alert('Report Failed', e.message || 'Could not reach server.');
                        }
                    }
                }
            ]
        );
    };

    // Use server search results when available, otherwise filter locally
    const basePosts = searchResults !== null ? searchResults : posts;

    const filteredPosts = basePosts.filter(p => {
        if (p.status !== 'active') return false;
        if (blockedUsers.includes(p.author_pubkey)) return false;
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (identity && p.author_pubkey === identity.publicKey) return false;
        
        if (radiusKm && p.lat && p.lng) {
            const centerLat = locationCenter ? locationCenter.lat : -28.5523;
            const centerLng = locationCenter ? locationCenter.lng : 153.4991;
            const dist = getDistanceInKm(centerLat, centerLng, p.lat, p.lng);
            if (dist > radiusKm) return false;
        }

        // Synonym-aware local search: expand query using synonym map
        // Works on ALL servers, even those without FTS5 deployed
        if (searchQuery.trim()) {
            const serverHasFTS = searchResults !== null && searchResults.length > 0 && 'search_keywords' in searchResults[0];
            if (!serverHasFTS) {
                const terms = expandSearchTerms(searchQuery);
                const titleStr = p.title ? p.title.toLowerCase() : '';
                const descStr = p.description ? p.description.toLowerCase() : '';
                const postText = `${titleStr} ${descStr}`;
                const matched = terms.some(term => postText.includes(term));
                if (!matched) return false;
            }
        }
        return true;
    });

    const selectedCategory = MARKETPLACE_CATEGORIES.find(c => c.id === categoryFilter);
    const hasActiveFilters = categoryFilter !== 'all' || radiusKm !== null || filter !== 'all';

    const HeaderComponent = (
        <View>
            {/* Top row: Search + My Deals + View Toggle */}
            <View style={[styles.searchRow, { paddingHorizontal: 16 }]}>
                <View style={styles.searchWrap}>
                    <Text style={{ opacity: 0.4, fontSize: 14 }}>🔍</Text>
                    <TextInput 
                        style={styles.searchInput}
                        placeholder="Search marketplace..."
                        placeholderTextColor="#9ca3af"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
                <Pressable 
                    onPress={() => setShowDealsSheet(true)} 
                    style={styles.dealsIconBtn}
                >
                    <Text style={{ fontSize: 18, marginBottom: -2 }}>🤝</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#b45309' }}>My Deals</Text>
                    {pendingCount > 0 && (
                        <View style={styles.dealsIconBadge}>
                            <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900' }}>{pendingCount}</Text>
                        </View>
                    )}
                </Pressable>
                <Pressable 
                    onPress={() => setViewMode(v => v === 'list' ? 'grid' : 'list')} 
                    style={styles.iconBtn}
                >
                    <MaterialCommunityIcons name={viewMode === 'list' ? 'view-grid-outline' : 'view-list-outline'} size={20} color="#6b7280" />
                </Pressable>
            </View>

            {/* Horizontal Filter Chips */}
            <View style={{ marginTop: 10, marginBottom: 4 }}>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.chipScrollContainer}
                >
                    {/* Type chips */}
                    <Pressable 
                        onPress={() => setFilter('all')} 
                        style={[styles.chip, filter === 'all' && styles.chipAllActive]}
                    >
                        <Text style={[styles.chipText, filter === 'all' && styles.chipTextActive]}>All</Text>
                    </Pressable>
                    <Pressable 
                        onPress={() => setFilter('offers')} 
                        style={[styles.chip, filter === 'offers' && styles.chipOfferActive]}
                    >
                        <Text style={[styles.chipText, filter === 'offers' && styles.chipTextActive]}>🟢 Offers</Text>
                    </Pressable>
                    <Pressable 
                        onPress={() => setFilter('needs')} 
                        style={[styles.chip, filter === 'needs' && styles.chipNeedActive]}
                    >
                        <Text style={[styles.chipText, filter === 'needs' && styles.chipTextActive]}>🟠 Needs</Text>
                    </Pressable>

                    {/* Category chip */}
                    <Pressable 
                        onPress={() => setShowCategoryPicker(true)} 
                        style={[styles.chip, categoryFilter !== 'all' && styles.chipActive]}
                    >
                        <Text style={[styles.chipText, categoryFilter !== 'all' && styles.chipTextActive]}>
                            {selectedCategory?.emoji || '🏷️'} {categoryFilter !== 'all' ? selectedCategory?.label : 'Category'}
                        </Text>
                        <Text style={{ fontSize: 8, color: '#9ca3af', marginLeft: 2 }}>▼</Text>
                    </Pressable>

                    {/* Distance chip */}
                    <Pressable 
                        onPress={() => setShowRadiusPicker(true)} 
                        style={[styles.chip, radiusKm !== null && styles.chipDistanceActive, radiusKm === null && { paddingHorizontal: 10 }]}
                    >
                        <Text style={[styles.chipText, radiusKm !== null && styles.chipTextActive]}>
                            📍{radiusKm ? ` ${radiusKm}km` : ''}
                        </Text>
                        {radiusKm !== null && (
                            <Pressable 
                                onPress={(e) => { e.stopPropagation(); setRadiusKm(null); setLocationCenter(null); }}
                                hitSlop={8}
                                style={{ marginLeft: 4 }}
                            >
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>✕</Text>
                            </Pressable>
                        )}
                    </Pressable>
                </ScrollView>
            </View>
        </View>
    );

    const listData = filteredPosts;

    const renderItem = ({ item }: { item: any }) => {
        let coverImage: string | null = null;
        if (item.photos) {
            try {
                const arr = Array.isArray(item.photos) ? item.photos : JSON.parse(item.photos);
                if (arr.length > 0) coverImage = arr[0];
            } catch {}
        }
        
        const cardAuthor = item.author_callsign || item.author_pubkey?.slice(0, 6) || 'Unknown';
        const elderCard = isElder(item.author_energy_cycled);
        
        const priceLabel = item.price_type === 'hourly' ? '/Hr' : 
                           item.price_type === 'daily' ? '/Dy' : 
                           item.price_type === 'weekly' ? '/Wk' : 
                           item.price_type === 'monthly' ? '/Mo' : '';

        if (viewMode === 'grid') {
            return (
                <Pressable 
                    style={[
                        styles.card, 
                        styles.gridCard,
                        elderCard && styles.elderCard,
                    ]}
                    onPress={() => router.push(`/post/${item.id}`)}
                >
                    <View style={styles.gridImageWrapper}>
                        {coverImage && typeof coverImage === 'string' && coverImage.trim() !== '' && coverImage !== 'null' && coverImage !== 'undefined' ? (
                            <Image source={{ uri: coverImage }} style={styles.gridImage} />
                        ) : (
                            <View style={[styles.gridImage, styles.gridFallback]}>
                                <Text style={styles.gridFallbackEmoji}>
                                    {MARKETPLACE_CATEGORIES.find(c => c.id === item.category)?.emoji || '📦'}
                                </Text>
                            </View>
                        )}
                        <View style={styles.gridPriceBadge}>
                            <CurrencyDisplay
                                amount={`${item.credits !== undefined && item.credits !== null ? item.credits : '?'}${priceLabel || ''}`}
                                style={styles.gridPriceText}
                                asView={true}
                            />
                        </View>
                        {!!item.repeatable && (
                            <View style={[styles.gridPriceBadge, { left: 8, right: undefined, backgroundColor: 'rgba(249, 115, 22, 0.9)' }]}>
                                <Text style={styles.gridPriceText}>↻ RECURRING</Text>
                            </View>
                        )}
                        <View style={[styles.gridTypeBadge, item.type === 'offer' ? styles.badgeOffer : styles.badgeNeed]}>
                            <Text style={styles.badgeText}>{item.type.toUpperCase()}</Text>
                        </View>
                    </View>
                    <View style={styles.gridTextContent}>
                        <Text style={styles.gridCardTitle} numberOfLines={1}>{item.title}</Text>
                        <PostAuthorTrust pubkey={item.author_pubkey} callsign={cardAuthor} energyCycled={item.author_energy_cycled} avatarUrl={item.author_avatar} mode="compact" />
                    </View>
                </Pressable>
            );
        }

        // List View
        return (
            <Pressable onPress={() => router.push(`/post/${item.id}`)}>
                <View style={[styles.card, { flexDirection: 'row', padding: 0 }, elderCard && styles.elderCard]}>
                    {coverImage && typeof coverImage === 'string' && coverImage.trim() !== '' && coverImage !== 'null' && coverImage !== 'undefined' ? (
                        <Image source={{ uri: coverImage }} style={{ width: 96, height: '100%', minHeight: 96, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 }} resizeMode="cover" />
                    ) : (
                        <View style={{ width: 96, height: '100%', minHeight: 96, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 20, borderBottomLeftRadius: 20 }}>
                            <Text style={{ fontSize: 32, opacity: 0.5 }}>
                                {MARKETPLACE_CATEGORIES.find(c => c.id === item.category)?.emoji || '📦'}
                            </Text>
                        </View>
                    )}
                    <View style={{ flex: 1, padding: 12, justifyContent: 'center' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[styles.badge, item.type === 'offer' ? styles.badgeOffer : styles.badgeNeed, { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, margin: 0 }]}>
                                    <Text style={[styles.badgeText, { fontSize: 10 }]}>{item.type.toUpperCase()}</Text>
                                </View>
                                {!!item.repeatable && (
                                    <View style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(249, 115, 22, 0.2)' }}>
                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#c2410c' }}>↻ RECURRING</Text>
                                    </View>
                                )}
                            </View>
                            <CurrencyDisplay
                                amount={`${item.credits !== undefined && item.credits !== null ? item.credits : '?'}${priceLabel || ''}`}
                                style={[styles.price, { fontSize: 16 }]}
                                asView={true}
                            />
                        </View>
                        
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#1f2937', marginBottom: 4 }} numberOfLines={1}>
                            {item.title}
                        </Text>
                        
                        <PostAuthorTrust pubkey={item.author_pubkey} callsign={cardAuthor} energyCycled={item.author_energy_cycled} avatarUrl={item.author_avatar} mode="full" />
                    </View>
                </View>
            </Pressable>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={{ paddingTop: 16, paddingBottom: 0 }}>
                {HeaderComponent}
            </View>
            <FlatList
                key={viewMode}
                numColumns={viewMode === 'grid' ? 2 : 1}
                data={listData}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={{ padding: 32, alignItems: 'center' }}>
                        <Text style={{ fontSize: 40, opacity: 0.3, marginBottom: 16 }}>🛒</Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1f2937', marginBottom: 8 }}>
                            No items found
                        </Text>
                        <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>
                            {hasActiveFilters 
                                ? 'Try adjusting your filters to see more results.'
                                : 'The market is quiet right now.'}
                        </Text>
                        {hasActiveFilters && (
                            <Pressable 
                                style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginBottom: 12 }}
                                onPress={() => { setFilter('all'); setCategoryFilter('all'); setRadiusKm(null); setLocationCenter(null); }}
                            >
                                <Text style={{ fontWeight: '700', color: '#4b5563', fontSize: 14 }}>Clear All Filters</Text>
                            </Pressable>
                        )}
                        <Pressable 
                            style={{ backgroundColor: '#111827', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 }}
                            onPress={() => router.push({ pathname: '/', params: { newPost: 'true' } })}
                        >
                            <Text style={{ fontWeight: '700', color: '#fff', fontSize: 14 }}>+ Post a Deal</Text>
                        </Pressable>
                    </View>
                }
            />
            <Pressable style={styles.fab} onPress={() => router.push({ pathname: '/', params: { newPost: 'true' } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '400', marginTop: -2 }}>+</Text>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>ADD POST</Text>
                </View>
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

            <CategoryPickerSheet
                visible={showCategoryPicker}
                selected={categoryFilter}
                onSelect={setCategoryFilter}
                onClose={() => setShowCategoryPicker(false)}
            />

            <MyDealsSheet
                visible={showDealsSheet}
                identity={identity}
                onClose={() => setShowDealsSheet(false)}
                initialTab={dealsInitialTab}
            />
        </SafeAreaView>
    );
}


const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f9fafb' },
    listContent: { padding: 16, paddingBottom: 100 },

    // Search row
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 23, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#1f2937', fontWeight: '500' },
    iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
    dealsIconBtn: { paddingHorizontal: 14, height: 46, borderRadius: 23, backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fcd34d', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
    dealsIconBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 8, minWidth: 14, alignItems: 'center' },

    // Deal badge (positioned on icon button)
    dealBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, minWidth: 16, alignItems: 'center' },
    dealBadgeText: { color: '#ffffff', fontSize: 9, fontWeight: '900' },

    // Horizontal filter chips
    chipScrollContainer: { flexGrow: 1, justifyContent: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingVertical: 4 },
    chip: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 8, 
        paddingHorizontal: 10, 
        borderRadius: 20, 
        borderWidth: 1.5, 
        borderColor: '#e5e7eb', 
        backgroundColor: '#ffffff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1,
    },
    chipText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
    chipTextActive: { color: '#ffffff' },
    chipAllActive: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
    chipOfferActive: { backgroundColor: '#059669', borderColor: '#047857' },
    chipNeedActive: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
    chipActive: { backgroundColor: '#6d28d9', borderColor: '#6d28d9' },
    chipDistanceActive: { backgroundColor: '#b45309', borderColor: '#92400e' },
    chipDivider: { width: 1, height: 24, backgroundColor: '#e5e7eb', alignSelf: 'center' },

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
    elderCard: {
        borderLeftWidth: 3,
        borderLeftColor: '#fbbf24',
        shadowColor: '#fbbf24',
        shadowOpacity: 0.15,
    },
    gridRow: { gap: 16 },
    gridCard: { flex: 1, marginBottom: 16 },
    gridImageWrapper: { position: 'relative', width: '100%', aspectRatio: 1 },
    gridImage: { width: '100%', height: '100%' },
    gridFallback: { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
    gridFallbackEmoji: { fontSize: 32, opacity: 0.3 },
    gridPriceBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(30,41,59,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
    gridPriceText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
    gridTypeBadge: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    gridTextContent: { padding: 12 },
    gridCardTitle: { fontSize: 14, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    badgeOffer: { backgroundColor: '#10b981', borderWidth: 0 },
    badgeNeed: { backgroundColor: '#ea580c', borderWidth: 0 },
    badgeText: { fontSize: 11, fontWeight: '800', color: '#000000', letterSpacing: 0.5 },
    price: { fontSize: 16, fontWeight: '800', color: '#8b5cf6' },
    fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: '#ea580c', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 8, zIndex: 100 }
});
