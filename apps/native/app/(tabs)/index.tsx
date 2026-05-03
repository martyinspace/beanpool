import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, Platform, Alert, TouchableOpacity, ScrollView, TextInput, Pressable, Switch, KeyboardAvoidingView, Dimensions, Image as RNImage, Keyboard, Linking, DeviceEventEmitter, Animated } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { Picker } from '@react-native-picker/picker';
import MapView, { Marker, PROVIDER_DEFAULT } from '../../components/Map';
import { useFocusEffect, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPosts, createPost } from '../../utils/db';
import { useIdentity } from '../IdentityContext';
import { useCurrencyString } from '../../components/CurrencyDisplay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

const CATEGORIES = [
    { id: 'food', emoji: '🥕', label: 'Food & Produce' },
    { id: 'services', emoji: '🤝', label: 'Services' },
    { id: 'labour', emoji: '👷', label: 'Labour' },
    { id: 'tools', emoji: '🛠️', label: 'Tools' },
    { id: 'goods', emoji: '📦', label: 'Goods' },
    { id: 'garden', emoji: '🌻', label: 'Garden' },
    { id: 'housing', emoji: '🏠', label: 'Housing' },
    { id: 'transport', emoji: '🚗', label: 'Transport' },
    { id: 'education', emoji: '📚', label: 'Education' },
    { id: 'arts', emoji: '🎨', label: 'Arts' },
    { id: 'health', emoji: '🌿', label: 'Health & Wellness' },
    { id: 'care', emoji: '❤️', label: 'Care & Support' },
    { id: 'animals', emoji: '🐾', label: 'Animals' },
    { id: 'tech', emoji: '💻', label: 'Tech & Digital' },
    { id: 'energy', emoji: '☀️', label: 'Energy' },
    { id: 'general', emoji: '🌱', label: 'General' },
];

// Hide Google Maps POI markers
const hidePoisStyle = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

const darkMapStyle = [
  ...hidePoisStyle,
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
];

