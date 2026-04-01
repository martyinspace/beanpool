import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Alert, Linking, Modal, Pressable } from 'react-native';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSavedNodes, SavedNode } from '../utils/nodes';
import { getLastSyncTime } from '../services/pillar-sync';

export function GlobalHeader() {
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const [locationEnabled, setLocationEnabled] = useState(false);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [savedNodes, setSavedNodes] = useState<(SavedNode & { status: 'pinging' | 'online' | 'offline' })[]>([]);
    const [switching, setSwitching] = useState(false);
    const [activeNode, setActiveNode] = useState<string | null>(null);
    const [activeSyncTime, setActiveSyncTime] = useState<number | null>(null);

    useEffect(() => {
        (async () => {
            const { status } = await Location.getForegroundPermissionsAsync();
            setLocationEnabled(status === 'granted');
        })();
    }, []);

    const openDropdown = async () => {
        const nodes = await getSavedNodes();
        const active = await AsyncStorage.getItem('beanpool_anchor_url');
        setActiveNode(active);
        const st = await getLastSyncTime();
        setActiveSyncTime(st);
        
        // Transform and prime array for background pings
        const enriched = nodes.map(n => ({ ...n, status: 'pinging' as const }));
        setSavedNodes(enriched);
        setDropdownVisible(true);

        // Silent HTTP verification mapping
        enriched.forEach((node, idx) => {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 3000);
            fetch(`${node.url}/api/community/health`, { signal: controller.signal })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
                .then(data => {
                    clearTimeout(t);
                    setSavedNodes(prev => {
                        const copy = [...prev];
                        if (data) {
                            const remoteName = data.nodeName || data.name /* fallback */;
                            const cType = data.currency?.type || 'image';
                            const cVal = data.currency?.value || 'bean';
                            
                            const changed = copy[idx].alias !== remoteName || copy[idx].currencyType !== cType || copy[idx].currencyValue !== cVal;
                            
                            if (remoteName && changed) {
                                copy[idx] = { ...copy[idx], status: 'online', alias: remoteName, currencyType: cType, currencyValue: cVal };
                                import('../utils/nodes').then(m => m.addSavedNode(node.url, remoteName, cType, cVal));
                            } else {
                                copy[idx] = { ...copy[idx], status: 'online' };
                            }
                        } else {
                            copy[idx] = { ...copy[idx], status: 'offline' };
                        }
                        return copy;
                    });
                });
        });
    };

    const handleQuickSwitch = async (targetUrl: string) => {
        if (targetUrl === activeNode) {
            setDropdownVisible(false);
            return;
        }
        setSwitching(true);
        try {
            const { closeDB, initDB } = await import('../utils/db');
            await closeDB(); 
            await AsyncStorage.setItem('beanpool_anchor_url', targetUrl);
            await initDB();
            setDropdownVisible(false);
            setSwitching(false);
            router.replace('/welcome');
        } catch (e: any) {
            setSwitching(false);
            Alert.alert("Pivot Failed", e.message);
        }
    };

    const handleLocationToggle = async () => {
        let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
        
        if (status === 'granted') {
            Alert.alert("Location Enabled", "BeanPool currently has access to your location. To disable it, please visit your device Settings.", [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() }
            ]);
            return;
        }

        if (canAskAgain) {
            const res = await Location.requestForegroundPermissionsAsync();
            if (res.status === 'granted') {
                setLocationEnabled(true);
            }
        } else {
            Alert.alert("Permission Denied", "Location permission was denied. Please enable it in your device settings to use location features.", [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() }
            ]);
        }
    };

    const isMapScreen = pathname === '/';

    return (
        <View style={[styles.headerWrapper, isMapScreen && styles.headerAbsolute]}>
            <View style={StyleSheet.absoluteFillObject}>
                <Image 
                    source={require('../assets/images/neon-vines-banner.png')} 
                    style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', transform: [{ scale: 1.5 }] }]}
                    resizeMode="cover"
                />
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
            </View>

            <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top + 10, 40) }]} pointerEvents="box-none">
                {/* LEFT: Invite Router Pill */}
                <View style={styles.headerLeft}>
                    <TouchableOpacity 
                        style={styles.headerLeftControls} 
                        onPress={() => router.push({ pathname: '/people', params: { view: 'invites' } })}
                    >
                        <MaterialCommunityIcons name="account-plus-outline" size={16} color="#10b981" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#10b981', marginLeft: 4 }}>Invite</Text>
                    </TouchableOpacity>
                </View>

                {/* CENTER: beanpool.org Text Logo or Page Title */}
                <TouchableOpacity 
                    style={[styles.headerCenter, { zIndex: 10 }]} 
                    activeOpacity={0.7} 
                    onPress={openDropdown}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
                        {isMapScreen ? (
                            <Image 
                                source={require('../assets/images/logo.png')} 
                                style={{ width: 140, height: 34, marginRight: 4 }} 
                                resizeMode="contain" 
                            />
                        ) : (
                            <Text style={[styles.headerTitle, { fontSize: 18, marginRight: 4 }]}>
                                {pathname === '/market' ? 'Marketplace' :
                                 pathname === '/projects' ? 'Community Projects' :
                                 pathname === '/chats' ? 'Messages' :
                                 pathname === '/people' ? 'People' :
                                 pathname === '/ledger' ? 'Ledger' :
                                 pathname === '/settings' ? 'Settings' : 'BeanPool'}
                            </Text>
                        )}
                        <MaterialCommunityIcons name="chevron-down" size={18} color="#ffffff" />
                    </View>
                </TouchableOpacity>

                {/* RIGHT: Controls */}
                <View style={styles.headerRightControls}>
                    <TouchableOpacity 
                        style={[styles.controlPillBtn, { borderRightWidth: 1, borderColor: '#e5e7eb' }]} 
                        onPress={handleLocationToggle} 
                    >
                        <MaterialCommunityIcons name={locationEnabled ? "map-marker-outline" : "map-marker-off-outline"} size={17} color="#4b5563" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={styles.controlPillBtn} 
                        onPress={() => {
                            if (pathname === '/settings') {
                                router.back();
                            } else {
                                router.push('/settings');
                            }
                        }}
                    >
                        <MaterialCommunityIcons name="tune" size={17} color={pathname === '/settings' ? "#8b5cf6" : "#4b5563"} />
                    </TouchableOpacity>
                </View>
            </View>

            <Modal visible={dropdownVisible} transparent animationType="fade">
                <Pressable style={styles.modalBg} onPress={() => setDropdownVisible(false)}>
                    <View style={[styles.modalContent, { marginTop: insets.top + 80 }]}>
                        <Text style={styles.modalHeader}>Select Community</Text>
                        {savedNodes.length === 0 && <Text style={{ padding: 10 }}>No saved communities.</Text>}
                        {savedNodes.map((n, i) => {
                            const isCurrent = activeNode === n.url;
                            
                            // Format active relative sync gap
                            let activeStatusText = 'Syncing...';
                            if (isCurrent && activeSyncTime) {
                                const seconds = Math.floor((Date.now() - activeSyncTime) / 1000);
                                if (seconds < 60) activeStatusText = `${seconds}s ago`;
                                else if (seconds < 3600) activeStatusText = `${Math.floor(seconds / 60)}m ago`;
                                else activeStatusText = `${Math.floor(seconds / 3600)}h ago`;
                            }

                            return (
                                <TouchableOpacity 
                                    key={i} 
                                    style={[styles.nodeBtn, isCurrent && styles.activeNodeBtn]}
                                    onPress={() => handleQuickSwitch(n.url)}
                                    disabled={switching}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.nodeTitle, isCurrent && styles.activeNodeText]} numberOfLines={1}>
                                            {n.alias || "Local Discovery"}
                                        </Text>
                                        <Text style={[styles.nodeSubText, isCurrent && styles.activeNodeText]} numberOfLines={1}>
                                            {n.url}
                                        </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                        {isCurrent ? (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={{ fontSize: 13, color: '#10b981', fontWeight: 'bold' }}>{activeStatusText}</Text>
                                                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#10b981' }} />
                                            </View>
                                        ) : (
                                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: n.status === 'pinging' ? '#fbbf24' : n.status === 'online' ? '#10b981' : '#ef4444' }} />
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    headerWrapper: {
        width: '100%',
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        overflow: 'hidden',
    },
    headerAbsolute: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
        borderBottomWidth: 0,
        zIndex: 100,
        elevation: 100,
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    headerLeft: { flex: 1, alignItems: 'flex-start' },
    headerCenter: { flex: 2, alignItems: 'center', justifyContent: 'center' },
    headerRight: { flex: 1, alignItems: 'flex-end' },
    logoBadge: {
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: 20,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    logoText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
        letterSpacing: 2,
        textTransform: 'lowercase',
    },
    headerTitle: {
        color: '#ffffff',
        fontSize: 22,
        fontWeight: '900',
        letterSpacing: 0.5,
        textShadowColor: 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
    },
    logoHighlight: {
        color: '#cb5326', // terra-400 equivalent
    },
    pillBase: {alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', height: 32, overflow: 'hidden' },
    headerLeftControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', height: 32, width: 80, overflow: 'hidden' },
    headerRightControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', height: 32, width: 72, overflow: 'hidden' },
    controlPillBtn: { flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center' },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center' },
    modalContent: { backgroundColor: '#fff', width: '85%', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
    modalHeader: { fontSize: 13, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
    nodeBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4 },
    activeNodeBtn: { backgroundColor: '#f3e8ff' },
    nodeTitle: { fontSize: 16, color: '#374151', fontWeight: '800' },
    nodeSubText: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    nodeText: { fontSize: 16, color: '#374151', fontWeight: '500', flex: 1 },
    activeNodeText: { color: '#8b5cf6' },
});
