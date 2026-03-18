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
import { getMarketplacePosts, createMarketplacePost, type MarketplacePost } from '../lib/api';
import { MARKETPLACE_CATEGORIES, POST_TYPE_COLORS } from '../lib/marketplace';

// Simple deterministic hash for consistent pin placement
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

// Default to Sydney, Australia
const DEFAULT_CENTER: [number, number] = [-33.8688, 151.2093];
const DEFAULT_ZOOM = 13;

interface Props {
    identity: BeanPoolIdentity;
    openNewPost?: boolean;
    onOpenNewPostHandled?: () => void;
    onNavigate?: (tab: string) => void;
}

export function MapPage({ identity, openNewPost, onOpenNewPostHandled, onNavigate }: Props) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.LayerGroup | null>(null);
    const userMarkerRef = useRef<L.Marker | null>(null);

    const [isDark, setIsDark] = useState(false); // Light mode by default
    const [locating, setLocating] = useState(false);
    const [posts, setPosts] = useState<MarketplacePost[]>([]);
    const [showNewPost, setShowNewPost] = useState(false);
    const [newPostType, setNewPostType] = useState<'offer' | 'need'>('need');
    const [newPostCategory, setNewPostCategory] = useState('general');
    const [newPostTitle, setNewPostTitle] = useState('');
    const [newPostDescription, setNewPostDescription] = useState('');
    const [newPostCredits, setNewPostCredits] = useState('');
    const [newPostPhotos, setNewPostPhotos] = useState<string[]>([]);
    const [posting, setPosting] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
    const [postLat, setPostLat] = useState<number | null>(null);
    const [postLng, setPostLng] = useState<number | null>(null);
    const [pinDropMode, setPinDropMode] = useState(false);
    const pinDropMarkerRef = useRef<L.Marker | null>(null);

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

        // Zoom control bottom-left
        L.control.zoom({ position: 'bottomleft' }).addTo(map);

        // Attribution bottom-right (small)
        L.control.attribution({ position: 'bottomright', prefix: false })
            .addAttribution('© <a href="https://openstreetmap.org">OSM</a>')
            .addTo(map);

        // Markers layer
        markersRef.current = L.layerGroup().addTo(map);

        mapRef.current = map;

        // Light mode by default — no filter needed

        // Try to get user location on init
        map.locate({ setView: true, maxZoom: 15 });
        map.on('locationfound', (e) => {
            setUserMarker(map, e.latlng);
        });

        // Event delegation for popup "View in Market" buttons
        const container = mapContainer.current;
        const handlePopupClick = (e: MouseEvent) => {
            const btn = (e.target as HTMLElement).closest('[data-navigate]') as HTMLElement | null;
            if (btn && onNavigate) {
                onNavigate(btn.dataset.navigate!);
            }
        };
        container.addEventListener('click', handlePopupClick);

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

    // GPS locate
    function handleLocate() {
        if (!mapRef.current) return;
        setLocating(true);
        mapRef.current.locate({ setView: true, maxZoom: 16 });
        mapRef.current.once('locationfound', (e) => {
            setUserMarker(mapRef.current!, e.latlng);
            setLocating(false);
        });
        mapRef.current.once('locationerror', () => {
            setLocating(false);
        });
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

    // Load marketplace posts
    const refreshPosts = useCallback(async () => {
        try {
            const data = await getMarketplacePosts();
            setPosts(data);
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
        if (!newPostCredits || Number(newPostCredits) <= 0) errors.add('credits');
        if (!newPostDescription.trim()) errors.add('description');
        if (postLat == null || postLng == null) errors.add('location');
        setValidationErrors(errors);
        if (errors.size > 0) return;
        setPosting(true);
        try {
            await createMarketplacePost({
                type: newPostType,
                category: newPostCategory,
                title: newPostTitle.trim(),
                description: newPostDescription.trim(),
                credits: Number(newPostCredits) || 0,
                authorPublicKey: identity.publicKey || '',
                ...(postLat != null && postLng != null ? { lat: postLat, lng: postLng } : {}),
                ...(newPostPhotos.length > 0 ? { photos: newPostPhotos } : {}),
            });
            setNewPostTitle('');
            setNewPostDescription('');
            setNewPostCredits('');
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
        } catch { /* offline */ }
        setPosting(false);
    }

    // Use current GPS location for the post
    function useMyLocation() {
        if (!mapRef.current) return;
        mapRef.current.locate({ setView: false, maxZoom: 16 });
        mapRef.current.once('locationfound', (e) => {
            setPostLat(Math.round(e.latlng.lat * 10000) / 10000);
            setPostLng(Math.round(e.latlng.lng * 10000) / 10000);
            setPinDropMode(false);
            // Place preview pin
            placePreviewPin(e.latlng.lat, e.latlng.lng);
        });
        mapRef.current.once('locationerror', () => {
            // Fall back to pin drop
            setPinDropMode(true);
        });
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
                className: '',
                html: `<div style="
                    width: 28px; height: 28px; border-radius: 50%;
                    background: #2563eb; border: 3px solid #fff;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                "></div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
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

        posts.forEach((post) => {
            const cat = MARKETPLACE_CATEGORIES.find(c => c.id === post.category);
            const emoji = cat?.emoji || '📌';
            const color = POST_TYPE_COLORS[post.type] || '#888';

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

            const icon = L.divIcon({
                className: '',
                html: `<div style="
                    width: 32px; height: 32px; border-radius: 50%;
                    background: #1a1a1a; border: 2px solid ${color};
                    display: flex; align-items: center; justify-content: center;
                    font-size: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                ">${emoji}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });

            const marker = L.marker([lat, lng], { icon });
            marker.bindPopup(`
                <div style="font-family: -apple-system, sans-serif; min-width: 160px;">
                    <p style="font-weight: 700; margin: 0 0 4px;">${emoji} ${post.title}</p>
                    <p style="margin: 0 0 4px; color: #666; font-size: 0.85em;">${post.description || ''}</p>
                    <p style="margin: 0; font-weight: 600; color: ${color};">
                        ${post.type === 'offer' ? '🔵 Offer' : '🟠 Need'} · ${post.credits}Ʀ
                    </p>
                    <p style="margin: 4px 0 0; color: #888; font-size: 0.8em;">by ${post.authorCallsign}</p>
                    <button data-navigate="marketplace" style="
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

    // Map control button style
    const mapBtnStyle: React.CSSProperties = {
        width: '48px', height: '48px', borderRadius: '14px',
        background: 'rgba(30, 30, 30, 0.95)', border: '1.5px solid rgba(255,255,255,0.2)',
        color: '#fff', fontSize: '1.4rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 3px 14px rgba(0,0,0,0.5)',
        fontFamily: 'inherit',
    };

    return (
        <>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* Map custom styles */}
            <style>{`
                .leaflet-container {
                    z-index: 0 !important;
                }
                .user-marker-pulse {
                    width: 18px; height: 18px;
                    background: rgba(139, 92, 246, 0.8);
                    border: 2px solid #fff;
                    border-radius: 50%;
                    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5);
                    animation: pulse 2s ease-out infinite;
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5); }
                    100% { box-shadow: 0 0 0 16px rgba(139, 92, 246, 0); }
                }
                .leaflet-control-zoom a {
                    background: rgba(26, 26, 26, 0.9) !important;
                    color: #fff !important;
                    border-color: #444 !important;
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                }
                .leaflet-control-zoom a:hover {
                    background: rgba(40, 40, 40, 0.95) !important;
                }
                .leaflet-control-attribution {
                    background: rgba(0,0,0,0.4) !important;
                    color: #888 !important;
                    font-size: 10px !important;
                }
                .leaflet-control-attribution a {
                    color: #aaa !important;
                }
                .leaflet-popup-content-wrapper {
                    background: #1a1a1a !important;
                    color: #e0e0e0 !important;
                    border-radius: 12px !important;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important;
                }
                .leaflet-popup-tip {
                    background: #1a1a1a !important;
                }
            `}</style>

            {/* Map container */}
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {/* Bottom-left controls: dark mode + GPS */}
            <div style={{
                position: 'fixed', bottom: '5.5rem', left: '0.75rem',
                display: 'flex', flexDirection: 'column', gap: '0.5rem',
                zIndex: 101,
            }}>
                {/* Dark/Light map toggle */}
                <button onClick={toggleDarkMode} style={mapBtnStyle} title="Toggle dark/light map">
                    {isDark ? '☀️' : '🌙'}
                </button>

                {/* GPS locate */}
                <button
                    onClick={handleLocate}
                    style={{
                        ...mapBtnStyle,
                        background: locating ? 'rgba(139, 92, 246, 0.4)' : mapBtnStyle.background,
                        border: locating ? '1.5px solid #8b5cf6' : mapBtnStyle.border,
                    }}
                    title="My location"
                >
                    {locating ? '⏳' : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
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
                    style={{
                        position: 'fixed', bottom: '5.5rem', right: '0.75rem',
                        width: '54px', height: '54px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: '2px solid rgba(255,255,255,0.2)',
                        color: '#fff', fontSize: '1.8rem', fontWeight: 300,
                        cursor: 'pointer', zIndex: 101,
                        boxShadow: '0 4px 20px rgba(245, 158, 11, 0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'inherit',
                    }}
                    title="New Post"
                >
                    +
                </button>
            )}
        </div>

        {/* Quick Post Panel — rendered OUTSIDE the map div so Leaflet touch handlers don't interfere */}
        {showNewPost && (
            <div style={{
                position: 'fixed', bottom: '4.5rem', left: '0.75rem', right: '0.75rem',
                maxHeight: '60vh', overflowY: 'auto',
                background: 'rgba(15, 15, 15, 0.95)', borderRadius: '16px',
                padding: '1rem', zIndex: 1000,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid var(--border-primary)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>New Post</span>
                    <button onClick={() => {
                        setShowNewPost(false);
                        setPinDropMode(false);
                        setPostLat(null);
                        setPostLng(null);
                        if (pinDropMarkerRef.current) {
                            pinDropMarkerRef.current.remove();
                            pinDropMarkerRef.current = null;
                        }
                    }} style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        fontSize: '1.2rem', cursor: 'pointer',
                    }}>✕</button>
                </div>

                {/* Type toggle */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {(['offer', 'need'] as const).map(t => (
                        <button key={t} onClick={() => setNewPostType(t)} style={{
                            flex: 1, padding: '0.4rem', borderRadius: '8px',
                            background: newPostType === t ? (t === 'offer' ? '#1d4ed8' : '#c2410c') : '#222',
                            color: 'var(--text-primary)', border: 'none', fontSize: '0.85rem',
                            fontWeight: newPostType === t ? 700 : 400,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                            {t === 'offer' ? '🔵 Offer' : '🟠 Need'}
                        </button>
                    ))}
                </div>

                {/* Category */}
                <select
                    value={newPostCategory}
                    onChange={e => setNewPostCategory(e.target.value)}
                    style={{
                        width: '100%', padding: '0.5rem', borderRadius: '8px',
                        background: 'var(--bg-hover)', color: 'var(--text-primary)', border: '1px solid var(--border-input)',
                        marginBottom: '0.5rem', fontSize: '0.85rem', fontFamily: 'inherit',
                    }}
                >
                    {MARKETPLACE_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                    ))}
                </select>

                {/* Location picker */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <button onClick={() => { useMyLocation(); setValidationErrors(prev => { const n = new Set(prev); n.delete('location'); return n; }); }} style={{
                        flex: 1, padding: '0.4rem', borderRadius: '8px',
                        background: (postLat != null && !pinDropMode) ? '#1a4d2e' : '#222',
                        color: 'var(--text-primary)',
                        border: validationErrors.has('location') ? '1px solid #ef4444' : (postLat != null && !pinDropMode) ? '1px solid #22c55e' : '1px solid #444',
                        boxShadow: validationErrors.has('location') ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
                        fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                        📍 My location
                    </button>
                    <button onClick={() => { enterPinDrop(); setValidationErrors(prev => { const n = new Set(prev); n.delete('location'); return n; }); }} style={{
                        flex: 1, padding: '0.4rem', borderRadius: '8px',
                        background: pinDropMode ? '#1a3a5c' : '#222',
                        color: 'var(--text-primary)',
                        border: validationErrors.has('location') ? '1px solid #ef4444' : pinDropMode ? '1px solid #3b82f6' : '1px solid #444',
                        boxShadow: validationErrors.has('location') ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
                        fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                        📌 Drop a pin
                    </button>
                </div>
                {pinDropMode && postLat == null && (
                    <p style={{ margin: '0 0 0.5rem', color: '#3b82f6', fontSize: '0.75rem', textAlign: 'center' }}>
                        Tap the map to place your pin
                    </p>
                )}
                {postLat != null && postLng != null && (
                    <p style={{ margin: '0 0 0.5rem', color: '#22c55e', fontSize: '0.75rem', textAlign: 'center' }}>
                        ✓ Location set ({postLat}, {postLng})
                    </p>
                )}

                {/* Title + Credits */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                        placeholder="What do you need/offer?"
                        value={newPostTitle}
                        onChange={e => { setNewPostTitle(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete('title'); return n; }); }}
                        style={{
                            flex: 1, padding: '0.5rem', borderRadius: '8px',
                            background: 'var(--bg-hover)', color: 'var(--text-primary)',
                            border: validationErrors.has('title') ? '1px solid #ef4444' : '1px solid #444',
                            boxShadow: validationErrors.has('title') ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
                            fontSize: '0.85rem', fontFamily: 'inherit',
                        }}
                    />
                    <input
                        placeholder="Ʀ"
                        type="number"
                        value={newPostCredits}
                        onChange={e => { setNewPostCredits(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete('credits'); return n; }); }}
                        style={{
                            width: '60px', padding: '0.5rem', borderRadius: '8px',
                            background: 'var(--bg-hover)', color: 'var(--text-primary)',
                            border: validationErrors.has('credits') ? '1px solid #ef4444' : '1px solid #444',
                            boxShadow: validationErrors.has('credits') ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
                            fontSize: '0.85rem', fontFamily: 'inherit', textAlign: 'center',
                        }}
                    />
                </div>

                {/* Description */}
                <textarea
                    placeholder="Describe what you need/offer..."
                    value={newPostDescription}
                    onChange={e => { setNewPostDescription(e.target.value); setValidationErrors(prev => { const n = new Set(prev); n.delete('description'); return n; }); }}
                    rows={2}
                    style={{
                        width: '100%', padding: '0.5rem', borderRadius: '8px',
                        background: 'var(--bg-hover)', color: 'var(--text-primary)',
                        border: validationErrors.has('description') ? '1px solid #ef4444' : '1px solid #444',
                        boxShadow: validationErrors.has('description') ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
                        fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical',
                        marginBottom: '0.5rem',
                    }}
                />

                {/* Photos */}
                <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {newPostPhotos.map((photo, i) => (
                            <div key={i} style={{ position: 'relative' }}>
                                <img src={photo} alt={`photo ${i+1}`} style={{
                                    width: '60px', height: '60px', objectFit: 'cover',
                                    borderRadius: '8px', border: '1px solid var(--border-input)',
                                }} />
                                <button
                                    onClick={() => setNewPostPhotos(prev => prev.filter((_, j) => j !== i))}
                                    style={{
                                        position: 'absolute', top: '-6px', right: '-6px',
                                        background: '#ef4444', border: 'none', borderRadius: '50%',
                                        width: '18px', height: '18px', color: 'var(--text-primary)',
                                        fontSize: '0.65rem', cursor: 'pointer', lineHeight: '18px',
                                        padding: 0, textAlign: 'center',
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        {newPostPhotos.length < 3 && (
                            <label style={{
                                width: '60px', height: '60px', borderRadius: '8px',
                                border: '1px dashed #555', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', background: 'var(--bg-hover)', fontSize: '1.2rem',
                                color: 'var(--text-muted)',
                            }}>
                                📷
                                <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
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
                    <p style={{ color: 'var(--text-faint)', fontSize: '0.65rem', marginTop: '0.25rem' }}>
                        {newPostPhotos.length}/3 photos {newPostPhotos.length === 0 ? '(optional)' : ''}
                    </p>
                </div>

                <button
                    onClick={handleCreatePost}
                    disabled={posting}
                    style={{
                        width: '100%', padding: '0.6rem', borderRadius: '10px',
                        background: posting ? '#333' : '#2563eb', color: 'var(--text-primary)',
                        border: 'none', fontSize: '0.9rem', fontWeight: 600,
                        cursor: posting ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}
                >
                    {posting ? 'Posting...' : `Post ${newPostType === 'offer' ? 'Offer' : 'Need'}`}
                </button>
            </div>
        )}
    </>
    );
}
