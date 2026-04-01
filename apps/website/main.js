/**
 * BeanPool.org — Live Node Directory & Interactive Map
 * 
 * Polls known BeanPool node endpoints for directory info,
 * then displays them as markers on a Leaflet map with radius circles.
 */

// Known seed nodes — in production these would come from a registry
// Nodes must opt-in via the "Publish to beanpool.org" checkbox in settings
const SEED_NODES = [
    'https://mullum.beanpool.org',
    // Add more as communities join
];

// ======================== MAP INIT ========================
const nodesMap = L.map('nodes-map', {
    center: [-28.5, 153.5],
    zoom: 6,
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: false,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OSM',
}).addTo(nodesMap);

L.control.attribution({ position: 'bottomright', prefix: false })
    .addAttribution('© <a href="https://openstreetmap.org">OSM</a>')
    .addTo(nodesMap);

// ======================== NODE POLLING ========================
const nodeIcon = L.divIcon({
    html: '<div style="width:12px;height:12px;background:#10b981;border-radius:50%;border:2px solid #064e3b;box-shadow:0 0 10px rgba(16,185,129,0.6)"></div>',
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
});

let totalMembers = 0;
let totalNodes = 0;
const bounds = [];

async function pollNodes() {

    const results = await Promise.allSettled(
        SEED_NODES.map(async (url) => {
            const res = await fetch(`${url}/api/directory/info`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) throw new Error(`${res.status}`);
            return { url, ...(await res.json()) };
        })
    );

    totalNodes = 0;
    totalMembers = 0;

    results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        const node = result.value;
        totalNodes++;
        totalMembers += node.memberCount || 0;

        // Add marker
        if (node.serviceRadius) {
            const { lat, lng, radiusKm } = node.serviceRadius;
            L.marker([lat, lng], { icon: nodeIcon })
                .bindPopup(`
                    <div style="font-family:Inter,sans-serif;">
                        <strong>${node.name}</strong><br>
                        <span style="color:#94a3b8;font-size:0.85em;">${node.memberCount} members · ${radiusKm}km radius</span><br>
                        <a href="${node.url}" target="_blank" style="font-size:0.85em; display:inline-block; margin-top:6px; color:#f59e0b; font-weight:500;">Visit Community →</a>
                    </div>
                `)
                .addTo(nodesMap);

            // Radius circle
            L.circle([lat, lng], {
                radius: radiusKm * 1000,
                color: '#f59e0b',
                fillColor: '#f59e0b',
                fillOpacity: 0.06,
                weight: 1.5,
                dashArray: '6 4',
                interactive: false,
            }).addTo(nodesMap);

            bounds.push([lat, lng]);
        } else if (node.lat && node.lng) {
            L.marker([node.lat, node.lng], { icon: nodeIcon })
                .bindPopup(`
                    <div style="font-family:Inter,sans-serif;">
                        <strong>${node.name}</strong><br>
                        <span style="color:#94a3b8;font-size:0.85em;">${node.memberCount} members</span><br>
                        <a href="${node.url}" target="_blank" style="font-size:0.85em; display:inline-block; margin-top:6px; color:#f59e0b; font-weight:500;">Visit Community →</a>
                    </div>
                `)
                .addTo(nodesMap);
            bounds.push([node.lat, node.lng]);
        }

    });

    // Update hero stats
    document.getElementById('stat-nodes').textContent = totalNodes || '—';
    document.getElementById('stat-members').textContent = totalMembers || '—';

    if (totalNodes === 0) {
        document.getElementById('nodes-map').style.opacity = '0.5';
    } else {
        document.getElementById('nodes-map').style.opacity = '1';
    }

    // Fit map to bounds
    if (bounds.length === 1) {
        nodesMap.setView(bounds[0], 8);
    } else if (bounds.length > 1) {
        nodesMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
}

// ======================== SMOOTH SCROLL ========================
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ======================== NAV SCROLL EFFECT ========================
window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (window.scrollY > 50) {
        nav.style.background = 'rgba(5, 10, 20, 0.95)';
    } else {
        nav.style.background = 'rgba(5, 10, 20, 0.85)';
    }
});

// ======================== INIT ========================
pollNodes();
// Re-poll every 5 minutes
setInterval(pollNodes, 300_000);
