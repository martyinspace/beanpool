import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert, Image, FlatList, BackHandler, KeyboardAvoidingView, Platform } from 'react-native';
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
import { buildSignedHeaders } from '../utils/crypto';

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

    const processFullUrl = useCallback(async (fullUrl: string) => {
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
    }, []);

    const handlePasteInvite = async () => {
        try {
            const content = await Clipboard.getStringAsync();
            const cleanContent = content?.trim() || '';
            if (!cleanContent) {
                Alert.alert("Nothing to paste", "Your clipboard is empty.");
                return;
            }

            // Check if it's an invite token OR an invite URL to use processFullUrl
            if (cleanContent.startsWith('BP-') || cleanContent.startsWith('INV-') ||
                (cleanContent.startsWith('http') && cleanContent.includes('invite='))) {
                setProcessingMagicLink(true);
                await processFullUrl(cleanContent);
                setTimeout(() => setProcessingMagicLink(false), 1500);
            } else {
                // Otherwise, just populate the input field text and don't auto-advance
                setInviteCode(cleanContent);
            }
        } catch (e) {
            Alert.alert("Failed to read clipboard", "Please try pasting the link manually.");
        }
    };

    React.useEffect(() => {
        AsyncStorage.getItem('beanpool_anchor_url').then(val => {
            if (val) {
                setCreateAnchorUrl(val);
                setRecoveryAnchorUrl(val);
            }
        });
        
        let mounted = true;

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
                    if (params?.server) {
                        setCreateAnchorUrl(params.server as string);
                        setRecoveryAnchorUrl(params.server as string);
                    }
                    setMode('create');
                }
                return;
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
                    const headers = await buildSignedHeaders('POST', '/api/profile/update', bodyString, pendingIdentity.privateKey, pendingIdentity.publicKey);

                    const res = await fetch(`${url}/api/profile/update`, {
                        method: 'POST',
                        headers,
                        body: bodyString,
                    });
                    if (!res.ok) {
                        const errText = await res.text().catch(() => '');
                        console.warn('[Welcome] Profile publish rejected by server:', res.status, errText);
                        await AsyncStorage.setItem('pending_profile_sync', 'true');
                    }
                }
            } catch (publishErr) {
                console.warn('[Welcome] Profile publish failed (non-blocking):', publishErr);
                await AsyncStorage.setItem('pending_profile_sync', 'true');
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
                <StatusBar style="dark" />
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
                                <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>Processing image...</Text>
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
                <StatusBar style="dark" />
                <ScrollView contentContainerStyle={styles.scroll}>
                    <OnboardingStepper step={3} />
                    <View style={styles.card}>
                        <Text style={styles.title}>🛡️ Your Safety Backup</Text>
                        <Text style={styles.subtitle}>
                            These 12 words are your personal recovery key. If you ever lose your phone, these words will bring your account back.
                        </Text>
                        <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
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
                <StatusBar style="dark" />
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.scroll}>
                    <OnboardingStepper step={1} />
                    <View style={styles.card}>
                        <Text style={styles.title}>🎟️ Join BeanPool</Text>

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.inputFlex}
                                placeholder="Paste your invite link or code"
                                placeholderTextColor="#9ca3af"
                                value={inviteCode}
                                onChangeText={setInviteCode}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <Pressable style={styles.pasteBtn} onPress={handlePasteInvite}>
                                <Text style={styles.pasteBtnText}>Paste</Text>
                            </Pressable>
                        </View>

                        {inviteCode && !inviteCode.startsWith('http') && (
                            <TextInput
                                style={styles.input}
                                placeholder="Community Node URL (Optional)"
                                placeholderTextColor="#9ca3af"
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
                            placeholderTextColor="#9ca3af"
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
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // --- MEMBER SUB-MENU (Transfer Link or 12 Words) ---
    if (mode === 'member') {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="dark" />
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
                <StatusBar style="dark" />
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                        <Text style={styles.title}>📥 Import Identity</Text>
                        <Text style={styles.subtitle}>Paste the transfer code from your other device and enter the PIN.</Text>

                        <TextInput
                            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                            value={importData}
                            onChangeText={setImportData}
                            placeholder="Paste transfer code here..."
                            placeholderTextColor="#9ca3af"
                            multiline
                        />

                        <TextInput
                            style={[styles.input, { textAlign: 'center', fontSize: 20, letterSpacing: 8 }]}
                            value={importPin}
                            onChangeText={setImportPin}
                            placeholder="PIN"
                            placeholderTextColor="#9ca3af"
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
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // --- RECOVER FROM 12 WORDS ---
    if (mode === 'recover') {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="dark" />
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
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
                                    placeholderTextColor="#9ca3af"
                                    autoCapitalize="none"
                                />
                            ))}
                        </View>

                        <TextInput
                            style={styles.input}
                            placeholder="Your callsign"
                            placeholderTextColor="#9ca3af"
                            value={recoveryCallsign}
                            onChangeText={setRecoveryCallsign}
                        />

                        <TextInput
                            style={styles.input}
                            placeholder="Community Node URL (optional)"
                            placeholderTextColor="#9ca3af"
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
                </KeyboardAvoidingView>
            </SafeAreaView>
        );
    }

    // --- MAIN WELCOME SCREEN (two choices like the PWA) ---
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
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
    container: { flex: 1, backgroundColor: '#f9fafb' },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111827', textAlign: 'center', marginBottom: 8 },
    headerSubtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginBottom: 32, lineHeight: 24 },
    card: { backgroundColor: '#ffffff', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 20 },
    input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 14, color: '#111827', fontSize: 16, marginBottom: 16 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
    inputFlex: { flex: 1, padding: 16, color: '#111827', fontSize: 16 },
    pasteBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 12, borderLeftWidth: 1, borderColor: '#d1d5db', justifyContent: 'center' },
    pasteBtnText: { color: '#4b5563', fontSize: 14, fontWeight: '600' },

    // Callsign (Step 1) — larger, labeled input
    callsignLabel: { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 8, marginTop: 8 },
    callsignInput: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 12, padding: 18, color: '#111827', fontSize: 18, marginBottom: 8 },
    callsignHelper: { fontSize: 13, color: '#6b7280', marginBottom: 4, lineHeight: 18 },
    callsignTip: { fontSize: 13, color: '#9ca3af', marginBottom: 20, fontStyle: 'italic' },

    // Main welcome buttons
    memberBtn: { backgroundColor: '#2563eb', padding: 18, borderRadius: 14, alignItems: 'center', width: '100%', marginBottom: 12, shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 6 },
    memberBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    secondaryBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#d1d5db', padding: 16, borderRadius: 14, alignItems: 'center', width: '100%' },
    secondaryBtnText: { color: '#4b5563', fontSize: 16, fontWeight: '600' },

    // Member sub-options
    transferBtn: { width: '100%', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(37,99,235,0.4)', backgroundColor: 'rgba(37,99,235,0.08)', alignItems: 'center', marginBottom: 10 },
    transferBtnText: { color: '#2563eb', fontSize: 16, fontWeight: '700' },
    recoverBtn: { width: '100%', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.08)', alignItems: 'center', marginBottom: 10 },
    recoverBtnText: { color: '#b45309', fontSize: 16, fontWeight: '700' },
    socialRecoverBtn: { width: '100%', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.08)', alignItems: 'center', marginBottom: 10 },
    socialRecoverBtnText: { color: '#047857', fontSize: 16, fontWeight: '700' },

    primaryBtn: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    disabledBtn: { backgroundColor: '#cbd5e1' },
    backBtn: { marginTop: 16, alignItems: 'center', padding: 10 },
    backBtnText: { color: '#6b7280', fontSize: 14 },
    error: { color: '#dc2626', fontSize: 14, marginBottom: 16, textAlign: 'center' },
    checkbox: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, padding: 12, backgroundColor: '#f3f4f6', borderRadius: 8 },
    checkboxActive: { backgroundColor: '#dbeafe' },
    checkboxText: { color: '#111827', fontSize: 14, fontWeight: '600' },
    seedGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    seedCell: { width: '31%', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 8, marginBottom: 8, alignItems: 'center' },
    seedIndex: { color: '#9ca3af', fontSize: 10 },
    seedWord: { color: '#111827', fontSize: 14, fontWeight: 'bold', minHeight: 20 },
    recoveryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
    recoveryInput: { width: '31%', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, color: '#111827', fontSize: 12, marginBottom: 8, textAlign: 'center' }
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
        overflow: 'hidden',
    },
    previewPlaceholder: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#f3f4f6',
        borderWidth: 2,
        borderColor: '#d1d5db',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewPlaceholderText: {
        fontSize: 36,
        fontWeight: '800',
        color: '#9ca3af',
    },
    previewCallsign: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1f2937',
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
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        gap: 6,
    },
    trinityCardActive: {
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
    },
    trinityEmoji: {
        fontSize: 28,
    },
    trinityLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#4b5563',
    },
    avatarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 20,
        paddingVertical: 12,
        paddingHorizontal: 4,
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
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
        backgroundColor: '#d1d5db',
        marginBottom: 6,
    },
    dotActive: {
        backgroundColor: '#2563eb',
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
        color: '#6b7280',
        fontWeight: '500',
    },
    labelActive: {
        color: '#111827',
        fontWeight: '700',
    },
    line: {
        width: 32,
        height: 2,
        backgroundColor: '#d1d5db',
        marginBottom: 18,
        marginHorizontal: 4,
    },
    lineActive: {
        backgroundColor: '#22c55e',
    },
});
