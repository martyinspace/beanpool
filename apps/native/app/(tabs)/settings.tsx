import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Image, Share, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useIdentity } from '../IdentityContext';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { updateCallsign, wipeIdentity } from '../../utils/identity';
import { nativeExportIdentity } from '../../utils/native-crypto';
import { updateMemberProfile, getMemberProfile } from '../../utils/db';
import { getSavedNodes, SavedNode, removeSavedNode, getDatabaseFilenameForNode } from '../../utils/nodes';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import Constants from 'expo-constants';

export default function SettingsScreen() {
    const { identity, setIdentity } = useIdentity();
    const [mode, setMode] = useState<'menu' | 'profile' | 'export' | 'import' | 'advanced' | 'wipe'>('menu');
    const [editCallsign, setEditCallsign] = useState(identity?.callsign || '');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [bio, setBio] = useState('');
    const [contact, setContact] = useState('');
    const [loading, setLoading] = useState(false);
    const [anchorUrl, setAnchorUrl] = useState<string>('Detecting...');
    const [useModernMarkers, setUseModernMarkers] = useState(true);
    
    React.useEffect(() => {
        AsyncStorage.getItem('beanpool_modern_markers').then(val => {
            if (val !== null) setUseModernMarkers(val === 'true');
        });
    }, []);
    
    // Advanced subsystem state
    const [newAnchorInput, setNewAnchorInput] = useState('');
    const [changeConfirm, setChangeConfirm] = useState('');
    const [wipeConfirm, setWipeConfirm] = useState('');
    const [advancedLoading, setAdvancedLoading] = useState(false);
    const [savedNodes, setSavedNodes] = useState<(SavedNode & { status: 'pinging' | 'online' | 'offline', sizeBytes: number })[]>([]);
    const [newNodeAlias, setNewNodeAlias] = useState('');
    
    React.useEffect(() => {
        if (mode === 'advanced') {
            AsyncStorage.getItem('beanpool_anchor_url').then(val => {
                setAnchorUrl(val || 'Local discovery (or offline)');
                if (val) setNewAnchorInput(val);
            });
            
            // Load and ping all saved nodes
            getSavedNodes().then(async nodes => {
                const enriched = await Promise.all(nodes.map(async node => {
                    let size = 0;
                    try {
                        const fileInfo = await FileSystem.getInfoAsync((FileSystem as any).documentDirectory + 'SQLite/' + getDatabaseFilenameForNode(node.url));
                        if (fileInfo.exists) size = fileInfo.size;
                    } catch(e) {}
                    return { ...node, status: 'pinging' as const, sizeBytes: size };
                }));
                setSavedNodes(enriched);

                // Ping them
                enriched.forEach((node, i) => {
                    const c = new AbortController();
                    const t = setTimeout(() => c.abort(), 3000);
                    fetch(`${node.url}/api/community/health`, { signal: c.signal })
                        .then(r => r.ok ? 'online' : 'offline')
                        .catch(() => 'offline')
                        .then(status => {
                            clearTimeout(t);
                            setSavedNodes(prev => {
                                const nw = [...prev];
                                nw[i] = { ...nw[i], status: status as 'online' | 'offline' };
                                return nw;
                            });
                        });
                });
            });
        }
    }, [mode]);
    
    // Transfer logic
    const [pin, setPin] = useState('');
    const [exportUri, setExportUri] = useState('');
    const [importUri, setImportUri] = useState('');
    const [importPin, setImportPin] = useState('');

    if (!identity) return null;

    const fingerprint = identity.publicKey.slice(0, 16) + '...';

    async function handlePickImage() {
        Alert.alert('Profile Photo', 'Choose a source', [
            { text: 'Camera', onPress: async () => {
                try {
                    const perm = await ImagePicker.requestCameraPermissionsAsync();
                    if (!perm.granted) { Alert.alert('Permission required', 'Camera access is needed.'); return; }
                    const result = await ImagePicker.launchCameraAsync({
                        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true
                    });
                    if (!result.canceled && result.assets[0].base64) {
                        setAvatar(`data:image/jpeg;base64,${result.assets[0].base64}`);
                    }
                } catch (e) { Alert.alert('Error', 'Could not take photo.'); }
            }},
            { text: 'Gallery', onPress: async () => {
                try {
                    const result = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true
                    });
                    if (!result.canceled && result.assets[0].base64) {
                        setAvatar(`data:image/jpeg;base64,${result.assets[0].base64}`);
                    }
                } catch (e) { Alert.alert('Error', 'Could not pick image.'); }
            }},
            { text: 'Cancel', style: 'cancel' },
        ]);
    }

    async function handleUpdateCallsign() {
        if (!identity) return;
        if (editCallsign.trim().length < 2) {
            Alert.alert('Error', 'Callsign must be at least 2 characters.');
            return;
        }
        setLoading(true);
        try {
            await updateMemberProfile(identity.publicKey, {
                callsign: editCallsign.trim(),
                avatar_url: avatar,
                bio: bio.trim(),
                contact_value: contact.trim()
            });
            if (editCallsign.trim() !== identity.callsign) {
                const updated = await updateCallsign(editCallsign.trim());
                if (updated) setIdentity(updated);
            }
            setMode('menu');
        } catch (e) {
            Alert.alert('Error', 'Could not update profile.');
        } finally {
            setLoading(false);
        }
    }

    async function handleSwitchNode(targetUrl: string) {
        if (targetUrl === anchorUrl) return;
        setAdvancedLoading(true);
        try {
            const { closeDB, initDB } = await import('../../utils/db');
            await closeDB(); 
            // The database is successfully suspended to Cold Storage.
            await AsyncStorage.setItem('beanpool_anchor_url', targetUrl);
            await initDB();
            
            // Hard bounce the Application State Tree via the Welcome resolver
            router.replace('/welcome');
        } catch (e: any) {
            Alert.alert("Pivot Failed", e.message);
            setAdvancedLoading(false);
        }
    }

    async function handleForgetNode(targetUrl: string) {
        if (targetUrl === anchorUrl) {
            const remainingNodes = savedNodes.filter(n => n.url !== targetUrl);
            if (remainingNodes.length === 0) {
                Alert.alert("Action Denied", "You cannot forget your only saved node. If you want to leave BeanPool completely, please use 'Delete Account' to destroy your identity.");
                return;
            }
            
            Alert.alert(
                "Forget Active Node",
                "You are currently connected to this node. To forget it, you will automatically be switched to your next saved node.",
                [
                    { text: "Cancel", style: "cancel" },
                    { 
                        text: "Forget & Switch", 
                        style: "destructive",
                        onPress: async () => {
                            await removeSavedNode(targetUrl);
                            setSavedNodes(remainingNodes);
                            try {
                                await FileSystem.deleteAsync((FileSystem as any).documentDirectory + 'SQLite/' + getDatabaseFilenameForNode(targetUrl), { idempotent: true });
                            } catch(e) {}
                            
                            // Automatically pivot to the next available node
                            await handleSwitchNode(remainingNodes[0].url);
                        }
                    }
                ]
            );
            return;
        }

        await removeSavedNode(targetUrl);
        setSavedNodes(prev => prev.filter(n => n.url !== targetUrl));
        // Optional: Physically delete the dormant .db file from the OS folder
        try {
            await FileSystem.deleteAsync((FileSystem as any).documentDirectory + 'SQLite/' + getDatabaseFilenameForNode(targetUrl), { idempotent: true });
        } catch(e) {}
    }

    async function handleUpdateAnchor() {
        if (!newAnchorInput.trim()) {
            Alert.alert("Invalid URL", "Please enter a valid BeanPool Node IP address.");
            return;
        }
        if (changeConfirm !== 'CHANGE') {
            Alert.alert("Warning", "You must type exactly 'CHANGE' to verify this destructive action.");
            return;
        }

        setAdvancedLoading(true);
        try {
            let finalAnchorUrl = newAnchorInput.trim();
            if (finalAnchorUrl && !finalAnchorUrl.startsWith('http')) {
                const isIpOrLocal = /^(?:\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(finalAnchorUrl) || finalAnchorUrl.startsWith('localhost');
                finalAnchorUrl = (isIpOrLocal ? 'http://' : 'https://') + finalAnchorUrl;
            }
            await AsyncStorage.setItem('beanpool_anchor_url', finalAnchorUrl);
            // Inject alias to native node matrix
            const { addSavedNode } = await import('../../utils/nodes');
            await addSavedNode(finalAnchorUrl, newNodeAlias.trim() || undefined);

            // Nuclear purge the native cache databases
            await AsyncStorage.removeItem('pillar:last-sync');
            await AsyncStorage.removeItem('pillar:checkpoint');
            const { clearDB, initDB } = await import('../../utils/db');
            await clearDB();
            await initDB();

            const { performSync } = await import('../../services/pillar-sync');
            performSync()
                .then((res: any) => { if (!res?.success) console.warn("Sync failed after URL update:", res?.errorMessage); })
                .catch((err: any) => console.error("Sync caught an error:", err));

            Alert.alert("Network Migrated", "Your Node IP has been successfully updated. The app is downloading the new network's state in the background.");
            setAnchorUrl(finalAnchorUrl);
            setChangeConfirm('');
        } catch (e: any) {
            Alert.alert("Update Failed", String(e.message || e));
        } finally {
            setAdvancedLoading(false);
        }
    }

    async function handleWipe() {
        if (wipeConfirm !== 'WIPE') {
            Alert.alert("Warning", "You must type exactly 'WIPE' to delete your mathematical identity.");
            return;
        }
        Alert.alert(
            "Wipe Device Identity",
            "This will permanently erase your Ed25519 Private Key from the Secure Enclave. This cannot be undone unless you have your 12-word recovery phrase.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Destroy Key", 
                    style: "destructive",
                    onPress: async () => {
                        setAdvancedLoading(true);
                        const { clearDB } = await import('../../utils/db');
                        await clearDB();
                        
                        // Purge sync engine cursors and the saved node matrix to force a clean slate
                        await AsyncStorage.multiRemove([
                            'beanpool_anchor_url',
                            'beanpool_saved_nodes',
                            'pillar:last-sync',
                            'pillar:merkle-root',
                            'pillar:accounts',
                            'pillar:transactions',
                            'pillar:checkpoint'
                        ]);

                        // Physically delete dormant DB files for all saved nodes to reclaim disk space
                        for (const node of savedNodes) {
                            try {
                                await FileSystem.deleteAsync((FileSystem as any).documentDirectory + 'SQLite/' + getDatabaseFilenameForNode(node.url), { idempotent: true });
                            } catch (e) {}
                        }
                        
                        await wipeIdentity();
                        setIdentity(null);
                    }
                }
            ]
        );
    }

    async function handleExport() {
        if (!identity) return;
        if (pin.length < 4) {
            Alert.alert('Error', 'PIN must be at least 4 digits.');
            return;
        }
        setLoading(true);
        try {
            const uri = await nativeExportIdentity(identity, pin);
            setExportUri(uri);
        } catch (e: any) {
            Alert.alert('Export Failed', 'Could not export identity: ' + (e.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    }

    async function handleImport() {
        if (importPin.length < 4) {
            Alert.alert('Error', 'PIN must be at least 4 digits.');
            return;
        }
        if (!importUri || !importUri.includes('import=')) {
            Alert.alert('Error', 'Invalid Transfer URI.');
            return;
        }
        setLoading(true);
        try {
            const { nativeDecryptIdentity } = await import('../../utils/native-crypto');
            const importedIdentity = await nativeDecryptIdentity(importUri, importPin);
            
            Alert.alert(
                "Overwrite Device Identity?",
                `Do you want to permanently merge this device onto the "${importedIdentity.callsign}" identity? Your current device keys will be destroyed.`,
                [
                    { text: "Cancel", style: "cancel" },
                    { 
                        text: "Yes, Merge Devices", 
                        style: "destructive",
                        onPress: async () => {
                            await wipeIdentity();
                            await SecureStore.setItemAsync('sovereign-identity', JSON.stringify({
                                publicKey: importedIdentity.publicKey,
                                privateKey: importedIdentity.privateKey,
                                callsign: importedIdentity.callsign,
                                createdAt: importedIdentity.createdAt,
                            }));
                            setIdentity(importedIdentity);
                            setMode('menu');
                            Alert.alert('Success', 'Device Unified Successfully!');
                        }
                    }
                ]
            );
        } catch (e: any) {
            Alert.alert('Import Failed', e.message || 'Decrypt error. Wrong PIN?');
        } finally {
            setLoading(false);
        }
    }

    async function handleCopy() {
        if (exportUri) {
            await Clipboard.setStringAsync(exportUri);
            Alert.alert('Copied!', 'Transfer code copied to clipboard.');
        }
    }

    async function handleShare() {
        if (exportUri) {
            try {
                await Share.share({ message: exportUri });
            } catch (e) {
                // User cancelled share
            }
        }
    }



    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Identity Card */}
            <View style={styles.card}>
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                    {avatar ? (
                        <Image source={{ uri: avatar }} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#10b981' }} />
                    ) : (
                        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#262626', borderWidth: 3, borderColor: '#404040', justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontSize: 32 }}>👤</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.label}>CALLSIGN</Text>
                <Text style={styles.value}>{identity.callsign}</Text>
                
                <Text style={styles.label}>PUBLIC KEY</Text>
                <View style={styles.keyBox}>
                    <Text style={styles.keyValue}>{fingerprint}</Text>
                </View>
            </View>

            {mode === 'menu' && (
                <>
                <View style={styles.menuGroup}>
                    <Pressable style={styles.menuBtn} onPress={() => setMode('profile')}>
                        <Text style={styles.menuText}>👤 Edit Profile</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => { setMode('export'); setPin(''); setExportUri(''); }}>
                        <Text style={styles.menuText}>📤 Export Identity</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => { setMode('import'); setImportUri(''); setImportPin(''); }}>
                        <Text style={styles.menuText}>📥 Import Identity</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => Linking.openURL('https://beanpool.org/privacy.html')}>
                        <Text style={styles.menuText}>🛡️ Privacy Policy</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => Linking.openURL('https://beanpool.org/terms.html')}>
                        <Text style={styles.menuText}>⚖️ Terms of Service & EULA</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => Linking.openURL('https://beanpool.org/safety.html')}>
                        <Text style={styles.menuText}>🚸 Child Safety Standards</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <View style={styles.menuBtn}>
                        <View>
                            <Text style={styles.menuText}>🗺️ Modern Map Pins</Text>
                            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Toggle standard vs custom pin styles</Text>
                        </View>
                        <Pressable 
                            style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: useModernMarkers ? '#10b981' : '#e5e7eb', justifyContent: 'center', paddingHorizontal: 2 }}
                            onPress={async () => {
                                const next = !useModernMarkers;
                                setUseModernMarkers(next);
                                await AsyncStorage.setItem('beanpool_modern_markers', next ? 'true' : 'false');
                            }}
                        >
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', transform: [{ translateX: useModernMarkers ? 22 : 0 }] }} />
                        </Pressable>
                    </View>
                    <Pressable style={styles.menuBtn} onPress={() => setMode('advanced')}>
                        <Text style={styles.menuText}>⚙️ Advanced / Subsystem</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={[styles.menuBtn, { borderBottomWidth: 0, backgroundColor: '#fff5f5' }]} onPress={() => { setMode('wipe'); setWipeConfirm(''); }}>
                        <Text style={[styles.menuText, { color: '#ef4444', fontWeight: 'bold' }]}>⚠️ Delete Account</Text>
                        <Text style={[styles.menuArrow, { color: '#fca5a5' }]}>→</Text>
                    </Pressable>
                </View>
                <Text style={{ textAlign: 'center', marginTop: 32, fontSize: 13, color: '#9ca3af', fontWeight: '600', letterSpacing: 1 }}>
                    BEANPOOL OS {Constants.expoConfig?.version || 'DEV'}
                </Text>
                </>
            )}

            {mode === 'profile' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Edit Profile</Text>
                    
                    {/* Avatar Picker */}
                    <View style={{ alignItems: 'center', marginBottom: 20 }}>
                        <Pressable 
                            onPress={handlePickImage} 
                            style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#e5e7eb', overflow: 'hidden' }}
                        >
                            {avatar ? (
                                <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} />
                            ) : (
                                <Text style={{ fontSize: 32 }}>📷</Text>
                            )}
                        </Pressable>
                        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>Tap to change photo</Text>
                    </View>

                    <Text style={styles.label}>CALLSIGN</Text>
                    <TextInput 
                        style={styles.input}
                        value={editCallsign}
                        onChangeText={setEditCallsign}
                        maxLength={32}
                    />

                    <Text style={styles.label}>BIO</Text>
                    <TextInput 
                        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                        value={bio}
                        onChangeText={setBio}
                        multiline
                        maxLength={200}
                        placeholder="A short bio about yourself..."
                    />

                    <Text style={styles.label}>CONTACT DETAILS</Text>
                    <TextInput 
                        style={styles.input}
                        value={contact}
                        onChangeText={setContact}
                        placeholder="Phone, email, or WhatsApp"
                    />

                    <Pressable style={styles.primaryBtn} onPress={handleUpdateCallsign} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save Profile</Text>}
                    </Pressable>
                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>Cancel</Text>
                    </Pressable>
                </View>
            )}

            {mode === 'export' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>📤 Export Identity</Text>
                    
                    {!exportUri ? (
                        <>
                            <Text style={styles.infoText}>
                                Choose a PIN to protect your identity during transfer. You'll need this same PIN on the receiving device.
                            </Text>
                            <TextInput 
                                style={[styles.input, { textAlign: 'center', fontSize: 20, letterSpacing: 8 }]}
                                value={pin}
                                onChangeText={setPin}
                                placeholder="4+ Digit PIN"
                                keyboardType="number-pad"
                                maxLength={8}
                                secureTextEntry
                            />
                            <Pressable style={[styles.primaryBtn, pin.length < 4 && { opacity: 0.5 }]} onPress={handleExport} disabled={loading || pin.length < 4}>
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Generate Transfer Code</Text>}
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <Text style={styles.infoText}>Your encrypted identity link is ready. Send it to your other device.</Text>
                            <View style={styles.uriBox}>
                                <Text style={styles.uriText} selectable>{exportUri}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                                <Pressable style={[styles.primaryBtn, { flex: 1, backgroundColor: '#059669' }]} onPress={handleCopy}>
                                    <Text style={styles.primaryBtnText}>📋 Copy</Text>
                                </Pressable>
                                <Pressable style={[styles.primaryBtn, { flex: 1, backgroundColor: '#d97757' }]} onPress={handleShare}>
                                    <Text style={styles.primaryBtnText}>📤 Share</Text>
                                </Pressable>
                            </View>
                            <View style={{ backgroundColor: '#ecfdf5', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#a7f3d0' }}>
                                <Text style={{ color: '#059669', fontSize: 14, fontWeight: '800' }}>🔑 PIN: {pin}</Text>
                            </View>
                        </>
                    )}
                    
                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>Cancel</Text>
                    </Pressable>
                </View>
            )}

            {mode === 'import' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>📥 Import Identity</Text>
                    
                    <Text style={styles.infoText}>
                        Paste the Identity Transfer URI (or beanpool://import string) and enter the 4+ digit PIN from your other device to securely merge.
                    </Text>
                    <TextInput 
                        style={[styles.input, { height: 80, textAlignVertical: 'top', fontSize: 13, fontFamily: 'monospace' }]}
                        value={importUri}
                        onChangeText={setImportUri}
                        placeholder="https://.../?import=..."
                        placeholderTextColor="#9ca3af"
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TextInput 
                        style={[styles.input, { textAlign: 'center', fontSize: 20, letterSpacing: 8, marginBottom: 24 }]}
                        value={importPin}
                        onChangeText={setImportPin}
                        placeholder="PIN"
                        keyboardType="number-pad"
                        maxLength={8}
                        secureTextEntry
                    />
                    
                    <Pressable style={[styles.primaryBtn, (importPin.length < 4 || !importUri) && { opacity: 0.5 }]} onPress={handleImport} disabled={loading || importPin.length < 4 || !importUri}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Decrypt & Merge Device</Text>}
                    </Pressable>
                    
                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>Cancel</Text>
                    </Pressable>
                </View>
            )}



            {mode === 'advanced' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Saved Communities</Text>
                    <Text style={styles.infoText}>
                        Your physical identity automatically ports between the dormant disconnected local states tracking below.
                    </Text>

                    {savedNodes.map((node, i) => {
                        const isActive = node.url === anchorUrl;
                        return (
                            <View key={i} style={[{ padding: 12, borderWidth: isActive ? 2 : 1, borderColor: isActive ? '#8b5cf6' : '#e5e7eb', borderRadius: 10, marginBottom: 10 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={{ fontSize: 16 }}>{node.status === 'pinging' ? '🟡' : node.status === 'online' ? '🟢' : '🔴'}</Text>
                                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#111827' }}>{node.url}</Text>
                                    </View>
                                    <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 'bold' }}>{(node.sizeBytes / 1024 / 1024).toFixed(1)} MB</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                    {!isActive ? (
                                        <Pressable style={{ flex: 1, backgroundColor: '#f3f4f6', padding: 8, borderRadius: 6, alignItems: 'center' }} onPress={() => handleSwitchNode(node.url)} disabled={advancedLoading}>
                                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#374151' }}>{advancedLoading ? 'Mounting...' : 'Switch to Town'}</Text>
                                        </Pressable>
                                    ) : (
                                        <View style={{ flex: 1, backgroundColor: '#ede9fe', padding: 8, borderRadius: 6, alignItems: 'center' }}>
                                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#8b5cf6' }}>Active Node</Text>
                                        </View>
                                    )}
                                    {!isActive && (
                                        <Pressable style={{ padding: 8, backgroundColor: '#fee2e2', borderRadius: 6 }} onPress={() => handleForgetNode(node.url)}>
                                            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#b91c1c' }}>Forget</Text>
                                        </Pressable>
                                    )}
                                </View>
                            </View>
                        );
                    })}

                    <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 24 }} />

                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Add Manual Node</Text>
                    <Text style={styles.infoText}>You can manually append an offline Node IP Address to your keychain bypass, directly executing a forced sync pipeline setup.</Text>

                    <Text style={styles.label}>COMMUNITY ALIAS (OPTIONAL)</Text>
                    <TextInput 
                        style={styles.input}
                        value={newNodeAlias}
                        onChangeText={setNewNodeAlias}
                        placeholder="e.g. My Secret Base"
                        autoCapitalize="words"
                        autoCorrect={false}
                    />

                    <Text style={styles.label}>NEW NODE IP</Text>
                    <TextInput 
                        style={styles.input}
                        value={newAnchorInput}
                        onChangeText={setNewAnchorInput}
                        placeholder="e.g. http://192.168.1.55"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    
                    <Text style={styles.label}>TYPE 'CHANGE' TO VERIFY</Text>
                    <TextInput 
                        style={[styles.input, { textAlign: 'center', fontWeight: 'bold', color: '#f59e0b', borderColor: '#fcd34d' }]}
                        value={changeConfirm}
                        onChangeText={setChangeConfirm}
                        placeholder="CHANGE"
                        autoCapitalize="characters"
                        autoCorrect={false}
                    />

                    <Pressable style={[styles.primaryBtn, { backgroundColor: '#f59e0b' }, (advancedLoading || changeConfirm !== 'CHANGE') && { opacity: 0.5 }]} onPress={handleUpdateAnchor} disabled={advancedLoading || changeConfirm !== 'CHANGE'}>
                        {advancedLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Wipe Cache & Migrate</Text>}
                    </Pressable>

                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </Pressable>
                </View>
            )}

            {mode === 'wipe' && (
                <View style={styles.card}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ef4444', marginBottom: 8 }}>Danger Zone</Text>
                    <Text style={styles.infoText}>This destroys your cryptographic private keys from your phone permanently. You will not be able to recover your account or your ledger balances without a backup.</Text>
                    
                    <Text style={styles.label}>TYPE 'WIPE' TO VERIFY</Text>
                    <TextInput 
                        style={[styles.input, { textAlign: 'center', fontWeight: 'bold', color: '#ef4444', borderColor: '#fca5a5' }]}
                        value={wipeConfirm}
                        onChangeText={setWipeConfirm}
                        placeholder="WIPE"
                        autoCapitalize="characters"
                        autoCorrect={false}
                    />

                    <Pressable style={[styles.dangerBtn, (advancedLoading || wipeConfirm !== 'WIPE') && { opacity: 0.5 }]} onPress={handleWipe} disabled={advancedLoading || wipeConfirm !== 'WIPE'}>
                        <Text style={styles.dangerBtnText}>Permanently Delete Identity</Text>
                    </Pressable>

                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </Pressable>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    content: { padding: 24, paddingVertical: 48 },
    header: { fontSize: 24, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 24 },
    card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginBottom: 24, borderWidth: 1, borderColor: '#e5e7eb' },
    label: { fontSize: 11, fontWeight: 'bold', color: '#6b7280', letterSpacing: 1, marginBottom: 4, marginTop: 12 },
    value: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
    keyBox: { backgroundColor: '#fdf4f2', borderColor: '#fbcfe8', borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 4 },
    keyValue: { color: '#e11d48', fontFamily: 'Courier', fontSize: 13 },
    menuGroup: { backgroundColor: '#ffffff', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
    menuBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    menuText: { fontSize: 16, fontWeight: '600', color: '#374151' },
    menuArrow: { fontSize: 16, color: '#9ca3af' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
    input: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, color: '#111827', fontSize: 16, marginBottom: 16 },
    primaryBtn: { backgroundColor: '#111827', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    primaryBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
    backBtn: { marginTop: 16, alignItems: 'center', padding: 10 },
    backBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
    dangerBtn: { backgroundColor: '#fee2e2', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: '#fca5a5' },
    dangerBtnText: { color: '#b91c1c', fontSize: 14, fontWeight: 'bold' },
    infoText: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 16 },
    uriBox: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16, maxHeight: 100 },
    uriText: { fontSize: 12, fontFamily: 'monospace', color: '#475569' }
});
