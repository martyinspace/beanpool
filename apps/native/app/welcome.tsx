import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert, Image, FlatList, BackHandler } from 'react-native';
import { hapticTick } from '../utils/haptics';
import { createIdentity, createIdentityFromMnemonic, BeanPoolIdentity } from '../utils/identity';
import { nativeDecryptIdentity } from '../utils/native-crypto';
import { importIdentity } from '../utils/identity';
import { useIdentity } from './IdentityContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useGlobalSearchParams, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import { BUNDLED_AVATARS, BundledAvatar, resolveBundledAvatar } from '../utils/bundled-avatars';
import { AvatarPickerSheet } from '../components/AvatarPickerSheet';
import { updateMemberProfile } from '../utils/db';
import { hexToBytes } from '../utils/crypto';
import { sign } from '@noble/ed25519';

import { extractNodeOrigin, normaliseInviteCode } from '../utils/invite-parser';

export default function WelcomeScreen() {
    const params = useGlobalSearchParams();
    const incomingUrl = Linking.useURL();
    const { setIdentity } = useIdentity();
    const [mode, setMode] = useState<'home' | 'member' | 'create' | 'recover' | 'import' | 'profileSetup' | 'seedBackup'>('home');
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
    const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [seedCopied, setSeedCopied] = useState(false);

    React.useEffect(() => {
        AsyncStorage.getItem('beanpool_anchor_url').then(val => {
            if (val) {
                setCreateAnchorUrl(val);
                setRecoveryAnchorUrl(val);
            }
        });
        
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
                let nodeUrl = createAnchorUrl.trim() || (__DEV__ ? 'https://127.0.0.1:8443' : '');
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
            // Go to avatar selection (Step 2) instead of seed phrase
            setMode('profileSetup');
        } catch (err: any) {
            setError(`Failed to generate identity: ${err?.message || err}`);
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
            // Final step — enter the app
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
            let finalAnchorUrl = recoveryAnchorUrl.trim() || (__DEV__ ? 'https://127.0.0.1:8443' : '');
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

    // --- Onboarding Progress Stepper ---
    function OnboardingStepper({ step }: { step: 1 | 2 | 3 }) {
        const steps = ['Your Name', 'Your Photo', 'Safety Backup'];
        return (
            <View style={stepperStyles.container}>
                {steps.map((label, i) => {
                    const stepNum = i + 1;
                    const isActive = stepNum === step;
                    const isCompleted = stepNum < step;
                    return (
                        <React.Fragment key={i}>
                            {i > 0 && <View style={[stepperStyles.line, (isCompleted || isActive) && stepperStyles.lineActive]} />}
                            <View style={stepperStyles.stepItem}>
                                <View style={[stepperStyles.dot, isActive && stepperStyles.dotActive, isCompleted && stepperStyles.dotCompleted]}>
                                    {isCompleted && <Text style={stepperStyles.dotCheck}>✓</Text>}
                                </View>
                                <Text style={[stepperStyles.label, isActive && stepperStyles.labelActive]}>{label}</Text>
                            </View>
                        </React.Fragment>
                    );
                })}
            </View>
        );
    }

    // --- Copy seed phrase to clipboard ---
    async function handleCopySeed() {
        if (!pendingIdentity?.mnemonic) return;
        await Clipboard.setStringAsync(pendingIdentity.mnemonic.join(' '));
        hapticTick();
        setSeedCopied(true);
        setTimeout(() => setSeedCopied(false), 2000);
    }

    // --- Back-button guard for seed phrase screen ---
    function handleSeedBackPress() {
        Alert.alert(
            'Have you saved your words?',
            'If you go back now, you\'ll need to start over.',
            [
                { text: 'Stay', style: 'cancel' },
                { text: 'Go Back', style: 'destructive', onPress: () => {
                    setPendingIdentity(null);
                    setPendingAvatar(null);
                    setSeedConfirmed(false);
                    setSeedCopied(false);
                    setMode('create');
                    setError(null);
                }},
            ]
        );
    }

    // Android hardware back button handler for seed screen
    React.useEffect(() => {
        if (mode !== 'seedBackup') return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            handleSeedBackPress();
            return true; // Prevent default back
        });
        return () => sub.remove();
    }, [mode]);

    // --- Profile image picker helpers for "Who Are You?" gate ---
    // Moved to AvatarPickerSheet component

    async function handleCompleteProfile() {
        if (!pendingIdentity || !pendingAvatar) return;
        setLoading(true);
        setError(null);
        try {
            // 1. Write avatar to local SQLite
            await updateMemberProfile(pendingIdentity.publicKey, {
                callsign: pendingIdentity.callsign,
                avatar_url: pendingAvatar,
            });

            // 2. Sign and publish to anchor server (Initial Profile Delta)
            try {
                const url = await AsyncStorage.getItem('beanpool_anchor_url');
                if (url && pendingIdentity) {
                    const payloadObj = {
                        publicKey: pendingIdentity.publicKey,
                        avatar: pendingAvatar,
                        callsign: pendingIdentity.callsign,
                    };
                    const bodyString = JSON.stringify(payloadObj);
                    const privateKeyBytes = hexToBytes(pendingIdentity.privateKey);
                    const msgBytes = new TextEncoder().encode(bodyString);
                    const sigBytes = await sign(msgBytes, privateKeyBytes);
                    const sigHex = Array.from(sigBytes).map(b => b.toString(16).padStart(2, '0')).join('');

                    await fetch(`${url}/api/profile`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-signature': sigHex,
                            'x-pubkey': pendingIdentity.publicKey,
                        },
                        body: bodyString,
                    }).catch(() => {}); // Don't block on network failure
                }
            } catch (publishErr) {
                console.warn('[Welcome] Profile publish failed (non-blocking):', publishErr);
            }

            // 3. Profile done — go to seed phrase (Step 3) instead of entering app
            setMode('seedBackup');
        } catch (err: any) {
            setError(err.message || 'Failed to save profile.');
        } finally {
            setLoading(false);
        }
    }

    // --- STEP 2: PROFILE SETUP ("Choose your look") ---
    if (mode === 'profileSetup' && pendingIdentity) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />
                <ScrollView contentContainerStyle={styles.scroll}>
                    <OnboardingStepper step={2} />
                    <View style={styles.card}>
                        <Text style={styles.title}>📸 Choose your look</Text>
                        <Text style={styles.subtitle}>
                            Pick a profile picture so your community knows you.
                        </Text>

                        {/* Preview circle */}
                        <View style={profileStyles.previewContainer}>
                            {pendingAvatar ? (
                                <Image
                                    source={pendingAvatar.startsWith('bundled://') ? resolveBundledAvatar(pendingAvatar)! : { uri: pendingAvatar }}
                                    style={profileStyles.previewImage}
                                />
                            ) : (
                                <View style={profileStyles.previewPlaceholder}>
                                    <Text style={profileStyles.previewPlaceholderText}>
                                        {pendingIdentity.callsign.charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                            )}
                            <Text style={profileStyles.previewCallsign}>
                                {pendingIdentity.callsign}
                            </Text>
                        </View>

                        {/* Choose Photo Button */}
                        <Pressable 
                            style={styles.secondaryBtn} 
                            onPress={() => setShowAvatarPicker(true)}
                            disabled={loading}
                        >
                            <Text style={styles.secondaryBtnText}>
                                {pendingAvatar ? 'Change Photo' : 'Choose Photo'}
                            </Text>
                        </Pressable>

                        {loading && (
                            <View style={{ alignItems: 'center', marginVertical: 12 }}>
                                <ActivityIndicator color="#2563eb" />
                                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Processing image...</Text>
                            </View>
                        )}

                        {error && <Text style={styles.error}>{error}</Text>}

                        <Pressable
                            style={[styles.primaryBtn, !pendingAvatar && styles.disabledBtn]}
                            disabled={!pendingAvatar || loading}
                            onPress={handleCompleteProfile}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.primaryBtnText}>Next →</Text>
                            )}
                        </Pressable>

                        <Pressable
                            style={styles.backBtn}
                            onPress={() => { setMode('create'); setPendingIdentity(null); setPendingAvatar(null); setShowAvatarPicker(false); setError(null); }}
                            disabled={loading}
                        >
                            <Text style={styles.backBtnText}>← Back</Text>
                        </Pressable>
                    </View>
                </ScrollView>
                
                <AvatarPickerSheet
                    visible={showAvatarPicker}
                    onClose={() => setShowAvatarPicker(false)}
                    onSelectImage={(uri) => setPendingAvatar(uri)}
                />
            </SafeAreaView>
        );
    }

    // --- STEP 3: SAFETY BACKUP (seed phrase — reframed) ---
    if (mode === 'seedBackup' && pendingIdentity) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />
                <ScrollView contentContainerStyle={styles.scroll}>
                    <OnboardingStepper step={3} />
                    <View style={styles.card}>
                        <Text style={styles.title}>🛡️ Your Safety Backup</Text>
                        <Text style={styles.subtitle}>
                            These 12 words are your personal recovery key. If you ever lose your phone, these words will bring your account back.
                        </Text>
                        <Text style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
                            💡 Take a screenshot or write them down somewhere safe.
                        </Text>
                        <View style={styles.seedGrid}>
                            {pendingIdentity.mnemonic?.map((word, i) => (
                                <View key={i} style={styles.seedCell}>
                                    <Text style={styles.seedIndex}>{i + 1}.</Text>
                                    <Text style={styles.seedWord}>{word}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Copy to clipboard */}
                        <Pressable
                            style={[styles.secondaryBtn, { marginBottom: 12 }]}
                            onPress={handleCopySeed}
                        >
                            <Text style={styles.secondaryBtnText}>
                                {seedCopied ? '✅ Copied!' : '📋 Copy All Words'}
                            </Text>
                        </Pressable>

                        <Pressable
                            style={[styles.checkbox, seedConfirmed && styles.checkboxActive]}
                            onPress={() => setSeedConfirmed(!seedConfirmed)}
                        >
                            <Text style={styles.checkboxText}>
                                {seedConfirmed ? '✅ ' : '⬜ '} I've saved these words ✓
                            </Text>
                        </Pressable>

                        {error && <Text style={styles.error}>{error}</Text>}

                        <Pressable
                            style={[styles.primaryBtn, !seedConfirmed && styles.disabledBtn]}
                            disabled={!seedConfirmed || loading}
                            onPress={handleConfirmSeed}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Enter BeanPool →</Text>}
                        </Pressable>

                        <Pressable
                            style={styles.backBtn}
                            onPress={handleSeedBackPress}
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
                <ScrollView contentContainerStyle={styles.scroll}>
                    <OnboardingStepper step={1} />
                    <View style={styles.card}>
                        <Text style={styles.title}>🎟️ Join BeanPool</Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Paste your invite link or code"
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

                        <Text style={styles.callsignLabel}>What should we call you?</Text>
                        <TextInput
                            style={styles.callsignInput}
                            placeholder="Your name or nickname (e.g. Sarah)"
                            placeholderTextColor="#64748b"
                            value={callsign}
                            onChangeText={setCallsign}
                            maxLength={32}
                            autoFocus={true}
                            autoCapitalize="words"
                        />
                        <Text style={styles.callsignHelper}>
                            This is your display name — how the community sees you. You can change it later.
                        </Text>
                        <Text style={styles.callsignTip}>
                            💡 Tip: adding your suburb helps locals find you!
                        </Text>

                        {error && <Text style={styles.error}>{error}</Text>}

                        <Pressable style={styles.primaryBtn} onPress={handleCreate} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Next →</Text>}
                        </Pressable>

                        <Pressable style={styles.backBtn} onPress={goBack}>
                            <Text style={styles.backBtnText}>← Back</Text>
                        </Pressable>
                    </View>
                </ScrollView>
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

                        <Pressable style={styles.socialRecoverBtn} onPress={() => { router.push('/recover-identity'); }}>
                            <Text style={styles.socialRecoverBtnText}>🛡️ Recover via Guardians</Text>
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

    // Callsign (Step 1) — larger, labeled input
    callsignLabel: { fontSize: 18, fontWeight: '700', color: '#e2e8f0', marginBottom: 8, marginTop: 8 },
    callsignInput: { backgroundColor: '#262626', borderWidth: 1.5, borderColor: '#404040', borderRadius: 12, padding: 18, color: '#fff', fontSize: 18, marginBottom: 8 },
    callsignHelper: { fontSize: 13, color: '#94a3b8', marginBottom: 4, lineHeight: 18 },
    callsignTip: { fontSize: 13, color: '#64748b', marginBottom: 20, fontStyle: 'italic' },

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
    socialRecoverBtn: { width: '100%', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.15)', alignItems: 'center', marginBottom: 10 },
    socialRecoverBtnText: { color: '#6ee7b7', fontSize: 16, fontWeight: '700' },

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

