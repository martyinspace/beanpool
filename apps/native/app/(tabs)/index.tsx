import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, Platform, Alert, TouchableOpacity, TextInput, Image } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_DEFAULT } from '../../components/Map';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPosts } from '../../utils/db';

const CATEGORIES = [
    { id: 'food', emoji: '🥕' },
    { id: 'services', emoji: '🤝' },
    { id: 'labour', emoji: '👷' },
    { id: 'tools', emoji: '🛠️' },
    { id: 'goods', emoji: '📦' },
    { id: 'housing', emoji: '🏠' },
    { id: 'transport', emoji: '🚲' },
    { id: 'education', emoji: '📚' },
    { id: 'arts', emoji: '🎨' },
    { id: 'health', emoji: '🌿' },
    { id: 'animals', emoji: '🐾' },
    { id: 'energy', emoji: '☀️' },
    { id: 'general', emoji: '🌱' },
];

// Deep Neon Dark Map Style
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
];

const MapPin = ({ post, author, catObj }: { post: any, author: string, catObj: any }) => {
    const [track, setTrack] = useState(true);
    
    useEffect(() => {
        const timer = setTimeout(() => {
            setTrack(false);
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    const markerColor = post.type === 'need' ? '#d97757' : '#10b981';
    const markerEmoji = catObj?.emoji || (post.type === 'offer' ? '📦' : '❤️');
    const typeLabel = post.type === 'offer' ? 'OFFER' : 'NEED';

    return (
        <Marker 
            coordinate={{ latitude: post.lat, longitude: post.lng }} 
            title={post.title} 
            description={`${author} • ${post.credits} Ʀ`} 
            tracksViewChanges={track}
            anchor={{ x: 0.5, y: 0.5 }}
            onCalloutPress={() => {
                router.push(`/post/${post.id}`);
            }}
        >
            <View style={[styles.pinCircle, { borderColor: markerColor }]}>
                <Text style={styles.pinEmoji}>{markerEmoji}</Text>
                <Text style={[styles.pinText, { color: markerColor }]}>{typeLabel}</Text>
            </View>
        </Marker>
    );
};

export default function MapScreen() {
    const [isDarkMap, setIsDarkMap] = useState(false);
    const [posts, setPosts] = useState<any[]>([]);
    const mapRef = useRef<MapView>(null);
    const insets = useSafeAreaInsets();

    useFocusEffect(
        React.useCallback(() => {
            loadPosts();
        }, [])
    );

    const loadPosts = async () => {
        try {
            const data = await getPosts();
            setPosts(data);
        } catch (e) {
            console.error('Failed to load map points', e);
        }
    };

    useEffect(() => {
        setupCompliancePermissions();
    }, []);

    const setupCompliancePermissions = async () => {
        try {
            if (Platform.OS === 'android') {
                Alert.alert(
                    "Location Required",
                    "BeanPool uses your location exclusively to plot your position on the local community map.",
                    [{ text: "Continue", onPress: async () => await Location.requestForegroundPermissionsAsync() }]
                );
            } else {
                await Location.requestForegroundPermissionsAsync();
            }
        } catch (e) {
            console.error("Compliance initialization skip (Dev Mode):", e);
        }
    };

    const centerOnUser = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            console.log("Warning: Hardware Location Denied by User");
            return;
        }
        
        try {
            const location = await Location.getCurrentPositionAsync({});
            mapRef.current?.animateToRegion({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.02,
            }, 1000);
        } catch (err) {
            console.log("Failed to fetch current location", err);
        }
    };

    return (
        <View style={styles.container}>
            <MapView 
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                customMapStyle={isDarkMap ? darkMapStyle : []}
                userInterfaceStyle={isDarkMap ? "dark" : "light"}
                showsUserLocation={true}
                initialRegion={{
                    latitude: -28.5398, // Initial zoom to Mullumbimby
                    longitude: 153.4996,
                    latitudeDelta: 0.0922,
                    longitudeDelta: 0.0421,
                }}
            >
                {posts.filter(p => typeof p.lat === 'number' && typeof p.lng === 'number').map(post => {
                    const author = post.author_callsign || post.author_pubkey?.slice(0, 6) || 'Unknown';
                    const catObj = CATEGORIES.find(c => c.id === post.category);
                    
                    return (
                        <MapPin key={post.id} post={post} author={author} catObj={catObj} />
                    );
                })}
            </MapView>

            {/* Bottom-Left Controls: Theme Toggle & GPS */}
            <View style={styles.bottomLeftControls} pointerEvents="box-none">
                <TouchableOpacity 
                    style={[styles.mapActionBtn, isDarkMap && styles.mapActionBtnDark]} 
                    onPress={() => setIsDarkMap(!isDarkMap)}
                    activeOpacity={0.8}
                >
                    <MaterialCommunityIcons 
                        name={isDarkMap ? "white-balance-sunny" : "weather-night"} 
                        size={24} 
                        color={isDarkMap ? "#facc15" : "#1f2937"} 
                    />
                </TouchableOpacity>
                
                <TouchableOpacity 
                    style={[styles.mapActionBtn, isDarkMap && styles.mapActionBtnDark]} 
                    onPress={() => centerOnUser()}
                    activeOpacity={0.8}
                >
                    <MaterialCommunityIcons name="crosshairs-gps" size={24} color={isDarkMap ? "#ffffff" : "#1f2937"} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    map: { width: '100%', height: '100%' },
    themeToggleBtn: { position: 'absolute', bottom: 120, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.95)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 },
    topNavOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, elevation: 100 },
    bannerWrapper: { width: '100%', backgroundColor: 'rgba(255,255,255,0.95)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, overflow: 'hidden' },
    pwaHeaderContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: 'transparent' },
    headerLeft: { flex: 1, alignItems: 'flex-start' },
    headerCenter: { flex: 2, alignItems: 'center', justifyContent: 'center' },
    headerRightControls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', height: 32, overflow: 'hidden' },
    controlPillBtn: { paddingHorizontal: 12, height: '100%', justifyContent: 'center', alignItems: 'center' },
    logoBadge: { backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    logoText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13, letterSpacing: 1.5, textTransform: 'lowercase' },
    logoHighlight: { color: '#e2725b' },
    dashboardContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 24, paddingHorizontal: 16, height: 44, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: '#e5e7eb' },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#1f2937' },
    filterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    collapsibleFilterPanel: { backgroundColor: 'rgba(249,250,251,0.95)', borderRadius: 24, borderWidth: 1, borderColor: '#e5e7eb', padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
    bottomLeftControls: { position: 'absolute', bottom: 120, left: 16, gap: 12, zIndex: 100, elevation: 100 },
    mapActionBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 5,
    },
    mapActionBtnDark: {
        backgroundColor: '#1f2937'
    },
    pinCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderWidth: 3,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    pinEmoji: {
        fontSize: 18,
        lineHeight: 20,
    },
    pinText: {
        fontSize: 8,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: -0.5,
        marginTop: -3,
    },
    pillContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    pill: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    pillActive: {
        backgroundColor: '#8b5cf6',
        borderColor: '#7c3aed'
    },
    pillText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4b5563'
    },
    pillTextActive: {
        color: '#ffffff'
    }
});
