import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Image, Share, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useIdentity } from '../IdentityContext';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { processProfileImage } from '../../utils/image-processing';
import { AvatarPickerSheet } from '../../components/AvatarPickerSheet';
import { resolveBundledAvatar } from '../../utils/bundled-avatars';
import { updateCallsign, wipeIdentity } from '../../utils/identity';
import { nativeExportIdentity } from '../../utils/native-crypto';
import { encodeBase64, encodeUtf8, hexToBytes, signData } from '../../utils/crypto';
import { updateMemberProfile, getMemberProfile, getPendingRecoveryRequests, approveRecoveryRequest, rejectRecoveryRequest, signedRequest } from '../../utils/db';
import { getSavedNodes, SavedNode, removeSavedNode, getDatabaseFilenameForNode } from '../../utils/nodes';
import * as FileSystem from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import appConfig from '../../app.json';

export default function SettingsScreen() {
    const { identity, setIdentity } = useIdentity();
    const [mode, setMode] = useState<'menu' | 'profile' | 'export' | 'import' | 'seed' | 'advanced' | 'wipe' | 'notifications' | 'recovery-requests'>('menu');
    const params = useLocalSearchParams<{ section?: string }>();

    // Deep-link: auto-open sections from other pages
    useEffect(() => {
        if (params.section === 'advanced') setMode('advanced');
        if (params.section === 'profile') setMode('profile');
    }, [params.section]);

    // Notification preference state
    const [notifChat, setNotifChat] = useState(true);
    const [notifMarketplace, setNotifMarketplace] = useState(true);
    const [notifEscrow, setNotifEscrow] = useState(true);
    const [notifLoading, setNotifLoading] = useState(false);
    const [editCallsign, setEditCallsign] = useState(identity?.callsign || '');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [bio, setBio] = useState('');
    const [contact, setContact] = useState('');
    const [contactVisibility, setContactVisibility] = useState<'hidden' | 'trade_partners' | 'friends' | 'community'>('community');
    const [loading, setLoading] = useState(false);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [anchorUrl, setAnchorUrl] = useState<string>('Detecting...');
    
    React.useEffect(() => {
        // Load profile data on mount
        if (identity?.publicKey) {
            getMemberProfile(identity.publicKey).then(profile => {
                if (profile) {
                    if (profile.avatar_url) setAvatar(profile.avatar_url);
                    if (profile.bio) setBio(profile.bio);
                    if (profile.contact_value) setContact(profile.contact_value);
                    if (profile.contact_visibility) setContactVisibility(profile.contact_visibility);
                }
            }).catch(() => {});
        }
    }, []);
    
    // Advanced subsystem state
    const [newAnchorInput, setNewAnchorInput] = useState('');
    const [changeConfirm, setChangeConfirm] = useState('');
    const [wipeConfirm, setWipeConfirm] = useState('');
    const [seedConfirm, setSeedConfirm] = useState('');
    const [seedVisible, setSeedVisible] = useState(false);
    const [advancedLoading, setAdvancedLoading] = useState(false);
    const [savedNodes, setSavedNodes] = useState<(SavedNode & { status: 'pinging' | 'online' | 'offline', sizeBytes: number })[]>([]);
    const [newNodeAlias, setNewNodeAlias] = useState('');
    const [redeemInviteCode, setRedeemInviteCode] = useState('');
    const [redeemLoading, setRedeemLoading] = useState(false);
    
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

    // Recovery logic
    const [recoveryReqs, setRecoveryReqs] = useState<any[]>([]);
    const [recoveryLoading, setRecoveryLoading] = useState(false);

    React.useEffect(() => {
        if (mode === 'recovery-requests') {
            setRecoveryLoading(true);
            getPendingRecoveryRequests()
                .then(setRecoveryReqs)
                .catch(console.error)
                .finally(() => setRecoveryLoading(false));
        }
    }, [mode]);

    if (!identity) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' }}>
                <Text style={{ fontSize: 18, color: 'red' }}>Debug: Identity is null.</Text>
            </View>
        );
    }




    async function handlePickImage() {
        setShowAvatarPicker(true);
    }

    async function handleUpdateCallsign() {
        if (!identity) return;
        if (editCallsign.trim().length < 2) {
            Alert.alert('Error', 'Callsign must be at least 2 characters.');
            return;
        }
        setLoading(true);
        try {
            // Only include avatar_url in the update if we have one in local state.
            // If avatar state is null (e.g., profile fetch hasn't completed), do NOT
            // send avatar_url at all — otherwise we'd wipe the existing avatar on the server.
            const localUpdate: any = {
                callsign: editCallsign.trim(),
                bio: bio.trim(),
                contact_value: contact.trim(),
                contact_visibility: contact.trim() ? contactVisibility : 'hidden',
            };
            if (avatar) localUpdate.avatar_url = avatar;
            await updateMemberProfile(identity.publicKey, localUpdate);
            if (editCallsign.trim() !== identity.callsign) {
                const updated = await updateCallsign(editCallsign.trim());
                if (updated) setIdentity(updated);
            }

            // Push profile (including avatar) to the server so other devices see it
            try {
                const url = await AsyncStorage.getItem('beanpool_anchor_url');
                if (url && identity) {
                    // Same guard as local: don't send avatar=null if state hasn't loaded
                    const payloadObj: any = {
                        publicKey: identity.publicKey,
                        bio: bio.trim(),
                        contact: contact.trim() ? { value: contact.trim(), visibility: contactVisibility } : null,
                        callsign: editCallsign.trim(),
                    };
                    if (avatar) payloadObj.avatar = avatar;
                    const bodyString = JSON.stringify(payloadObj);
                    const privateKeyBytes = hexToBytes(identity.privateKey);
                    const messageBytes = encodeUtf8(bodyString);
                    const signatureBytes = await signData(messageBytes, privateKeyBytes);
                    const signatureBase64 = encodeBase64(signatureBytes);

                    const res = await fetch(`${url}/api/profile/update`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'X-Public-Key': identity.publicKey,
                            'X-Signature': signatureBase64,
                        },
                        body: bodyString,
                    });
                    
                    if (!res.ok) {
                        throw new Error('Server rejected the profile update.');
                    }
                    await AsyncStorage.removeItem('pending_profile_sync');
                }
            } catch (e: any) {
                console.warn('[Profile] Server sync failed (offline?):', e);
                await AsyncStorage.setItem('pending_profile_sync', 'true');
                Alert.alert('Offline Mode', 'Profile saved locally. It will be published automatically in the background when you reconnect to the network.');
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
        }
    }

    async function handleRedeemInvite() {
        if (!redeemInviteCode.trim()) return;
        setRedeemLoading(true);
        try {
            const { redeemInvite } = await import('../../utils/db');
            // Re-fetch the callsign just to be sure it's current
            await redeemInvite(redeemInviteCode.trim(), identity?.callsign || 'Unknown', identity);
            
            // Kick off a background sync immediately so they pull the node's ledger
            const { performSync } = await import('../../services/pillar-sync');
            performSync().catch(console.error);

            Alert.alert('Success', 'Invite redeemed successfully on current node! Syncing data...');
            setRedeemInviteCode('');
        } catch (e: any) {
            Alert.alert('Redemption Failed', e.message);
        } finally {
            setRedeemLoading(false);
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

    async function handleForceResync(targetUrl: string) {
        Alert.alert(
            "Force Resync",
            "This will delete your local database for this community and redownload everything from scratch.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear & Resync",
                    style: "destructive",
                    onPress: async () => {
                        setAdvancedLoading(true);
                        try {
                            const dbFilename = getDatabaseFilenameForNode(targetUrl);
                            await AsyncStorage.multiRemove([
                                `pillar_sync_${dbFilename}_last-sync`,
                                `pillar_sync_${dbFilename}_checkpoint`
                            ]);
                            const { clearDB, initDB } = await import('../../utils/db');
                            await clearDB();
                            await initDB();
                            
                            const { performSync } = await import('../../services/pillar-sync');
                            performSync().then((res: any) => {
                                if (res?.success) Alert.alert("Success", "Local database rebuilt.");
                                else Alert.alert("Sync Error", res?.errorMessage || "Failed to fetch data.");
                            });
                        } catch (e: any) {
                            Alert.alert("Error", String(e.message || e));
                        } finally {
                            setAdvancedLoading(false);
                        }
                    }
                }
            ]
        );
    }

    async function handleUpdateAnchor() {
        if (!newAnchorInput.trim()) {
            Alert.alert("Invalid URL", "Please enter a valid BeanPool Node IP address.");
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

            const { closeDB, initDB } = await import('../../utils/db');
            await closeDB();
            await initDB();

            const { performSync } = await import('../../services/pillar-sync');
            performSync()
                .then((res: any) => { if (!res?.success) console.warn("Sync failed after URL update:", res?.errorMessage); })
                .catch((err: any) => console.error("Sync caught an error:", err));

            Alert.alert("Node Added", "You have successfully connected to the new community.");
            setAnchorUrl(finalAnchorUrl);
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
                        const allKeys = await AsyncStorage.getAllKeys();
                        const pillarKeys = allKeys.filter(k => k.startsWith('pillar_sync_') || k.startsWith('pillar:'));
                        await AsyncStorage.multiRemove([
                            'beanpool_anchor_url',
                            'beanpool_saved_nodes',
                            ...pillarKeys
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
            await AsyncStorage.setItem('beanpool_identity_backed_up', 'true');
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
            {/* ─── Identity Dashboard Card ─── */}
            <View style={styles.identityCard}>
                <View style={styles.identityInner}>
                    {/* Edit button — top-right corner */}
                    <Pressable style={styles.editBadge} onPress={() => setMode('profile')}>
                        <Text style={styles.editBadgeText}>✏️ Edit</Text>
                    </Pressable>

                    {/* Avatar */}
                    <Pressable onPress={() => setMode('profile')} style={styles.avatarWrap}>
                        {avatar ? (
                            <Image source={avatar.startsWith('bundled://') ? resolveBundledAvatar(avatar)! : { uri: avatar }} style={styles.avatarImg} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={{ fontSize: 42 }}>👤</Text>
                            </View>
                        )}
                        <View style={styles.avatarRing} />
                    </Pressable>

                    {/* Callsign */}
                    <Text style={styles.callsignText}>{identity.callsign}</Text>

                    {/* Bio */}
                    {bio ? <Text style={styles.bioText}>{bio}</Text> : null}

                    {/* Contact */}
                    {contact ? (
                        <View style={styles.contactRow}>
                            <Text style={{ fontSize: 13 }}>📱</Text>
                            <Text style={styles.contactText}>{contact}</Text>
                        </View>
                    ) : null}

                    {/* Public Key — truncated, tap to copy */}
                    <Pressable 
                        style={styles.pubkeyRow}
                        onPress={async () => {
                            await Clipboard.setStringAsync(identity.publicKey);
                            Alert.alert('Copied', 'Public key copied to clipboard.');
                        }}
                    >
                        <Text style={styles.pubkeyText}>
                            {identity.publicKey.slice(0, 6)}...{identity.publicKey.slice(-6)}
                        </Text>
                        <Text style={{ fontSize: 12, marginLeft: 6 }}>📋</Text>
                    </Pressable>
                </View>
            </View>

            {mode === 'menu' && (
                <>
                {/* ─── Account & Identity ─── */}
                <Text style={styles.sectionHeader}>ACCOUNT & IDENTITY</Text>
                <View style={styles.menuGroup}>
                    <Pressable style={styles.menuBtn} onPress={() => { setMode('recovery-requests'); }}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>🛡️</Text></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.menuText}>Recovery Requests</Text>
                            <Text style={styles.menuSub}>Help a friend recover their identity</Text>
                        </View>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => { setMode('export'); setPin(''); setExportUri(''); }}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>📤</Text></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.menuText}>Export Identity</Text>
                            <Text style={styles.menuSub}>Transfer your keys to another device</Text>
                        </View>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => { setMode('import'); setImportUri(''); setImportPin(''); }}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>📥</Text></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.menuText}>Import Identity</Text>
                            <Text style={styles.menuSub}>Merge from another device</Text>
                        </View>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                    <Pressable style={[styles.menuBtn, styles.menuBtnLast]} onPress={() => { setMode('seed'); setSeedConfirm(''); setSeedVisible(false); }}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>🔑</Text></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.menuText}>View Recovery Phrase</Text>
                            <Text style={styles.menuSub}>View your 12-word backup seed</Text>
                        </View>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                </View>

                {/* ─── App Settings ─── */}
                <Text style={styles.sectionHeader}>APP SETTINGS</Text>
                <View style={styles.menuGroup}>
                    <Pressable style={[styles.menuBtn, styles.menuBtnLast]} onPress={async () => {
                        setMode('notifications');
                        setNotifLoading(true);
                        try {
                            const url = await AsyncStorage.getItem('beanpool_anchor_url');
                            if (url && identity?.publicKey) {
                                const res = await fetch(`${url}/api/members/preferences?publicKey=${identity.publicKey}`);
                                if (res.ok) {
                                    const prefs = await res.json();
                                    setNotifChat(prefs.notify_chat !== 'false');
                                    setNotifMarketplace(prefs.notify_marketplace !== 'false');
                                    setNotifEscrow(prefs.notify_escrow !== 'false');
                                }
                            }
                        } catch (e) { console.warn('[Prefs] Failed to fetch preferences:', e); }
                        setNotifLoading(false);
                    }}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>🔔</Text></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.menuText}>Notification Preferences</Text>
                            <Text style={styles.menuSub}>Control push alerts by category</Text>
                        </View>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                </View>

                {/* ─── Legal & Privacy ─── */}
                <Text style={styles.sectionHeader}>LEGAL & PRIVACY</Text>
                <View style={styles.menuGroup}>
                    <Pressable style={styles.menuBtn} onPress={() => Linking.openURL('https://beanpool.org/privacy.html')}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>🛡️</Text></View>
                        <Text style={[styles.menuText, { flex: 1 }]}>Privacy Policy</Text>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => Linking.openURL('https://beanpool.org/terms.html')}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>⚖️</Text></View>
                        <Text style={[styles.menuText, { flex: 1 }]}>Terms of Service & EULA</Text>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                    <Pressable style={[styles.menuBtn, styles.menuBtnLast]} onPress={() => Linking.openURL('https://beanpool.org/safety.html')}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>🚸</Text></View>
                        <Text style={[styles.menuText, { flex: 1 }]}>Child Safety Standards</Text>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                </View>

                {/* ─── Advanced ─── */}
                <Text style={styles.sectionHeader}>SYSTEM</Text>
                <View style={styles.menuGroup}>
                    <Pressable style={[styles.menuBtn, styles.menuBtnLast]} onPress={() => setMode('advanced')}>
                        <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>⚙️</Text></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.menuText}>Advanced / Subsystem</Text>
                            <Text style={styles.menuSub}>Node management & cache controls</Text>
                        </View>
                        <Text style={styles.menuChevron}>›</Text>
                    </Pressable>
                </View>

                {/* ─── Danger Zone ─── */}
                <View style={{ marginTop: 24 }}>
                    <View style={styles.dangerGroup}>
                        <Pressable style={[styles.menuBtn, styles.menuBtnLast]} onPress={() => { setMode('wipe'); setWipeConfirm(''); }}>
                            <View style={[styles.menuIconWrap, { backgroundColor: '#fef2f2' }]}><Text style={styles.menuIcon}>⚠️</Text></View>
                            <Text style={[styles.menuText, { flex: 1, color: '#dc2626' }]}>Delete Account</Text>
                            <Text style={[styles.menuChevron, { color: '#fca5a5' }]}>›</Text>
                        </Pressable>
                    </View>
                </View>

                {/* ─── Version Footer ─── */}
                <Text style={styles.versionText}>
                    BEANPOOL OS {appConfig.expo.version} (Build {appConfig.expo.ios.buildNumber})
                </Text>
                </>
            )}

            {mode === 'recovery-requests' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>🛡️ Recovery Requests</Text>
                    <Text style={styles.infoText}>These friends have requested to recover their identity on a new device. Verify it's really them before approving.</Text>
                    
                    {recoveryLoading ? (
                        <ActivityIndicator color="#059669" style={{ marginVertical: 20 }} />
                    ) : recoveryReqs.length === 0 ? (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                            <Text style={{ fontSize: 32, marginBottom: 8 }}>✨</Text>
                            <Text style={{ color: '#9ca3af' }}>No pending requests.</Text>
                        </View>
                    ) : (
                        recoveryReqs.map(req => (
                            <View key={req.id} style={{ backgroundColor: '#262626', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#404040' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#3f3f46', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                        <Text style={{ fontSize: 18 }}>👤</Text>
                                    </View>
                                    <View>
                                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{req.old_callsign}</Text>
                                        <Text style={{ color: '#9ca3af', fontSize: 12 }}>Requested: {new Date(req.created_at).toLocaleDateString()}</Text>
                                    </View>
                                </View>
                                
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Pressable 
                                        style={[styles.primaryBtn, { flex: 1, backgroundColor: '#ef4444' }]}
                                        onPress={async () => {
                                            try {
                                                await rejectRecoveryRequest(req.id);
                                                setRecoveryReqs(prev => prev.filter(r => r.id !== req.id));
                                                Alert.alert('Rejected', 'Request has been rejected.');
                                            } catch(e) {
                                                Alert.alert('Error', 'Failed to reject request.');
                                            }
                                        }}
                                    >
                                        <Text style={styles.primaryBtnText}>Reject</Text>
                                    </Pressable>
                                    <Pressable 
                                        style={[styles.primaryBtn, { flex: 1, backgroundColor: '#10b981' }]}
                                        onPress={async () => {
                                            try {
                                                await approveRecoveryRequest(req.id);
                                                setRecoveryReqs(prev => prev.filter(r => r.id !== req.id));
                                                Alert.alert('Approved', 'Request has been approved.');
                                            } catch(e) {
                                                Alert.alert('Error', 'Failed to approve request.');
                                            }
                                        }}
                                    >
                                        <Text style={styles.primaryBtnText}>Approve</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))
                    )}
                    
                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </Pressable>
                </View>
            )}

            {mode === 'profile' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Edit Profile</Text>
                    
                    {/* Avatar Picker */}
                    <View style={{ alignItems: 'center', marginBottom: 20 }}>
                        <Pressable onPress={handlePickImage} style={{ alignItems: 'center' }}>
                            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#e5e7eb', overflow: 'hidden' }}>
                                {avatar ? (
                                    <Image source={avatar.startsWith('bundled://') ? resolveBundledAvatar(avatar)! : { uri: avatar }} style={{ width: '100%', height: '100%' }} />
                                ) : (
                                    <Text style={{ fontSize: 32 }}>📷</Text>
                                )}
                            </View>
                            <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>Tap to change photo</Text>
                        </Pressable>
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

                    {contact.trim().length > 0 && (
                        <View style={styles.visibilitySection}>
                            <Text style={styles.visibilityLabel}>Who can see this?</Text>
                            {([
                                { value: 'hidden' as const, emoji: '🔒', label: 'Hidden', desc: 'Only you can see it' },
                                { value: 'trade_partners' as const, emoji: '🤝', label: 'Trade Partners', desc: 'Visible when you enter a trade' },
                                { value: 'friends' as const, emoji: '👥', label: 'Friends', desc: 'People you have added as friends' },
                                { value: 'community' as const, emoji: '🌍', label: 'Community', desc: 'Anyone on this node' },
                            ]).map(opt => {
                                const isActive = contactVisibility === opt.value;
                                return (
                                    <Pressable
                                        key={opt.value}
                                        style={[styles.visibilityOption, isActive && styles.visibilityOptionActive]}
                                        onPress={() => setContactVisibility(opt.value)}
                                    >
                                        <Text style={styles.visibilityEmoji}>{opt.emoji}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.visibilityOptionLabel, isActive && styles.visibilityOptionLabelActive]}>{opt.label}</Text>
                                            <Text style={[styles.visibilityOptionDesc, isActive && styles.visibilityOptionDescActive]}>{opt.desc}</Text>
                                        </View>
                                        {isActive && <Text style={styles.visibilityCheck}>✓</Text>}
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}

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

            {mode === 'notifications' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>🔔 Notification Preferences</Text>
                    <Text style={styles.infoText}>
                        Control which push notifications wake up your device. Changes are saved automatically.
                    </Text>

                    {notifLoading ? (
                        <ActivityIndicator color="#10b981" style={{ marginVertical: 20 }} />
                    ) : (
                        <View style={styles.menuGroup}>
                            <View style={styles.menuBtn}>
                                <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>💬</Text></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.menuText}>Direct Messages</Text>
                                    <Text style={styles.menuSub}>Get notified when someone messages you</Text>
                                </View>
                                <Pressable style={[styles.toggle, notifChat && styles.toggleOn]} onPress={async () => {
                                    const next = !notifChat; setNotifChat(next);
                                    try { if (identity?.publicKey) { await signedRequest('/api/members/preferences', { publicKey: identity.publicKey, preferences: { notify_chat: next } }); } } catch (e) { console.warn('[Prefs]', e); }
                                }}>
                                    <View style={[styles.toggleThumb, notifChat && styles.toggleThumbOn]} />
                                </Pressable>
                            </View>
                            <View style={styles.menuBtn}>
                                <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>📬</Text></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.menuText}>Marketplace Activity</Text>
                                    <Text style={styles.menuSub}>Requests, approvals & rejections</Text>
                                </View>
                                <Pressable style={[styles.toggle, notifMarketplace && styles.toggleOn]} onPress={async () => {
                                    const next = !notifMarketplace; setNotifMarketplace(next);
                                    try { if (identity?.publicKey) { await signedRequest('/api/members/preferences', { publicKey: identity.publicKey, preferences: { notify_marketplace: next } }); } } catch (e) { console.warn('[Prefs]', e); }
                                }}>
                                    <View style={[styles.toggleThumb, notifMarketplace && styles.toggleThumbOn]} />
                                </Pressable>
                            </View>
                            <View style={[styles.menuBtn, styles.menuBtnLast]}>
                                <View style={styles.menuIconWrap}><Text style={styles.menuIcon}>🔒</Text></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.menuText}>Escrow & System</Text>
                                    <Text style={styles.menuSub}>Credits locked, released, or disputed</Text>
                                </View>
                                <Pressable style={[styles.toggle, notifEscrow && styles.toggleOn]} onPress={async () => {
                                    const next = !notifEscrow; setNotifEscrow(next);
                                    try { if (identity?.publicKey) { await signedRequest('/api/members/preferences', { publicKey: identity.publicKey, preferences: { notify_escrow: next } }); } } catch (e) { console.warn('[Prefs]', e); }
                                }}>
                                    <View style={[styles.toggleThumb, notifEscrow && styles.toggleThumbOn]} />
                                </Pressable>
                            </View>
                        </View>
                    )}

                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>← Back</Text>
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

                                {isActive && (
                                    <View style={{ marginTop: 12, padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 8 }}>Authenticate Identity on this Node</Text>
                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                            <TextInput 
                                                style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 10, height: 36, fontSize: 13 }}
                                                placeholder="Invite Code (e.g. INV-...)"
                                                value={redeemInviteCode}
                                                onChangeText={setRedeemInviteCode}
                                                autoCapitalize="characters"
                                            />
                                            <Pressable 
                                                style={{ backgroundColor: '#10b981', paddingHorizontal: 16, borderRadius: 6, justifyContent: 'center' }}
                                                onPress={handleRedeemInvite}
                                                disabled={redeemLoading || !redeemInviteCode.trim()}
                                            >
                                                {redeemLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Redeem</Text>}
                                            </Pressable>
                                        </View>
                                        <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'flex-start', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
                                            <Pressable style={{ backgroundColor: '#fef2f2', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5' }} onPress={() => handleForceResync(node.url)}>
                                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#b91c1c' }}>Clear Cache & Resync</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                )}
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
                    
                    <Pressable style={[styles.primaryBtn, { backgroundColor: '#10b981' }, advancedLoading && { opacity: 0.5 }]} onPress={handleUpdateAnchor} disabled={advancedLoading}>
                        {advancedLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Add & Connect</Text>}
                    </Pressable>

                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </Pressable>
                </View>
            )}

            {mode === 'seed' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>🔑 Recovery Phrase</Text>
                    {!identity?.mnemonic ? (
                        <Text style={styles.infoText}>
                            This identity was created before seed phrase support. Use "Export Identity" to back up your keys to another device.
                        </Text>
                    ) : (
                        <>
                            {!seedVisible ? (
                                <>
                                    <Text style={styles.infoText}>
                                        Your 12-word recovery phrase allows you to restore your identity on any device. Anyone with these words can control your account.
                                    </Text>
                                    <Text style={styles.label}>TYPE 'CONFIRM' TO VIEW SEED</Text>
                                    <TextInput 
                                        style={[styles.input, { textAlign: 'center', fontWeight: 'bold' }]}
                                        value={seedConfirm}
                                        onChangeText={setSeedConfirm}
                                        placeholder="CONFIRM"
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                    />
                                    <Pressable 
                                        style={[styles.primaryBtn, seedConfirm !== 'CONFIRM' && { opacity: 0.5 }]} 
                                        onPress={async () => {
                                            setSeedVisible(true);
                                            await AsyncStorage.setItem('beanpool_identity_backed_up', 'true');
                                        }} 
                                        disabled={seedConfirm !== 'CONFIRM'}
                                    >
                                        <Text style={styles.primaryBtnText}>Show Recovery Phrase</Text>
                                    </Pressable>
                                </>
                            ) : (
                                <>
                                    <Text style={[styles.infoText, { color: '#ef4444', fontWeight: 'bold' }]}>
                                        Never share this phrase with anyone. Write it down on paper and keep it secure.
                                    </Text>
                                    <View style={styles.seedGrid}>
                                        {identity.mnemonic.map((word, i) => (
                                            <View key={i} style={styles.seedWord}>
                                                <Text style={styles.seedWordNum}>{i + 1}.</Text>
                                                <Text style={styles.seedWordText}>{word}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </>
                            )}
                        </>
                    )}
                    <Pressable style={[styles.backBtn, { marginTop: 24 }]} onPress={() => setMode('menu')}>
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

            <AvatarPickerSheet
                visible={showAvatarPicker}
                onClose={() => setShowAvatarPicker(false)}
                onSelectImage={(uri) => setAvatar(uri)}
            />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f2f4f7' },
    content: { padding: 20, paddingTop: 16, paddingBottom: 48 },

    // ─── Identity Dashboard ───
    identityCard: {
        borderRadius: 20, marginBottom: 28, overflow: 'hidden',
        backgroundColor: '#022c22', // Premium very dark green
        shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 6,
        borderWidth: 1, borderColor: '#065f46',
    },
    identityInner: {
        alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20,
    },
    editBadge: {
        position: 'absolute', top: 16, right: 16,
        backgroundColor: '#065f46', paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, borderWidth: 1, borderColor: '#10b981',
    },
    editBadgeText: { fontSize: 13, color: '#a7f3d0', fontWeight: 'bold' },
    avatarWrap: {
        width: 96, height: 96, borderRadius: 48,
        marginBottom: 16, position: 'relative',
    },
    avatarImg: { width: 96, height: 96, borderRadius: 48 },
    avatarPlaceholder: {
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: '#064e3b', justifyContent: 'center', alignItems: 'center',
    },
    avatarRing: {
        position: 'absolute', top: -3, left: -3, right: -3, bottom: -3,
        borderRadius: 51, borderWidth: 2.5, borderColor: '#34d399',
    },
    callsignText: {
        fontSize: 24, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5, marginBottom: 4,
    },
    bioText: {
        fontSize: 14, color: '#a7f3d0', lineHeight: 20, textAlign: 'center',
        marginBottom: 12, paddingHorizontal: 12, fontStyle: 'italic',
    },
    contactRow: {
        flexDirection: 'row', alignItems: 'center', marginBottom: 16,
        backgroundColor: '#064e3b', paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 16, borderWidth: 1, borderColor: '#065f46',
    },
    contactText: { fontSize: 13, color: '#d1fae5', marginLeft: 6, fontWeight: '600' },
    pubkeyRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#022c22', paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 20, borderWidth: 1, borderColor: '#065f46',
    },
    pubkeyText: { fontSize: 13, color: '#6ee7b7', fontFamily: 'Courier', letterSpacing: 1 },

    // ─── Section Headers ───
    sectionHeader: {
        fontSize: 12, fontWeight: '700', color: '#9ca3af', letterSpacing: 1.5,
        marginBottom: 8, marginTop: 24, marginLeft: 4,
    },

    // ─── Menu Groups ───
    menuGroup: {
        backgroundColor: '#ffffff', borderRadius: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8,
        elevation: 2, overflow: 'hidden',
    },
    menuBtn: {
        flexDirection: 'row', alignItems: 'center', padding: 14, paddingVertical: 13,
        borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    },
    menuBtnLast: { borderBottomWidth: 0 },
    menuIconWrap: {
        width: 36, height: 36, borderRadius: 10, backgroundColor: '#f0fdf4',
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    menuIcon: { fontSize: 18 },
    menuText: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
    menuSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
    menuChevron: { fontSize: 22, color: '#d1d5db', fontWeight: '300', marginLeft: 8 },

    // ─── Toggle ───
    toggle: {
        width: 50, height: 28, borderRadius: 14,
        backgroundColor: '#e5e7eb', justifyContent: 'center', paddingHorizontal: 2,
    },
    toggleOn: { backgroundColor: '#10b981' },
    toggleThumb: {
        width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, elevation: 2,
    },
    toggleThumbOn: { transform: [{ translateX: 22 }] },

    // ─── Danger Zone ───
    dangerGroup: {
        backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: '#fecaca',
    },

    // ─── Version ───
    versionText: {
        textAlign: 'center', marginTop: 32, fontSize: 12,
        color: '#d1d5db', fontWeight: '700', letterSpacing: 1.5,
    },

    // ─── Shared (sub-screens) ───
    card: {
        backgroundColor: '#ffffff', borderRadius: 16, padding: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8,
        elevation: 2, marginBottom: 24,
    },
    label: { fontSize: 11, fontWeight: 'bold', color: '#6b7280', letterSpacing: 1, marginBottom: 4, marginTop: 12 },
    value: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
    input: {
        backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
        borderRadius: 10, padding: 14, color: '#111827', fontSize: 16, marginBottom: 16,
    },
    primaryBtn: { backgroundColor: '#111827', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    primaryBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
    backBtn: { marginTop: 16, alignItems: 'center', padding: 10 },
    backBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
    dangerBtn: { backgroundColor: '#fee2e2', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: '#fca5a5' },
    dangerBtnText: { color: '#b91c1c', fontSize: 14, fontWeight: 'bold' },
    infoText: { fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 20 },
    errorText: { color: '#ef4444', marginBottom: 16, textAlign: 'center' },
    
    // Seed UI
    seedGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 16 },
    seedWord: { width: '48%', backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
    seedWordNum: { color: '#9ca3af', fontSize: 12, marginRight: 8, width: 20, textAlign: 'right' },
    seedWordText: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
    uriBox: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16, maxHeight: 100 },
    uriText: { fontSize: 12, fontFamily: 'monospace', color: '#475569' },

    // Contact visibility picker
    visibilitySection: { marginTop: 4, marginBottom: 16 },
    visibilityLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 8 },
    visibilityOption: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 12, borderWidth: 1.5,
        borderColor: '#e5e7eb', backgroundColor: '#ffffff',
        marginBottom: 8,
    },
    visibilityOptionActive: {
        borderColor: '#3b82f6', backgroundColor: '#eff6ff',
        shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
    },
    visibilityEmoji: { fontSize: 20 },
    visibilityOptionLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
    visibilityOptionLabelActive: { color: '#1e40af' },
    visibilityOptionDesc: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
    visibilityOptionDescActive: { color: '#3b82f6' },
    visibilityCheck: { fontSize: 18, fontWeight: '800', color: '#3b82f6' },
});
