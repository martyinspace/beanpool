import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, SafeAreaView, ScrollView, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MemberAvatar } from '../components/MemberAvatar';
import { lookupRecoveryCallsign, createRecoveryRequest, getRecoveryStatus } from '../utils/db';
import { createIdentity } from '../utils/identity';

export default function RecoverIdentityScreen() {
    const [step, setStep] = useState<'lookup' | 'select' | 'guess' | 'creating' | 'waiting'>('lookup');
    const [callsign, setCallsign] = useState('');
    const [lookupResults, setLookupResults] = useState<any[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<any>(null);
    const [guardianGuess, setGuardianGuess] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    
    // Status tracking
    const [statusData, setStatusData] = useState<any>(null);

    const handleLookup = async () => {
        if (!callsign.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const results = await lookupRecoveryCallsign(callsign.trim());
            if (results.length === 0) {
                setError('No recovery-eligible accounts found with that callsign.');
            } else {
                setLookupResults(results);
                setStep('select');
            }
        } catch (e: any) {
            setError(e.message || 'Lookup failed. Check connection.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (profile: any) => {
        setSelectedProfile(profile);
        setStep('guess');
    };

    const handleSubmit = async () => {
        if (!guardianGuess.trim()) return;
        setLoading(true);
        setError(null);
        try {
            // 1. Generate new identity locally (which also saves it)
            const newId = await createIdentity(selectedProfile.callsign);
            
            // 2. Submit the request
            const req = await createRecoveryRequest(selectedProfile.publicKey, guardianGuess.trim(), newId);
            
            setStatusData(req);
            setStep('waiting');
        } catch (e: any) {
            setError(e.message || 'Failed to submit recovery request.');
        } finally {
            setLoading(false);
        }
    };

    const checkStatus = async () => {
        if (!statusData?.newPubkey) return;
        try {
            const st = await getRecoveryStatus(statusData.newPubkey);
            if (st && st.status !== 'none') {
                setStatusData(st);
                if (st.status === 'executed') {
                    // Force app reload to main UI
                    router.replace('/(tabs)');
                }
            }
        } catch (e) {}
    };

    useEffect(() => {
        let interval: any;
        if (step === 'waiting') {
            interval = setInterval(checkStatus, 5000);
        }
        return () => clearInterval(interval);
    }, [step, statusData]);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.card}>
                    {step === 'lookup' && (
                        <>
                            <Text style={styles.title}>🛡️ Social Recovery</Text>
                            <Text style={styles.subtitle}>Enter your old callsign. We will look up your account on the community node.</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Your old callsign"
                                placeholderTextColor="#64748b"
                                value={callsign}
                                onChangeText={setCallsign}
                                autoCapitalize="none"
                            />
                            {error && <Text style={styles.error}>{error}</Text>}
                            <Pressable style={styles.primaryBtn} onPress={handleLookup} disabled={loading}>
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Find Account</Text>}
                            </Pressable>
                            <Pressable style={styles.backBtn} onPress={() => router.back()}>
                                <Text style={styles.backBtnText}>← Cancel</Text>
                            </Pressable>
                        </>
                    )}

                    {step === 'select' && (
                        <>
                            <Text style={styles.title}>Who are you?</Text>
                            <Text style={styles.subtitle}>Select your profile from the results below.</Text>
                            {lookupResults.map(p => (
                                <Pressable key={p.publicKey} style={styles.profileBtn} onPress={() => handleSelect(p)}>
                                    <View style={styles.avatar}>
                                        <MemberAvatar avatarUrl={p.avatarUrl} pubkey={p.publicKey} callsign={p.callsign || '?'} size={44} />
                                    </View>
                                    <View>
                                        <Text style={styles.callsign}>{p.callsign}</Text>
                                        <Text style={styles.joinedAt}>Joined {new Date(p.joinedAt).toLocaleDateString()}</Text>
                                    </View>
                                </Pressable>
                            ))}
                            <Pressable style={styles.backBtn} onPress={() => setStep('lookup')}>
                                <Text style={styles.backBtnText}>← Back</Text>
                            </Pressable>
                        </>
                    )}

                    {step === 'guess' && (
                        <>
                            <Text style={styles.title}>Guardian Knowledge Check</Text>
                            <Text style={styles.subtitle}>To prevent spam, please enter the exact callsign of at least ONE of your Guardians.</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="A guardian's callsign"
                                placeholderTextColor="#64748b"
                                value={guardianGuess}
                                onChangeText={setGuardianGuess}
                                autoCapitalize="none"
                            />
                            {error && <Text style={styles.error}>{error}</Text>}
                            <Pressable style={styles.primaryBtn} onPress={handleSubmit} disabled={loading}>
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Submit Request</Text>}
                            </Pressable>
                            <Pressable style={styles.backBtn} onPress={() => setStep('select')}>
                                <Text style={styles.backBtnText}>← Back</Text>
                            </Pressable>
                        </>
                    )}

                    {step === 'waiting' && statusData && (
                        <View style={{ alignItems: 'center' }}>
                            <Text style={styles.title}>⏳ Waiting for Guardians</Text>
                            <Text style={styles.subtitle}>Your request has been sent! Your guardians have received a notification.</Text>
                            
                            <View style={styles.statusBox}>
                                <Text style={styles.statusLabel}>Approvals</Text>
                                <Text style={styles.statusValue}>{statusData.approvals || 0} / {statusData.quorumRequired}</Text>
                            </View>

                            {statusData.status === 'approved' && statusData.cooldownUntil && (
                                <View style={styles.infoBanner}>
                                    <Text style={styles.infoText}>
                                        ✅ Quorum reached! Your identity will automatically migrate after the 24-hour security cooldown.
                                    </Text>
                                    <Text style={[styles.infoText, {marginTop: 8, fontWeight: 'bold'}]}>
                                        Time remaining: {Math.max(0, Math.floor((new Date(statusData.cooldownUntil).getTime() - Date.now()) / 3600000))} hours
                                    </Text>
                                </View>
                            )}

                            <Pressable style={styles.backBtn} onPress={() => router.replace('/(tabs)')}>
                                <Text style={styles.backBtnText}>Go to App Home</Text>
                            </Pressable>
                        </View>
                    )}
                </View>
            </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0a' },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    card: { backgroundColor: '#1a1a1a', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
    title: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 24, lineHeight: 20 },
    input: { backgroundColor: '#262626', borderWidth: 1, borderColor: '#404040', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, marginBottom: 16 },
    primaryBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    backBtn: { marginTop: 16, alignItems: 'center', padding: 10 },
    backBtnText: { color: '#94a3b8', fontSize: 14 },
    error: { color: '#ef4444', fontSize: 14, marginBottom: 16, textAlign: 'center' },
    
    profileBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#262626', padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#404040' },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    callsign: { color: '#fff', fontSize: 16, fontWeight: '600' },
    joinedAt: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
    
    statusBox: { backgroundColor: '#262626', padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 24, width: '100%' },
    statusLabel: { color: '#94a3b8', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    statusValue: { color: '#10b981', fontSize: 36, fontWeight: '800' },
    
    infoBanner: { backgroundColor: 'rgba(16,185,129,0.1)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', marginBottom: 24 },
    infoText: { color: '#6ee7b7', fontSize: 14, lineHeight: 20 }
});
