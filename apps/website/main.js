/**
 * BeanPool.org — Live Node Directory & Interactive Map
 * 
 * Polls known BeanPool node endpoints for directory info,
 * then displays them as markers on a Leaflet map with radius circles.
 */

const SUPABASE_URL = 'https://dpemwoermzkaxoctafzg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fmlYuaf6NCkTI2IwWnvZmw_bOzo-PrF';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ======================== MAP INIT ========================
const nodesMap = L.map('nodes-map', {
    center: [20, 0],
    zoom: 2,
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

    try {
        const { data: nodes, error } = await supabaseClient
            .from('directory_nodes')
            .select('*');
            
        if (error) throw error;
        
        totalNodes = 0;
        totalMembers = 0;

        nodes.forEach((node) => {
            totalNodes++;
            totalMembers += node.member_count || 0;
            
            // Map db fields to expected format
            const radiusKm = node.service_radius?.radiusKm || 0;
            const lat = node.service_radius?.lat || node.lat;
            const lng = node.service_radius?.lng || node.lng;
            const name = node.community_name || node.callsign;
            const url = node.node_url || '#';

            // Add marker
            if (lat && lng) {
                if (radiusKm > 0) {
                    L.marker([lat, lng], { icon: nodeIcon })
                        .bindPopup(`
                            <div style="font-family:Inter,sans-serif;">
                                <strong>${name}</strong><br>
                                <span style="color:#94a3b8;font-size:0.85em;">${node.member_count} members · ${radiusKm}km radius</span>
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
                } else {
                    L.marker([lat, lng], { icon: nodeIcon })
                        .bindPopup(`
                            <div style="font-family:Inter,sans-serif;">
                                <strong>${name}</strong><br>
                                <span style="color:#94a3b8;font-size:0.85em;">${node.member_count} members</span>
                            </div>
                        `)
                        .addTo(nodesMap);
                }
                bounds.push([lat, lng]);
            }

        });
    } catch (err) {
        console.error('Failed to load directory nodes from Supabase:', err);
    }

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
