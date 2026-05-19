import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, Platform, Alert, TouchableOpacity, ScrollView, TextInput, Pressable, Switch, KeyboardAvoidingView, Dimensions, Image as RNImage, Keyboard, Linking, DeviceEventEmitter, Animated, Modal, FlatList } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { Picker } from '@react-native-picker/picker';
import MapView, { Marker, PROVIDER_DEFAULT } from '../../components/Map';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemberAvatar } from '../../components/MemberAvatar';
import { getPosts, createPost } from '../../utils/db';
import { useIdentity } from '../IdentityContext';
import { useCurrencyString } from '../../components/CurrencyDisplay';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CategoryPickerSheet } from '../../components/CategoryPickerSheet';
import { PricingInfoModal } from '../../components/info-content/PricingInfoModal';
import { PinVisual, MapMarkerManager, getCachedMarkerImage, buildVariantList, PIN_ANCHOR, PIN_RENDER_W, PIN_RENDER_H, pinCacheKey, ClusterCaptureManager, getCachedClusterImage, CLUSTER_ANCHOR } from '../../components/UnifiedMapPin';

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

const ClusterMarker = ({ cluster, clustersReady }: any) => {
    const { geometry, onPress, properties } = cluster;
    const points = properties.point_count;
    // Cap at 99 for image lookup — counts ≥100 use the "99+" image
    const displayCount = Math.min(points, 99);

    const cachedImage = clustersReady ? getCachedClusterImage(displayCount) : null;

    // Platform fix: We start tracksViewChanges=true on Android.
    // It will be set to false ONLY when the RNImage's onLoad fires.
    const [tracksViewChanges, setTracksViewChanges] = useState(Platform.OS !== 'ios');

    const getCS = (p: number) => {
        if (p >= 50) return { size: 64, glow: 80, fontSize: 20 };
        if (p >= 25) return { size: 56, glow: 72, fontSize: 19 };
        if (p >= 15) return { size: 50, glow: 66, fontSize: 18 };
        if (p >= 10) return { size: 46, glow: 60, fontSize: 17 };
        if (p >= 5)  return { size: 42, glow: 54, fontSize: 16 };
        return { size: 36, glow: 48, fontSize: 15 };
    };

    if (cachedImage && Platform.OS !== 'web') {
        if (Platform.OS === 'android') {
            const { glow } = getCS(displayCount);
            return (
                <Marker
                    coordinate={{ longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] }}
                    onPress={onPress}
                    tracksViewChanges={tracksViewChanges}
                    anchor={CLUSTER_ANCHOR}
                >
                    <View style={{ width: glow + 8, height: glow + 8, justifyContent: 'center', alignItems: 'center' }}>
                        <RNImage 
                            source={{ uri: cachedImage }} 
                            style={{ width: glow + 8, height: glow + 8 }} 
                            resizeMode="contain" 
                            fadeDuration={0}
                            onLoad={() => setTimeout(() => setTracksViewChanges(false), 400)}
                        />
                    </View>
                </Marker>
            );
        }
        return (
            <Marker
                coordinate={{ longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] }}
                onPress={onPress}
                tracksViewChanges={tracksViewChanges}
                anchor={CLUSTER_ANCHOR}
                image={{ uri: cachedImage }}
            />
        );
    }

    // Fallback (web, or while capturing)
    const { size, glow, fontSize } = getCS(points);

    return (
        <Marker
            coordinate={{ longitude: geometry.coordinates[0], latitude: geometry.coordinates[1] }}
            onPress={onPress}
            tracksViewChanges={true}
            style={{ zIndex: points + 1 }}
            anchor={CLUSTER_ANCHOR}
        >
            <View collapsable={false} style={{ width: glow, height: glow, justifyContent: 'center', alignItems: 'center' }}>
                <View collapsable={false} style={{ position: 'absolute', width: glow, height: glow, borderRadius: glow / 2, backgroundColor: 'rgba(59, 130, 246, 0.25)' }} />
                <View collapsable={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', borderColor: '#ffffff', borderWidth: 3 }}>
                    <Text collapsable={false} style={{ color: '#ffffff', fontWeight: '800', fontSize }}>{points}</Text>
                </View>
            </View>
        </Marker>
    );
};

