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

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    attribution: '© CartoDB © OSM',
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
    const nodesList = document.getElementById('nodes-list');
    nodesList.innerHTML = '<span style="color:#64748b;font-size:0.82rem;">Scanning nodes...</span>';

    const results = await Promise.allSettled(
        SEED_NODES.map(async (url) => {
            const res = await fetch(`${url}/api/directory/info`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) throw new Error(`${res.status}`);
            return { url, ...(await res.json()) };
        })
    );

    nodesList.innerHTML = '';
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
                        <strong>${node.nodeName}</strong><br>
                        <span style="color:#94a3b8;font-size:0.85em;">${node.memberCount} members · ${radiusKm}km radius</span>
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
                .bindPopup(`<strong>${node.nodeName}</strong><br>${node.memberCount} members`)
                .addTo(nodesMap);
            bounds.push([node.lat, node.lng]);
        }

        // Node chip
        const chip = document.createElement('div');
        chip.className = 'node-chip';
        chip.innerHTML = `<span class="node-dot"></span> ${node.nodeName}`;
        nodesList.appendChild(chip);
    });

    // Update hero stats
    document.getElementById('stat-nodes').textContent = totalNodes || '—';
    document.getElementById('stat-members').textContent = totalMembers || '—';

    if (totalNodes === 0) {
        nodesList.innerHTML = '<span style="color:#64748b;font-size:0.82rem;">No nodes online right now. Start yours!</span>';
    }

    // Fit map to bounds
    if (bounds.length > 0) {
        nodesMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
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
