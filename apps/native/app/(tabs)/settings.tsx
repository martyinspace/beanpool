import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Image } from 'react-native';
import { useIdentity } from '../IdentityContext';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { updateCallsign, wipeIdentity, importIdentity, createIdentityFromMnemonic } from '../../utils/identity';
import { exportIdentity, decryptIdentity } from '../../utils/identity-transfer';
import { updateMemberProfile, getMemberProfile } from '../../utils/db';

export default function SettingsScreen() {
    const { identity, setIdentity } = useIdentity();
    const [mode, setMode] = useState<'menu' | 'profile' | 'export' | 'import' | 'advanced'>('menu');
    const [editCallsign, setEditCallsign] = useState(identity?.callsign || '');
    const [avatar, setAvatar] = useState<string | null>(null);
    const [bio, setBio] = useState('');
    const [contact, setContact] = useState('');
    const [loading, setLoading] = useState(false);
    
    React.useEffect(() => {
        if (identity && mode === 'profile') {
            getMemberProfile(identity.publicKey).then(profile => {
                if (profile) {
                    setAvatar(profile.avatar_url || null);
                    setBio(profile.bio || '');
                    setContact(profile.contact_value || '');
                }
            }).catch(console.error);
        }
    }, [identity, mode]);
    
    // Transfer logic
    const [pin, setPin] = useState('');
    const [exportUri, setExportUri] = useState('');
    const [importData, setImportData] = useState('');

    if (!identity) return null;

    const fingerprint = identity.publicKey.slice(0, 16) + '...';

    async function handlePickImage() {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
                base64: true
            });
            if (!result.canceled && result.assets[0].base64) {
                setAvatar(`data:image/jpeg;base64,${result.assets[0].base64}`);
            }
        } catch (e) {
            Alert.alert('Error', 'Could not pick image.');
        }
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

    async function handleWipe() {
        Alert.alert(
            "Wipe Device Identity",
            "This will permanently erase your Ed25519 Private Key from the Secure Enclave. This cannot be undone unless you have your 12-word recovery phrase.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Destroy Key", 
                    style: "destructive",
                    onPress: async () => {
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
            const uri = await exportIdentity(identity, pin);
            setExportUri(uri);
        } catch (e: any) {
            if (e.message?.includes('WebCrypto')) {
                if (identity.mnemonic) {
                    Alert.alert('Legacy Export', 'Your device does not support AES-GCM encryption natively. Please write down your 12-word recovery phrase instead:\n\n' + identity.mnemonic.join(' '));
                } else {
                    Alert.alert('Export Failed', 'Your identity cannot be exported because the recovery phrase is missing and native AES encryption is unsupported.');
                }
            } else {
                Alert.alert('Error', 'Export failed.');
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleImport() {
        setLoading(true);
        const words = importData.trim().split(/\\s+/);
        
        // Dynamic Mnemonic Fallback
        if (words.length === 12) {
            try {
                let tempCallsign = 'Recovered Node';
                if (words[0] === identity.mnemonic?.[0]) tempCallsign = identity.callsign;
                const imported = await createIdentityFromMnemonic(words, tempCallsign);
                setIdentity(imported);
                Alert.alert('Success', 'Imported network identity via 12-word Recovery Phrase.');
                setMode('menu');
            } catch (err) {
                Alert.alert('Error', 'Failed to reconstruct Ed25519 keypair.');
            }
            setLoading(false);
            return;
        }

        if (pin.length < 4) {
            Alert.alert('Error', 'PIN must be at least 4 digits to decrypt a transfer URI.');
            setLoading(false);
            return;
        }

        try {
            const imported = await decryptIdentity(importData.trim(), pin);
            await importIdentity(imported);
            setIdentity(imported);
            Alert.alert('Success', `Imported identity: ${imported.callsign}`);
            setMode('menu');
        } catch (e: any) {
             if (e.message?.includes('WebCrypto')) {
                Alert.alert('Unsupported Device', 'Your device does not support AES-GCM decryption natively. Please paste your raw 12-word recovery phrase directly into the import box instead.');
             } else {
                Alert.alert('Decryption failed', 'Wrong PIN or corrupted transfer data.');
             }
        } finally {
            setLoading(false);
        }
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.header}>Settings</Text>

            {/* Identity Card */}
            <View style={styles.card}>
                <Text style={styles.label}>CALLSIGN</Text>
                <Text style={styles.value}>{identity.callsign}</Text>
                
                <Text style={styles.label}>PUBLIC KEY</Text>
                <View style={styles.keyBox}>
                    <Text style={styles.keyValue}>{fingerprint}</Text>
                </View>
            </View>

            {mode === 'menu' && (
                <View style={styles.menuGroup}>
                    <Pressable style={styles.menuBtn} onPress={() => setMode('profile')}>
                        <Text style={styles.menuText}>👤 Edit Profile</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => { setMode('export'); setPin(''); setExportUri(''); }}>
                        <Text style={styles.menuText}>📤 Export Identity</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={styles.menuBtn} onPress={() => { setMode('import'); setPin(''); setImportData(''); }}>
                        <Text style={styles.menuText}>📥 Import Identity</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                    <Pressable style={[styles.menuBtn, { borderBottomWidth: 0 }]} onPress={() => setMode('advanced')}>
                        <Text style={styles.menuText}>⚙️ Advanced / Subsystem</Text>
                        <Text style={styles.menuArrow}>→</Text>
                    </Pressable>
                </View>
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
                            <Text style={styles.infoText}>Your encrypted identity link is ready.</Text>
                            <View style={styles.uriBox}>
                                <Text style={styles.uriText}>{exportUri}</Text>
                            </View>
                            <Text style={[styles.infoText, { color: '#059669', fontWeight: 'bold', textAlign: 'center', marginTop: -8 }]}>
                                PIN: {pin}
                            </Text>
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
                        Paste the encrypted transfer link (or your raw 12-word recovery phrase) below.
                    </Text>
                    
                    <TextInput 
                        style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                        value={importData}
                        onChangeText={setImportData}
                        placeholder="Paste URI or 12 words..."
                        multiline
                    />

                    <TextInput 
                        style={[styles.input, { textAlign: 'center', fontSize: 20, letterSpacing: 8 }]}
                        value={pin}
                        onChangeText={setPin}
                        placeholder="Decrypt PIN (if URI)"
                        keyboardType="number-pad"
                        maxLength={8}
                        secureTextEntry
                    />

                    <Pressable style={styles.primaryBtn} onPress={handleImport} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Reconstruct Identity</Text>}
                    </Pressable>
                    
                    <Pressable style={styles.backBtn} onPress={() => setMode('menu')}>
                        <Text style={styles.backBtnText}>Cancel</Text>
                    </Pressable>
                </View>
            )}

            {mode === 'advanced' && (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Subsystem Diagnostics</Text>
                    
                    <Text style={styles.infoText}>
                        BeanPool enforces local cryptographic boundaries. Your keys are locked within the Apple/Android Secure Enclave.
                    </Text>

                    <Pressable style={styles.dangerBtn} onPress={handleWipe}>
                        <Text style={styles.dangerBtnText}>Wipe Physical Identity</Text>
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