const MapPin = ({ post, catObj, useModernMarkers, isSelected, onPress }: { post: any, catObj: any, useModernMarkers: boolean, isSelected: boolean, onPress: (p: any) => void }) => {
    const [track, setTrack] = useState(true);
    useEffect(() => { const t = setTimeout(() => setTrack(false), 500); return () => clearTimeout(t); }, []);

    const isOffer = post.type === 'offer';
    const bgColor = isOffer ? '#10b981' : '#ea580c';
    const markerEmoji = catObj?.emoji || (isOffer ? '📦' : '❤️');
    
    // Elder Glow (Energy Cycled > 10000)
    const isElder = post.author_energy_cycled && post.author_energy_cycled >= 10000;
    const elderStyle = isElder ? { borderColor: '#fbbf24', borderWidth: 2, shadowColor: '#fbbf24', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : {};

    if (useModernMarkers) {
        return (
            <Marker
                coordinate={{ latitude: post.lat, longitude: post.lng }}
                tracksViewChanges={track}
                anchor={{ x: 0.5, y: 1 }}
                onPress={(e) => { e.stopPropagation(); onPress(post); }}
            >
                <View style={styles.pinContainer}>
                    <View style={[styles.modernPin, { backgroundColor: bgColor }, isElder && { borderColor: '#fbbf24', borderWidth: 2 }, isSelected && { transform: [{ scale: 1.15 }] }]}>
                        {isElder && <View style={[StyleSheet.absoluteFill, styles.elderGlow]} />}
                        <Text style={styles.modernPinEmoji}>{markerEmoji}</Text>
                    </View>
                    <View style={[styles.modernPinTail, { borderTopColor: isElder ? '#fbbf24' : bgColor }]} />
                </View>
            </Marker>
        );
    }

    return (
        <Marker
            coordinate={{ latitude: post.lat, longitude: post.lng }}
            tracksViewChanges={track}
            anchor={{ x: 0.5, y: 1 }}
            onPress={(e) => { e.stopPropagation(); onPress(post); }}
        >
            <View style={styles.pinContainer}>
                <View style={[styles.pinCircle, { borderColor: bgColor }, elderStyle, isSelected && { transform: [{ scale: 1.15 }] }]}>
                    <Text style={styles.pinEmoji}>{markerEmoji}</Text>
                </View>
                <View style={[styles.pinArrow, { borderTopColor: isElder ? '#fbbf24' : bgColor }]} />
            </View>
        </Marker>
    );
};

export default function MapScreen() {
    const currencyStr = useCurrencyString();
    const [isDarkMap, setIsDarkMap] = useState(false);
    const [posts, setPosts] = useState<any[]>([]);
    const mapRef = useRef<MapView>(null);
    const [currentRegion, setCurrentRegion] = useState({
        latitude: -28.5398, longitude: 153.4996,
        latitudeDelta: 0.0922, longitudeDelta: 0.0421,
    });
    const insets = useSafeAreaInsets();
    const { identity } = useIdentity();

    // New Post state
    const [showNewPost, setShowNewPost] = useState(false);
    const [postType, setPostType] = useState<'offer' | 'need'>('offer');
    const [postCategory, setPostCategory] = useState('');
    const [postTitle, setPostTitle] = useState('');
    const [postDescription, setPostDescription] = useState('');
    const [postCredits, setPostCredits] = useState('');
    const [postPriceType, setPostPriceType] = useState<string>('fixed');
    const [postRepeatable, setPostRepeatable] = useState(false);
    const [postPhotos, setPostPhotos] = useState<string[]>([]);
    const [postLat, setPostLat] = useState<number | null>(null);
    const [postLng, setPostLng] = useState<number | null>(null);
    const [pinDropMode, setPinDropMode] = useState(false);
    const [posting, setPosting] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [validationToast, setValidationToast] = useState('');

    // Map UI State
    const [useModernMarkers, setUseModernMarkers] = useState(true);
    const [selectedPostPreview, setSelectedPostPreview] = useState<any>(null);

    useEffect(() => {
        AsyncStorage.getItem('beanpool_modern_markers').then(val => {
            if (val !== null) setUseModernMarkers(val === 'true');
        });
    }, []);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    useFocusEffect(
        React.useCallback(() => { loadPosts(); }, [])
    );

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('sync_data_updated', () => loadPosts());
        return () => sub.remove();
    }, []);

    const loadPosts = async () => {
        try { 
            const p = await getPosts();
            setPosts(p); 
        } catch (e: any) { 
            console.error('Failed to load map points', e); 
        }
    };

    // We no longer automatically request permissions on init.
    // The user must explicitly request location via the GPS button.

    const centerOnUser = async () => {
        let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
            if (canAskAgain) {
                const res = await Location.requestForegroundPermissionsAsync();
                status = res.status;
            } else {
                Alert.alert("Permission Denied", "Location permission was denied. Please enable it in your device settings to center the map.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Open Settings", onPress: () => Linking.openSettings() }
                ]);
                return;
            }
        }
        if (status !== 'granted') return;
        try {
            const location = await Location.getCurrentPositionAsync({});
            mapRef.current?.animateToRegion({
                latitude: location.coords.latitude, longitude: location.coords.longitude,
                latitudeDelta: 0.05, longitudeDelta: 0.02,
            }, 1000);
        } catch (err) { console.log("Failed to fetch current location", err); }
    };

    // --- New Post Functions ---
    const resetNewPost = () => {
        setPostType('offer'); setPostCategory(''); setPostTitle(''); setPostDescription('');
        setPostCredits(''); setPostPriceType('fixed'); setPostRepeatable(false); setPostPhotos([]);
        setPostLat(null); setPostLng(null); setPinDropMode(false); setValidationErrors(new Set());
        setValidationToast('');
    };

    const useMyLocation = async () => {
        let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
            if (canAskAgain) {
                const res = await Location.requestForegroundPermissionsAsync();
                status = res.status;
            } else {
                Alert.alert("Permission Denied", "Location permission was denied. Please enable it in your device settings to use your current location.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Open Settings", onPress: () => Linking.openSettings() }
                ]);
                return;
            }
        }
        if (status !== 'granted') return;
        try {
            const loc = await Location.getCurrentPositionAsync({});
            const lat = Math.round(loc.coords.latitude * 10000) / 10000;
            const lng = Math.round(loc.coords.longitude * 10000) / 10000;
            setPostLat(lat); setPostLng(lng); setPinDropMode(false);
            setValidationErrors(prev => { const n = new Set(prev); n.delete('location'); return n; });
            mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.01 }, 500);
        } catch { Alert.alert("Error", "Could not get your location. Try 'Drop a pin' instead."); }
    };

    const enterPinDrop = () => {
        Keyboard.dismiss();
        setPinDropMode(true); setPostLat(null); setPostLng(null);
        setValidationErrors(prev => { const n = new Set(prev); n.delete('location'); return n; });
    };

    const handleMapPress = (e: any) => {
        if (!pinDropMode) return;
        const { latitude, longitude } = e.nativeEvent.coordinate;
        const lat = Math.round(latitude * 10000) / 10000;
        const lng = Math.round(longitude * 10000) / 10000;
        setPostLat(lat); setPostLng(lng);
        setValidationErrors(prev => { const n = new Set(prev); n.delete('location'); return n; });
    };

    const pickPhoto = async () => {
        if (postPhotos.length >= 3) return;
        Alert.alert('Add Photo', 'Choose a source', [
            { text: 'Camera', onPress: async () => {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) { Alert.alert('Permission needed'); return; }
                const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, base64: false });
                if (!result.canceled && result.assets[0]?.uri) {
                    try {
                        const manipResult = await ImageManipulator.manipulateAsync(
                            result.assets[0].uri,
                            [{ resize: { width: 800 } }],
                            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                        );
                        if (manipResult.base64) {
                            setPostPhotos(prev => [...prev, `data:image/jpeg;base64,${manipResult.base64}`]);
                        }
                    } catch (e) { console.error("Failed to manipulate image:", e); }
                }
            }},
            { text: 'Gallery', onPress: async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, base64: false });
                if (!result.canceled && result.assets[0]?.uri) {
                    try {
                        const manipResult = await ImageManipulator.manipulateAsync(
                            result.assets[0].uri,
                            [{ resize: { width: 800 } }],
                            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                        );
                        if (manipResult.base64) {
                            setPostPhotos(prev => [...prev, `data:image/jpeg;base64,${manipResult.base64}`]);
                        }
                    } catch (e) { console.error("Failed to manipulate image:", e); }
                }
            }},
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const showPricingGuide = () => {
        Alert.alert(
            "💡 Pricing Guide",
            "Free (0 Ʀ) — Gifts, community contributions\n\n" +
            "1–10 Ʀ — Small favours, home produce, quick tasks\n\n" +
            "10–40 Ʀ — Skilled labour (per hour), substantial goods\n\n" +
            "40–100 Ʀ — Professional services, large items\n\n" +
            "100+ Ʀ — Major projects, housing, vehicles",
            [{ text: "Got it" }]
        );
    };

    const handleSubmit = async () => {
        Keyboard.dismiss();
        
        const errors = new Set<string>();
        if (!postTitle.trim()) errors.add('title');
        if (postCredits.trim() === '' || isNaN(Number(postCredits))) errors.add('credits');
        if (!postDescription.trim()) errors.add('description');
        if (postLat == null || postLng == null) errors.add('location');
        if (!postCategory) errors.add('category');
        if (postPhotos.length < 1) errors.add('photos');
        setValidationErrors(errors);
        if (errors.size > 0) {
            setValidationToast('⚠️ Please complete all required fields');
            setTimeout(() => setValidationToast(''), 3000);
            return;
        }

        if (!identity) { Alert.alert("Auth", "You must be authenticated."); return; }

        setPosting(true);
        try {
            await createPost({
                id: Crypto.randomUUID(),
                type: postType,
                category: postCategory,
                title: postTitle.trim(),
                description: postDescription.trim(),
                credits: Number(postCredits) || 0,
                price_type: postPriceType,
                repeatable: postRepeatable ? 1 : 0,
                author_pubkey: identity.publicKey,
                lat: postLat,
                lng: postLng,
                photos: postPhotos.length > 0 ? JSON.stringify(postPhotos) : null,
                created_at: new Date().toISOString(),
            });
            setTimeout(() => {
                resetNewPost();
                setShowNewPost(false);
                loadPosts();
                setPosting(false);
                router.push({ pathname: '/market', params: { tab: 'deals', dealsTab: 'active' } });
            }, 300);
        } catch (e: any) {
            console.error(e);
            Alert.alert("Error", e.message || "Could not publish post.");
            setPosting(false);
        }
    };

    const fieldBorder = (field: string) => validationErrors.has(field) ? { borderColor: '#ef4444', borderWidth: 2, shadowColor: '#ef4444', shadowOpacity: 0.3, shadowRadius: 6 } : {};

    // Smart button label
    const submitLabel = posting ? 'Posting...'
        : (!postCategory) ? '📂 Select a category'
        : (postLat == null) ? '📍 Set a location'
        : (postPhotos.length < 1) ? '📷 Add a photo'
        : (postCredits === '') ? '💰 Set a price'
        : (!postTitle.trim() || !postDescription.trim()) ? '✏️ Fill required fields'
        : `Post ${postType === 'offer' ? 'Offer' : 'Need'}`;
    const submitDisabled = posting || postLat == null || !postTitle.trim() || !postDescription.trim() || postCredits === '' || !postCategory || postPhotos.length < 1;

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                customMapStyle={isDarkMap ? darkMapStyle : hidePoisStyle}
                userInterfaceStyle={isDarkMap ? "dark" : "light"}
                showsUserLocation={true}
                onRegionChangeComplete={(r) => setCurrentRegion(r)}
                onPress={(e) => {
                    handleMapPress(e);
                    if (selectedPostPreview) setSelectedPostPreview(null);
                }}
                onLongPress={handleMapPress}
                initialRegion={currentRegion}
            >
                {posts.filter(p => {
                    if (p.status && p.status !== 'active') return false;
                    if (p.lat == null || p.lng == null) return false;
                    const l1 = Number(p.lat);
                    const l2 = Number(p.lng);
                    return !isNaN(l1) && !isNaN(l2);
                }).map(post => {
                    const catObj = CATEGORIES.find(c => c.id === post.category);
                    const safePost = { ...post, lat: Number(post.lat), lng: Number(post.lng) };
                    const isSelected = selectedPostPreview?.id === post.id;
                    return (
                        <MapPin 
                            key={post.id} 
                            post={safePost} 
                            catObj={catObj} 
                            useModernMarkers={useModernMarkers}
                            isSelected={isSelected}
                            onPress={setSelectedPostPreview} 
                        />
                    );
                })}

                {/* Pin drop preview marker */}
                {showNewPost && postLat != null && postLng != null && (
                    <Marker coordinate={{ latitude: postLat, longitude: postLng }} pinColor={postType === 'offer' ? '#10b981' : '#ea580c'} />
                )}
            </MapView>

            {/* Top Gradient Overlay for Edge-to-Edge immersion */}
            <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent']} style={styles.topGradient} pointerEvents="none" />

            {/* Map Action FABs - Right Pill */}
            {!showNewPost && !selectedPostPreview && (
                <View style={[styles.fabPill, { top: Math.max(insets.top + 10, 50) }]} pointerEvents="box-none">
                    <TouchableOpacity style={styles.pillBtn} onPress={() => setIsDarkMap(!isDarkMap)}>
                        <Text style={styles.pillBtnEmoji}>{isDarkMap ? '☀️' : '🌙'}</Text>
                    </TouchableOpacity>
                    <View style={styles.pillDivider} />
                    <TouchableOpacity style={styles.pillBtn} onPress={centerOnUser}>
                        <Text style={[styles.pillBtnIcon, isDarkMap && { color: '#e5e7eb' }]}>⌖</Text>
                    </TouchableOpacity>
                    <View style={styles.pillDivider} />
                    <TouchableOpacity style={styles.pillBtn} onPress={() => mapRef.current?.animateToRegion({ ...currentRegion, latitudeDelta: currentRegion.latitudeDelta / 2, longitudeDelta: currentRegion.longitudeDelta / 2 }, 300)}>
                        <Text style={[styles.pillBtnIcon, isDarkMap && { color: '#e5e7eb' }]}>+</Text>
                    </TouchableOpacity>
                    <View style={styles.pillDivider} />
                    <TouchableOpacity style={styles.pillBtn} onPress={() => mapRef.current?.animateToRegion({ ...currentRegion, latitudeDelta: currentRegion.latitudeDelta * 2, longitudeDelta: currentRegion.longitudeDelta * 2 }, 300)}>
                        <Text style={[styles.pillBtnIcon, isDarkMap && { color: '#e5e7eb' }]}>−</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Map Preview Card (Bottom Sheet style) */}
            {selectedPostPreview && !showNewPost && (
                <SafeAreaView style={styles.previewCardWrapper} pointerEvents="box-none">
                    <Pressable style={styles.previewCardOverlay} onPress={() => setSelectedPostPreview(null)} />
                    <Animated.View style={styles.previewCard}>
                        {selectedPostPreview.photos && selectedPostPreview.photos.length > 0 ? (
                            <RNImage source={{ uri: selectedPostPreview.photos[0] }} style={styles.previewThumb} />
                        ) : (
                            <View style={[styles.previewThumbPlaceholder, { backgroundColor: selectedPostPreview.type === 'offer' ? '#10b98120' : '#ea580c20' }]}>
                                <Text style={{ fontSize: 32 }}>{CATEGORIES.find(c => c.id === selectedPostPreview.category)?.emoji || '📌'}</Text>
                            </View>
                        )}
                        <View style={styles.previewInfo}>
                            <View style={styles.previewHeader}>
                                <Text style={styles.previewCategory} numberOfLines={1}>
                                    {CATEGORIES.find(c => c.id === selectedPostPreview.category)?.label || 'General'}
                                </Text>
                                <Text style={styles.previewCredits}>
                                    {selectedPostPreview.credits} {currencyStr}
                                </Text>
                            </View>
                            <Text style={styles.previewTitle} numberOfLines={1}>
                                {selectedPostPreview.title}
                            </Text>
                            <Text style={styles.previewAuthor} numberOfLines={1}>
                                {selectedPostPreview.author_callsign || selectedPostPreview.author_pubkey?.slice(0, 6) || 'Unknown'}
                                {selectedPostPreview.author_energy_cycled && selectedPostPreview.author_energy_cycled >= 10000 ? ' ✨ Elder' : ''}
                            </Text>
                            <Pressable 
                                style={[styles.previewActionBtn, { backgroundColor: selectedPostPreview.type === 'offer' ? '#10b981' : '#ea580c' }]}
                                onPress={() => {
                                    setSelectedPostPreview(null);
                                    router.push(`/post/${selectedPostPreview.id}`);
                                }}
                            >
                                <Text style={styles.previewActionText}>View Details</Text>
                            </Pressable>
                        </View>
                        <Pressable style={styles.previewClose} onPress={() => setSelectedPostPreview(null)} hitSlop={15}>
                            <Text style={styles.previewCloseText}>✕</Text>
                        </Pressable>
                    </Animated.View>
                </SafeAreaView>
            )}

            {/* FAB — New Post Button */}
            {!showNewPost && !selectedPostPreview && (
                <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
                    <TouchableOpacity
                        style={styles.fab}
                        onPress={() => setShowNewPost(true)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.fabText}>+</Text>
                    </TouchableOpacity>
                </SafeAreaView>
            )}

            {/* Pin drop mode instruction */}
            {pinDropMode && showNewPost && postLat == null && (
                <View style={styles.pinDropBanner}>
                    <Text style={styles.pinDropBannerText}>📌 Tap the map to place your pin</Text>
                </View>
            )}

            {/* Dedicated Pin Drop Confirm/Cancel Footer */}
            {pinDropMode && showNewPost && (
                <SafeAreaView style={[styles.sheetWrapper, { bottom: 0, paddingBottom: 20 }]} pointerEvents="box-none">
                    <View style={[styles.sheet, { padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 20 }]}>
                        <Pressable 
                            style={{ flex: 1, padding: 14, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, marginRight: 8, alignItems: 'center' }}
                            onPress={() => { setPinDropMode(false); setPostLat(null); setPostLng(null); }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '700' }}>Cancel</Text>
                        </Pressable>
                        <Pressable 
                            style={{ flex: 1, padding: 14, backgroundColor: postLat != null ? '#10b981' : 'rgba(16,185,129,0.3)', borderRadius: 12, marginLeft: 8, alignItems: 'center' }}
                            disabled={postLat == null}
                            onPress={() => setPinDropMode(false)}
                        >
                            <Text style={{ color: '#fff', fontWeight: '800' }}>Confirm Pin {postLat != null ? '✓' : ''}</Text>
                        </Pressable>
                    </View>
                </SafeAreaView>
            )}

            {/* New Post Full-Screen Overlay */}
            {showNewPost && !pinDropMode && (
                <KeyboardAvoidingView
                    style={[StyleSheet.absoluteFill, { zIndex: 500, justifyContent: 'flex-end' }]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    keyboardVerticalOffset={0}
                >
                    <View style={styles.sheet}>
                        {/* Validation Toast */}
                        {validationToast !== '' && (
                            <View style={styles.toastBanner}>
                                <Text style={styles.toastText}>{validationToast}</Text>
                            </View>
                        )}

                        {/* Header */}
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>New Post</Text>
                            <Pressable onPress={() => { setShowNewPost(false); resetNewPost(); }} hitSlop={12}>
                                <Text style={styles.sheetClose}>✕</Text>
                            </Pressable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
                            {/* Type Toggle */}
                            <View style={styles.typeRow}>
                                <Pressable style={[styles.typeBtn, postType === 'offer' && styles.typeBtnOffer]} onPress={() => setPostType('offer')}>
                                    <Text style={[styles.typeBtnText, postType === 'offer' && styles.typeBtnTextActive]}>🔵 Offer</Text>
                                </Pressable>
                                <Pressable style={[styles.typeBtn, postType === 'need' && styles.typeBtnNeed]} onPress={() => setPostType('need')}>
                                    <Text style={[styles.typeBtnText, postType === 'need' && styles.typeBtnTextActive]}>🟠 Need</Text>
                                </Pressable>
                            </View>

                            {/* Category Dropdown */}
                            <Text style={styles.sectionLabel}>Category <Text style={styles.requiredStar}>*</Text></Text>
                            <View style={[styles.pickerWrap, fieldBorder('category')]}>
                                <Picker
                                    selectedValue={postCategory}
                                    onValueChange={v => { setPostCategory(v); setValidationErrors(prev => { const n = new Set(prev); n.delete('category'); return n; }); }}
                                    style={styles.picker}
                                    dropdownIconColor="#6b7280"
                                >
                                    <Picker.Item label="Select a category..." value="" enabled={false} color="#9ca3af" />
                                    {CATEGORIES.map(c => (
                                        <Picker.Item key={c.id} label={`${c.emoji} ${c.label}`} value={c.id} />
                                    ))}
                                </Picker>
                            </View>

                            {/* Title */}
                            <Text style={styles.sectionLabel}>Title <Text style={styles.requiredStar}>*</Text></Text>
                            <TextInput
                                style={[styles.titleInputFull, fieldBorder('title')]}
                                placeholder="What do you need/offer?"
                                placeholderTextColor="#9ca3af"
                                value={postTitle}
                                onChangeText={v => { setPostTitle(v); setValidationErrors(prev => { const n = new Set(prev); n.delete('title'); return n; }); }}
                                maxLength={50}
                            />

                            {/* Price Row */}
                            <Text style={styles.sectionLabel}>Price <Text style={styles.requiredStar}>*</Text></Text>
                            <View style={styles.priceRow}>
                                <TextInput
                                    style={[styles.creditsInputWide, fieldBorder('credits')]}
                                    placeholder="Beans"
                                    placeholderTextColor="#9ca3af"
                                    keyboardType="numeric"
                                    value={postCredits}
                                    onChangeText={v => { setPostCredits(v); setValidationErrors(prev => { const n = new Set(prev); n.delete('credits'); return n; }); }}
                                    maxLength={5}
                                />
                                <Pressable onPress={() => {
                                    const types = ['fixed', 'hourly', 'daily', 'weekly', 'monthly'];
                                    setPostPriceType(types[(types.indexOf(postPriceType) + 1) % types.length]);
                                }} style={styles.priceTypeBtn}>
                                    <Text style={styles.priceTypeBtnText}>{
                                        { fixed: 'Total', hourly: '/ Hr', daily: '/ Dy', weekly: '/ Wk', monthly: '/ Mo' }[postPriceType] || 'Total'
                                    }</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.freeChip, postCredits === '0' && styles.freeChipActive]}
                                    onPress={() => { setPostCredits('0'); setValidationErrors(prev => { const n = new Set(prev); n.delete('credits'); return n; }); }}
                                >
                                    <Text style={[styles.freeChipText, postCredits === '0' && styles.freeChipTextActive]}>FREE</Text>
                                </Pressable>
                            </View>
                            <Pressable onPress={showPricingGuide} style={styles.pricingGuideLink}>
                                <Text style={styles.pricingGuideLinkText}>💡 How should I price this?</Text>
                            </Pressable>

                            {/* Location */}
                            <Text style={styles.sectionLabel}>Location <Text style={styles.requiredStar}>*</Text></Text>
                            <View style={styles.locationRow}>
                                <Pressable
                                    style={[styles.locationChip, postLat != null && !pinDropMode && styles.locationChipActive, fieldBorder('location')]}
                                    onPress={useMyLocation}
                                >
                                    <Text style={styles.locationChipIcon}>📍</Text>
                                    <Text style={styles.locationChipLabel}>My location</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.locationChip, fieldBorder('location')]}
                                    onPress={enterPinDrop}
                                >
                                    <Text style={styles.locationChipIcon}>📌</Text>
                                    <Text style={styles.locationChipLabel}>Drop a pin</Text>
                                </Pressable>
                                {postLat != null && postLng != null && (
                                    <Text style={styles.locationConfirmInline}>✓ Set</Text>
                                )}
                            </View>

                            {/* Description */}
                            <Text style={styles.sectionLabel}>Description <Text style={styles.requiredStar}>*</Text></Text>
                            <TextInput
                                style={[styles.descriptionInput, fieldBorder('description')]}
                                placeholder="Describe what you need/offer..."
                                placeholderTextColor="#9ca3af"
                                value={postDescription}
                                onChangeText={v => { setPostDescription(v); setValidationErrors(prev => { const n = new Set(prev); n.delete('description'); return n; }); }}
                                multiline
                                textAlignVertical="top"
                            />

                            {/* Repeatable Toggle */}
                            <Pressable style={styles.repeatableRow} onPress={() => setPostRepeatable(!postRepeatable)}>
                                <View style={[styles.checkbox, postRepeatable && styles.checkboxActive]}>
                                    {postRepeatable && <Text style={styles.checkboxTick}>✓</Text>}
                                </View>
                                <Text style={styles.repeatableText}>🔁 Repeatable — keep listing active for ongoing bookings</Text>
                            </Pressable>

                            {/* Photos */}
                            <Text style={styles.sectionLabel}>Photos <Text style={styles.requiredStar}>*</Text> <Text style={styles.sectionLabelHint}>(min 1)</Text></Text>
                            <View style={[styles.photosRow, fieldBorder('photos')]}>
                                {postPhotos.map((uri, i) => (
                                    <View key={i} style={styles.photoThumb}>
                                        <RNImage source={{ uri }} style={styles.photoImg} />
                                        <Pressable style={styles.photoRemove} onPress={() => setPostPhotos(prev => prev.filter((_, j) => j !== i))}>
                                            <Text style={styles.photoRemoveText}>✕</Text>
                                        </Pressable>
                                    </View>
                                ))}
                                {postPhotos.length < 3 && (
                                    <Pressable style={styles.photoAdd} onPress={() => { pickPhoto(); setValidationErrors(prev => { const n = new Set(prev); n.delete('photos'); return n; }); }}>
                                        <Text style={styles.photoAddIcon}>📷</Text>
                                    </Pressable>
                                )}
                            </View>
                            <Text style={styles.photoCount}>{postPhotos.length}/3 photos</Text>
                        </ScrollView>

                        {/* Sticky Submit */}
                        <Pressable
                            style={[styles.submitBtn, submitDisabled ? styles.submitBtnDisabled : (postType === 'offer' ? styles.submitBtnOffer : styles.submitBtnNeed)]}
                            onPress={handleSubmit}
                            disabled={posting}
                        >
                            <Text style={[styles.submitBtnText, submitDisabled && styles.submitBtnTextDisabled]}>{submitLabel}</Text>
                        </Pressable>
                    </View>
                </KeyboardAvoidingView>
            )}
        </View>
    );
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    map: { width: '100%', height: '100%' },
    // Top Gradient Overlay
    topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, zIndex: 10 },

    // FAB Pill (Right side)
    fabPill: { position: 'absolute', right: 16, width: 48, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 24, paddingVertical: 8, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8, zIndex: 100 },
    pillBtn: { width: 48, height: 44, justifyContent: 'center', alignItems: 'center' },
    pillDivider: { width: 32, height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 2 },
    pillBtnEmoji: { fontSize: 20 },
    pillBtnIcon: { fontSize: 22, fontWeight: '300', color: '#374151' },

    // Map Pins (Classic)
    pinContainer: { width: 44, height: 52, alignItems: 'center', justifyContent: 'flex-start' },
    pinCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
    pinEmoji: { fontSize: 18 },
    pinArrow: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },

    // Map Pins (Modern Bean)
    modernPin: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
    modernPinEmoji: { fontSize: 22 },
    modernPinTail: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -2 },
    elderGlow: { borderRadius: 20, borderWidth: 2, borderColor: '#fbbf24', shadowColor: '#fbbf24', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },

    // Map Preview Card
    previewCardWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 150, justifyContent: 'flex-end' },
    previewCardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
    previewCard: { backgroundColor: '#fff', margin: 16, borderRadius: 24, padding: 16, flexDirection: 'row', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20 },
    previewThumb: { width: 90, height: 90, borderRadius: 16, backgroundColor: '#f3f4f6' },
    previewThumbPlaceholder: { width: 90, height: 90, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    previewInfo: { flex: 1, marginLeft: 16, justifyContent: 'center' },
    previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    previewCategory: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
    previewCredits: { fontSize: 14, fontWeight: '800', color: '#10b981' },
    previewTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 },
    previewAuthor: { fontSize: 14, fontWeight: '500', color: '#6b7280', marginBottom: 12 },
    previewActionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
    previewActionText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    previewClose: { position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' },
    previewCloseText: { fontSize: 12, fontWeight: '800', color: '#6b7280' },

    // FAB
    fab: { position: 'absolute', bottom: 32, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10, zIndex: 100 },
    fabText: { color: '#fff', fontSize: 32, fontWeight: '300', marginTop: -2 },

    // Pin drop banner
    pinDropBanner: { position: 'absolute', top: 60, left: 20, right: 20, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', zIndex: 200 },
    pinDropBannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Full-Screen Sheet
    sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: SCREEN_HEIGHT * 0.95, zIndex: 500 },
    sheet: { backgroundColor: 'rgba(24, 30, 24, 0.98)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: SCREEN_HEIGHT * 0.95, flex: 1 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
    sheetClose: { color: 'rgba(255,255,255,0.5)', fontSize: 24, fontWeight: '300', width: 32, height: 32, textAlign: 'center', lineHeight: 32 },

    // Toast
    toastBanner: { backgroundColor: '#ef4444', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 10, alignItems: 'center' },
    toastText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    // Section labels
    sectionLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
    requiredStar: { color: '#ef4444', fontSize: 12 },
    sectionLabelHint: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '500', textTransform: 'none', letterSpacing: 0 },

    // Type toggle
    typeRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    typeBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
    typeBtnOffer: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    typeBtnNeed: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
    typeBtnText: { fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.6)' },
    typeBtnTextActive: { color: '#fff' },

    // Category picker
    pickerWrap: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', marginBottom: 12, overflow: 'hidden' },
    picker: { color: '#fff', height: 50 },

    // Title (full-width)
    titleInputFull: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, marginBottom: 12 },

    // Price row
    priceRow: { flexDirection: 'row', gap: 8, marginBottom: 4, alignItems: 'center' },
    creditsInputWide: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 16, fontWeight: '800' },
    priceTypeBtn: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center' },
    priceTypeBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
    freeChip: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.08)' },
    freeChipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
    freeChipText: { color: 'rgba(16,185,129,0.8)', fontSize: 13, fontWeight: '800' },
    freeChipTextActive: { color: '#fff' },
    pricingGuideLink: { marginBottom: 12, paddingVertical: 4 },
    pricingGuideLinkText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600' },

    // Location (compact chips)
    locationRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    locationChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)' },
    locationChipActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)' },
    locationChipIcon: { fontSize: 16 },
    locationChipLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    locationConfirmInline: { color: '#10b981', fontSize: 13, fontWeight: '800' },

    // Repeatable
    repeatableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 10 },
    checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
    checkboxActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    checkboxTick: { color: '#fff', fontSize: 14, fontWeight: '800' },
    repeatableText: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },

    // Description
    descriptionInput: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, minHeight: 80, marginBottom: 12 },

    // Photos
    photosRow: { flexDirection: 'row', gap: 10, marginBottom: 4, flexWrap: 'wrap', padding: 4, borderRadius: 14 },
    photoThumb: { width: 60, height: 60, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    photoImg: { width: 60, height: 60, borderRadius: 12 },
    photoRemove: { position: 'absolute', top: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
    photoRemoveText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    photoAdd: { width: 60, height: 60, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
    photoAddIcon: { fontSize: 26 },
    photoCount: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

    // Submit
    submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginBottom: 8, marginTop: 4 },
    submitBtnOffer: { backgroundColor: '#10b981' },
    submitBtnNeed: { backgroundColor: '#ea580c' },
    submitBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.1)' },
    submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
    submitBtnTextDisabled: { color: 'rgba(255,255,255,0.4)' },
});
