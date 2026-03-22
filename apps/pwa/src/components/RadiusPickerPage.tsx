/**
 * RadiusPickerPage — Full-screen map for choosing location + radius
 *
 * Facebook-style: tap to set center, slider for radius, circle overlay.
 * No intermediate screen — straight to the map.
 */

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { type RadiusSettings } from '../lib/geo';

interface Props {
    initial?: RadiusSettings | null;
    defaultRadius?: number;
    onApply: (settings: RadiusSettings) => void;
    onCancel: () => void;
    onReset: () => void;
}

const RADIUS_STEPS = [1, 2, 5, 10, 15, 20, 30, 50, 75, 100];

export function RadiusPickerPage({ initial, defaultRadius = 20, onApply, onCancel, onReset }: Props) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const circleRef = useRef<L.Circle | null>(null);
    const markerRef = useRef<L.CircleMarker | null>(null);

    const [center, setCenter] = useState<[number, number]>(
        initial ? [initial.lat, initial.lng] : [-28.5495, 153.5005] // Default: Mullumbimby
    );
    const [radiusKm, setRadiusKm] = useState(initial?.radiusKm ?? defaultRadius);
    const [radiusIdx, setRadiusIdx] = useState(() => {
        const km = initial?.radiusKm ?? defaultRadius;
        const idx = RADIUS_STEPS.findIndex(s => s >= km);
        return idx >= 0 ? idx : RADIUS_STEPS.length - 1;
    });

    // Init map
    useEffect(() => {
        if (!mapContainer.current || mapRef.current) return;

        const map = L.map(mapContainer.current, {
            center: center,
            zoom: 11,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
        }).addTo(map);

        // Circle overlay
        const circle = L.circle(center, {
            radius: radiusKm * 1000,
            color: '#f59e0b',
            fillColor: '#f59e0b',
            fillOpacity: 0.12,
            weight: 2,
            dashArray: '6, 6',
        }).addTo(map);

        // Center marker
        const marker = L.circleMarker(center, {
            radius: 8,
            color: '#fff',
            fillColor: '#f59e0b',
            fillOpacity: 1,
            weight: 2,
        }).addTo(map);

        // Tap to move center
        map.on('click', (e: L.LeafletMouseEvent) => {
            const { lat, lng } = e.latlng;
            setCenter([lat, lng]);
            circle.setLatLng([lat, lng]);
            marker.setLatLng([lat, lng]);
        });

        mapRef.current = map;
        circleRef.current = circle;
        markerRef.current = marker;

        // Try to get user's actual location
        if (!initial) {
            navigator.geolocation?.getCurrentPosition(
                (pos) => {
                    const userLat = pos.coords.latitude;
                    const userLng = pos.coords.longitude;
                    setCenter([userLat, userLng]);
                    map.setView([userLat, userLng], 11);
                    circle.setLatLng([userLat, userLng]);
                    marker.setLatLng([userLat, userLng]);
                },
                () => {}, // Ignore errors
                { timeout: 5000 }
            );
        }

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // Update circle when radius changes
    useEffect(() => {
        const km = RADIUS_STEPS[radiusIdx];
        setRadiusKm(km);
        if (circleRef.current && mapRef.current) {
            circleRef.current.setRadius(km * 1000);
            // Fit map to show the full circle
            mapRef.current.fitBounds(circleRef.current.getBounds(), { padding: [20, 20] });
        }
    }, [radiusIdx]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-primary)',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-secondary)',
                zIndex: 10,
            }}>
                <button
                    onClick={onCancel}
                    style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    Cancel
                </button>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                    📍 Set Location & Radius
                </h3>
                <button
                    onClick={onReset}
                    style={{
                        background: 'none', border: 'none', color: '#ef4444',
                        fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                >
                    Reset
                </button>
            </div>

            {/* Map */}
            <div ref={mapContainer} style={{ flex: 1 }} />

            {/* Bottom controls */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderTop: '1px solid var(--border-secondary)',
                padding: '1rem 1.25rem',
                paddingBottom: '2rem', // safe area
            }}>
                {/* Radius label */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '0.5rem',
                }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Search radius</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b' }}>
                        {radiusKm} km
                    </span>
                </div>

                {/* Slider */}
                <input
                    type="range"
                    min={0}
                    max={RADIUS_STEPS.length - 1}
                    value={radiusIdx}
                    onChange={(e) => setRadiusIdx(Number(e.target.value))}
                    style={{
                        width: '100%',
                        accentColor: '#f59e0b',
                        marginBottom: '0.75rem',
                    }}
                />

                {/* Step labels */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: '0.65rem', color: 'var(--text-faint)',
                    marginBottom: '1rem',
                    paddingLeft: '0.2rem', paddingRight: '0.2rem',
                }}>
                    <span>1km</span>
                    <span>10km</span>
                    <span>50km</span>
                    <span>100km</span>
                </div>

                {/* Tap hint */}
                <p style={{
                    textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-faint)',
                    marginBottom: '0.75rem',
                }}>
                    Tap the map to move the center point
                </p>

                {/* Apply button */}
                <button
                    onClick={() => onApply({
                        lat: center[0],
                        lng: center[1],
                        radiusKm,
                        label: `${radiusKm}km radius`,
                    })}
                    style={{
                        width: '100%', padding: '0.85rem', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        border: 'none', color: '#fff', fontSize: '1rem',
                        fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)',
                    }}
                >
                    Apply — {radiusKm}km radius
                </button>
                {initial && (
                    <button
                        onClick={onReset}
                        style={{
                            width: '100%', padding: '0.85rem', borderRadius: '12px',
                            background: 'transparent',
                            border: '1px solid #ef4444', color: '#ef4444', fontSize: '1rem',
                            fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                            marginTop: '0.75rem',
                        }}
                    >
                        Clear Filter
                    </button>
                )}
            </div>
        </div>
    );
}
