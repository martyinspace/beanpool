/**
 * MapPage — Community Map with Leaflet/OSM
 *
 * Matches the Lattice Sovereign Wallet map design:
 *  - Light mode (default) with CSS invert for dark mode
 *  - Zoom controls (+/-) positioned bottom-left
 *  - GPS crosshair button for current location
 *  - Marketplace post pins with category emoji
 *  - User location marker (pulsing purple dot)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { BeanPoolIdentity } from '../lib/identity';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMarketplacePosts, createMarketplacePost, getNodeInfo, getRemotePosts, getNodeConfig, type MarketplacePost } from '../lib/api';
import { haversineDistance } from '../lib/geo';
import { MARKETPLACE_CATEGORIES, POST_TYPE_COLORS } from '../lib/marketplace';
import { loadEnabledPeers } from '../lib/peer-prefs';

// Simple deterministic hash for consistent pin placement
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

// Default to Mullumbimby, Australia
const DEFAULT_CENTER: [number, number] = [-28.5495, 153.5005];
const DEFAULT_ZOOM = 13;

interface Props {
    identity: BeanPoolIdentity;
    openNewPost?: boolean;
    onOpenNewPostHandled?: () => void;
    onNavigate?: (tab: string, contextId?: string) => void;
}

export function MapPage({ identity, openNewPost, onOpenNewPostHandled, onNavigate }: Props) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.LayerGroup | null>(null);
    const userMarkerRef = useRef<L.Marker | null>(null);
    const radiusCircleRef = useRef<L.Circle | null>(null);

    const [isDark, setIsDark] = useState(false); // Light mode by default
    const [locating, setLocating] = useState(false);
    const [posts, setPosts] = useState<MarketplacePost[]>([]);
    const [showNewPost, setShowNewPost] = useState(false);
    const [newPostType, setNewPostType] = useState<'offer' | 'need'>('need');
    const [newPostCategory, setNewPostCategory] = useState('general');
    const [newPostTitle, setNewPostTitle] = useState('');
    const [newPostDescription, setNewPostDescription] = useState('');
    const [newPostCredits, setNewPostCredits] = useState('');
    const [newPostPriceType, setNewPostPriceType] = useState<'fixed' | 'hourly' | 'daily' | 'weekly' | 'monthly'>('fixed');
    const [newPostRepeatable, setNewPostRepeatable] = useState(false);
    const [newPostPhotos, setNewPostPhotos] = useState<string[]>([]);
    const [posting, setPosting] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
    const [postLat, setPostLat] = useState<number | null>(null);
    const [postLng, setPostLng] = useState<number | null>(null);
    const [pinDropMode, setPinDropMode] = useState(false);
    const pinDropMarkerRef = useRef<L.Marker | null>(null);
    const [nodeRadius, setNodeRadius] = useState<{lat: number, lng: number, radiusKm: number} | null>(null);

    // Auto-open post form when navigated from marketplace
    useEffect(() => {
        if (openNewPost) {
            setShowNewPost(true);
            onOpenNewPostHandled?.();
        }
    }, [openNewPost, onOpenNewPostHandled]);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || mapRef.current) return;

        const map = L.map(mapContainer.current, {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false, // We add custom controls
            attributionControl: false,
        });

        // OSM tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
        }).addTo(map);

        // Zoom control top-right (avoids bottom nav bar & custom FABs)
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Attribution bottom-right (small)
        L.control.attribution({ position: 'bottomright', prefix: false })
            .addAttribution('© <a href="https://openstreetmap.org">OSM</a>')
            .addTo(map);

        // Markers layer
        markersRef.current = L.layerGroup().addTo(map);

        mapRef.current = map;

        // Light mode by default — no filter needed

        // We specifically DO NOT request location on init here anymore
        // map.locate({ setView: false });
        // map.on('locationfound', (e) => {
        //     setUserMarker(map, e.latlng);
        // });

        // Event delegation for popup "View in Market" buttons
        const container = mapContainer.current;
        const handlePopupClick = (e: MouseEvent) => {
            const btn = (e.target as HTMLElement).closest('[data-navigate]') as HTMLElement | null;
            if (btn && onNavigate) {
                onNavigate(btn.dataset.navigate!, btn.dataset.contextid);
            }
        };
        container.addEventListener('click', handlePopupClick);

        // Draw service radius circle from node config
        getNodeConfig().then(config => {
            if (config.serviceRadius && config.serviceRadius.radiusKm > 0 && mapRef.current) {
                setNodeRadius(config.serviceRadius);
                const { lat, lng, radiusKm } = config.serviceRadius;
                if (radiusCircleRef.current) {
                    mapRef.current.removeLayer(radiusCircleRef.current);
                }
                radiusCircleRef.current = L.circle([lat, lng], {
                    radius: radiusKm * 1000,
                    color: '#f59e0b',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.06,
                    weight: 2,
                    dashArray: '8 5',
                    interactive: false,
                }).addTo(mapRef.current);

                // Frame the map around the radius so it touches the edges
                mapRef.current.fitBounds(radiusCircleRef.current.getBounds(), { padding: [10, 10] });
            }
        }).catch(() => {});

        return () => {
            container.removeEventListener('click', handlePopupClick);
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Dark mode toggle
    function applyDarkMode(map: L.Map, dark: boolean) {
        const tilePane = map.getPane('tilePane');
        if (tilePane) {
            tilePane.style.filter = dark ? 'invert(1) hue-rotate(180deg)' : '';
        }
    }

    function toggleDarkMode() {
        const next = !isDark;
        setIsDark(next);
        if (mapRef.current) {
            applyDarkMode(mapRef.current, next);
        }
    }

    function handleLocate() {
        if (!mapRef.current) return;
        setLocating(true);
        
        const map = mapRef.current;
        const onLocationFound = (e: L.LocationEvent) => {
            setUserMarker(map, e.latlng);
            setLocating(false);
            cleanupLocate();
        };
        const onLocationError = () => {
            setLocating(false);
            cleanupLocate();
        };
        function cleanupLocate() {
            map.off('locationfound', onLocationFound);
            map.off('locationerror', onLocationError);
        }

        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);
        map.locate({ setView: true, maxZoom: 16 });
    }

    // User location marker (pulsing purple dot)
    function setUserMarker(map: L.Map, latlng: L.LatLng) {
        if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng(latlng);
            return;
        }
        const icon = L.divIcon({
            className: '',
            html: `<div class="user-marker-pulse"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        });
        userMarkerRef.current = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map);
    }

    // Load marketplace posts (home + enabled peers from localStorage)
    const refreshPosts = useCallback(async () => {
        try {
            const localData = await getMarketplacePosts();
            let allPosts: MarketplacePost[] = [...localData];

            // Only fetch from peers the user has toggled on
            const enabledPeers = loadEnabledPeers();
            if (enabledPeers.size > 0) {
                const nodeInfo = await getNodeInfo('');
                const peersToFetch = (nodeInfo.peerNodes || [])
                    .filter((n: any) => n.publicUrl && enabledPeers.has(n.publicUrl));

                if (peersToFetch.length > 0) {
                    const remoteResults = await Promise.allSettled(
                        peersToFetch.map(async (n: any) => {
                            const remotePosts = await getRemotePosts(n.publicUrl);
                            return remotePosts.map((p: any) => ({ ...p, _remoteNode: n.publicUrl, _remoteCallsign: n.callsign }));
                        })
                    );
                    for (const result of remoteResults) {
                        if (result.status === 'fulfilled') allPosts = allPosts.concat(result.value);
                    }
                }
            }
            setPosts(allPosts);
        } catch { /* offline */ }
    }, []);

    useEffect(() => {
        refreshPosts();
        const interval = setInterval(refreshPosts, 30_000);
        return () => clearInterval(interval);
    }, [refreshPosts]);

    // Create a new post from the map
    async function handleCreatePost() {
        // Validate all fields
        const errors = new Set<string>();
        if (!newPostTitle.trim()) errors.add('title');
        if (newPostCredits.trim() === '' || isNaN(Number(newPostCredits)) || Number(newPostCredits) < 0) errors.add('credits');
        if (!newPostDescription.trim()) errors.add('description');
        if (postLat == null || postLng == null) errors.add('location');
        setValidationErrors(errors);
        if (errors.size > 0) return;

        if (nodeRadius && postLat != null && postLng != null) {
            const dist = haversineDistance(postLat, postLng, nodeRadius.lat, nodeRadius.lng);
            if (dist > nodeRadius.radiusKm) {
                const proceed = window.confirm(`This listing is ${Math.round(dist)}km away, which is outside your community's ${nodeRadius.radiusKm}km service area. Are you sure you want to post it here?`);
                if (!proceed) return;
            }
        }

        setPosting(true);
        try {
            await createMarketplacePost({
                type: newPostType,
                category: newPostCategory,
                title: newPostTitle.trim(),
                description: newPostDescription.trim(),
                credits: Number(newPostCredits) || 0,
                priceType: newPostPriceType,
                authorPublicKey: identity.publicKey || '',
                repeatable: newPostRepeatable,
                ...(postLat != null && postLng != null ? { lat: postLat, lng: postLng } : {}),
                ...(newPostPhotos.length > 0 ? { photos: newPostPhotos } : {}),
            });
            setNewPostTitle('');
            setNewPostDescription('');
            setNewPostCredits('');
            setNewPostPriceType('fixed');
            setNewPostRepeatable(false);
            setNewPostPhotos([]);
            setPostLat(null);
            setPostLng(null);
            setPinDropMode(false);
            if (pinDropMarkerRef.current) {
                pinDropMarkerRef.current.remove();
                pinDropMarkerRef.current = null;
            }
            setShowNewPost(false);
            refreshPosts();
            if (onNavigate) onNavigate('marketplace', 'deals_active');
        } catch (e: any) {
            alert(e.message || 'Failed to create post. Are you offline?');
        }
        setPosting(false);
    }

    // Use current GPS location for the post
    function useMyLocation() {
        if (!mapRef.current) return;

        const map = mapRef.current;
        const onLocationFound = (e: L.LocationEvent) => {
            setPostLat(Math.round(e.latlng.lat * 10000) / 10000);
            setPostLng(Math.round(e.latlng.lng * 10000) / 10000);
            setPinDropMode(false);
            // Place preview pin
            placePreviewPin(e.latlng.lat, e.latlng.lng);
            cleanupLocate();
        };
        const onLocationError = () => {
            // Fall back to pin drop
            setPinDropMode(true);
            cleanupLocate();
        };
        function cleanupLocate() {
            map.off('locationfound', onLocationFound);
            map.off('locationerror', onLocationError);
        }

        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);
        map.locate({ setView: false, maxZoom: 16 });
    }

    // Enter pin-drop mode — tap map to place location
    function enterPinDrop() {
        setPinDropMode(true);
        setPostLat(null);
        setPostLng(null);
        if (pinDropMarkerRef.current) {
            pinDropMarkerRef.current.remove();
            pinDropMarkerRef.current = null;
        }
    }

    // Place a preview pin on the map
    function placePreviewPin(lat: number, lng: number) {
        if (!mapRef.current) return;
        if (pinDropMarkerRef.current) {
            pinDropMarkerRef.current.setLatLng([lat, lng]);
        } else {
            const icon = L.divIcon({
                className: 'custom-preview-pin',
                html: `
                <div style="position: relative; width: 36px; height: 46px; display: flex; flex-direction: column; align-items: center; opacity: 0.8;">
                    <div style="
                        width: 36px; height: 36px; border-radius: 50%;
                        background: #fff; border: 3px dashed #d97757;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                        z-index: 2; box-sizing: border-box;
                    "></div>
                    <div style="
                        width: 0; height: 0;
                        border-left: 6px solid transparent;
                        border-right: 6px solid transparent;
                        border-top: 10px solid #d97757;
                        margin-top: -2px; z-index: 1;
                    "></div>
                </div>`,
                iconSize: [36, 46],
                iconAnchor: [18, 46],
            });
            pinDropMarkerRef.current = L.marker([lat, lng], { icon }).addTo(mapRef.current);
        }
    }

    // Listen for map clicks in pin-drop mode
    useEffect(() => {
        if (!mapRef.current) return;
        const map = mapRef.current;
        function onMapClick(e: L.LeafletMouseEvent) {
            if (!pinDropMode) return;
            const lat = Math.round(e.latlng.lat * 10000) / 10000;
            const lng = Math.round(e.latlng.lng * 10000) / 10000;
            setPostLat(lat);
            setPostLng(lng);
            placePreviewPin(lat, lng);
        }
        map.on('click', onMapClick);
        return () => { map.off('click', onMapClick); };
    }, [pinDropMode]);

    // Render marketplace post pins on the map
    useEffect(() => {
        if (!markersRef.current || !mapRef.current) return;
        markersRef.current.clearLayers();

        posts.filter(post => !post.status || post.status === 'active').forEach((post) => {
            const cat = MARKETPLACE_CATEGORIES.find(c => c.id === post.category);
            const emoji = cat?.emoji || '📌';
            const typeColor = POST_TYPE_COLORS[post.type] || '#888';
            const isRemote = !!(post as any)._remoteNode;
            const remoteCallsign = (post as any)._remoteCallsign || '';
            // Remote pins get indigo border; local pins get type color
            const borderColor = isRemote ? '#6366f1' : typeColor;

            // Use real coordinates if available, otherwise deterministic fallback
            let lat: number, lng: number;
            if (post.lat != null && post.lng != null) {
                lat = post.lat;
                lng = post.lng;
            } else {
                const hash = simpleHash(post.id || post.title);
                lat = DEFAULT_CENTER[0] + ((hash % 1000) - 500) * 0.00004;
                lng = DEFAULT_CENTER[1] + ((Math.floor(hash / 1000) % 1000) - 500) * 0.00004;
            }

            const typeLabel = post.type === 'offer' ? 'Offer' : 'Need';
            const icon = L.divIcon({
                className: 'custom-map-pin hover:scale-110 transition-transform origin-bottom',
                html: `
                <div style="position: relative; width: 44px; height: 56px; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15));">
                    <div style="
                        width: 44px; height: 44px; border-radius: 50%;
                        background: rgba(255,255,255,0.95); border: 3px solid ${borderColor};
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        box-sizing: border-box; z-index: 2; position: relative;
                    ">
                        <span style="font-size: 18px; line-height: 1.1;">${emoji}</span>
                        <span style="font-size: 8px; font-weight: 800; color: ${borderColor}; text-transform: uppercase; letter-spacing: -0.5px; opacity: 0.9; margin-top: -2px;">${typeLabel}</span>
                    </div>
                    <div style="
                        width: 0; height: 0;
                        border-left: 8px solid transparent;
                        border-right: 8px solid transparent;
                        border-top: 12px solid ${borderColor};
                        margin-top: -3px; z-index: 1; position: relative;
                    "></div>
                </div>`,
                iconSize: [44, 56],
                iconAnchor: [22, 56],
                popupAnchor: [0, -50]
            });
            const nodeBadge = isRemote
                ? `<span style="display:inline-block;font-size:0.65em;background:rgba(99,102,241,0.2);color:#818cf8;padding:1px 5px;border-radius:9px;margin-left:4px;">🌐 ${remoteCallsign}</span>`
                : '';

            const marker = L.marker([lat, lng], { icon });
            marker.bindPopup(`
                <div style="font-family: -apple-system, sans-serif; min-width: 160px;">
                    <p style="font-weight: 700; margin: 0 0 4px;">${emoji} ${post.title}${nodeBadge}</p>
                    <p style="margin: 0 0 4px; color: #666; font-size: 0.85em;">${post.description || ''}</p>
                    <p style="margin: 0; font-weight: 600; color: ${typeColor};">
                        ${post.type === 'offer' ? '🔵 Offer' : '🟠 Need'} · ${post.credits}B
                    </p>
                    <p style="margin: 4px 0 0; color: #888; font-size: 0.8em;">by ${post.authorCallsign}</p>
                    <button data-navigate="marketplace" data-contextid="${post.id}" style="
                        margin-top: 8px; width: 100%; padding: 6px 10px;
                        border-radius: 6px; border: none;
                        background: #2563eb; color: #fff;
                        font-size: 0.85em; font-weight: 600;
                        cursor: pointer; font-family: inherit;
                    ">View in Market →</button>
                </div>
            `);
            marker.addTo(markersRef.current!);
        });
    }, [posts]);

    return (
        <>
        <div className="relative w-full h-full">
            {/* Map custom styles overrides for glassmorphism and Earth-tone palettes */}
            <style>{`
                .leaflet-container {
                    z-index: 0 !important;
                }
                .leaflet-top {
                    top: 70px !important;
                }
                .user-marker-pulse {
                    width: 18px; height: 18px;
                    background: rgba(16, 185, 129, 0.9); /* emerald-500 */
                    border: 2px solid #fff;
                    border-radius: 50%;
                    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
                    animation: pulse 2s ease-out infinite;
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
                    100% { box-shadow: 0 0 0 16px rgba(16, 185, 129, 0); }
                }
                .leaflet-control-zoom a {
                    background: rgba(255, 255, 255, 0.9) !important;
                    color: #4b5563 !important; /* text-nature-600 */
                    border-color: #e5e7eb !important; /* border-nature-200 */
                }
                .leaflet-control-zoom a:hover {
                    background: rgba(249, 250, 251, 0.95) !important; /* bg-nature-50 */
                }
                .leaflet-control-attribution {
                    background: rgba(255, 255, 255, 0.7) !important;
                    color: #6b7280 !important; /* text-nature-500 */
                    font-size: 10px !important;
                    border-top-left-radius: 8px;
                }
                .leaflet-control-attribution a {
                    color: #4b5563 !important;
                }
                .leaflet-popup-content-wrapper {
                    background: rgba(255, 255, 255, 0.95) !important;
                    color: #111827 !important; /* text-nature-950 */
                    border-radius: 16px !important;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important; /* shadow-soft */
                    border: 1px solid #e5e7eb !important; /* border-nature-200 */
                }
                .leaflet-popup-tip {
                    background: rgba(255, 255, 255, 0.95) !important;
                }
            `}</style>

            {/* Map container */}
            <div ref={mapContainer} className="w-full h-full" />

            {/* Bottom-left controls: dark mode + GPS */}
            <div className="fixed bottom-[5.5rem] left-3 flex flex-col gap-2 z-[101]">
                {/* Dark/Light map toggle */}
                <button 
                    onClick={toggleDarkMode} 
                    className="w-12 h-12 rounded-2xl bg-white/90 dark:bg-nature-900/90 border border-nature-200 dark:border-nature-700 text-nature-700 dark:text-oat-50 text-xl flex items-center justify-center backdrop-blur-md shadow-soft hover:bg-white dark:hover:bg-nature-800 transition-all transform hover:scale-105"
                    title="Toggle map style"
                    aria-label="Toggle map style"
                >
                    {isDark ? '☀️' : '🌙'}
                </button>

                {/* GPS locate */}
                <button
                    onClick={handleLocate}
                    className={`w-12 h-12 rounded-2xl text-xl flex items-center justify-center backdrop-blur-md shadow-soft transition-all transform hover:scale-105 ${
                        locating 
                            ? 'bg-emerald-100/90 border-2 border-emerald-500 text-emerald-600' 
                            : 'bg-white/90 dark:bg-nature-900/90 border border-nature-200 dark:border-nature-700 text-nature-700 dark:text-oat-50 hover:bg-white dark:hover:bg-nature-800'
                    }`}
                    title="My location"
                    aria-label="My location"
                >
                    {locating ? '⏳' : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <circle cx="12" cy="12" r="4" />
                            <line x1="12" y1="2" x2="12" y2="6" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                            <line x1="2" y1="12" x2="6" y2="12" />
                            <line x1="18" y1="12" x2="22" y2="12" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Floating Add Button — bottom right */}
            {!showNewPost && (
                <button
                    onClick={() => setShowNewPost(true)}
                    className="fixed bottom-[5.5rem] right-3 w-14 h-14 rounded-full bg-terra-500 hover:bg-terra-600 text-white text-3xl font-light z-[101] shadow-[0_8px_30px_rgb(226,114,91,0.4)] flex items-center justify-center transition-transform transform hover:scale-105 border-2 border-white/20"
                    title="New Post"
                    aria-label="New Post"
                >
                    +
                </button>
            )}
        </div>

        {/* Quick Post Panel — rendered OUTSIDE the map div so Leaflet touch handlers don't interfere */}
        {showNewPost && (
            <div className="fixed bottom-[4.5rem] left-3 right-3 max-h-[60vh] overflow-y-auto bg-white/95 dark:bg-nature-900/95 backdrop-blur-xl rounded-3xl p-5 z-[1000] shadow-soft border border-nature-200 dark:border-nature-800 overscroll-contain">
                <div className="flex justify-between items-center mb-4">
                    <span className="font-bold text-lg text-nature-950 dark:text-white tracking-tight">New Post</span>
                    <button onClick={() => {
                        setShowNewPost(false);
                        setPinDropMode(false);
                        setPostLat(null);
                        setPostLng(null);
                        if (pinDropMarkerRef.current) {
                            pinDropMarkerRef.current.remove();
                            pinDropMarkerRef.current = null;
                        }
                    }} className="bg-transparent border-none text-nature-400 hover:text-nature-600 text-2xl cursor-pointer transition-colors leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-nature-50">
                        ✕
                    </button>
                </div>

                {/* Type toggle */}
                <div className="flex gap-2 mb-4">
                    {(['offer', 'need'] as const).map(t => (
                        <button key={t} onClick={() => setNewPostType(t)} className={`flex-1 py-3 rounded-xl border text-[15px] font-bold capitalize transition-all shadow-sm ${
                            newPostType === t
                                ? (t === 'offer' ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-[1.02]' : 'bg-orange-600 border-orange-600 text-white shadow-md scale-[1.02]')
                                : 'bg-white dark:bg-nature-800 border-nature-200 dark:border-nature-700 text-nature-500 dark:text-nature-300 hover:bg-oat-50 dark:hover:bg-nature-700'
                        }`}>
                            {t === 'offer' ? '🔵 Offer' : '🟠 Need'}
                        </button>
                    ))}
                </div>

                {/* Category */}
                <select
                    value={newPostCategory}
                    onChange={e => setNewPostCategory(e.target.value)}
                    className="w-full mb-3 py-3 px-4 rounded-xl border border-nature-200 dark:border-nature-700 bg-white dark:bg-nature-800 text-nature-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm appearance-auto cursor-pointer"
                >
                    {MARKETPLACE_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                    ))}
                </select>

                {/* Location picker */}
                <div className="flex gap-2 mb-2">
                    <button onClick={() => { useMyLocation(); setValidationErrors(prev => { const n = new Set(prev); n.delete('location'); return n; }); }} className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-all text-sm font-bold shadow-sm ${
                        validationErrors.has('location') ? 'border-red-400 bg-red-50 text-red-600 shadow-md ring-1 ring-red-400' 
                        : (postLat != null && !pinDropMode) ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-md ring-1 ring-emerald-500' : 'border-nature-200 dark:border-nature-700 bg-white dark:bg-nature-800 text-nature-600 dark:text-nature-300 hover:bg-nature-50 dark:hover:bg-nature-700'
                    }`}>
                        <span className="text-xl leading-none">📍</span> My location
                    </button>
                    <button onClick={() => { enterPinDrop(); setValidationErrors(prev => { const n = new Set(prev); n.delete('location'); return n; }); }} className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl border transition-all text-sm font-bold shadow-sm ${
                        validationErrors.has('location') ? 'border-red-400 bg-red-50 text-red-600 shadow-md ring-1 ring-red-400' 
                        : pinDropMode ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md ring-1 ring-blue-500' : 'border-nature-200 dark:border-nature-700 bg-white dark:bg-nature-800 text-nature-600 dark:text-nature-300 hover:bg-nature-50 dark:hover:bg-nature-700'
                    }`}>
                        <span className="text-xl leading-none">📌</span> Drop a pin
                    </button>
                </div>
                {pinDropMode && postLat == null && (
                    <p className="m-0 mb-3 text-blue-600 text-sm font-semibold text-center animate-pulse">
                        Tap the map to place your pin
                    </p>
                )}
                {postLat != null && postLng != null && (
                    <p className="m-0 mb-3 text-emerald-600 text-sm font-semibold text-center flex items-center justify-center gap-1">
                        ✓ Location set
                    </p>
                )}

                {/* Title + Credits */}
                <div className="flex gap-2 mb-3">
                    <input
                        placeholder="What do you need/offer?"
                        value={newPostTitle}
                        onChange={e => { setNewPostTitle(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete('title'); return n; }); }}
                        className={`flex-1 py-3 px-4 rounded-xl border bg-white dark:bg-nature-800 text-nature-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm transition-all ${
                            validationErrors.has('title') ? 'border-red-400 bg-red-50 ring-1 ring-red-400' : 'border-nature-200 dark:border-nature-700'
                        }`}
                    />
                    <input
                        placeholder="B"
                        type="number"
                        min="0"
                        step="0.01"
                        value={newPostCredits}
                        onChange={e => { setNewPostCredits(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete('credits'); return n; }); }}
                        className={`w-20 py-3 px-2 rounded-xl border bg-white dark:bg-nature-800 text-nature-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm text-center font-bold tracking-tight transition-all ${
                            validationErrors.has('credits') ? 'border-red-400 bg-red-50 ring-1 ring-red-400' : 'border-nature-200 dark:border-nature-700'
                        }`}
                    />
                    <select
                        value={newPostPriceType}
                        onChange={e => setNewPostPriceType(e.target.value as 'fixed' | 'hourly' | 'daily' | 'weekly' | 'monthly')}
                        className="w-24 py-3 px-2 rounded-xl border bg-white dark:bg-nature-800 text-nature-900 dark:text-white text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm transition-all border-nature-200 dark:border-nature-700 cursor-pointer appearance-auto"
                    >
                        <option value="fixed">Total</option>
                        <option value="hourly">/ Hr</option>
                        <option value="daily">/ Dy</option>
                        <option value="weekly">/ Wk</option>
                        <option value="monthly">/ Mo</option>
                    </select>
                </div>

                {/* Repeatable toggle */}
                <label className="flex items-center gap-3 text-sm font-medium text-nature-700 cursor-pointer py-2 px-1 mb-1">
                    <input
                        type="checkbox"
                        checked={newPostRepeatable}
                        onChange={e => setNewPostRepeatable(e.target.checked)}
                        className="w-5 h-5 rounded border-nature-300 text-blue-600 focus:ring-blue-500 shadow-sm accent-blue-600 cursor-pointer transition-all"
                    />
                    🔁 Repeatable — keep listing active for ongoing bookings
                </label>

                {/* Description */}
                <textarea
                    placeholder="Describe what you need/offer..."
                    value={newPostDescription}
                    onChange={e => { setNewPostDescription(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete('description'); return n; }); }}
                    rows={2}
                    className={`w-full mb-4 py-3 px-4 rounded-xl border bg-white dark:bg-nature-800 text-nature-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-terra-300 shadow-sm min-h-[90px] resize-y transition-all ${
                        validationErrors.has('description') ? 'border-red-400 bg-red-50 ring-1 ring-red-400' : 'border-nature-200 dark:border-nature-700'
                    }`}
                />

                {/* Photos */}
                <div className="mb-5">
                    <div className="flex gap-2 flex-wrap items-center">
                        {newPostPhotos.map((photo, i) => (
                            <div key={i} className="relative">
                                <img src={photo} alt={`photo ${i+1}`} className="w-16 h-16 object-cover rounded-xl border border-nature-200 shadow-sm" />
                                <button
                                    onClick={() => setNewPostPhotos(prev => prev.filter((_, j) => j !== i))}
                                    className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 border-none rounded-full text-white text-[11px] font-bold cursor-pointer flex items-center justify-center shadow-md hover:bg-red-600 transition-colors transform hover:scale-110"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        {newPostPhotos.length < 3 && (
                            <label className="w-16 h-16 rounded-xl border-2 border-dashed border-nature-300 flex items-center justify-center cursor-pointer bg-nature-50 text-2xl text-nature-400 hover:text-nature-500 hover:border-nature-400 hover:bg-oat-50 transition-all shadow-sm">
                                📷
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                            const img = new Image();
                                            img.onload = () => {
                                                const canvas = document.createElement('canvas');
                                                const MAX = 400;
                                                let w = img.width, h = img.height;
                                                if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
                                                else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
                                                canvas.width = w; canvas.height = h;
                                                canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
                                                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                                                setNewPostPhotos(prev => [...prev.slice(0, 2), dataUrl]);
                                            };
                                            img.src = reader.result as string;
                                        };
                                        reader.readAsDataURL(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                        )}
                    </div>
                    <p className="text-xs font-semibold text-nature-400 mt-2 uppercase tracking-wide">
                        {newPostPhotos.length}/3 photos {newPostPhotos.length === 0 ? '(optional)' : ''}
                    </p>
                </div>

                <button
                    onClick={handleCreatePost}
                    disabled={posting || !newPostTitle.trim() || !newPostDescription.trim() || newPostCredits === '' || postLat == null}
                    className={`w-full p-3 rounded-xl font-semibold transition-all ${
                        posting || !newPostTitle.trim() || !newPostDescription.trim() || newPostCredits === '' || postLat == null
                            ? 'bg-oat-200 text-oat-500 cursor-not-allowed'
                            : 'bg-nature-600 text-white hover:bg-nature-700 shadow-md'
                    }`}
                >
                    {posting ? 'Posting...' : 
                     postLat == null ? '📍 Map location required' :
                     !newPostTitle.trim() || !newPostDescription.trim() || newPostCredits === '' ? '✏️ Fill required fields' : 
                     `Post ${newPostType === 'offer' ? 'Offer' : 'Need'}`}
                </button>
            </div>
        )}
    </>
    );
}
