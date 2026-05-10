        const API = '/api/local';
        let authToken = null;
        let settingsMap, settingsMarker;
        let radiusCircle;

        function updateRadiusCircle() {
            const lat = parseFloat(document.getElementById('cfg-lat').value);
            const lng = parseFloat(document.getElementById('cfg-lng').value);
            const km = parseInt(document.getElementById('radius-km').value) || 0;
            // Remove old circle
            if (radiusCircle) { settingsMap?.removeLayer(radiusCircle); radiusCircle = null; }
            // Draw new if valid
            if (settingsMap && !isNaN(lat) && !isNaN(lng) && km > 0) {
                radiusCircle = L.circle([lat, lng], {
                    radius: km * 1000,
                    color: '#f59e0b', fillColor: '#f59e0b',
                    fillOpacity: 0.08, weight: 2, dashArray: '6 4'
                }).addTo(settingsMap);
            }
        }

        // ======================== PASSWORD EYE TOGGLE ========================
        document.querySelectorAll('.pwd-eye').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const input = btn.closest('.pwd-wrapper').querySelector('input');
                input.type = input.type === 'password' ? 'text' : 'password';
            });
        });

        function showStatus(id, msg, type) {
            const el = document.getElementById(id);
            el.textContent = msg;
            el.className = `status-msg show ${type}`;
        }

        function showView(name) {
            document.getElementById('view-login').classList.toggle('hidden', name !== 'login');
            document.getElementById('view-settings').classList.toggle('hidden', name !== 'settings');
        }

        // ======================== TAB SWITCHING ========================
        function switchTab(tabName) {
            // Update buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });
            // Show/hide panels
            document.querySelectorAll('#view-settings > .glass[data-tab]').forEach(panel => {
                panel.style.display = panel.dataset.tab === tabName ? '' : 'none';
            });
            // Persist
            sessionStorage.setItem('bp-settings-tab', tabName);
            // Leaflet needs invalidateSize after being unhidden
            if (tabName === 'identity') {
                if (settingsMap) setTimeout(() => settingsMap.invalidateSize(), 50);
                loadNodeConfig();
            }
            // Load data for admin tabs
            if (tabName === 'moderation' || tabName === 'members') loadAdminData();
            if (tabName === 'comms') loadAdminInbox();
            if (tabName === 'commons') { loadCommonsData(); loadNodeConfig(); }
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Apply initial tab (default: identity)
        switchTab(sessionStorage.getItem('bp-settings-tab') || 'identity');

        // ======================== LEAFLET MAP ========================
        const nodeIcon = L.divIcon({
            html: '<div style="width:14px;height:14px;background:#10b981;border-radius:50%;border:2px solid #064e3b;box-shadow:0 0 10px rgba(16,185,129,0.6)"></div>',
            className: '', iconSize: [14, 14], iconAnchor: [7, 7]
        });

        const sisterIcon = L.divIcon({
            html: '<div style="width:14px;height:14px;background:#3b82f6;border-radius:50%;border:2px solid #1e3a8a;box-shadow:0 0 10px rgba(59,130,246,0.6)"></div>',
            className: '', iconSize: [14, 14], iconAnchor: [7, 7]
        });
        const sisterMarkers = [];

        async function plotSisterNodes(connectors) {
            if (!settingsMap) return;
            sisterMarkers.forEach(m => settingsMap.removeLayer(m));
            sisterMarkers.length = 0;

            for (const c of connectors) {
                if (!c.enabled || !c.publicUrl) continue;
                try {
                    const res = await fetch(`${c.publicUrl}/api/local/status`).catch(() => null);
                    if (res && res.ok) {
                        const info = await res.json();
                        if (info.location && info.location.lat && info.location.lng) {
                            const marker = L.marker([info.location.lat, info.location.lng], { icon: sisterIcon })
                                .addTo(settingsMap)
                                .bindPopup(`<div style="text-align:center;"><b>${info.callsign || c.callsign || 'Sister Node'}</b><br><a href="${c.publicUrl}" target="_blank" style="color:#3b82f6;font-size:0.8rem;text-decoration:none;">Visit Node ↗</a></div>`);
                            sisterMarkers.push(marker);
                        }
                    }
                } catch(e) {}
            }
        }

        function initMap(lat, lng) {
            if (settingsMap) { settingsMap.invalidateSize(); return; }
            const center = (lat && lng) ? [lat, lng] : [0, 0];
            const zoom = (lat && lng) ? 10 : 2;
            settingsMap = L.map('settings-map').setView(center, zoom);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap', maxZoom: 18
            }).addTo(settingsMap);
            if (lat && lng) {
                settingsMarker = L.marker([lat, lng], { icon: nodeIcon }).addTo(settingsMap);
            }
            settingsMap.on('click', (e) => {
                document.getElementById('cfg-lat').value = e.latlng.lat;
                document.getElementById('cfg-lng').value = e.latlng.lng;
                if (settingsMarker) settingsMarker.setLatLng(e.latlng);
                else settingsMarker = L.marker(e.latlng, { icon: nodeIcon }).addTo(settingsMap);
                updateRadiusCircle();
            });
            // Draw initial radius circle if loaded
            updateRadiusCircle();
        }

        // Sync radius slider <-> km input
        document.getElementById('radius-slider').addEventListener('input', (e) => {
            document.getElementById('radius-km').value = e.target.value;
            updateRadiusCircle();
        });
        document.getElementById('radius-km').addEventListener('input', (e) => {
            const v = Math.min(parseInt(e.target.value) || 0, 500);
            document.getElementById('radius-slider').value = Math.min(v, 200);
            updateRadiusCircle();
        });

        // ======================== LOCATION SEARCH (NOMINATIM) ========================
        const searchInput = document.getElementById('location-search');
        const searchResults = document.getElementById('location-results');
        let searchTimeout;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const q = e.target.value.trim();
            if (q.length < 3) { searchResults.classList.remove('active'); return; }
            searchTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
                    const data = await res.json();
                    searchResults.innerHTML = data.map(r => `
                        <div class="item" data-lat="${r.lat}" data-lng="${r.lon}">
                            <div style="color:#e2e8f0">${r.display_name}</div>
                            <div class="type">${r.type}</div>
                        </div>
                    `).join('');
                    searchResults.classList.add('active');
                    searchResults.querySelectorAll('.item').forEach(item => {
                        item.addEventListener('click', () => {
                            const lat = parseFloat(item.dataset.lat);
                            const lng = parseFloat(item.dataset.lng);
                            document.getElementById('cfg-lat').value = lat;
                            document.getElementById('cfg-lng').value = lng;
                            searchInput.value = item.querySelector('div').textContent;
                            searchResults.classList.remove('active');
                            settingsMap.setView([lat, lng], 12);
                            if (settingsMarker) settingsMarker.setLatLng([lat, lng]);
                            else settingsMarker = L.marker([lat, lng], { icon: nodeIcon }).addTo(settingsMap);
                        });
                    });
                } catch (err) { console.error('Geocoding failed:', err); }
            }, 350);
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper')) searchResults.classList.remove('active');
        });

        // ======================== LOGIN ========================
        document.getElementById('login-btn').addEventListener('click', async () => {
            const password = document.getElementById('login-password').value;
            if (!password) { showStatus('login-status', 'Enter your password', 'error'); return; }
            try {
                const res = await fetch(`${API}/verify-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                if (!res.ok) {
                    const err = await res.json();
                    showStatus('login-status', err.error || 'Invalid password', 'error');
                    return;
                }
                authToken = password;
                let dashboardData = null;
                const dashRes = await fetch(`${API}/dashboard`);
                if (dashRes.ok) {
                    dashboardData = await dashRes.json();
                    hydrateSettings(dashboardData);
                }
                showView('settings');
                loadVersionInfo();
                loadHealthDashboard();
                loadThresholds();
                loadCommunityInfo();
                loadAdminData();
                setTimeout(() => {
                    initMap(
                        parseFloat(document.getElementById('cfg-lat').value) || null,
                        parseFloat(document.getElementById('cfg-lng').value) || null
                    );
                    if (dashboardData && dashboardData.connectors) plotSisterNodes(dashboardData.connectors);
                    maybeAutoCheck();
                }, 150);
            } catch (err) {
                showStatus('login-status', 'Login failed', 'error');
            }
        });

        // Enter key submits login
        document.getElementById('login-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('login-btn').click();
        });

        // ======================== HYDRATE SETTINGS ========================
        function hydrateSettings(data) {
            document.getElementById('hdr-peer-id').textContent = `PeerId: ${data.identity.peerId}`;
            document.getElementById('cfg-callsign').value = data.identity.callsign || '';
            if (data.identity.location) {
                document.getElementById('cfg-lat').value = data.identity.location.lat;
                document.getElementById('cfg-lng').value = data.identity.location.lng;
            }
            renderConnectors(data.connectors || []);
        }

        // ======================== CONNECTORS ========================
        function renderConnectors(connectors) {
            const list = document.getElementById('connectors-list');
            if (connectors.length === 0) {
                list.innerHTML = '<p style="font-size:0.8rem;color:#475569;text-align:center;padding:1rem;">No connectors configured. Add one below.</p>';
                return;
            }
            list.innerHTML = connectors.map(c => {
                const trustLabels = { mirror: 'Mirror', peer: 'Peer', blocked: 'Blocked' };
                let badge;
                if (c.connected && c.mutualTrust) {
                    badge = `<span class="badge badge-mutual">● Mutual Trust</span>`;
                } else if (c.connected) {
                    badge = `<span class="badge badge-outbound">◐ Outbound Only</span>`;
                } else {
                    badge = `<span class="badge badge-disconnected">○ Disconnected</span>`;
                }
                const latency = c.latencyMs !== null && c.latencyMs > 0 ? `${c.latencyMs}ms` : '—';
                const lastVerified = c.lastVerified ? `${Math.round((Date.now() - c.lastVerified) / 1000)}s ago` : '—';
                const remoteTrust = c.remoteTrustLevel ? trustLabels[c.remoteTrustLevel] || c.remoteTrustLevel : '—';

                return `
                    <div class="connector-card">
                        <div class="header">
                            <div>
                                <div class="name">${c.callsign || c.address}</div>
                                <div class="addr">${c.address}</div>
                            </div>
                            ${badge}
                        </div>
                        <div class="meta">
                            <span>You → ${trustLabels[c.trustLevel] || c.trustLevel}</span>
                            <span>Them → ${remoteTrust}</span>
                            <span>RTT: ${latency}</span>
                        </div>
                        <div class="actions">
                            ${c.connected
                        ? `<button class="btn btn-outline btn-sm" onclick="doDisconnect('${c.address}')">Disconnect</button>`
                        : `<button class="btn btn-outline btn-sm" onclick="doConnect('${c.address}')">Connect</button>`
                    }
                            <button class="btn btn-danger btn-sm" onclick="doRemove('${c.address}')">Remove</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function refreshConnectors() {
            try {
                const res = await fetch(`${API}/connectors`);
                if (res.ok) renderConnectors(await res.json());
            } catch (e) { /* ignore */ }
        }

        window.doConnect = async function (address) {
            try {
                await fetch(`${API}/connectors/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, address })
                });
                await refreshConnectors();
            } catch (e) { showStatus('connector-status', 'Connection failed', 'error'); }
        };

        window.doDisconnect = async function (address) {
            try {
                await fetch(`${API}/connectors/disconnect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, address })
                });
                await refreshConnectors();
            } catch (e) { showStatus('connector-status', 'Disconnect failed', 'error'); }
        };

        window.doRemove = async function (address) {
            if (!confirm(`Remove connector ${address}?`)) return;
            try {
                await fetch(`${API}/connectors/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, address })
                });
                await refreshConnectors();
            } catch (e) { showStatus('connector-status', 'Remove failed', 'error'); }
        };

        // Add connector
        document.getElementById('add-connector-btn').addEventListener('click', async () => {
            const address = document.getElementById('new-addr').value.trim();
            const trustLevel = document.getElementById('new-trust').value;
            const callsign = document.getElementById('new-callsign').value.trim();
            if (!address) { showStatus('connector-status', 'Address is required', 'error'); return; }
            try {
                const res = await fetch(`${API}/connectors`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, address, trustLevel, callsign: callsign || undefined })
                });
                if (res.ok) {
                    document.getElementById('new-addr').value = '';
                    document.getElementById('new-callsign').value = '';
                    showStatus('connector-status', 'Connector added!', 'success');
                    await refreshConnectors();
                } else {
                    const err = await res.json();
                    showStatus('connector-status', err.error || 'Failed', 'error');
                }
            } catch (e) { showStatus('connector-status', 'Failed', 'error'); }
        });

        // Mirror warning toggle
        document.getElementById('new-trust').addEventListener('change', (e) => {
            document.getElementById('mirror-warning').style.display =
                e.target.value === 'mirror' ? 'block' : 'none';
        });

        // ======================== SAVE IDENTITY ========================
        document.getElementById('save-identity-btn').addEventListener('click', async () => {
            try {
                const res = await fetch(`${API}/update-identity`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: authToken,
                        callsign: document.getElementById('cfg-callsign').value,
                        lat: document.getElementById('cfg-lat').value ? parseFloat(document.getElementById('cfg-lat').value) : null,
                        lng: document.getElementById('cfg-lng').value ? parseFloat(document.getElementById('cfg-lng').value) : null,
                        communityName: document.getElementById('community-name').value,
                        contactEmail: document.getElementById('contact-email').value,
                        contactPhone: document.getElementById('contact-phone').value,
                    })
                });
                // Also save node config (radius + directory)
                await saveNodeConfig();
                if (res.ok) showStatus('identity-status', 'Saved!', 'success');
                else showStatus('identity-status', 'Save failed', 'error');
            } catch (e) { showStatus('identity-status', 'Save failed', 'error'); }
        });

        // ======================== COMMUNITY INFO ========================
        // Load community info after login
        async function loadCommunityInfo() {
            try {
                const res = await fetch(`${API}/community-info`);
                if (res.ok) {
                    const data = await res.json();
                    document.getElementById('community-name').value = data.communityName || '';
                    document.getElementById('contact-email').value = data.contactEmail || '';
                    document.getElementById('contact-phone').value = data.contactPhone || '';
                }
            } catch (e) { console.warn('Failed to load community info:', e); }
        }

        // ======================== SEED INVITE ========================
        // Tier selector visual highlighting
        document.querySelectorAll('#invite-tier-selector .tier-option').forEach(label => {
            label.addEventListener('click', () => {
                document.querySelectorAll('#invite-tier-selector .tier-option').forEach(l => {
                    l.style.borderColor = '#334155';
                    l.style.background = 'transparent';
                });
                const colors = { standard: '#6b7280', trusted: '#3b82f6', ambassador: '#8b5cf6' };
                const type = label.dataset.type;
                label.style.borderColor = colors[type] || '#334155';
                label.style.background = (colors[type] || '#334155') + '15';
            });
            // Apply initial highlight for selected
            if (label.querySelector('input').checked) label.click();
        });

        document.getElementById('seed-invite-btn').addEventListener('click', async () => {
            try {
                if (!navigator.onLine) {
                    showStatus('seed-invite-status', '⚠️ You must be online to generate an invite code. Please check your connection and try again.', 'error');
                    return;
                }
                const selectedType = document.querySelector('input[name="invite-type"]:checked')?.value || 'standard';
                showStatus('seed-invite-status', 'Generating...', 'info');
                const res = await fetch('/api/admin/seed-invite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, type: selectedType })
                });
                const data = await res.json();
                if (res.ok && data.code) {
                    const code = data.code.toUpperCase();
                    const inviteUrl = `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
                    document.getElementById('seed-invite-code').textContent = inviteUrl;
                    document.getElementById('seed-invite-qr').src =
                        `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inviteUrl)}`;
                    document.getElementById('seed-invite-tier-label').textContent = data.tierLabel || '';
                    document.getElementById('seed-invite-result').classList.remove('hidden');
                    showStatus('seed-invite-status', data.message || 'Invite generated!', 'success');
                } else {
                    showStatus('seed-invite-status', data.error || 'Failed to generate invite', 'error');
                }
            } catch (e) { showStatus('seed-invite-status', 'Failed to generate invite', 'error'); }
        });

        document.getElementById('copy-invite-btn')?.addEventListener('click', () => {
            const code = document.getElementById('seed-invite-code').textContent;
            navigator.clipboard.writeText(code).then(() => {
                showStatus('seed-invite-status', 'Copied!', 'success');
            });
        });

        // ======================== CHANGE PASSWORD ========================
        document.getElementById('change-pwd-btn').addEventListener('click', async () => {
            const np = document.getElementById('new-pwd').value;
            const nc = document.getElementById('new-pwd-confirm').value;
            if (!np) { showStatus('pwd-status', 'Enter a new password', 'error'); return; }
            if (np !== nc) { showStatus('pwd-status', 'Passwords do not match', 'error'); return; }
            try {
                const res = await fetch(`${API}/change-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword: authToken, newPassword: np })
                });
                if (res.ok) {
                    authToken = np;
                    showStatus('pwd-status', 'Password updated!', 'success');
                    document.getElementById('new-pwd').value = '';
                    document.getElementById('new-pwd-confirm').value = '';
                } else {
                    const err = await res.json();
                    showStatus('pwd-status', err.error || 'Failed', 'error');
                }
            } catch (e) { showStatus('pwd-status', 'Failed', 'error'); }
        });

        // ======================== RESET ========================
        document.getElementById('reset-btn').addEventListener('click', async () => {
            // First offer a backup
            const wantsBackup = confirm('⚠️ LAST CHANCE: Download a backup before resetting?\n\nClick OK to download a backup first, or Cancel to proceed without one.');
            if (wantsBackup) {
                await downloadBackup();
                // Give them a chance to cancel after seeing the backup
                if (!confirm('Backup downloaded. Proceed with the reset?\n\nThis will erase your node identity and admin password.')) return;
            } else {
                if (!confirm('Are you absolutely sure?\n\nThis will erase your node identity, admin password, and all configuration. This cannot be undone.')) return;
            }
            try {
                const res = await fetch(`${API}/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                const d = await res.json();
                if (d.success) {
                    showStatus('reset-status', 'Reset complete. Restart the container to reconfigure.', 'success');
                } else {
                    showStatus('reset-status', d.error || 'Reset failed', 'error');
                }
            } catch (e) { showStatus('reset-status', 'Failed', 'error'); }
            // Re-lock the button
            document.getElementById('reset-confirm-input').value = '';
            document.getElementById('reset-btn').disabled = true;
        });

        // ======================== SOFTWARE UPDATES ========================
        // Load current version on login
        async function loadVersionInfo() {
            try {
                const res = await fetch('/api/version');
                if (res.ok) {
                    const data = await res.json();
                    document.getElementById('current-version').textContent = `v${data.version}`;
                    const topDisplay = document.getElementById('top-version-display');
                    if (topDisplay) topDisplay.textContent = `V${data.version}`;
                    // If server has cached update info, show badge immediately
                    if (data.updateAvailable && data.latestVersion) {
                        const badge = document.getElementById('update-badge');
                        const badgeText = document.getElementById('update-badge-text');
                        const latestEl = document.getElementById('latest-version');
                        if (badge) {
                            badge.style.display = 'inline';
                            badgeText.textContent = `v${data.latestVersion} available`;
                        }
                        if (latestEl) {
                            latestEl.textContent = `v${data.latestVersion}`;
                            latestEl.style.color = '#f59e0b';
                        }
                        // Show instructions panel
                        const instructionsEl = document.getElementById('update-instructions');
                        if (instructionsEl) instructionsEl.style.display = 'block';
                    }
                }
            } catch { /* offline */ }
        }

        // Community Health dashboard
        async function loadHealthDashboard() {
            try {
                const res = await fetch('/api/community/health');
                if (!res.ok) return;
                const h = await res.json();

                // Stat cards
                const stats = [
                    { emoji: '👥', value: h.tree.totalMembers, label: 'Members' },
                    { emoji: '🌳', value: h.tree.maxDepth, label: 'Tree Depth' },
                    { emoji: '📈', value: h.activity.last7Days, label: 'Txns (7d)' },
                    { emoji: '📊', value: h.activity.last30Days, label: 'Txns (30d)' },
                    { emoji: '🟢', value: h.activity.activeMemberCount, label: 'Active', color: '#22c55e' },
                    { emoji: '⚪', value: h.activity.inactiveMemberCount, label: 'Inactive', color: '#64748b' },
                    { emoji: '🏦', value: h.activity.commonsBalance + 'B', label: 'Commons', color: '#f59e0b' },
                    { emoji: '💸', value: h.activity.totalTransactions, label: 'Total Txns' },
                ];
                const grid = document.getElementById('health-grid');
                grid.innerHTML = stats.map(s => `
                    <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:0.6rem;text-align:center;">
                        <div style="font-size:1.1rem;">${s.emoji}</div>
                        <div style="font-size:1.2rem;font-weight:700;font-family:monospace;color:${s.color || '#f8fafc'};">${s.value}</div>
                        <div style="font-size:0.65rem;color:#64748b;text-transform:uppercase;letter-spacing:0.03em;">${s.label}</div>
                    </div>
                `).join('');

                // Widest branch
                const wEl = document.getElementById('health-widest');
                if (h.tree.widestBranch.children > 0) {
                    wEl.style.display = '';
                    wEl.innerHTML = `<div style="font-size:0.65rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.2rem;">Widest Branch</div><div style="font-size:0.95rem;font-weight:600;">🌿 ${h.tree.widestBranch.callsign} — ${h.tree.widestBranch.children} invitee${h.tree.widestBranch.children !== 1 ? 's' : ''}</div>`;
                } else {
                    wEl.style.display = 'none';
                }

                // Flags
                const fEl = document.getElementById('health-flags');
                if (h.flags.length === 0) {
                    fEl.innerHTML = '<div style="text-align:center;padding:0.75rem;border:1px solid #1a3a1a;border-radius:10px;background:rgba(34,197,94,0.05);"><div style="font-size:1.2rem;margin-bottom:0.15rem;">✅</div><div style="color:#22c55e;font-size:0.85rem;">No issues detected</div></div>';
                } else {
                    fEl.innerHTML = h.flags.map(f => {
                        const icon = f.type === 'wash_trading' ? '🔄' : f.type === 'isolated_branch' ? '🏝️' : '💤';
                        const borderColor = f.severity === 'alert' ? '#ef444466' : '#f59e0b44';
                        const bgColor = f.severity === 'alert' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)';
                        const labelColor = f.severity === 'alert' ? '#ef4444' : '#f59e0b';
                        return `<div style="border:1px solid ${borderColor};background:${bgColor};border-radius:10px;padding:0.75rem;margin-bottom:0.5rem;"><div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.2rem;"><span>${icon}</span><span style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${labelColor};">${f.type.replace(/_/g, ' ')}</span></div><div style="font-size:0.8rem;color:#cbd5e1;">${f.description}</div></div>`;
                    }).join('');
                }
            } catch { /* offline */ }
        }

        // ===================== THRESHOLDS =====================

        const THRESHOLD_KEYS = [
            'circulationRate', 'circulationEpochDays',
            'syncIntervalMin', 'initialSyncDelaySec', 'handshakeIntervalSec',
            'retryIntervalSec', 'maxRetryBackoffMin',
            'washTradingWindowHours', 'washTradingMinTxns', 'inactiveMemberDays', 'isolatedBranchMinTxns',
            'maxProjectExpiryDays'
        ];

        async function loadThresholds() {
            try {
                const res = await fetch('/api/admin/thresholds/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                if (!res.ok) return;
                const data = await res.json();
                for (const key of THRESHOLD_KEYS) {
                    const el = document.getElementById('th-' + key);
                    if (el) el.value = data.thresholds[key];
                }
            } catch { /* offline */ }
        }

        async function saveThresholds() {
            const updates = { password: authToken };
            for (const key of THRESHOLD_KEYS) {
                const el = document.getElementById('th-' + key);
                if (el) updates[key] = parseFloat(el.value);
            }
            try {
                const res = await fetch('/api/admin/thresholds', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                if (res.ok) {
                    showStatus('thresholds-status', '✅ Thresholds saved!', 'success');
                    loadHealthDashboard(); // Refresh health with new thresholds
                } else {
                    const data = await res.json();
                    showStatus('thresholds-status', data.error || 'Save failed', 'error');
                }
            } catch {
                showStatus('thresholds-status', 'Failed to save', 'error');
            }
        }

        async function resetThresholds() {
            try {
                const res = await fetch('/api/admin/thresholds/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                if (!res.ok) return;
                const data = await res.json();
                // Fill with defaults
                for (const key of THRESHOLD_KEYS) {
                    const el = document.getElementById('th-' + key);
                    if (el) el.value = data.defaults[key];
                }
                showStatus('thresholds-status', 'Defaults loaded — click Save to apply', 'success');
            } catch { /* offline */ }
        }

        document.getElementById('save-thresholds-btn').addEventListener('click', saveThresholds);
        document.getElementById('reset-thresholds-btn').addEventListener('click', resetThresholds);

        document.getElementById('refresh-health-btn').addEventListener('click', loadHealthDashboard);

        // Old loadReports removed — reports are now surfaced in Moderation tab via admin data

        async function checkForUpdates() {
            showStatus('update-status', 'Checking...', 'success');
            try {
                const res = await fetch('/api/admin/check-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                const data = await res.json();
                if (!res.ok) {
                    showStatus('update-status', data.error || 'Check failed', 'error');
                    return;
                }
                document.getElementById('current-version').textContent = `v${data.currentVersion}`;
                const latestEl = document.getElementById('latest-version');
                const badge = document.getElementById('update-badge');
                const badgeText = document.getElementById('update-badge-text');
                const instructionsEl = document.getElementById('update-instructions');
                const notesEl = document.getElementById('update-release-notes');
                const publishedEl = document.getElementById('update-published-at');

                if (data.updateAvailable && data.latestVersion) {
                    latestEl.textContent = `v${data.latestVersion}`;
                    latestEl.style.color = '#f59e0b';
                    // Show header badge
                    if (badge) {
                        badge.style.display = 'inline';
                        badgeText.textContent = `v${data.latestVersion} available`;
                    }
                    // Show instructions
                    if (instructionsEl) instructionsEl.style.display = 'block';
                    // Show release notes
                    if (data.releaseNotes && notesEl) {
                        notesEl.textContent = data.releaseNotes;
                        notesEl.style.display = 'block';
                    }
                    // Show published date
                    if (data.publishedAt && publishedEl) {
                        publishedEl.textContent = `Published: ${new Date(data.publishedAt).toLocaleDateString()}`;
                        publishedEl.style.display = 'block';
                    }
                    showStatus('update-status', '🆕 Update available!', 'success');
                } else {
                    latestEl.textContent = `v${data.currentVersion}`;
                    latestEl.style.color = '#10b981';
                    if (badge) badge.style.display = 'none';
                    if (instructionsEl) instructionsEl.style.display = 'none';
                    if (notesEl) notesEl.style.display = 'none';
                    if (publishedEl) publishedEl.style.display = 'none';
                    showStatus('update-status', '✓ You are up to date', 'success');
                }
                localStorage.setItem('beanpool-last-update-check', Date.now().toString());
            } catch (e) {
                showStatus('update-status', 'Check failed — offline?', 'error');
            }
        }

        // Copy update commands to clipboard
        window.copyUpdateCommands = function() {
            const commands = 'docker compose pull\ndocker compose up -d';
            navigator.clipboard.writeText(commands).then(() => {
                showStatus('update-status', '📋 Commands copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = commands;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showStatus('update-status', '📋 Commands copied to clipboard!', 'success');
            });
        };

        document.getElementById('check-update-btn').addEventListener('click', checkForUpdates);

        // Auto-check for updates with configurable interval
        const autoCheckEl = document.getElementById('auto-check-updates');
        const intervalEl = document.getElementById('update-check-interval');

        // Restore saved preferences
        autoCheckEl.checked = localStorage.getItem('beanpool-auto-check') === 'true';
        const savedInterval = localStorage.getItem('beanpool-check-interval');
        if (savedInterval && intervalEl) intervalEl.value = savedInterval;

        autoCheckEl.addEventListener('change', () => {
            localStorage.setItem('beanpool-auto-check', autoCheckEl.checked.toString());
        });
        intervalEl?.addEventListener('change', () => {
            localStorage.setItem('beanpool-check-interval', intervalEl.value);
        });

        // Run auto-check if enabled and interval has elapsed
        function maybeAutoCheck() {
            if (!autoCheckEl.checked || !authToken) return;
            const lastCheck = parseInt(localStorage.getItem('beanpool-last-update-check') || '0');
            const interval = parseInt(intervalEl?.value || '21600000'); // default 6h
            if (Date.now() - lastCheck > interval) {
                checkForUpdates();
            }
        }

        // ======================== ADMIN CONSOLE ========================
        let adminDataCache = null;

        // ===================== COMMONS =====================
        let commonsData = null;

        async function loadCommonsData() {
            if (!authToken) return;
            try {
                const res = await fetch('/api/local/admin/commons/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                if (!res.ok) return;
                commonsData = await res.json();
                renderCommonsTab();
            } catch (e) { console.warn('Failed to load commons:', e); }
        }

        function renderCommonsTab() {
            if (!commonsData) return;
            document.getElementById('commons-balance').textContent = commonsData.balance.toFixed(2) + 'B';

            const activeRound = commonsData.rounds.find(r => r.status === 'open');
            const roundStatus = document.getElementById('commons-round-status');
            if (activeRound) {
                roundStatus.textContent = 'Open → ' + new Date(activeRound.closesAt).toLocaleDateString();
                roundStatus.style.color = '#10b981';
            } else {
                roundStatus.textContent = 'None';
                roundStatus.style.color = '#60a5fa';
            }

            const list = document.getElementById('commons-projects-list');
            if (!commonsData.projects.length) {
                list.innerHTML = '<div style="padding:1rem;text-align:center;color:#64748b;">No projects yet</div>';
                return;
            }
            list.innerHTML = commonsData.projects.map(p => {
                const statusBadge = {
                    proposed: '📋 Proposed',
                    active: '🗳️ Voting',
                    funded: '✅ Funded',
                    rejected: '❌ Rejected',
                    completed: '🎉 Completed',
                }[p.status] || p.status;
                const votes = p.votes?.length || 0;
                const currentAmt = p.currentAmount || 0;
                const exceeds = (p.status === 'active' || p.status === 'proposed') && p.requestedAmount > commonsData.balance;
                const progress = p.requestedAmount > 0 ? Math.min(100, (currentAmt / p.requestedAmount) * 100) : 0;
                const progressColor = progress >= 100 ? '#10b981' : '#8b5cf6';
                
                return `<div style="padding:0.6rem 0.75rem;border-bottom:1px solid #1e293b;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">
                        <div>
                            <strong style="font-size:0.85rem;">${p.title}</strong>
                            <div style="font-size:0.7rem;color:#64748b;margin-top:2px;">${p.proposerCallsign} · ${votes} vote${votes !== 1 ? 's' : ''}</div>
                        </div>
                        <div style="display:flex;gap:0.4rem;align-items:center;">
                            <span style="font-size:0.7rem;padding:2px 6px;border-radius:4px;background:${p.status === 'funded' ? '#10b98122' : p.status === 'rejected' ? '#ef444422' : '#2563eb22'};color:${p.status === 'funded' ? '#10b981' : p.status === 'rejected' ? '#ef4444' : '#60a5fa'};">${statusBadge}</span>
                            ${p.status === 'proposed' || p.status === 'active' ? `<button onclick="rejectProject('${p.id}')" style="padding:2px 6px;border-radius:4px;background:#ef444422;color:#ef4444;border:none;cursor:pointer;font-size:0.7rem;">✕</button>` : ''}
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <div style="flex:1;height:4px;background:#1e293b;border-radius:2px;overflow:hidden;">
                            <div style="height:100%;width:${progress}%;background:${progressColor};border-radius:2px;"></div>
                        </div>
                        <span style="font-size:0.7rem;color:${exceeds ? '#ef4444' : '#94a3b8'};white-space:nowrap;font-weight:${exceeds ? 'bold' : 'normal'};" title="${exceeds ? '⚠️ Goal exceeds available Commons balance' : ''}">${currentAmt.toFixed(0)} / ${p.requestedAmount.toFixed(0)}B${exceeds ? ' ⚠️' : ''}</span>
                    </div>
                </div>`;
            }).join('');
        }

        async function createRound() {
            if (!authToken || !commonsData) return;
            const proposed = commonsData.projects.filter(p => p.status === 'proposed');
            if (!proposed.length) { alert('No proposed projects to include in a round.'); return; }
            const days = prompt('How many days should voting be open?', '7');
            if (!days) return;
            const closesAt = new Date(Date.now() + Number(days) * 86400000).toISOString();
            try {
                await fetch('/api/local/admin/commons/round', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, action: 'create', projectIds: proposed.map(p => p.id), closesAt })
                });
                await loadCommonsData();
            } catch (e) { alert('Failed to create round: ' + e.message); }
        }

        async function closeRound() {
            if (!authToken || !commonsData) return;
            const activeRound = commonsData.rounds.find(r => r.status === 'open');
            if (!activeRound) { alert('No active round to close.'); return; }
            if (!confirm('Close the voting round and fund the winner?')) return;
            try {
                const res = await fetch('/api/local/admin/commons/round', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, action: 'close', roundId: activeRound.id })
                });
                const data = await res.json();
                if (data.winner) alert('🎉 Funded: ' + data.winner.title + ' (' + data.winner.requestedAmount + 'B)');
                else alert('Round closed. No project was funded (not enough in commons or no votes).');
                await loadCommonsData();
            } catch (e) { alert('Failed to close round: ' + e.message); }
        }

        async function rejectProject(projectId) {
            if (!authToken) return;
            if (!confirm('Reject this project?')) return;
            try {
                await fetch('/api/local/admin/commons/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, projectId })
                });
                await loadCommonsData();
            } catch (e) { alert('Failed: ' + e.message); }
        }

        async function saveNodeConfig() {
            if (!authToken) return;
            const lat = parseFloat(document.getElementById('cfg-lat').value);
            const lng = parseFloat(document.getElementById('cfg-lng').value);
            const km = parseInt(document.getElementById('radius-km').value) || 0;
            const publishLocation = document.getElementById('publish-location').checked;
            const publishMembers = document.getElementById('publish-members').checked;
            const publishContacts = document.getElementById('publish-contacts').checked;
            const publishHealth = document.getElementById('publish-health').checked;
            const directoryPushIntervalHours = parseInt(document.getElementById('directory-push-interval').value) || 12;
            
            const update = { publishLocation, publishMembers, publishContacts, publishHealth, directoryPushIntervalHours };
            if (!isNaN(lat) && !isNaN(lng) && km > 0) {
                update.serviceRadius = { lat, lng, radiusKm: km };
            } else {
                update.serviceRadius = null;
            }
            try {
                await fetch('/api/local/admin/node/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, ...update })
                });
            } catch (e) { console.warn('Failed to save node config:', e); }
        }

        async function triggerDirectoryPush() {
            if (!authToken) return;
            const btn = document.getElementById('publish-now-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '⏳ Publishing...';
            btn.disabled = true;
            try {
                const res = await fetch('/api/local/admin/directory/push', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                const data = await res.json();
                if (data.success) {
                    btn.innerHTML = '✅ Published!';
                    if (data.timestamp) {
                        const date = new Date(data.timestamp);
                        document.getElementById('last-published').innerText = `Last published: ${date.toLocaleString()}`;
                    }
                } else {
                    btn.innerHTML = '❌ Failed';
                }
            } catch (err) {
                console.error(err);
                btn.innerHTML = '❌ Failed';
            }
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 3000);
        }

        async function loadNodeConfig() {
            try {
                const res = await fetch('/api/node/config');
                if (!res.ok) return;
                const config = await res.json();
                if (config.serviceRadius) {
                    const km = config.serviceRadius.radiusKm || 0;
                    document.getElementById('radius-slider').value = Math.min(km, 200);
                    document.getElementById('radius-km').value = km;
                    updateRadiusCircle();
                }
                document.getElementById('publish-location').checked = config.publishLocation !== false;
                document.getElementById('publish-members').checked = config.publishMembers !== false;
                document.getElementById('publish-contacts').checked = config.publishContacts !== false;
                document.getElementById('publish-health').checked = config.publishHealth !== false;
                if (config.directoryPushIntervalHours) {
                    document.getElementById('directory-push-interval').value = config.directoryPushIntervalHours;
                }
                if (config.lastDirectoryPush) {
                    const date = new Date(config.lastDirectoryPush);
                    document.getElementById('last-published').innerText = `Last published: ${date.toLocaleString()}`;
                }
            } catch { /* ignore */ }
        }

        async function loadAdminData() {
            if (!authToken) return;
            try {
                const res = await fetch('/api/local/admin/data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                if (!res.ok) return;
                adminDataCache = await res.json();
                renderAdminPosts();
                renderAdminMembers();
                renderAdminReports();
                renderHealthAlerts();
                updateModBadge();
            } catch (err) { console.error('Failed to load admin data', err); }
        }

        async function adminAction(endpoint, payload = {}) {
            if (!confirm('Are you sure you want to perform this administrative action?')) return;
            try {
                const res = await fetch('/api/local/admin' + endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, password: authToken })
                });
                if (res.ok) {
                    alert('Action successful.');
                    loadAdminData();
                } else {
                    const err = await res.json();
                    alert('Action failed: ' + err.error);
                }
            } catch (err) {
                alert('Network error.');
            }
        }

        // ======================== MODERATION: REPORT FILTER STATE ========================
        let reportFilterState = 'all';
        let postSearchDebounce = null;
        let selectedPostIds = new Set();
        let currentPostPage = 0;
        const POST_PAGE_SIZE = 25;

        function toggleReportFilter(filter) {
            reportFilterState = filter;
            document.querySelectorAll('[id^="report-filter-"]').forEach(b => {
                b.style.background = b.id === 'report-filter-' + filter ? '#3b82f6' : '';
                b.style.color = b.id === 'report-filter-' + filter ? '#fff' : '';
            });
            renderAdminReports();
        }

        function updateModBadge() {
            const badge = document.getElementById('mod-badge');
            const count = adminDataCache?.reportCount || 0;
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.style.display = 'inline';
                } else {
                    badge.style.display = 'none';
                }
            }
        }

        function renderAdminReports() {
            const el = document.getElementById('admin-reports-inbox');
            if (!el || !adminDataCache) return;
            const reports = adminDataCache.reports || [];
            const filtered = reportFilterState === 'all' ? reports : reports.filter(r => r.status === reportFilterState);
            const pending = reports.filter(r => r.status === 'pending').length;
            
            const countBadge = document.getElementById('reports-count-badge');
            if (countBadge) countBadge.textContent = pending > 0 ? `(${pending} pending)` : '';

            if (filtered.length === 0) {
                el.innerHTML = `<div style="text-align:center;padding:1rem;">
                    <div style="font-size:1.2rem;">✅</div>
                    <div style="color:#22c55e;font-size:0.85rem;">No ${reportFilterState === 'all' ? '' : reportFilterState + ' '}reports</div>
                </div>`;
                return;
            }
            el.innerHTML = filtered.map(r => {
                const statusColor = r.status === 'pending' ? '#ef4444' : r.status === 'actioned' ? '#10b981' : '#64748b';
                const statusIcon = r.status === 'pending' ? '🔴' : r.status === 'actioned' ? '✅' : '👁️';
                return `
                <div style="padding:0.6rem 0.75rem;border-bottom:1px solid #1e293b;background:${r.status === 'pending' ? '#1a0a0a' : 'transparent'};">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.3rem;">
                        <div style="flex:1;">
                            <span style="font-size:0.8rem;font-weight:600;color:${statusColor};">${statusIcon} ${r.reason}</span>
                            <div style="font-size:0.75rem;color:#94a3b8;margin-top:0.2rem;">
                                <span style="color:#60a5fa;">${r.reporterCallsign}</span> → <span style="color:#f87171;">${r.targetCallsign}</span>
                            </div>
                            ${r.postTitle ? `<div style="font-size:0.7rem;color:#64748b;margin-top:0.1rem;">📦 "${r.postTitle}"</div>` : '<div style="font-size:0.7rem;color:#64748b;margin-top:0.1rem;">👤 User report (no specific post)</div>'}
                        </div>
                        <div style="display:flex;flex-direction:column;gap:0.25rem;align-items:flex-end;">
                            <span style="font-size:0.65rem;color:#64748b;">${new Date(r.createdAt).toLocaleDateString()}</span>
                            ${r.status === 'pending' ? `
                                <div style="display:flex;gap:0.25rem;">
                                    ${r.targetPostId ? `<button class="btn btn-sm btn-danger" onclick="reportAction('${r.id}', true)" style="padding:1px 6px;font-size:0.65rem;">🗑️ Delete Post</button>` : ''}
                                    <button class="btn btn-sm btn-outline" onclick="reportAction('${r.id}', false)" style="padding:1px 6px;font-size:0.65rem;">✓ Dismiss</button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>`;
            }).join('');
        }

        window.reportAction = async function(reportId, deletePost) {
            const action = deletePost ? 'Delete the reported post and mark this report as actioned?' : 'Dismiss this report?';
            if (!confirm(action)) return;
            try {
                const endpoint = deletePost ? `/api/local/admin/reports/${reportId}/action` : `/api/local/admin/reports/${reportId}/dismiss`;
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken, deletePost })
                });
                if (res.ok) { loadAdminData(); }
                else { alert('Action failed'); }
            } catch { alert('Network error'); }
        };

        function renderHealthAlerts() {
            const el = document.getElementById('admin-health-alerts');
            if (!el || !adminDataCache) return;
            const flags = adminDataCache.health?.flags || [];
            if (flags.length === 0) {
                el.innerHTML = '<div style="text-align:center;padding:0.75rem;"><div style="font-size:1rem;">✅</div><div style="color:#22c55e;font-size:0.8rem;">No health alerts</div></div>';
                return;
            }
            const icons = { wash_trading: '🔄', inactive_member: '💤', isolated_branch: '🏝️', invite_spam: '⚠️' };
            el.innerHTML = flags.map(f => `
                <div style="padding:0.5rem 0.75rem;border-bottom:1px solid #1e293b;display:flex;gap:0.5rem;align-items:flex-start;">
                    <span style="font-size:1rem;">${icons[f.type] || '⚠️'}</span>
                    <div>
                        <div style="font-size:0.8rem;font-weight:600;color:${f.severity === 'alert' ? '#ef4444' : '#f59e0b'};">${f.description}</div>
                        <div style="font-size:0.7rem;color:#64748b;margin-top:0.15rem;">${f.members.join(', ')}</div>
                    </div>
                </div>
            `).join('');
        }

        function renderAdminPosts() {
            const el = document.getElementById('admin-posts-list');
            if (!el || !adminDataCache) return;
            
            const searchQ = (document.getElementById('admin-post-search')?.value || '').toLowerCase().trim();
            const typeFilter = document.getElementById('admin-post-type-filter')?.value || 'all';
            const catFilter = document.getElementById('admin-post-category-filter')?.value || 'all';
            
            let posts = adminDataCache.posts.filter(p => (p.status !== 'cancelled' && p.active !== 0));
            
            // Apply filters
            if (typeFilter !== 'all') posts = posts.filter(p => p.type === typeFilter);
            if (catFilter !== 'all') posts = posts.filter(p => p.category === catFilter);
            if (searchQ) posts = posts.filter(p => 
                (p.title || '').toLowerCase().includes(searchQ) || 
                (p.authorCallsign || '').toLowerCase().includes(searchQ) ||
                (p.description || '').toLowerCase().includes(searchQ)
            );
            
            // Sort by date desc
            posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            
            // Get report counts per post
            const reportsByPost = {};
            (adminDataCache.reports || []).forEach(r => {
                if (r.targetPostId) {
                    reportsByPost[r.targetPostId] = (reportsByPost[r.targetPostId] || 0) + 1;
                }
            });

            // Pagination
            const totalFiltered = posts.length;
            const totalPages = Math.ceil(totalFiltered / POST_PAGE_SIZE);
            if (currentPostPage >= totalPages) currentPostPage = Math.max(0, totalPages - 1);
            const startIdx = currentPostPage * POST_PAGE_SIZE;
            const pageSlice = posts.slice(startIdx, startIdx + POST_PAGE_SIZE);

            // Update count label
            const countLabel = document.getElementById('post-count-label');
            if (countLabel) {
                if (totalFiltered <= POST_PAGE_SIZE) {
                    countLabel.textContent = `${totalFiltered} post${totalFiltered !== 1 ? 's' : ''}`;
                } else {
                    countLabel.textContent = `${startIdx + 1}–${Math.min(startIdx + POST_PAGE_SIZE, totalFiltered)} of ${totalFiltered}`;
                }
            }

            if (totalFiltered === 0) { 
                el.innerHTML = '<div style="padding:1rem;text-align:center;color:#64748b;">No posts match your filters</div>'; 
                return; 
            }
            
            let html = pageSlice.map(p => {
                const isSelected = selectedPostIds.has(p.id);
                const reportCount = reportsByPost[p.id] || 0;
                return `
                <div style="padding:0.5rem 0.75rem;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;background:${isSelected ? '#1e293b' : 'transparent'};">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex:1;min-width:0;">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="togglePostSelect('${p.id}')" style="accent-color:#f59e0b;cursor:pointer;">
                        <div style="min-width:0;flex:1;">
                            <div style="font-size:0.85rem;font-weight:600;color:${p.status==='active'?'#10b981':'#64748b'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                ${p.title || 'Untitled'}
                                ${reportCount > 0 ? `<span style="background:#ef4444;color:#fff;font-size:0.6rem;padding:1px 4px;border-radius:6px;margin-left:4px;">🚩 ${reportCount}</span>` : ''}
                            </div>
                            <div style="font-size:0.7rem;color:#94a3b8;">${p.authorCallsign || 'Anon'} · ${p.type} · ${p.category || 'general'} · ${new Date(p.createdAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:0.3rem;">
                        <button class="btn btn-sm btn-outline" onclick="viewMemberPosts('${p.authorPublicKey}')" title="View all posts by this author" style="padding:2px 6px;font-size:0.7rem;">👤</button>
                        <button class="btn btn-sm btn-danger" onclick="adminAction('/posts/${p.id}/delete')" style="padding:2px 6px;font-size:0.7rem;">🗑️</button>
                    </div>
                </div>`;
            }).join('');

            // Pagination controls
            if (totalPages > 1) {
                html += `<div style="display:flex;justify-content:center;align-items:center;gap:0.75rem;padding:0.6rem;border-top:1px solid #334155;">
                    <button class="btn btn-sm btn-outline" onclick="postPageNav(-1)" ${currentPostPage === 0 ? 'disabled style="opacity:0.3;padding:2px 8px;"' : 'style="padding:2px 8px;"'}>◀ Prev</button>
                    <span style="font-size:0.75rem;color:#94a3b8;">Page ${currentPostPage + 1} of ${totalPages}</span>
                    <button class="btn btn-sm btn-outline" onclick="postPageNav(1)" ${currentPostPage >= totalPages - 1 ? 'disabled style="opacity:0.3;padding:2px 8px;"' : 'style="padding:2px 8px;"'}>Next ▶</button>
                </div>`;
            }

            el.innerHTML = html;
            updateBatchBar();
        }

        window.postPageNav = function(dir) {
            currentPostPage = Math.max(0, currentPostPage + dir);
            renderAdminPosts();
        };

        // Post search and filter event listeners
        document.getElementById('admin-post-search')?.addEventListener('input', () => {
            currentPostPage = 0;
            if (postSearchDebounce) clearTimeout(postSearchDebounce);
            postSearchDebounce = setTimeout(renderAdminPosts, 300);
        });
        document.getElementById('admin-post-type-filter')?.addEventListener('change', () => { currentPostPage = 0; renderAdminPosts(); });
        document.getElementById('admin-post-category-filter')?.addEventListener('change', () => { currentPostPage = 0; renderAdminPosts(); });

        // Batch selection functions
        window.togglePostSelect = function(id) {
            if (selectedPostIds.has(id)) selectedPostIds.delete(id);
            else selectedPostIds.add(id);
            updateBatchBar();
            renderAdminPosts();
        };

        function updateBatchBar() {
            const bar = document.getElementById('batch-action-bar');
            const countEl = document.getElementById('selected-count');
            if (bar && countEl) {
                bar.style.display = selectedPostIds.size > 0 ? 'flex' : 'none';
                countEl.textContent = selectedPostIds.size;
            }
        }

        window.selectAllPosts = function() {
            if (!adminDataCache) return;
            const searchQ = (document.getElementById('admin-post-search')?.value || '').toLowerCase().trim();
            const typeFilter = document.getElementById('admin-post-type-filter')?.value || 'all';
            const catFilter = document.getElementById('admin-post-category-filter')?.value || 'all';
            let posts = adminDataCache.posts.filter(p => (p.status !== 'cancelled' && p.active !== 0));
            if (typeFilter !== 'all') posts = posts.filter(p => p.type === typeFilter);
            if (catFilter !== 'all') posts = posts.filter(p => p.category === catFilter);
            if (searchQ) posts = posts.filter(p => (p.title || '').toLowerCase().includes(searchQ) || (p.authorCallsign || '').toLowerCase().includes(searchQ));
            posts.forEach(p => selectedPostIds.add(p.id));
            renderAdminPosts();
        };

        window.deselectAllPosts = function() {
            selectedPostIds.clear();
            renderAdminPosts();
        };

        window.bulkDeletePosts = async function() {
            if (selectedPostIds.size === 0) return;
            if (!confirm(`Delete ${selectedPostIds.size} post${selectedPostIds.size > 1 ? 's' : ''}? This will refund any pending escrows.`)) return;
            try {
                const res = await fetch('/api/local/admin/posts/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ postIds: [...selectedPostIds], password: authToken })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`Deleted ${data.deleted} post${data.deleted !== 1 ? 's' : ''}.`);
                    selectedPostIds.clear();
                    loadAdminData();
                } else {
                    alert('Bulk delete failed: ' + (data.error || 'Unknown error'));
                }
            } catch { alert('Network error'); }
        };

        // Cross-tab: view posts by a specific author
        window.viewMemberPosts = function(pubkey) {
            switchTab('moderation');
            const member = adminDataCache?.members?.find(m => m.publicKey === pubkey);
            const searchEl = document.getElementById('admin-post-search');
            if (searchEl && member) {
                searchEl.value = member.callsign || pubkey.substring(0, 8);
                renderAdminPosts();
            }
        };

        function renderAdminMembers() {
            const el = document.getElementById('admin-members-tree');
            if (!el || !adminDataCache) return;
            const { members, profiles, health, reports, memberStats } = adminDataCache;
            const flags = health?.flags || [];
            const stats = memberStats || {};
            
            // Build report counts per target pubkey
            const reportsByMember = {};
            (reports || []).filter(r => r.status === 'pending').forEach(r => {
                reportsByMember[r.targetPubkey] = (reportsByMember[r.targetPubkey] || 0) + 1;
            });
            
            const nodeFlags = {}; // pubkey -> array of flags directly on this user
            flags.forEach(f => {
                f.members.forEach(m => {
                    if (!nodeFlags[m]) nodeFlags[m] = [];
                    nodeFlags[m].push(f);
                });
            });

            // Map members by invitedBy to build tree
            const tree = {};
            members.forEach(m => {
                const inv = m.invitedBy || 'genesis';
                if (!tree[inv]) tree[inv] = [];
                tree[inv].push(m);
            });

            const branchFlagsCache = {};
            function getBranchFlags(pubkey) {
                if (branchFlagsCache[pubkey]) return branchFlagsCache[pubkey];
                const direct = nodeFlags[pubkey] || [];
                const children = tree[pubkey] || [];
                let all = [...direct];
                children.forEach(c => all.push(...getBranchFlags(c.publicKey)));
                
                // Deduplicate by description
                const unique = [];
                const seen = new Set();
                all.forEach(f => {
                    if (!seen.has(f.description)) {
                        seen.add(f.description);
                        unique.push(f);
                    }
                });
                branchFlagsCache[pubkey] = unique;
                return unique;
            }

            // Recursive branch stats aggregation
            const branchStatsCache = {};
            function computeBranchStats(pubkey) {
                if (branchStatsCache[pubkey]) return branchStatsCache[pubkey];
                const personal = stats[pubkey] || { posts: 0, messages: 0, deals: 0, volume: 0, cancelled: 0 };
                const children = tree[pubkey] || [];
                const agg = { ...personal, memberCount: 1 };
                children.forEach(c => {
                    const childAgg = computeBranchStats(c.publicKey);
                    agg.posts += childAgg.posts;
                    agg.messages += childAgg.messages;
                    agg.deals += childAgg.deals;
                    agg.volume += childAgg.volume;
                    agg.cancelled += childAgg.cancelled;
                    agg.memberCount += childAgg.memberCount;
                });
                agg.volume = Math.round(agg.volume * 100) / 100;
                branchStatsCache[pubkey] = agg;
                return agg;
            }

            function buildNode(pubkey, depth = 0) {
                const member = members.find(m => m.publicKey === pubkey);
                if (!member) return '';
                const profile = profiles.find(p => p && p.publicKey === pubkey);
                const children = tree[pubkey] || [];
                const isPruned = profile?.status === 'pruned';
                const isActive = !profile || profile.status === 'active' || profile.status === undefined;
                const isGenesis = depth === 0;
                const memberReportCount = reportsByMember[pubkey] || 0;

                const bFlags = getBranchFlags(pubkey);
                const hasFlags = bFlags.length > 0;
                const isAlert = bFlags.some(f => f.severity === 'alert');
                
                let flagPill = '';
                if (hasFlags) {
                    flagPill = `<span style="background:${isAlert ? '#ef4444' : '#f59e0b'};color:#fff;font-size:0.65rem;padding:0.1rem 0.4rem;border-radius:12px;margin-left:0.4rem;font-weight:700;" title="${bFlags.map(f => f.type.replace('_',' ')).join(', ')}">${bFlags.length} ⚠️</span>`;
                }
                let reportPill = '';
                if (memberReportCount > 0) {
                    reportPill = `<span style="background:#ef4444;color:#fff;font-size:0.65rem;padding:0.1rem 0.4rem;border-radius:12px;margin-left:0.3rem;font-weight:700;" title="${memberReportCount} pending report${memberReportCount > 1 ? 's' : ''}">🚩 ${memberReportCount}</span>`;
                }

                // Personal stat chips (compact inline indicators)
                const s = stats[pubkey] || { posts: 0, messages: 0, deals: 0, volume: 0, cancelled: 0 };
                let chipHtml = '<span style="display:inline-flex;gap:3px;margin-left:0.4rem;vertical-align:middle;">';
                if (s.posts > 0) chipHtml += `<span class="stat-chip posts" title="${s.posts} active posts">📦${s.posts}</span>`;
                if (s.messages > 0) chipHtml += `<span class="stat-chip msgs" title="${s.messages} messages sent">💬${s.messages}</span>`;
                if (s.deals > 0) chipHtml += `<span class="stat-chip deals" title="${s.deals} completed deals · B${s.volume} volume">🤝${s.deals}</span>`;
                if (s.cancelled > 0) chipHtml += `<span class="stat-chip cancelled" title="${s.cancelled} cancelled escrows">🚫${s.cancelled}</span>`;
                chipHtml += '</span>';

                // Branch stats card (expandable)
                const branchStats = computeBranchStats(pubkey);
                const hasBranch = children.length > 0;
                const statsCardId = `stats-${pubkey.slice(0,12)}`;
                let statsBtn = '';
                let statsCard = '';
                if (hasBranch || s.deals > 0 || s.posts > 0) {
                    statsBtn = `<button class="btn btn-sm btn-outline" onclick="event.preventDefault();event.stopPropagation();const c=document.getElementById('${statsCardId}');c.style.display=c.style.display==='none'?'grid':'none';" title="Toggle stats" style="padding:2px 6px;font-size:0.65rem;">📊</button>`;
                    statsCard = `<div id="${statsCardId}" class="stats-card" style="display:none;">
                        <div class="stat-row"><span class="label">📦 Posts</span><span class="value">${s.posts}</span></div>
                        <div class="stat-row"><span class="label">💬 Messages</span><span class="value">${s.messages}</span></div>
                        <div class="stat-row"><span class="label">🤝 Deals</span><span class="value">${s.deals}</span></div>
                        <div class="stat-row"><span class="label">💰 Volume</span><span class="value">B${s.volume}</span></div>
                        <div class="stat-row"><span class="label">🚫 Cancelled</span><span class="value">${s.cancelled}</span></div>
                        ${hasBranch ? `
                        <div class="stat-row full-width" style="background:#0f172a;border:1px solid #334155;margin-top:0.2rem;">
                            <span class="label" style="color:#60a5fa;">🌳 Branch (${branchStats.memberCount} members)</span>
                            <span class="value" style="color:#60a5fa;">📦${branchStats.posts} 💬${branchStats.messages} 🤝${branchStats.deals} 💰B${branchStats.volume}</span>
                        </div>` : ''}
                    </div>`;
                }

                const childrenHtml = children.map(c => buildNode(c.publicKey, depth + 1)).join('');
                const hasChildren = children.length > 0;
                
                let html = `
                    <details ${depth < 3 || hasFlags || memberReportCount > 0 ? 'open' : ''} style="margin-left:${depth === 0 ? 0 : 15}px;">
                        <summary style="margin-bottom:0.4rem; padding:0.4rem; background:#1e293b; border-left:2px solid ${isPruned ? '#475569' : isActive ? '#10b981' : '#f59e0b'}; border-radius:0 8px 8px 0; cursor:${hasChildren ? 'pointer' : 'default'};">
                            <div style="display:inline-flex; width: calc(100% - 20px); justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; vertical-align: top;">
                                <div>
                                    <strong style="font-size:0.85rem;color:${isPruned ? '#64748b' : isActive ? '#f8fafc' : '#f59e0b'}">${isPruned ? '🗑️ ' : !isActive ? '⏸️ ' : ''}${member.callsign} <span style="font-size:0.6rem;font-family:monospace;color:#475569;">(${pubkey.substring(0,8)})</span></strong>
                                    ${flagPill}${reportPill}${chipHtml}
                                    <div style="font-size:0.7rem;color:#94a3b8;">Active: ${profile?.lastActiveAt ? new Date(profile.lastActiveAt).toLocaleString() : 'Never'}</div>
                                </div>
                                <div style="display:flex;gap:0.3rem;align-items:center;">
                                    ${statsBtn}
                                    <button class="btn btn-sm btn-outline" onclick="event.preventDefault(); viewMemberPosts('${pubkey}')" title="View posts by this member" style="padding:2px 6px;font-size:0.65rem;">📦 Posts</button>
                                    ${!isGenesis && !isPruned ? `<button class="btn btn-sm ${isActive?'btn-outline':'btn-primary'}" onclick="event.preventDefault(); adminAction('/users/${pubkey}/status', {status:'${isActive?'disabled':'active'}'})">${isActive?'Pause':'Resume'}</button>` : ''}
                                    ${!isGenesis && !isPruned ? `<button class="btn btn-sm btn-danger" onclick="event.preventDefault(); adminAction('/users/${pubkey}/prune')">Prune User</button>` : ''}
                                    ${!isGenesis && children.length > 0 ? `<button class="btn btn-sm btn-danger" onclick="event.preventDefault(); adminAction('/branches/${pubkey}/prune')">Prune Branch</button>` : ''}
                                    ${!isPruned ? `<button class="btn btn-sm btn-primary" style="background:#2563eb;color:#fff;border-color:#2563eb;" onclick="event.preventDefault(); promptWarning('${pubkey}')">✉️ Message</button>` : ''}
                                </div>
                            </div>
                        </summary>
                        ${statsCard}
                        <div>
                            ${childrenHtml}
                        </div>
                    </details>
                `;
                return html;
            }

            const roots = tree['genesis'] || [];
            if (roots.length === 0) el.innerHTML = '<div style="padding:1rem;color:#64748b;">No tree found</div>';
            else el.innerHTML = roots.map(r => buildNode(r.publicKey, 0)).join('');
            
            window.promptWarning = async function(pubkey) {
                // Switch to the Inbox & Comms tab
                switchTab('comms');
                // Load inbox data then auto-select the user
                await loadAdminInbox();
                selectInboxUser(pubkey);
                // Focus the input so admin can start typing immediately
                const inp = document.getElementById('admin-inbox-input');
                if (inp) { inp.disabled = false; inp.focus(); }
            }
        }

        document.getElementById('btn-send-announcement')?.addEventListener('click', async () => {
            if (!authToken) return;
            const payload = {
                title: document.getElementById('admin-announce-title').value,
                body: document.getElementById('admin-announce-body').value,
                severity: document.getElementById('admin-announce-severity').value
            };
            try {
                const res = await fetch('/api/local/admin/announcements', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, password: authToken })
                });
                if (res.ok) { showStatus('announce-status', '✅ Sent', 'success'); }
                else { showStatus('announce-status', 'Failed', 'error'); }
            } catch (e) { showStatus('announce-status', 'Error', 'error'); }
        });

        // ======================== ADMIN INBOX ========================
        let inboxDataCache = null;
        let inboxSelectedUser = null;
        let inboxAdminPubkey = null;

        function decodePlaintext(ciphertext, nonce) {
            try {
                if (nonce.startsWith('plaintext')) {
                    const text = decodeURIComponent(escape(atob(ciphertext)));
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed.type === 'marketplace_request') {
                            const icons = { request: '📨', accept: '🤝', complete: '✅', reject: '❌', cancel: '🚫' };
                            return `<em>${icons[parsed.stage] || '🔄'} [Escrow System Event: ${parsed.stage.toUpperCase()}]</em>`;
                        }
                    } catch {}
                    return text;
                }
                return `<em>[Encrypted ${nonce}]</em>`;
            } catch { return '<em>[Encrypted]</em>'; }
        }

        async function loadAdminInbox() {
            if (!authToken) return;
            // Need members to build the user list
            if (!adminDataCache) await loadAdminData();
            
            try {
                const res = await fetch('/api/local/admin/inbox', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                if (res.ok) {
                    const data = await res.json();
                    inboxDataCache = data.conversations;
                    inboxAdminPubkey = data.adminPubkey;
                    renderAdminInboxList();
                    if (inboxSelectedUser) renderAdminInboxChat();
                }
            } catch (err) { console.error('Failed to load inbox', err); }
        }

        let showAllMembers = false;
        
        function renderAdminInboxList() {
            const listEl = document.getElementById('admin-inbox-list');
            if (!listEl || !adminDataCache) return;

            const searchTerm = document.getElementById('admin-inbox-search').value.toLowerCase();
            
            // Build a list of users, excluding the admin themselves
            let users = adminDataCache.members
                .filter(m => m.publicKey !== inboxAdminPubkey)
                .map(m => {
                const profile = adminDataCache.profiles.find(p => p.publicKey === m.publicKey);
                const conv = (inboxDataCache || []).find(c => c.participants.includes(m.publicKey));
                const lastMessage = conv?.messages?.length ? conv.messages[conv.messages.length - 1] : null;
                const unreadCount = conv?.unreadCount || 0;
                return {
                    publicKey: m.publicKey,
                    callsign: profile?.callsign || m.callsign,
                    conv,
                    lastMessage,
                    unreadCount
                };
            });

            // Filter by search
            if (searchTerm) {
                users = users.filter(u => u.callsign.toLowerCase().includes(searchTerm) || u.publicKey.toLowerCase().includes(searchTerm));
            }

            // Default: only show users with active conversations (unless toggled or searching)
            if (!showAllMembers && !searchTerm) {
                users = users.filter(u => u.conv && u.conv.messages && u.conv.messages.length > 0);
            }

            // Sort: unread first, then by most recent message
            users.sort((a, b) => {
                if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
                if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
                const timeA = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : 0;
                const timeB = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : 0;
                return timeB - timeA;
            });

            const INBOX_MAX = 50;
            const totalUsers = users.length;
            const isTruncated = !searchTerm && users.length > INBOX_MAX;
            if (isTruncated) users = users.slice(0, INBOX_MAX);

            let html = users.map(u => `
                <div class="inbox-user-item" onclick="selectInboxUser('${u.publicKey}')" style="padding: 0.75rem; border-bottom: 1px solid #1e293b; cursor: pointer; background: ${inboxSelectedUser?.publicKey === u.publicKey ? '#1e293b' : 'transparent'}; transition: background 0.2s; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight: ${u.unreadCount > 0 ? '700' : '600'}; font-size: 0.85rem; color: #f8fafc;">${u.callsign}</div>
                        <div style="font-size: 0.7rem; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.2rem;">
                            ${u.lastMessage ? decodePlaintext(u.lastMessage.ciphertext, u.lastMessage.nonce) : '<em>No messages yet</em>'}
                        </div>
                    </div>
                    ${u.unreadCount > 0 ? `<span style="background:#ef4444;color:#fff;font-size:0.6rem;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;margin-left:0.5rem;box-shadow:0 0 6px rgba(239,68,68,0.6);">${u.unreadCount > 99 ? '99+' : u.unreadCount}</span>` : ''}
                </div>
            `).join('');

            if (isTruncated) {
                html += `<div style="padding:0.4rem;text-align:center;font-size:0.7rem;color:#64748b;border-top:1px solid #1e293b;">Showing ${INBOX_MAX} of ${totalUsers} — use search to find others</div>`;
            }

            // Show all members toggle
            if (!searchTerm) {
                html += `<div onclick="showAllMembers=!showAllMembers;renderAdminInboxList();" style="padding:0.5rem;text-align:center;cursor:pointer;color:#3b82f6;font-size:0.75rem;border-top:1px solid #1e293b;">${showAllMembers ? '▲ Show active only' : '▼ Show all members'}</div>`;
            }

            listEl.innerHTML = html;
        }

        function selectInboxUser(pubkey) {
            inboxSelectedUser = adminDataCache.members.find(m => m.publicKey === pubkey);
            const profile = adminDataCache.profiles.find(p => p.publicKey === pubkey);
            if (inboxSelectedUser) inboxSelectedUser.callsign = profile?.callsign || inboxSelectedUser.callsign;
            
            // Mark conversation as read (admin perspective)
            if (inboxAdminPubkey) {
                const conv = (inboxDataCache || []).find(c => c.participants.includes(pubkey));
                if (conv) {
                    fetch('/api/messages/mark-read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pubkey: inboxAdminPubkey, conversationId: conv.id })
                    }).catch(() => {});
                    // Clear unread count locally
                    if (conv.unreadCount) conv.unreadCount = 0;
                }
            }
            
            document.getElementById('admin-inbox-input').disabled = false;
            document.getElementById('admin-inbox-send').disabled = false;
            renderAdminInboxList(); // update highlight
            renderAdminInboxChat();
        }

        function renderAdminInboxChat() {
            const headerEl = document.getElementById('admin-inbox-header');
            const messagesEl = document.getElementById('admin-inbox-messages');
            if (!headerEl || !messagesEl) return;

            if (!inboxSelectedUser) {
                headerEl.textContent = 'Select a conversation';
                messagesEl.innerHTML = '<div style="margin:auto;color:#475569;font-size:0.85rem;">No conversation selected</div>';
                return;
            }

            headerEl.textContent = 'Chat with ' + inboxSelectedUser.callsign;

            const conv = (inboxDataCache || []).find(c => c.participants.includes(inboxSelectedUser.publicKey));
            const messages = conv?.messages || [];

            if (messages.length === 0) {
                messagesEl.innerHTML = '<div style="margin:auto;color:#475569;font-size:0.85rem;">No messages yet. Send a warning to start the conversation.</div>';
                return;
            }

            messagesEl.innerHTML = messages.map(msg => {
                const isAdmin = msg.authorPubkey === inboxAdminPubkey || msg.authorPubkey === 'system';
                return `
                    <div style="align-self: ${isAdmin ? 'flex-end' : 'flex-start'}; max-width: 80%;">
                        <div style="background: ${isAdmin ? '#2563eb' : '#1e293b'}; border-radius: ${isAdmin ? '12px 12px 2px 12px' : '12px 12px 12px 2px'}; padding: 0.5rem 0.8rem; font-size: 0.85rem; color: #f8fafc; word-break: break-word;">
                            ${decodePlaintext(msg.ciphertext, msg.nonce)}
                        </div>
                        <div style="font-size: 0.65rem; color: #64748b; margin-top: 0.2rem; text-align: ${isAdmin ? 'right' : 'left'};">
                            ${new Date(msg.timestamp).toLocaleString()}
                        </div>
                    </div>
                `;
            }).join('');
            
            // Scroll to bottom
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        document.getElementById('admin-inbox-search')?.addEventListener('input', renderAdminInboxList);

        document.getElementById('admin-inbox-send')?.addEventListener('click', async () => {
            if (!authToken || !inboxSelectedUser) return;
            const inputEl = document.getElementById('admin-inbox-input');
            const message = inputEl.value.trim();
            if (!message) return;

            inputEl.disabled = true;
            try {
                const res = await fetch('/api/local/admin/inbox/send', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetPubkey: inboxSelectedUser.publicKey, message, password: authToken })
                });
                if (res.ok) {
                    inputEl.value = '';
                    await loadAdminInbox(); // refresh
                } else { alert('Failed to send message'); }
            } catch (e) { alert('Network error'); }
            finally { inputEl.disabled = false; inputEl.focus(); }
        });
        
        document.getElementById('admin-inbox-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('admin-inbox-send').click();
        });



        // ======================== DATABASE BACKUP ========================
        async function downloadBackup() {
            if (!authToken) return;
            const btn = document.getElementById('btn-backup');
            const statusEl = document.getElementById('backup-status');
            btn.disabled = true;
            btn.textContent = '⏳ Creating backup...';
            statusEl.textContent = '';
            try {
                const res = await fetch('/api/local/admin/backup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authToken })
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(err.error || `HTTP ${res.status}`);
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const disposition = res.headers.get('Content-Disposition') || '';
                const match = disposition.match(/filename="(.+?)"/);
                a.download = match ? match[1] : `beanpool-backup-${new Date().toISOString().slice(0,19).replace(/[:.]/g,'-')}.tar.gz`;
                a.href = url;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                statusEl.textContent = '✅ Backup downloaded';
                statusEl.style.color = '#10b981';
            } catch (e) {
                statusEl.textContent = '❌ ' + e.message;
                statusEl.style.color = '#ef4444';
            } finally {
                btn.disabled = false;
                btn.textContent = '💾 Download Backup';
            }
        }
        // Make it globally accessible for onclick
        window.downloadBackup = downloadBackup;

        // ======================== INIT ========================
        async function init() {
            try {
                const res = await fetch(`${API}/status`);
                const data = await res.json();
                if (data.isLocked) {
                    showView('login');
                } else {
                    // Node not locked — show message
                    showView('login');
                    showStatus('login-status', 'Node not configured. Set ADMIN_PASSWORD and restart.', 'error');
                }
            } catch (err) {
                showView('login');
                showStatus('login-status', 'Cannot reach server API', 'error');
            }
        }

        // Auto-refresh connectors every 10s while on settings view
        setInterval(() => {
            if (!document.getElementById('view-settings').classList.contains('hidden') && authToken) {
                refreshConnectors();
            }
        }, 10000);

        init();
