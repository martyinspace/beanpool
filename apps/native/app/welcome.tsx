import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { createIdentity, createIdentityFromMnemonic, BeanPoolIdentity } from '../utils/identity';
import { nativeDecryptIdentity } from '../utils/native-crypto';
import { importIdentity } from '../utils/identity';
import { useIdentity } from './IdentityContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useGlobalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

function extractNodeOrigin(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed.includes('http')) {
        const originMatch = trimmed.match(/^.*?https?:\/\/[^\/?#\s]+/);
        if (originMatch) {
            let extracted = originMatch[0];
            const whitespaceIndex = extracted.indexOf('http');
            if (whitespaceIndex > 0) {
                extracted = extracted.substring(whitespaceIndex);
            }
            return extracted;
        }
    }
    return null;
}

function extractInviteToken(raw: string): string {
    const trimmed = raw.trim();
    
    // 1. Explicit invite= param takes highest precedence
    const inviteMatch = trimmed.match(/[?&]invite=([^&\s]+)/);
    if (inviteMatch) return decodeURIComponent(inviteMatch[1]);
    
    // 2. Look for expected pattern anywhere in the string
    const patternMatch = trimmed.match(/(?:INV|BP)-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
    if (patternMatch) return patternMatch[0];
    
    // 3. Fallback: URL path tail parsing
    if (trimmed.includes('http')) {
        const urlParts = trimmed.split('?')[0].split('/');
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart.length >= 8 && /^[A-Z0-9-]+$/i.test(lastPart)) return lastPart;
    }
    
    return trimmed; // Give up, return raw
}

function normaliseInviteCode(raw: string): string {
    const extracted = extractInviteToken(raw);
    const trimmed = extracted.trim();
    
    // If it's a long offline ticket, leave it alone
    if (trimmed.length > 20 && trimmed.startsWith('BP-')) return trimmed;
    
    // Remove formatting characters
    const clean = extracted.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    if (clean.startsWith('INV')) {
        const body = clean.slice(3);
        if (body.length < 8) return extracted.trim().toUpperCase();
        return `INV-${body.slice(0, 4)}-${body.slice(4, 8)}`;
    }
    
    if (clean.length === 8) {
        return `INV-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
    }
    
    return trimmed.toUpperCase();
}

export default function WelcomeScreen() {
    const params = useGlobalSearchParams();
    const incomingUrl = Linking.useURL();
    const { setIdentity } = useIdentity();
    const [mode, setMode] = useState<'home' | 'member' | 'create' | 'recover' | 'import'>('home');
    const [callsign, setCallsign] = useState('');
    const [recoveryWords, setRecoveryWords] = useState<string[]>(Array(12).fill(''));
    const [recoveryCallsign, setRecoveryCallsign] = useState('');
    const [recoveryAnchorUrl, setRecoveryAnchorUrl] = useState('');
    const [createAnchorUrl, setCreateAnchorUrl] = useState('');
    const [importData, setImportData] = useState('');
    const [importPin, setImportPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingIdentity, setPendingIdentity] = useState<BeanPoolIdentity | null>(null);
    const [seedConfirmed, setSeedConfirmed] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [pendingInviteCode, setPendingInviteCode] = useState('');
    const [processingMagicLink, setProcessingMagicLink] = useState(false);

    React.useEffect(() => {
        let mounted = true;

        const processFullUrl = async (fullUrl: string) => {
            if (fullUrl.startsWith('http')) {
                const originMatch = fullUrl.match(/^https?:\/\/[^\/?#]+/);
                if (originMatch) {
                    setCreateAnchorUrl(originMatch[0]);
                }
            }
            const inviteMatch = fullUrl.match(/[?&]invite=([^&]+)/);
            if (inviteMatch) {
                setInviteCode(decodeURIComponent(inviteMatch[1]));
            } else if (!fullUrl.startsWith('http') && (fullUrl.startsWith('BP-') || fullUrl.startsWith('INV-'))) {
                setInviteCode(fullUrl);
            }
            setMode('create');
        };

        const checkAutoIntercept = async () => {
            // Priority 1: Raw Expo Linking Intent (bypasses router segment hydration issues)
            if (incomingUrl) {
                const parsed = Linking.parse(incomingUrl);
                if (parsed.queryParams?.invite) {
                    if (mounted) {
                        if (incomingUrl.startsWith('http')) {
                            // Universal link - process fully
                            await processFullUrl(incomingUrl);
                        } else {
                            // Deep link (beanpool://)
                            setInviteCode(parsed.queryParams.invite as string);
                            if (parsed.queryParams.server) {
                                setCreateAnchorUrl(parsed.queryParams.server as string);
                            }
                            setMode('create');
                        }
                    }
                    return;
                }
            }

            // Priority 2: Standard Router Params
            if (params?.invite) {
                if (mounted) {
                    setInviteCode(params.invite as string);
                    setMode('create');
                }
                return;
            }

            try {
                // Tier 3 Privacy Guardrail: Ensure we don't creepily ping the clipboard on returning users
                const hasLaunched = await AsyncStorage.getItem('bp_has_launched_before');
                if (!hasLaunched) {
                    await AsyncStorage.setItem('bp_has_launched_before', 'true');

                    const hasCode = await Clipboard.hasStringAsync();
                    if (hasCode) {
                        const content = await Clipboard.getStringAsync();
                        const cleanContent = content?.trim() || '';

                        // Intercept if it's an invite token OR an invite URL
                        if (cleanContent.startsWith('BP-') || cleanContent.startsWith('INV-') ||
                            (cleanContent.startsWith('http') && cleanContent.includes('invite='))) {
                            if (mounted) {
                                setProcessingMagicLink(true);
                                await processFullUrl(cleanContent);
                                setTimeout(() => setProcessingMagicLink(false), 1500); // UI breathing room
                            }
                        }
                    }
                }
            } catch (e) {
                console.log("Clipboard read intercepted by OS or failed", e);
            }
        };

        checkAutoIntercept();

        return () => { mounted = false; };
    }, [params?.invite, incomingUrl]);

    async function handleCreate() {
        if (!inviteCode.trim()) {
            setError('An invite code is required to join the network.');
            return;
        }
        if (callsign.trim().length < 2) {
            setError('Callsign must be at least 2 characters.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const rawInvite = inviteCode.trim();
            const extractedOrigin = extractNodeOrigin(rawInvite);
            
            if (extractedOrigin) {
                await AsyncStorage.setItem('beanpool_anchor_url', extractedOrigin);
            } else {
                let nodeUrl = createAnchorUrl.trim() || (__DEV__ ? 'https://127.0.0.1:8443' : 'https://review.beanpool.org:8443');
                if (nodeUrl && !nodeUrl.startsWith('http')) {
                    const isIpOrLocal = /^(?:\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(nodeUrl) || nodeUrl.startsWith('localhost');
                    nodeUrl = (isIpOrLocal ? 'http://' : 'https://') + nodeUrl;
                }
                await AsyncStorage.setItem('beanpool_anchor_url', nodeUrl);
            }

            const parsedCode = normaliseInviteCode(rawInvite);
            const identity = await createIdentity(callsign.trim());
            setPendingIdentity(identity);
            setPendingInviteCode(parsedCode);
        } catch (err) {
            setError('Failed to generate identity.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirmSeed() {
        if (!pendingIdentity) return;
        setLoading(true);
        setError(null);
        try {
            if (pendingInviteCode) {
                const { redeemInvite } = await import('../utils/db');
                await redeemInvite(pendingInviteCode, pendingIdentity.callsign, pendingIdentity);
            }
            // Once redeemed (or if no code), enter the app
            setIdentity(pendingIdentity);
        } catch (err: any) {
            setError(err.message || 'Failed to redeem invite code.');
        } finally {
            setLoading(false);
        }
    }

    async function handleRecover() {
        if (recoveryCallsign.trim().length < 2) {
            setError('Callsign must be at least 2 characters.');
            return;
        }
        const words = recoveryWords.map(w => w.toLowerCase().trim());
        const valid = words.filter(w => w.length > 0).length === 12;
        if (!valid) {
            setError('Please enter all 12 recovery words.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            let finalAnchorUrl = recoveryAnchorUrl.trim() || (__DEV__ ? 'https://127.0.0.1:8443' : 'https://review.beanpool.org:8443');
            if (finalAnchorUrl && !finalAnchorUrl.startsWith('http')) {
                const isIpOrLocal = /^(?:\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(finalAnchorUrl) || finalAnchorUrl.startsWith('localhost');
                finalAnchorUrl = (isIpOrLocal ? 'http://' : 'https://') + finalAnchorUrl;
            }
            await AsyncStorage.setItem('beanpool_anchor_url', finalAnchorUrl);

            const identity = await createIdentityFromMnemonic(words, recoveryCallsign.trim());
            setIdentity(identity);
        } catch (err) {
            setError('Recovery failed. Check words and try again.');
        } finally {
            setLoading(false);
        }
    }

    async function handleImport() {
        if (!importData.trim()) {
            setError('Paste the transfer code from your other device.');
            return;
        }
        if (importPin.length < 4) {
            setError('Enter the PIN (at least 4 digits).');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const imported = await nativeDecryptIdentity(importData.trim(), importPin);
            await importIdentity(imported);
            setIdentity(imported);
        } catch (e: any) {
            setError('Import failed — wrong PIN or invalid transfer code.');
        } finally {
            setLoading(false);
        }
    }

    function goBack() {
        setMode('home');
        setError(null);
    }

    // --- SEED PHRASE CONFIRMATION (after create) ---
    if (pendingIdentity) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.title}>🔑 Recovery Phrase</Text>
                        <Text style={styles.subtitle}>
                            Write these 12 words down on paper. This is the only way to recover your identity if you lose this device.
                        </Text>
                        <View style={styles.seedGrid}>
                            {pendingIdentity.mnemonic?.map((word, i) => (
                                <View key={i} style={styles.seedCell}>
                                    <Text style={styles.seedIndex}>{i + 1}.</Text>
                                    <Text style={styles.seedWord}>{word}</Text>
                                </View>
                            ))}
                        </View>

                        <Pressable
                            style={[styles.checkbox, seedConfirmed && styles.checkboxActive]}
                            onPress={() => setSeedConfirmed(!seedConfirmed)}
                        >
                            <Text style={styles.checkboxText}>
                                {seedConfirmed ? '✅ ' : '⬜ '} I've written these words down safely
                            </Text>
                        </Pressable>

                        {error && <Text style={styles.error}>{error}</Text>}

                        <Pressable
                            style={[styles.primaryBtn, !seedConfirmed && styles.disabledBtn]}
                            disabled={!seedConfirmed || loading}
                            onPress={handleConfirmSeed}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue →</Text>}
                        </Pressable>

                        <Pressable
                            style={styles.backBtn}
                            onPress={() => { setPendingIdentity(null); setError(null); }}
                            disabled={loading}
                        >
                            <Text style={styles.backBtnText}>← Back</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // --- CREATE NEW IDENTITY ---
    if (mode === 'create') {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />
                <View style={styles.card}>
                    <Text style={styles.title}>🎟️ Join BeanPool</Text>
                    <Text style={styles.subtitle}>Enter an Invite Code and choose your Call Sign.</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Invite URL or token"
                        placeholderTextColor="#64748b"
                        value={inviteCode}
                        onChangeText={setInviteCode}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    {inviteCode && !inviteCode.startsWith('http') && (
                        <TextInput
                            style={styles.input}
                            placeholder="Community Node URL (Optional)"
                            placeholderTextColor="#64748b"
                            value={createAnchorUrl}
                            onChangeText={setCreateAnchorUrl}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                        />
                    )}

                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Billinudgel-Marty"
                        placeholderTextColor="#64748b"
                        value={callsign}
                        onChangeText={setCallsign}
                        maxLength={32}
                    />

                    {error && <Text style={styles.error}>{error}</Text>}

                    <Pressable style={styles.primaryBtn} onPress={handleCreate} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Sovereign Identity</Text>}
                    </Pressable>

                    <Pressable style={styles.backBtn} onPress={goBack}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    // --- MEMBER SUB-MENU (Transfer Link or 12 Words) ---
    if (mode === 'member') {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />
                <View style={{ flex: 1, justifyContent: 'center', padding: 24, alignItems: 'center' }}>
                    <View style={styles.card}>
                        <Text style={styles.title}>Sign in to your account</Text>
                        <Text style={styles.subtitle}>Choose how to restore your identity on this device:</Text>

                        <Pressable style={styles.transferBtn} onPress={() => { setMode('import'); setError(null); }}>
                            <Text style={styles.transferBtnText}>📲 I have a Transfer Code</Text>
                        </Pressable>

                        <Pressable style={styles.recoverBtn} onPress={() => { setMode('recover'); setError(null); }}>
                            <Text style={styles.recoverBtnText}>🔑 Recover with 12 Words</Text>
                        </Pressable>

                        <Pressable style={styles.backBtn} onPress={goBack}>
                            <Text style={styles.backBtnText}>← Back</Text>
                        </Pressable>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // --- IMPORT VIA TRANSFER CODE ---
    if (mode === 'import') {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.title}>📥 Import Identity</Text>
                        <Text style={styles.subtitle}>Paste the transfer code from your other device and enter the PIN.</Text>

                        <TextInput
                            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                            value={importData}
                            onChangeText={setImportData}
                            placeholder="Paste transfer code here..."
                            placeholderTextColor="#64748b"
                            multiline
                        />

                        <TextInput
                            style={[styles.input, { textAlign: 'center', fontSize: 20, letterSpacing: 8 }]}
                            value={importPin}
                            onChangeText={setImportPin}
                            placeholder="PIN"
                            placeholderTextColor="#64748b"
                            keyboardType="number-pad"
                            maxLength={8}
                            secureTextEntry
                        />

                        {error && <Text style={styles.error}>{error}</Text>}

                        <Pressable style={[styles.primaryBtn, (loading || importPin.length < 4) && styles.disabledBtn]} onPress={handleImport} disabled={loading || importPin.length < 4}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Import Identity</Text>}
                        </Pressable>

                        <Pressable style={styles.backBtn} onPress={() => { setMode('member'); setError(null); }}>
                            <Text style={styles.backBtnText}>← Back</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // --- RECOVER FROM 12 WORDS ---
    if (mode === 'recover') {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.title}>🔑 Recover Identity</Text>
                        <Text style={styles.subtitle}>Enter the 12 recovery words you wrote down.</Text>

                        <View style={styles.recoveryGrid}>
                            {recoveryWords.map((word, i) => (
                                <TextInput
                                    key={i}
                                    style={styles.recoveryInput}
                                    value={word}
                                    onChangeText={(t) => {
                                        const updated = [...recoveryWords];
                                        updated[i] = t;
                                        setRecoveryWords(updated);
                                    }}
                                    placeholder={`${i + 1}`}
                                    placeholderTextColor="#64748b"
                                    autoCapitalize="none"
                                />
                            ))}
                        </View>

                        <TextInput
                            style={styles.input}
                            placeholder="Your callsign"
                            placeholderTextColor="#64748b"
                            value={recoveryCallsign}
                            onChangeText={setRecoveryCallsign}
                        />

                        <TextInput
                            style={styles.input}
                            placeholder="Community Node URL (optional)"
                            placeholderTextColor="#64748b"
                            value={recoveryAnchorUrl}
                            onChangeText={setRecoveryAnchorUrl}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        {error && <Text style={styles.error}>{error}</Text>}

                        <Pressable style={styles.primaryBtn} onPress={handleRecover} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Recover Identity</Text>}
                        </Pressable>

                        <Pressable style={styles.backBtn} onPress={() => { setMode('member'); setError(null); }}>
                            <Text style={styles.backBtnText}>← Back</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // --- MAIN WELCOME SCREEN (two choices like the PWA) ---
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <View style={{ flex: 1, justifyContent: 'center', padding: 24, alignItems: 'center' }}>
                <Text style={styles.headerTitle}>Welcome to BeanPool</Text>
                <Text style={styles.headerSubtitle}>
                    Your identity is yours. It lives on this device, backed by hardware cryptography — no passwords, no central accounts.
                </Text>

                <Pressable style={styles.memberBtn} onPress={() => setMode('member')}>
                    <Text style={styles.memberBtnText}>I'm Already a Member →</Text>
                </Pressable>

                <Pressable style={styles.secondaryBtn} onPress={() => setMode('create')}>
                    <Text style={styles.secondaryBtnText}>I'm New Here</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0a' },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8 },
    headerSubtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
    card: { backgroundColor: '#1a1a1a', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
    title: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 24, lineHeight: 20 },
    input: { backgroundColor: '#262626', borderWidth: 1, borderColor: '#404040', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, marginBottom: 16 },

    // Main welcome buttons
    memberBtn: { backgroundColor: '#2563eb', padding: 18, borderRadius: 14, alignItems: 'center', width: '100%', marginBottom: 12, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6 },
    memberBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    secondaryBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#404040', padding: 16, borderRadius: 14, alignItems: 'center', width: '100%' },
    secondaryBtnText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },

    // Member sub-options
    transferBtn: { width: '100%', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(37,99,235,0.4)', backgroundColor: 'rgba(37,99,235,0.15)', alignItems: 'center', marginBottom: 10 },
    transferBtnText: { color: '#93bbfc', fontSize: 16, fontWeight: '700' },
    recoverBtn: { width: '100%', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.15)', alignItems: 'center', marginBottom: 10 },
    recoverBtnText: { color: '#fcd171', fontSize: 16, fontWeight: '700' },

    primaryBtn: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    disabledBtn: { backgroundColor: '#334155' },
    backBtn: { marginTop: 16, alignItems: 'center', padding: 10 },
    backBtnText: { color: '#94a3b8', fontSize: 14 },
    error: { color: '#ef4444', fontSize: 14, marginBottom: 16, textAlign: 'center' },
    checkbox: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, padding: 12, backgroundColor: '#262626', borderRadius: 8 },
    checkboxActive: { backgroundColor: '#1e3a8a' },
    checkboxText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    seedGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    seedCell: { width: '31%', backgroundColor: '#262626', borderRadius: 8, padding: 8, marginBottom: 8, alignItems: 'center' },
    seedIndex: { color: '#64748b', fontSize: 10 },
    seedWord: { color: '#fff', fontSize: 14, fontWeight: 'bold', minHeight: 20 },
    recoveryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
    recoveryInput: { width: '31%', backgroundColor: '#262626', borderWidth: 1, borderColor: '#404040', borderRadius: 8, padding: 8, color: '#fff', fontSize: 12, marginBottom: 8, textAlign: 'center' }
});