// Styles for the "Who Are You?" profile setup gate
const profileStyles = StyleSheet.create({
    previewContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    previewImage: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 3,
        borderColor: '#2563eb',
    },
    previewPlaceholder: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#262626',
        borderWidth: 2,
        borderColor: '#404040',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewPlaceholderText: {
        fontSize: 36,
        fontWeight: '800',
        color: '#64748b',
    },
    previewCallsign: {
        fontSize: 16,
        fontWeight: '700',
        color: '#e2e8f0',
        marginTop: 8,
    },
    trinityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 20,
    },
    trinityCard: {
        flex: 1,
        backgroundColor: '#262626',
        borderWidth: 1,
        borderColor: '#404040',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        gap: 6,
    },
    trinityCardActive: {
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
    },
    trinityEmoji: {
        fontSize: 28,
    },
    trinityLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#94a3b8',
    },
    avatarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 20,
        paddingVertical: 12,
        paddingHorizontal: 4,
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#333',
    },
    avatarGridItem: {
        width: 60,
        height: 60,
        borderRadius: 30,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    avatarGridItemSelected: {
        borderColor: '#2563eb',
        shadowColor: '#2563eb',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 6,
    },
    avatarGridImage: {
        width: '100%',
        height: '100%',
    },
});

// Styles for the onboarding progress stepper
const stepperStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        paddingHorizontal: 8,
    },
    stepItem: {
        alignItems: 'center',
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#404040',
        marginBottom: 6,
    },
    dotActive: {
        backgroundColor: '#fff',
        width: 14,
        height: 14,
        borderRadius: 7,
    },
    dotCompleted: {
        backgroundColor: '#22c55e',
        width: 14,
        height: 14,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dotCheck: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '800',
    },
    label: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '500',
    },
    labelActive: {
        color: '#fff',
        fontWeight: '700',
    },
    line: {
        width: 32,
        height: 2,
        backgroundColor: '#404040',
        marginBottom: 18,
        marginHorizontal: 4,
    },
    lineActive: {
        backgroundColor: '#22c55e',
    },
});