const CustomMapMarker = React.memo(({ coordinate, post, catObj, isSelected, onPress, opacity = 1, markersReady = false }: any) => {

    const postType = (post.type || '').toLowerCase();
    const isOffer = postType === 'offer';
    const bgColor = isOffer ? '#10b981' : '#ea580c';
    const markerEmoji = catObj?.emoji || (isOffer ? '📦' : '❤️');
    const isElder = (post.author_energy_cycled || 0) >= 10000;
    const cachedImage = markersReady ? getCachedMarkerImage(markerEmoji, bgColor, isElder) : null;

    // Platform fix: We start tracksViewChanges=true on Android.
    // It will be set to false ONLY when the RNImage's onLoad fires.
    const [tracksViewChanges, setTracksViewChanges] = useState(Platform.OS !== 'ios');

    useEffect(() => {
        if (Platform.OS === 'android') {
            setTracksViewChanges(true);
        }
    }, [cachedImage]);

    if (cachedImage && Platform.OS !== 'web') {
        if (Platform.OS === 'android') {
            return (
                <Marker
                    coordinate={coordinate}
                    tracksViewChanges={tracksViewChanges}
                    opacity={opacity}
                    anchor={PIN_ANCHOR}
                    onPress={(e) => { e.stopPropagation(); onPress(post); }}
                >
                    <View style={{ width: PIN_RENDER_W, height: PIN_RENDER_H, justifyContent: 'center', alignItems: 'center' }}>
                        <RNImage 
                            key={cachedImage}
                            source={{ uri: cachedImage }} 
                            style={{ width: PIN_RENDER_W, height: PIN_RENDER_H }} 
                            resizeMode="contain" 
                            fadeDuration={0}
                            onLoad={() => setTimeout(() => setTracksViewChanges(false), 400)}
                        />
                    </View>
                </Marker>
            );
        }
        return (
            <Marker
                coordinate={coordinate}
                tracksViewChanges={tracksViewChanges}
                opacity={opacity}
                anchor={PIN_ANCHOR}
                image={{ uri: cachedImage }}
                onPress={(e) => { e.stopPropagation(); onPress(post); }}
            />
        );
    }

    // Fallback: inline SVG (web, or while images are still being captured)
    return (
        <Marker
            coordinate={coordinate}
            tracksViewChanges={false}
            opacity={opacity}
            anchor={PIN_ANCHOR}
            onPress={(e) => { e.stopPropagation(); onPress(post); }}
        >
            <View collapsable={false} style={{ width: PIN_RENDER_W, height: PIN_RENDER_H }}>
                <PinVisual
                    emoji={markerEmoji}
                    bgColor={bgColor}
                    isElder={isElder}
                />
            </View>
        </Marker>
    );
});

