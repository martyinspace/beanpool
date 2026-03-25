import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, Platform, Alert, TouchableOpacity, ScrollView, TextInput, Pressable, Switch, KeyboardAvoidingView, Dimensions, Image as RNImage, Keyboard } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { Picker } from '@react-native-picker/picker';
import MapView, { Marker, PROVIDER_DEFAULT } from '../../components/Map';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPosts, createPost } from '../../utils/db';
import { useIdentity } from '../IdentityContext';

const CATEGORIES = [
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

const MapPin = ({ post, author, catObj }: { post: any, author: string, catObj: any }) => {
    const [track, setTrack] = useState(true);
    useEffect(() => { const t = setTimeout(() => setTrack(false), 500); return () => clearTimeout(t); }, []);

    const isOffer = post.type === 'offer';
    const markerColor = isOffer ? '#10b981' : '#d97757';
    const markerEmoji = catObj?.emoji || (isOffer ? '📦' : '❤️');

    return (
        <Marker
            coordinate={{ latitude: post.lat, longitude: post.lng }}
            title={post.title}
            description={`${author} • ${post.credits} Ʀ`}
            tracksViewChanges={track}
            anchor={{ x: 0.5, y: 1 }}
        >
            <View style={styles.pinContainer}>
                <View style={[styles.pinCircle, { borderColor: markerColor }]}>
                    <Text style={styles.pinEmoji}>{markerEmoji}</Text>
                </View>
                <View style={[styles.pinArrow, { borderTopColor: markerColor }]} />
            </View>
        </Marker>
    );
};

export default function MapScreen() {
    const [isDarkMap, setIsDarkMap] = useState(false);
    const [posts, setPosts] = useState<any[]>([]);
    const mapRef = useRef<MapView>(null);
    const insets = useSafeAreaInsets();
    const { identity } = useIdentity();

    // New Post state
    const [showNewPost, setShowNewPost] = useState(false);
    const [postType, setPostType] = useState<'offer' | 'need'>('offer');
    const [postCategory, setPostCategory] = useState('general');
    const [postTitle, setPostTitle] = useState('');
    const [postDescription, setPostDescription] = useState('');
    const [postCredits, setPostCredits] = useState('');
    const [postPriceType, setPostPriceType] = useState<'fixed' | 'hourly'>('fixed');
    const [postRepeatable, setPostRepeatable] = useState(false);
    const [postPhotos, setPostPhotos] = useState<string[]>([]);
    const [postLat, setPostLat] = useState<number | null>(null);
    const [postLng, setPostLng] = useState<number | null>(null);
    const [pinDropMode, setPinDropMode] = useState(false);
    const [posting, setPosting] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

    useFocusEffect(
        React.useCallback(() => { loadPosts(); }, [])
    );

    const loadPosts = async () => {
        try { setPosts(await getPosts()); } catch (e) { console.error('Failed to load map points', e); }
    };

    useEffect(() => { setupCompliancePermissions(); }, []);

    const setupCompliancePermissions = async () => {
        try {
            if (Platform.OS === 'android') {
                Alert.alert("Location Required", "BeanPool uses your location to plot your position on the local community map.",
                    [{ text: "Continue", onPress: async () => await Location.requestForegroundPermissionsAsync() }]);
            } else {
                await Location.requestForegroundPermissionsAsync();
            }
        } catch (e) { console.error("Compliance initialization skip (Dev Mode):", e); }
    };

    const centerOnUser = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
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
        setPostType('offer'); setPostCategory('general'); setPostTitle(''); setPostDescription('');
        setPostCredits(''); setPostPriceType('fixed'); setPostRepeatable(false); setPostPhotos([]);
        setPostLat(null); setPostLng(null); setPinDropMode(false); setValidationErrors(new Set());
    };

    const useMyLocation = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { Alert.alert("Permission Denied", "Location permission is needed."); return; }
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
                const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
                if (!result.canceled && result.assets[0]?.base64) {
                    setPostPhotos(prev => [...prev, `data:image/jpeg;base64,${result.assets[0].base64}`]);
                }
            }},
            { text: 'Gallery', onPress: async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
                if (!result.canceled && result.assets[0]?.base64) {
                    setPostPhotos(prev => [...prev, `data:image/jpeg;base64,${result.assets[0].base64}`]);
                }
            }},
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const handleSubmit = async () => {
        const errors = new Set<string>();
        if (!postTitle.trim()) errors.add('title');
        if (postCredits.trim() === '' || isNaN(Number(postCredits))) errors.add('credits');
        if (!postDescription.trim()) errors.add('description');
        if (postLat == null || postLng == null) errors.add('location');
        setValidationErrors(errors);
        if (errors.size > 0) return;

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
            resetNewPost();
            setShowNewPost(false);
            loadPosts();
        } catch (e: any) {
            console.error(e);
            Alert.alert("Error", e.message || "Could not publish post.");
        }
        setPosting(false);
    };

    const fieldBorder = (field: string) => validationErrors.has(field) ? { borderColor: '#ef4444', borderWidth: 2, shadowColor: '#ef4444', shadowOpacity: 0.3, shadowRadius: 6 } : {};

    // Smart button label
    const submitLabel = posting ? 'Posting...'
        : (postLat == null) ? '📍 Set a location'
        : (!postTitle.trim() || !postDescription.trim() || postCredits === '') ? '✏️ Fill required fields'
        : `Post ${postType === 'offer' ? 'Offer' : 'Need'}`;
    const submitDisabled = posting || postLat == null || !postTitle.trim() || !postDescription.trim() || postCredits === '';

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                customMapStyle={isDarkMap ? darkMapStyle : hidePoisStyle}
                userInterfaceStyle={isDarkMap ? "dark" : "light"}
                showsUserLocation={true}
                onPress={handleMapPress}
                initialRegion={{
                    latitude: -28.5398, longitude: 153.4996,
                    latitudeDelta: 0.0922, longitudeDelta: 0.0421,
                }}
            >
                {posts.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number').map(post => {
                    const author = post.author_callsign || post.author_pubkey?.slice(0, 6) || 'Unknown';
                    const catObj = CATEGORIES.find(c => c.id === post.category);
                    return <MapPin key={post.id} post={post} author={author} catObj={catObj} />;
                })}

                {/* Pin drop preview marker */}
                {pinDropMode && postLat != null && postLng != null && (
                    <Marker coordinate={{ latitude: postLat, longitude: postLng }} anchor={{ x: 0.5, y: 0.8 }}>
                        <Text style={{ fontSize: 42 }}>📍</Text>
                    </Marker>
                )}
            </MapView>

            {/* Bottom-Left Controls */}
            <View style={styles.bottomLeftControls} pointerEvents="box-none">
                <TouchableOpacity style={[styles.mapActionBtn, isDarkMap && styles.mapActionBtnDark]} onPress={() => setIsDarkMap(!isDarkMap)} activeOpacity={0.8}>
                    <Text style={{ fontSize: 22 }}>{isDarkMap ? '☀️' : '🌙'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mapActionBtn, isDarkMap && styles.mapActionBtnDark]} onPress={centerOnUser} activeOpacity={0.8}>
                    <Text style={[{ fontSize: 20, fontWeight: '300' }, isDarkMap && { color: '#e5e7eb' }]}>⌖</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.zoomBtn, isDarkMap && styles.zoomBtnDark]}
                    onPress={() => { mapRef.current?.getCamera().then(cam => { if (cam) mapRef.current?.animateCamera({ ...cam, zoom: (cam.zoom || 10) + 1 }, { duration: 300 }); }); }}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.zoomBtnText, isDarkMap && styles.zoomBtnTextDark]}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.zoomBtn, isDarkMap && styles.zoomBtnDark]}
                    onPress={() => { mapRef.current?.getCamera().then(cam => { if (cam) mapRef.current?.animateCamera({ ...cam, zoom: Math.max((cam.zoom || 10) - 1, 1) }, { duration: 300 }); }); }}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.zoomBtnText, isDarkMap && styles.zoomBtnTextDark]}>−</Text>
                </TouchableOpacity>
            </View>

            {/* FAB — New Post Button */}
            {!showNewPost && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => setShowNewPost(true)}
                    activeOpacity={0.8}
                >
                    <Text style={styles.fabText}>+</Text>
                </TouchableOpacity>
            )}

            {/* Pin drop mode instruction */}
            {pinDropMode && showNewPost && postLat == null && (
                <View style={styles.pinDropBanner}>
                    <Text style={styles.pinDropBannerText}>📌 Tap the map to place your pin</Text>
                </View>
            )}

            {/* New Post Bottom Sheet */}
            {showNewPost && (
                <View style={[StyleSheet.absoluteFill, { zIndex: 500 }]} pointerEvents="box-none">
                    <KeyboardAvoidingView
                        behavior="padding"
                        style={{ flex: 1, justifyContent: 'flex-end' }}
                        pointerEvents="box-none"
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
                    >
                        <View style={styles.sheet}>
                        {/* Header */}
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>New Post</Text>
                            <Pressable onPress={() => { setShowNewPost(false); resetNewPost(); }} hitSlop={12}>
                                <Text style={styles.sheetClose}>✕</Text>
                            </Pressable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                            <View style={[styles.pickerWrap, fieldBorder('category')]}>
                                <Picker
                                    selectedValue={postCategory}
                                    onValueChange={v => setPostCategory(v)}
                                    style={styles.picker}
                                    dropdownIconColor="#6b7280"
                                >
                                    {CATEGORIES.map(c => (
                                        <Picker.Item key={c.id} label={`${c.emoji} ${c.label}`} value={c.id} />
                                    ))}
                                </Picker>
                            </View>

                            {/* Location Buttons */}
                            <View style={styles.locationRow}>
                                <Pressable
                                    style={[styles.locationBtn, postLat != null && !pinDropMode && styles.locationBtnActive, fieldBorder('location')]}
                                    onPress={useMyLocation}
                                >
                                    <Text style={styles.locationBtnIcon}>📍</Text>
                                    <Text style={styles.locationBtnLabel}>My location</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.locationBtn, pinDropMode && styles.locationBtnPinDrop, fieldBorder('location')]}
                                    onPress={enterPinDrop}
                                >
                                    <Text style={styles.locationBtnIcon}>📌</Text>
                                    <Text style={styles.locationBtnLabel}>Drop a pin</Text>
                                </Pressable>
                            </View>
                            {postLat != null && postLng != null && (
                                <Text style={styles.locationConfirm}>✓ Location set</Text>
                            )}

                            {/* Title + Credits Row */}
                            <View style={styles.titleCreditsRow}>
                                <TextInput
                                    style={[styles.titleInput, fieldBorder('title')]}
                                    placeholder="What do you need/offer?"
                                    placeholderTextColor="#9ca3af"
                                    value={postTitle}
                                    onChangeText={v => { setPostTitle(v); setValidationErrors(prev => { const n = new Set(prev); n.delete('title'); return n; }); }}
                                    maxLength={50}
                                />
                                <TextInput
                                    style={[styles.creditsInput, fieldBorder('credits')]}
                                    placeholder="B"
                                    placeholderTextColor="#9ca3af"
                                    keyboardType="numeric"
                                    value={postCredits}
                                    onChangeText={v => { setPostCredits(v); setValidationErrors(prev => { const n = new Set(prev); n.delete('credits'); return n; }); }}
                                    maxLength={5}
                                />
                                <View style={styles.priceTypeWrap}>
                                    <Pressable onPress={() => setPostPriceType(postPriceType === 'fixed' ? 'hourly' : 'fixed')} style={styles.priceTypeBtn}>
                                        <Text style={styles.priceTypeBtnText}>{postPriceType === 'fixed' ? 'Total' : '/ Hr'}</Text>
                                    </Pressable>
                                </View>
                            </View>

                            {/* Repeatable Toggle */}
                            <Pressable style={styles.repeatableRow} onPress={() => setPostRepeatable(!postRepeatable)}>
                                <View style={[styles.checkbox, postRepeatable && styles.checkboxActive]}>
                                    {postRepeatable && <Text style={styles.checkboxTick}>✓</Text>}
                                </View>
                                <Text style={styles.repeatableText}>🔁 Repeatable — keep listing active for ongoing bookings</Text>
                            </Pressable>

                            {/* Description */}
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
                            <View style={styles.photosRow}>
                                {postPhotos.map((uri, i) => (
                                    <View key={i} style={styles.photoThumb}>
                                        <RNImage source={{ uri }} style={styles.photoImg} />
                                        <Pressable style={styles.photoRemove} onPress={() => setPostPhotos(prev => prev.filter((_, j) => j !== i))}>
                                            <Text style={styles.photoRemoveText}>✕</Text>
                                        </Pressable>
                                    </View>
                                ))}
                                {postPhotos.length < 3 && (
                                    <Pressable style={styles.photoAdd} onPress={pickPhoto}>
                                        <Text style={styles.photoAddIcon}>📷</Text>
                                    </Pressable>
                                )}
                            </View>
                            <Text style={styles.photoCount}>{postPhotos.length}/3 photos {postPhotos.length === 0 ? '(optional)' : ''}</Text>

                            {/* Submit */}
                            <Pressable
                                style={[styles.submitBtn, submitDisabled ? styles.submitBtnDisabled : (postType === 'offer' ? styles.submitBtnOffer : styles.submitBtnNeed)]}
                                onPress={handleSubmit}
                                disabled={submitDisabled}
                            >
                                <Text style={[styles.submitBtnText, submitDisabled && styles.submitBtnTextDisabled]}>{submitLabel}</Text>
                            </Pressable>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
                </View>
            )}
        </View>
    );
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    map: { width: '100%', height: '100%' },
    bottomLeftControls: { position: 'absolute', bottom: 120, left: 16, gap: 12, zIndex: 100 },
    mapActionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 5 },
    mapActionBtnDark: { backgroundColor: '#1f2937' },

    // Zoom Controls
    zoomBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 4 },
    zoomBtnDark: { backgroundColor: '#1f2937' },
    zoomBtnText: { fontSize: 22, fontWeight: '300', color: '#374151', lineHeight: 26 },
    zoomBtnTextDark: { color: '#e5e7eb' },

    // Map Pins
    pinContainer: { width: 40, height: 48, alignItems: 'center', justifyContent: 'flex-start' },
    pinCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
    pinEmoji: { fontSize: 18 },
    pinArrow: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },

    // FAB
    fab: { position: 'absolute', bottom: 120, right: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: '#d97757', justifyContent: 'center', alignItems: 'center', shadowColor: '#d97757', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8, zIndex: 100 },
    fabText: { color: '#fff', fontSize: 32, fontWeight: '300', marginTop: -2 },

    // Pin drop banner
    pinDropBanner: { position: 'absolute', top: 60, left: 20, right: 20, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', zIndex: 200 },
    pinDropBannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Bottom Sheet
    sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: SCREEN_HEIGHT * 0.58, zIndex: 500 },
    sheet: { backgroundColor: 'rgba(42, 50, 42, 0.95)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: SCREEN_HEIGHT * 0.58 },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
    sheetClose: { color: 'rgba(255,255,255,0.5)', fontSize: 24, fontWeight: '300', width: 32, height: 32, textAlign: 'center', lineHeight: 32 },

    // Type toggle
    typeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    typeBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
    typeBtnOffer: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    typeBtnNeed: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
    typeBtnText: { fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.6)' },
    typeBtnTextActive: { color: '#fff' },

    // Category picker
    pickerWrap: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', marginBottom: 12, overflow: 'hidden' },
    picker: { color: '#fff', height: 50 },

    // Location
    locationRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
    locationBtn: { flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)' },
    locationBtnActive: { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)' },
    locationBtnPinDrop: { borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)' },
    locationBtnIcon: { fontSize: 22, marginBottom: 2 },
    locationBtnLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    locationConfirm: { textAlign: 'center', color: '#10b981', fontSize: 13, fontWeight: '700', marginBottom: 8 },

    // Title + Credits
    titleCreditsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    titleInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15 },
    creditsInput: { width: 60, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 12, color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
    priceTypeWrap: {},
    priceTypeBtn: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center' },
    priceTypeBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },

    // Repeatable
    repeatableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 10 },
    checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
    checkboxActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    checkboxTick: { color: '#fff', fontSize: 14, fontWeight: '800' },
    repeatableText: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },

    // Description
    descriptionInput: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, minHeight: 80, marginBottom: 12 },

    // Photos
    photosRow: { flexDirection: 'row', gap: 10, marginBottom: 4, flexWrap: 'wrap' },
    photoThumb: { width: 60, height: 60, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    photoImg: { width: 60, height: 60, borderRadius: 12 },
    photoRemove: { position: 'absolute', top: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
    photoRemoveText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    photoAdd: { width: 60, height: 60, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
    photoAddIcon: { fontSize: 26 },
    photoCount: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

    // Submit
    submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginBottom: 8 },
    submitBtnOffer: { backgroundColor: '#10b981' },
    submitBtnNeed: { backgroundColor: '#ea580c' },
    submitBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.1)' },
    submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
    submitBtnTextDisabled: { color: 'rgba(255,255,255,0.4)' },
});
