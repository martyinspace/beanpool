import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable, SafeAreaView, Platform, Alert, Image, TextInput, ScrollView, DeviceEventEmitter } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { getPosts, getMemberRatings, getMarketplaceTransactions, reportAbuse } from '../../utils/db';
import { useIdentity } from '../IdentityContext';
import { RadiusPickerModal } from '../../components/RadiusPickerModal';
import { ReviewModal } from '../../components/ReviewModal';
import { CurrencyDisplay } from '../../components/CurrencyDisplay';

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

function PostAuthorRating({ pubkey, callsign, isGrid }: { pubkey: string, callsign: string, isGrid?: boolean }) {
    const [avg, setAvg] = useState<number | null>(null);
    useEffect(() => {
        if (!pubkey) return;
        getMemberRatings(pubkey).then(r => setAvg(r.average)).catch(() => {});
    }, [pubkey]);
    
    const r = avg !== null ? Math.round(avg) : 0;
    const beans = avg !== null ? '🫘'.repeat(Math.min(r, 5)) + '○'.repeat(Math.max(0, 5 - r)) : '';
    
    if (isGrid) {
        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <Text style={styles.gridCardAuthor} numberOfLines={1}>{callsign}</Text>
                {avg !== null && <Text style={{ fontSize: 10 }}>{beans}</Text>}
            </View>
        );
    }
    
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 }}>
            <Text style={[styles.cardAuthor, { marginBottom: 0 }]}>By {callsign}</Text>
            {avg !== null && <Text style={{ fontSize: 13 }}>{beans}</Text>}
        </View>
    );
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
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
    const [radiusKm, setRadiusKm] = useState<number | null>(null);
    const [locationCenter, setLocationCenter] = useState<{lat: number, lng: number} | null>(null);
    const [showRadiusPicker, setShowRadiusPicker] = useState(false);
    
    // Deals Dashboard states
    const [dealsTab, setDealsTab] = useState<'active' | 'pending' | 'history'>('active');
    const [myTransactions, setMyTransactions] = useState<any[]>([]);
    const [historyFilter, setHistoryFilter] = useState<'all' | 'buying' | 'selling'>('all');
    
    // Review Modal States
    const [promptReviewForTx, setPromptReviewForTx] = useState<{ txId: string; targetPubkey: string; targetCallsign: string } | null>(null);

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
            setActiveTab('deals');
            router.setParams({ tab: '' });
        }
        if (params.dealsTab) {
            if (params.dealsTab === 'active') setDealsTab('active');
            else if (params.dealsTab === 'pending') setDealsTab('pending');
            else if (params.dealsTab === 'history') setDealsTab('history');
            router.setParams({ dealsTab: '' });
        }
    }, [params.tab, params.dealsTab]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('sync_data_updated', () => loadPosts());
        return () => sub.remove();
    }, [filter, identity?.publicKey]);

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

    const [activeTab, setActiveTab] = useState<'feed' | 'deals'>('feed');

    const pendingDeals = posts.filter(p => {
        if (!identity) return false;
        if (p.status === 'pending' && (p.author_pubkey === identity.publicKey || p.accepted_by === identity.publicKey)) return true;
        return myTransactions.some(t => t.post_id === p.id && t.status === 'pending');
    });

    const myMarketPosts = posts.filter(p => 
        identity && 
        (
            p.author_pubkey === identity.publicKey || 
            p.accepted_by === identity.publicKey ||
            myTransactions.some(t => t.post_id === p.id && t.status === 'pending' && (t.buyer_pubkey === identity.publicKey || t.seller_pubkey === identity.publicKey))
        )
    ).sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const filteredPosts = activeTab === 'deals' ? (() => {
        if (dealsTab === 'active') return myMarketPosts.filter(p => p.status === 'active');
        if (dealsTab === 'pending') return pendingDeals;
        return [];
    })() : posts.filter(p => {
        // Only active posts belong in the Global Feed
        if (p.status !== 'active') return false;
        
        if (blockedUsers.includes(p.author_pubkey)) return false;
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (identity && p.author_pubkey === identity.publicKey) return false;
        
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

            {/* Active/Pending/History Deals Sub-Nav */}
            {activeTab === 'deals' && (
                <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 4, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}>
                    <Pressable 
                        style={[styles.tabBtn, dealsTab === 'active' && {backgroundColor: '#f3f4f6'}]}
                        onPress={() => setDealsTab('active')}
                    >
                        <Text style={[styles.tabBtnText, dealsTab === 'active' && {color: '#1f2937'}]}>Active</Text>
                    </Pressable>
                    <Pressable 
                        style={[styles.tabBtn, dealsTab === 'pending' && {backgroundColor: '#fef3c7'}]}
                        onPress={() => setDealsTab('pending')}
                    >
                        <Text style={[styles.tabBtnText, dealsTab === 'pending' && {color: '#92400e'}]}>In Progress</Text>
                        {pendingDeals.length > 0 && (
                            <View style={[styles.dealBadge, { paddingHorizontal: 4, paddingVertical: 1, marginLeft: 4 }]}>
                                <Text style={[styles.dealBadgeText, {fontSize: 9}]}>{pendingDeals.length}</Text>
                            </View>
                        )}
                    </Pressable>
                    <Pressable 
                        style={[styles.tabBtn, dealsTab === 'history' && {backgroundColor: '#f3f4f6'}]}
                        onPress={() => setDealsTab('history')}
                    >
                        <Text style={[styles.tabBtnText, dealsTab === 'history' && {color: '#1f2937'}]}>History</Text>
                    </Pressable>
                </View>
            )}

            {/* History Filter */}
            {activeTab === 'deals' && dealsTab === 'history' && (
                <View style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                        {[{id: 'all', label: 'All'}, {id: 'buying', label: 'Received'}, {id: 'selling', label: 'Given'}].map((f) => (
                            <Pressable 
                                key={f.id} 
                                onPress={() => setHistoryFilter(f.id as any)} 
                                style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 }, historyFilter === f.id ? { backgroundColor: '#1f2937', borderColor: '#1f2937' } : { backgroundColor: '#fff', borderColor: '#d1d5db' }]}
                            >
                                <Text style={[{ fontSize: 12, fontWeight: '700' }, historyFilter === f.id ? { color: '#fff' } : { color: '#4b5563' }]}>
                                    {f.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            )}

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
                    </View>
                </View>
            )}
        </View>
    );

    let listData = filteredPosts;
    
    // Process search on Deals
    if (activeTab === 'deals' && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        listData = listData.filter((t: any) => (t.title || t.postTitle || '').toLowerCase().includes(q));
    }

    if (activeTab === 'deals' && (dealsTab === 'history' || dealsTab === 'pending')) {
        let txs = myTransactions.filter(t => dealsTab === 'pending' ? t.status === 'pending' : (t.status === 'completed' || t.status === 'cancelled' || t.status === 'rejected'));
        if (historyFilter === 'buying') txs = txs.filter(t => t.buyerPublicKey === identity?.publicKey);
        if (historyFilter === 'selling') txs = txs.filter(t => t.sellerPublicKey === identity?.publicKey);
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            txs = txs.filter(t => (t.postTitle || '').toLowerCase().includes(q));
        }
        listData = txs;
    }

    const renderItem = ({ item }: { item: any }) => {
        // Render Transaction Item (History or Pending)
        if (activeTab === 'deals' && (dealsTab === 'history' || dealsTab === 'pending')) {
            const isBuyer = item.buyerPublicKey === identity?.publicKey;
            const isCompleted = item.status === 'completed';
            const isPending = item.status === 'pending';
            const needsReview = isCompleted && ((isBuyer && !item.ratedByBuyer) || (!isBuyer && !item.ratedBySeller));
            const partnerCallsign = isBuyer ? item.sellerCallsign : item.buyerCallsign;
            const partnerPubkey = isBuyer ? item.sellerPublicKey : item.buyerPublicKey;
            
            const InnerCard = () => (
                <View style={[
                    styles.card, 
                    { padding: 16, borderLeftWidth: 4, borderLeftColor: isBuyer ? '#ef4444' : '#10b981' },
                    !isCompleted && !isPending && { opacity: 0.5, backgroundColor: '#f9fafb' },
                    isPending && { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1 }
                ]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ backgroundColor: isCompleted ? '#d1fae5' : '#e5e7eb', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: isCompleted ? '#065f46' : '#4b5563', textTransform: 'uppercase' }}>
                                    {item.status}
                                </Text>
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af' }}>
                                {new Date(item.createdAt).toLocaleDateString()}
                            </Text>
                        </View>
                        <Text style={{ fontWeight: '900', color: isBuyer ? '#dc2626' : '#059669', fontSize: 16 }}>
                            {isBuyer ? '-' : '+'}{item.credits} B
                        </Text>
                    </View>
                    
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#1f2937', marginBottom: 12 }} numberOfLines={1}>
                        {item.postTitle}
                    </Text>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280' }}>
                            {isBuyer ? 'Bought from ' : 'Sold to '}
                            <Text style={{ color: '#1f2937', fontWeight: '800' }}>{partnerCallsign}</Text>
                        </Text>
                        
                        {needsReview && (
                            <Pressable 
                                style={{ backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fde047' }}
                                onPress={() => setPromptReviewForTx({ txId: item.id, targetPubkey: partnerPubkey, targetCallsign: partnerCallsign })}
                            >
                                <Text style={{ color: '#b45309', fontSize: 12, fontWeight: '800' }}>Leave Review</Text>
                            </Pressable>
                        )}
                    </View>
                </View>
            );

            if (isPending) {
                return (
                    <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.postId, txId: item.id } })}>
                        <InnerCard />
                    </Pressable>
                );
            }

            return <InnerCard />;
        }

        let coverImage = null;
        if (item.photos) {
            try {
                const arr = JSON.parse(item.photos);
                if (arr.length > 0) coverImage = arr[0];
            } catch {}
        }
        
        const cardAuthor = item.author_callsign || item.author_pubkey?.slice(0, 6) || 'Unknown';
        
        const priceLabel = item.price_type === 'hourly' ? '/Hr' : 
                           item.price_type === 'daily' ? '/Dy' : 
                           item.price_type === 'weekly' ? '/Wk' : 
                           item.price_type === 'monthly' ? '/Mo' : '';

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
                            <CurrencyDisplay style={styles.gridPriceText} amount={item.credits + (priceLabel || '')} hideAmount={false} />
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
                        <PostAuthorRating pubkey={item.author_pubkey} callsign={cardAuthor} isGrid={true} />
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
                        {!!item.repeatable && (
                            <View style={[styles.badge, { backgroundColor: 'rgba(249, 115, 22, 0.1)', borderWidth: 1, borderColor: 'rgba(249, 115, 22, 0.2)', marginLeft: 8 }]}>
                                <Text style={[styles.badgeText, { color: '#c2410c' }]}>↻ RECURRING</Text>
                            </View>
                        )}
                        <CurrencyDisplay style={styles.price} amount={item.credits + (priceLabel || '')} hideAmount={false} />
                    </View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <PostAuthorRating pubkey={item.author_pubkey} callsign={cardAuthor} isGrid={false} />
                    <View style={styles.cardFooter}>
                        <Pressable style={styles.actionBtn}>
                            <MaterialCommunityIcons name="chat-outline" size={16} color="#aaa" />
                            <Text style={styles.actionText}>Message</Text>
                        </Pressable>
                        <Pressable style={styles.reportBtn} onPress={() => handleContentAction(item.author_pubkey, cardAuthor, item.id)}>
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
                key={viewMode + activeTab + dealsTab}
                numColumns={viewMode === 'grid' && !(activeTab === 'deals' && dealsTab === 'history') ? 2 : 1}
                data={listData}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                columnWrapperStyle={viewMode === 'grid' && !(activeTab === 'deals' && dealsTab === 'history') ? styles.gridRow : undefined}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={{ padding: 32, alignItems: 'center' }}>
                        <Text style={{ fontSize: 40, opacity: 0.3, marginBottom: 16 }}>
                            {activeTab === 'deals' && dealsTab === 'history' ? '📜' : '🛒'}
                        </Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1f2937', marginBottom: 8 }}>
                            {activeTab === 'deals' && dealsTab === 'history' ? 'No history' : 'No items found'}
                        </Text>
                        <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
                            {activeTab === 'deals' && dealsTab === 'history' ? 'You have no completed or cancelled deals yet.' : 'The market is quiet right now.'}
                        </Text>
                    </View>
                }
            />
            {!(activeTab === 'deals' && dealsTab === 'history') && (
                <Pressable style={styles.fab} onPress={() => router.push('/')}>
                    <Text style={{ color: '#fff', fontSize: 30, fontWeight: '300', marginTop: -2 }}>+</Text>
                </Pressable>
            )}

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

            {promptReviewForTx && (
                <ReviewModal 
                    visible={!!promptReviewForTx}
                    txId={promptReviewForTx.txId}
                    targetPubkey={promptReviewForTx.targetPubkey}
                    targetCallsign={promptReviewForTx.targetCallsign}
                    onClose={() => setPromptReviewForTx(null)}
                    onSuccess={() => {
                        setPromptReviewForTx(null);
                        loadPosts(); // refresh to clear the review button
                    }}
                />
            )}
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
    pillNeedActive: { backgroundColor: '#ea580c', borderColor: '#ea580c' },

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