export default function MapScreen() {
    const currencyStr = useCurrencyString();
    const [isDarkMap, setIsDarkMap] = useState(false);
    const [posts, setPosts] = useState<any[]>([]);
    const mapRef = useRef<any>(null);
    const [currentRegion, setCurrentRegion] = useState({
        latitude: -28.5398, longitude: 153.4996,
        latitudeDelta: 0.0922, longitudeDelta: 0.0421,
    });
    const insets = useSafeAreaInsets();
    const { identity } = useIdentity();

    const params = useLocalSearchParams();

    useFocusEffect(
        useCallback(() => {
            if (params.newPost === 'true') {
                setShowNewPost(true);
                router.setParams({ newPost: '' });
            }
        }, [params.newPost])
    );

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
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showPricingModal, setShowPricingModal] = useState(false);
    const scrollViewRef = useRef<ScrollView>(null);
    const pickerRef = useRef<any>(null);

    // Map UI State
    const [selectedPostPreview, setSelectedPostPreview] = useState<any>(null);
    const [markersReady, setMarkersReady] = useState(false);
    const [clustersReady, setClustersReady] = useState(false);

    // Pre-compute unique marker variants for off-screen capture
    const markerVariants = useMemo(
        () => buildVariantList(posts, CATEGORIES),
        [posts]
    );

    // Pre-compute cluster counts to capture (2 through 99, plus a "99+" variant)
    const clusterCounts = useMemo(
        () => Array.from({ length: 98 }, (_, i) => i + 2),
        []
    );

    // Filter state
    const [mapTypeFilter, setMapTypeFilter] = useState<'all' | 'offers' | 'needs'>('all');
    const [mapCategoryFilter, setMapCategoryFilter] = useState('all');
    const [showMapCategoryPicker, setShowMapCategoryPicker] = useState(false);

    useFocusEffect(
        React.useCallback(() => { 
            loadPosts(); 
        }, [])
    );

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('sync_data_updated', () => loadPosts());
        return () => sub.remove();
    }, []);

    const initialClusterTriggered = useRef(false);

    const loadPosts = async () => {
        try { 
            const p = await getPosts();
            setPosts(p); 
            
            // Workaround for react-native-map-clustering: 
            // Force a microscopic region change to trigger supercluster after initial async data load
            if (p.length > 0 && mapRef.current && !initialClusterTriggered.current) {
                initialClusterTriggered.current = true;
                setTimeout(() => {
                    mapRef.current?.animateToRegion({
                        latitude: currentRegion.latitude,
                        longitude: currentRegion.longitude,
                        latitudeDelta: currentRegion.latitudeDelta + 0.000001,
                        longitudeDelta: currentRegion.longitudeDelta + 0.000001,
                    }, 1);
                }, 500);
            }
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

    const showPricingGuide = () => setShowPricingModal(true);

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

    const renderCluster = (cluster: any) => {
        return <ClusterMarker key={`cluster-${cluster.id}-${clustersReady}`} cluster={cluster} clustersReady={clustersReady} />;
    };

    return (
        <View style={styles.container}>
            {/* Off-screen pin capture layer */}
            {Platform.OS !== 'web' && markerVariants.length > 0 && (
                <MapMarkerManager
                    variants={markerVariants}
                    onReady={() => {
                        console.log('[MapScreen] ✅ All marker images captured!');
                        setMarkersReady(true);
                    }}
                />
            )}
            {/* Off-screen cluster capture layer */}
            {Platform.OS !== 'web' && !clustersReady && (
                <ClusterCaptureManager
                    counts={clusterCounts}
                    onReady={() => {
                        console.log('[MapScreen] ✅ All cluster images captured!');
                        setClustersReady(true);
                    }}
                />
            )}
            <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                customMapStyle={isDarkMap ? darkMapStyle : hidePoisStyle}
                userInterfaceStyle={isDarkMap ? "dark" : "light"}
                showsUserLocation={true}
                onRegionChangeComplete={(r: any) => {
                    setCurrentRegion(r);
                }}
                onPress={(e: any) => {
                    handleMapPress(e);
                    if (selectedPostPreview) setSelectedPostPreview(null);
                }}
                onLongPress={handleMapPress}
                initialRegion={currentRegion}
                renderCluster={renderCluster}
                spiralEnabled={true}
                animationEnabled={false}
                radius={15}
            >
                {posts.filter(p => {
                    if (p.status && p.status !== 'active') return false;
                    if (p.lat == null || p.lng == null) return false;
                    const l1 = Number(p.lat);
                    const l2 = Number(p.lng);
                    if (isNaN(l1) || isNaN(l2)) return false;

                    const pt = (p.type || '').toLowerCase();
                    if (mapTypeFilter === 'offers' && pt !== 'offer') return false;
                    if (mapTypeFilter === 'needs' && pt !== 'need') return false;
                    if (mapCategoryFilter !== 'all' && p.category !== mapCategoryFilter) return false;

                    return true;
                }).map(post => {
                    const catObj = CATEGORIES.find(c => c.id === post.category);
                    const safePost = { ...post, lat: Number(post.lat), lng: Number(post.lng) };
                    const isSelected = selectedPostPreview?.id === post.id;
                    return (
                        <CustomMapMarker
                            key={`${post.id}-${isSelected}-${markersReady}`}
                            coordinate={{ latitude: safePost.lat, longitude: safePost.lng }}
                            post={safePost}
                            catObj={catObj}

                            isSelected={isSelected}
                            onPress={setSelectedPostPreview}
                            markersReady={markersReady}
                        />
                    );
                })}

                {/* Pin drop preview marker */}
                {showNewPost && postLat != null && postLng != null && (
                    <Marker coordinate={{ latitude: postLat, longitude: postLng }} pinColor={postType === 'offer' ? '#10b981' : '#ea580c'} />
                )}
            </MapView>

            {/* Floating Filter Bar */}
            {!showNewPost && !selectedPostPreview && (
                <SafeAreaView style={styles.filterBarWrapper} pointerEvents="box-none">
                    <View style={styles.filterBar}>
                        <Pressable style={[styles.filterChip, mapTypeFilter === 'all' && styles.filterChipActive]} onPress={() => setMapTypeFilter('all')}>
                            <Text style={[styles.filterChipText, mapTypeFilter === 'all' && styles.filterChipTextActive]}>All</Text>
                        </Pressable>
                        <Pressable style={[styles.filterChip, mapTypeFilter === 'offers' && styles.filterChipActiveOffers]} onPress={() => setMapTypeFilter('offers')}>
                            <Text style={[styles.filterChipText, mapTypeFilter === 'offers' && styles.filterChipTextOnGreen]}>Offers</Text>
                        </Pressable>
                        <Pressable style={[styles.filterChip, mapTypeFilter === 'needs' && styles.filterChipActiveNeeds]} onPress={() => setMapTypeFilter('needs')}>
                            <Text style={[styles.filterChipText, mapTypeFilter === 'needs' && styles.filterChipTextOnOrange]}>Needs</Text>
                        </Pressable>
                        <View style={styles.filterDivider} />
                        <Pressable style={[styles.filterChip, mapCategoryFilter !== 'all' && styles.filterChipActive]} onPress={() => setShowMapCategoryPicker(true)}>
                            <Text style={[styles.filterChipText, mapCategoryFilter !== 'all' && styles.filterChipTextActive]}>
                                {mapCategoryFilter === 'all' ? '🏷️ Cat' : `${CATEGORIES.find(c => c.id === mapCategoryFilter)?.emoji || '🏷️'} ▼`}
                            </Text>
                        </Pressable>
                        {/* Clear all icon if filters active */}
                        {(mapTypeFilter !== 'all' || mapCategoryFilter !== 'all') && (
                            <Pressable style={styles.filterClear} onPress={() => { setMapTypeFilter('all'); setMapCategoryFilter('all'); }}>
                                <Text style={styles.filterClearText}>✕</Text>
                            </Pressable>
                        )}
                    </View>
                </SafeAreaView>
            )}

            <CategoryPickerSheet
                visible={showMapCategoryPicker}
                selected={mapCategoryFilter}
                onSelect={(id) => setMapCategoryFilter(id)}
                onClose={() => setShowMapCategoryPicker(false)}
            />

            {/* Map Action FABs - Left Pill */}
            {!showNewPost && !selectedPostPreview && (
                <View style={[styles.fabPill, { bottom: 120, left: 16 }]} pointerEvents="box-none">
                    <TouchableOpacity style={styles.pillBtn} onPress={() => setIsDarkMap(!isDarkMap)}>
                        <Text style={styles.pillBtnEmoji}>{isDarkMap ? '☀️' : '🌙'}</Text>
                    </TouchableOpacity>
                    <View style={styles.pillDivider} />
                    <TouchableOpacity style={styles.pillBtn} onPress={centerOnUser}>
                        <MaterialCommunityIcons name="crosshairs-gps" size={24} color={isDarkMap ? '#e5e7eb' : '#374151'} />
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
                        {selectedPostPreview.photos && selectedPostPreview.photos.length > 0 && selectedPostPreview.photos[0] !== "" ? (
                            <RNImage source={{ uri: selectedPostPreview.photos[0] }} style={styles.previewThumb} />
                        ) : (
                            <View style={[styles.previewThumbPlaceholder, { backgroundColor: selectedPostPreview.type === 'offer' ? '#10b98120' : '#ea580c20' }]}>
                                <Text style={{ fontSize: 36, color: '#000', lineHeight: 44, textAlign: 'center' }}>{CATEGORIES.find(c => c.id === selectedPostPreview.category)?.emoji || '📌'}</Text>
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
                            <Pressable 
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                onPress={() => router.push({ pathname: '/public-profile', params: { publicKey: selectedPostPreview.author_pubkey, callsign: selectedPostPreview.author_callsign || 'Unknown' } })}
                            >
                                <MemberAvatar 
                                    avatarUrl={selectedPostPreview.author_avatar}
                                    pubkey={selectedPostPreview.author_pubkey || ''}
                                    callsign={selectedPostPreview.author_callsign || '?'}
                                    size={20}
                                />
                                <Text style={[styles.previewAuthor, { color: '#10b981' }]} numberOfLines={1}>
                                    {selectedPostPreview.author_callsign || selectedPostPreview.author_pubkey?.slice(0, 6) || 'Unknown'}
                                    {selectedPostPreview.author_energy_cycled && selectedPostPreview.author_energy_cycled >= 10000 ? ' ✨ Elder' : ''}
                                </Text>
                            </Pressable>
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
                        onPress={async () => {
                            const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
                            if (!anchorUrl) {
                                Alert.alert(
                                    'Not Connected',
                                    'You need to connect to a BeanPool community before posting. Go to Settings → Advanced to add a node.',
                                    [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Connect', onPress: () => router.push({ pathname: '/(tabs)/settings', params: { section: 'advanced' } }) }
                                    ]
                                );
                                return;
                            }
                            setShowNewPost(true);
                        }}
                        activeOpacity={0.8}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '400', marginTop: -2 }}>+</Text>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>ADD POST</Text>
                        </View>
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
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
                >
                    <View style={[styles.sheet, { paddingTop: Math.max(insets.top + 10, 20) }]}>
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

                        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingBottom: 40 }}>
                            {/* Type Toggle — colours match map pins */}
                            <View style={styles.typeRow}>
                                <Pressable style={[styles.typeBtn, postType === 'offer' && styles.typeBtnOffer]} onPress={() => setPostType('offer')}>
                                    <Text style={[styles.typeBtnText, postType === 'offer' && styles.typeBtnTextActive]}>🟢 Offer</Text>
                                </Pressable>
                                <Pressable style={[styles.typeBtn, postType === 'need' && styles.typeBtnNeed]} onPress={() => setPostType('need')}>
                                    <Text style={[styles.typeBtnText, postType === 'need' && styles.typeBtnTextActive]}>🟠 Need</Text>
                                </Pressable>
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

                            {/* Category — unified modal picker, full-row tappable on both platforms */}
                            <Text style={styles.sectionLabel}>Category <Text style={styles.requiredStar}>*</Text></Text>
                            <Pressable style={[styles.pickerWrap, fieldBorder('category')]} onPress={() => setShowCategoryModal(true)}>
                                <Text style={[styles.pickerText, postCategory && styles.pickerTextActive]}>
                                    {postCategory ? `${CATEGORIES.find(c => c.id === postCategory)?.emoji} ${CATEGORIES.find(c => c.id === postCategory)?.label}` : 'Select a category...'}
                                </Text>
                                <Text style={styles.pickerArrow}>▼</Text>
                            </Pressable>
                            <Modal visible={showCategoryModal} transparent animationType="slide">
                                <Pressable style={styles.categoryModalOverlay} onPress={() => setShowCategoryModal(false)}>
                                    <View style={styles.categorySheet}>
                                        <View style={styles.categorySheetHeader}>
                                            <Text style={styles.categorySheetTitle}>Select Category</Text>
                                        </View>
                                        <FlatList
                                            data={CATEGORIES}
                                            keyExtractor={c => c.id}
                                            renderItem={({ item: c }) => (
                                                <Pressable
                                                    style={[styles.categoryRow, postCategory === c.id && styles.categoryRowActive]}
                                                    onPress={() => { setPostCategory(c.id); setShowCategoryModal(false); setValidationErrors(prev => { const n = new Set(prev); n.delete('category'); return n; }); }}
                                                >
                                                    <Text style={styles.categoryRowEmoji}>{c.emoji}</Text>
                                                    <Text style={styles.categoryRowLabel}>{c.label}</Text>
                                                    {postCategory === c.id && <Text style={styles.categoryRowCheck}>✓</Text>}
                                                </Pressable>
                                            )}
                                        />
                                    </View>
                                </Pressable>
                            </Modal>

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

                            {/* Price */}
                            <Text style={styles.sectionLabel}>Price <Text style={styles.requiredStar}>*</Text></Text>
                            <View style={styles.priceInputRow}>
                                <TextInput
                                    style={[styles.creditsInputCompact, fieldBorder('credits')]}
                                    placeholder="0"
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
                                <Pressable onPress={showPricingGuide} hitSlop={8} style={styles.tipPill}>
                                    <Text style={styles.tipPillEmoji}>💡</Text>
                                    <Text style={styles.tipPillText}>Pricing tip</Text>
                                </Pressable>
                            </View>

                            {/* Repeatable Toggle */}
                            <Pressable style={styles.repeatableRow} onPress={() => setPostRepeatable(!postRepeatable)}>
                                <View style={[styles.checkbox, postRepeatable && styles.checkboxActive]}>
                                    {postRepeatable && <Text style={styles.checkboxTick}>✓</Text>}
                                </View>
                                <Text style={styles.repeatableText}>🔁 Repeatable — keep listing active for ongoing bookings</Text>
                            </Pressable>
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

            <PricingInfoModal isOpen={showPricingModal} onClose={() => setShowPricingModal(false)} />
        </View>
    );
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    map: { width: '100%', height: '100%' },

    // Floating Filter Bar
    filterBarWrapper: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 90, paddingTop: 100 },
    filterBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.85)', padding: 4, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    filterChipActive: { backgroundColor: '#e5e7eb' },
    filterChipActiveOffers: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#10b981' },
    filterChipActiveNeeds: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#ea580c' },
    filterChipText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
    filterChipTextActive: { color: '#111827', fontWeight: '800' },
    filterChipTextOnGreen: { fontSize: 13, color: '#ffffff', fontWeight: '800' },
    filterChipTextOnOrange: { fontSize: 13, color: '#ffffff', fontWeight: '800' },
    filterDivider: { width: 1, height: 16, backgroundColor: '#d1d5db', marginHorizontal: 4 },
    filterClear: { paddingHorizontal: 8, paddingVertical: 8 },
    filterClearText: { fontSize: 14, color: '#9ca3af', fontWeight: '800' },

    // FAB Pill (Right side)
    fabPill: { position: 'absolute', width: 48, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 24, paddingVertical: 8, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8, zIndex: 100 },
    pillBtn: { width: 48, height: 44, justifyContent: 'center', alignItems: 'center' },
    pillDivider: { width: 32, height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 2 },
    pillBtnEmoji: { fontSize: 20 },
    pillBtnIcon: { fontSize: 22, fontWeight: '300', color: '#374151' },

    // Map Pins — now rendered via UnifiedMapPin (SVG). Legacy styles removed.

    // Map Preview Card
    previewCardWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 150, justifyContent: 'flex-end' },
    previewCardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
    previewCard: { backgroundColor: '#fff', margin: 16, borderRadius: 24, padding: 16, flexDirection: 'row', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 20 },
    previewThumb: { width: 90, height: 90, borderRadius: 16, backgroundColor: '#f3f4f6' },
    previewThumbPlaceholder: { width: 90, height: 90, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    previewInfo: { flex: 1, marginLeft: 16, justifyContent: 'center' },
    previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingRight: 32 },
    previewCategory: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
    previewCredits: { fontSize: 14, fontWeight: '800', color: '#10b981' },
    previewTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 },
    previewAuthor: { fontSize: 14, fontWeight: '500', color: '#6b7280', marginBottom: 12 },
    previewActionBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
    previewActionText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    previewClose: { position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' },
    previewCloseText: { fontSize: 12, fontWeight: '800', color: '#6b7280' },

    // FAB
    fab: { position: 'absolute', bottom: 32, right: 24, backgroundColor: '#ea580c', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 8, zIndex: 100 },

    // Pin drop banner
    pinDropBanner: { position: 'absolute', top: 60, left: 20, right: 20, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', zIndex: 200 },
    pinDropBannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Full-Screen Sheet — LIGHT theme
    sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: SCREEN_HEIGHT * 0.95, zIndex: 500 },
    sheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: SCREEN_HEIGHT * 0.95, flex: 1 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sheetTitle: { color: '#111827', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
    sheetClose: { color: '#9ca3af', fontSize: 24, fontWeight: '300', width: 32, height: 32, textAlign: 'center', lineHeight: 32 },

    // Toast
    toastBanner: { backgroundColor: '#ef4444', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 10, alignItems: 'center' },
    toastText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    // Section labels
    sectionLabel: { color: '#6b7280', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, marginTop: 2 },
    requiredStar: { color: '#ef4444', fontSize: 12 },
    sectionLabelHint: { color: '#9ca3af', fontSize: 11, fontWeight: '500', textTransform: 'none', letterSpacing: 0 },

    // Type toggle — colours match map pins (green offer / orange need)
    typeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center' },
    typeBtnOffer: { backgroundColor: '#10b981', borderColor: '#10b981' },
    typeBtnNeed: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
    typeBtnText: { fontSize: 15, fontWeight: '800', color: '#6b7280' },
    typeBtnTextActive: { color: '#fff' },

    // Category picker
    pickerWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 50, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8, overflow: 'hidden' },
    pickerText: { flex: 1, color: '#9ca3af', fontSize: 15 },
    pickerTextActive: { color: '#111827', fontWeight: '600' },
    pickerArrow: { color: '#6b7280', fontSize: 12 },
    picker: { color: '#111827', height: 50 },

    // Category modal sheet
    categoryModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    categorySheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: 480, paddingBottom: 32 },
    categorySheetHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    categorySheetTitle: { color: '#111827', fontSize: 16, fontWeight: '700', textAlign: 'center' },
    categoryRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: 'transparent' },
    categoryRowActive: { backgroundColor: 'rgba(16,185,129,0.08)' },
    categoryRowEmoji: { fontSize: 20, marginRight: 12 },
    categoryRowLabel: { color: '#111827', fontSize: 15, fontWeight: '600' },
    categoryRowCheck: { marginLeft: 'auto', color: '#10b981', fontWeight: '800' },

    // Title (full-width)
    titleInputFull: { backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 12, color: '#111827', fontSize: 15, marginBottom: 8 },

    // Price label row + tip pill
    priceLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginTop: 2 },
    tipPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a' },
    tipPillEmoji: { fontSize: 13 },
    tipPillText: { fontSize: 11, fontWeight: '800', color: '#92400e', letterSpacing: 0.3 },

    // Price input row
    priceInputRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    creditsInputCompact: { width: 80, backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 10, paddingVertical: 12, color: '#111827', fontSize: 16, fontWeight: '800', textAlign: 'center' },

    // Legacy (unused but kept for safety)
    priceRowCompact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingVertical: 2 },
    priceRow: { flexDirection: 'row', gap: 8, marginBottom: 4, alignItems: 'center' },
    creditsInputWide: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 12, color: '#111827', fontSize: 16, fontWeight: '800' },

    priceTypeBtn: { width: 72, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center', alignItems: 'center' },
    priceTypeBtnText: { color: '#4b5563', fontSize: 13, fontWeight: '700' },
    freeChip: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.08)' },
    freeChipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
    freeChipText: { color: '#059669', fontSize: 13, fontWeight: '800' },
    freeChipTextActive: { color: '#fff' },
    pricingGuideLink: { marginBottom: 12, paddingVertical: 4 },
    pricingGuideLinkText: { color: '#9ca3af', fontSize: 12, fontWeight: '600' },

    // Location (compact chips)
    locationRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    locationChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
    locationChipActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)' },
    locationChipIcon: { fontSize: 16 },
    locationChipLabel: { fontSize: 13, fontWeight: '700', color: '#4b5563' },
    locationConfirmInline: { color: '#10b981', fontSize: 13, fontWeight: '800' },

    // Repeatable
    repeatableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, marginBottom: 6 },
    checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: '#d1d5db', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
    checkboxActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
    checkboxTick: { color: '#fff', fontSize: 14, fontWeight: '800' },
    repeatableText: { flex: 1, color: '#4b5563', fontSize: 13, fontWeight: '500' },

    // Description
    descriptionInput: { backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 10, color: '#111827', fontSize: 15, minHeight: 90, marginBottom: 12 },

    // Photos
    photosRow: { flexDirection: 'row', gap: 10, marginBottom: 4, flexWrap: 'wrap', padding: 4, borderRadius: 14 },
    photoThumb: { width: 60, height: 60, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    photoImg: { width: 60, height: 60, borderRadius: 12 },
    photoRemove: { position: 'absolute', top: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
    photoRemoveText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    photoAdd: { width: 60, height: 60, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
    photoAddIcon: { fontSize: 26 },
    photoCount: { color: '#9ca3af', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },

    // Submit
    submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginBottom: 8, marginTop: 4 },
    submitBtnOffer: { backgroundColor: '#10b981' },
    submitBtnNeed: { backgroundColor: '#ea580c' },
    submitBtnDisabled: { backgroundColor: '#e5e7eb' },
    submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
    submitBtnTextDisabled: { color: '#9ca3af' },
});
