import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { createIdentity, createIdentityFromMnemonic, BeanPoolIdentity } from '../utils/identity';
import { useIdentity } from './IdentityContext';
import { StatusBar } from 'expo-status-bar';

export default function WelcomeScreen() {
    const { setIdentity } = useIdentity();
    const [mode, setMode] = useState<'home' | 'create' | 'recover'>('home');
    const [callsign, setCallsign] = useState('');
    const [recoveryWords, setRecoveryWords] = useState<string[]>(Array(12).fill(''));
    const [recoveryCallsign, setRecoveryCallsign] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingIdentity, setPendingIdentity] = useState<BeanPoolIdentity | null>(null);
    const [seedConfirmed, setSeedConfirmed] = useState(false);

    async function handleCreate() {
        if (callsign.trim().length < 2) {
            setError('Callsign must be at least 2 characters.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const identity = await createIdentity(callsign.trim());
            setPendingIdentity(identity);
        } catch (err) {
            setError('Failed to generate identity.');
            console.error(err);
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
            const identity = await createIdentityFromMnemonic(words, recoveryCallsign.trim());
            setIdentity(identity);
        } catch (err) {
            setError('Recovery failed. Check words and try again.');
        } finally {
            setLoading(false);
        }
    }

    // --- RENDER LOGIC ---

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

                        <Pressable 
                            style={[styles.primaryBtn, !seedConfirmed && styles.disabledBtn]} 
                            disabled={!seedConfirmed}
                            onPress={() => setIdentity(pendingIdentity)}
                        >
                            <Text style={styles.primaryBtnText}>Continue →</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    if (mode === 'create') {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />
                <View style={styles.card}>
                    <Text style={styles.title}>🎟️ Join BeanPool</Text>
                    <Text style={styles.subtitle}>Choose your Call Sign to establish your Sovereign Identity.</Text>
                    
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

                    <Pressable style={styles.backBtn} onPress={() => { setMode('home'); setError(null); }}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

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

                        {error && <Text style={styles.error}>{error}</Text>}

                        <Pressable style={styles.primaryBtn} onPress={handleRecover} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Recover Identity</Text>}
                        </Pressable>

                        <Pressable style={styles.backBtn} onPress={() => { setMode('home'); setError(null); }}>
                            <Text style={styles.backBtnText}>← Back</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />
            <View style={{ flex: 1, justifyContent: 'center', padding: 24, alignItems: 'center' }}>
                <Text style={styles.headerTitle}>Welcome to BeanPool</Text>
                <Text style={styles.headerSubtitle}>
                    Your identity is yours. It lives on this device, backed by hardware cryptography — no passwords, no central accounts.
                </Text>

                <Pressable style={styles.primaryBtn} onPress={() => setMode('create')}>
                    <Text style={styles.primaryBtnText}>I'm New Here</Text>
                </Pressable>

                <Pressable style={styles.secondaryBtn} onPress={() => setMode('recover')}>
                    <Text style={styles.secondaryBtnText}>🔑 Recover with 12 Words</Text>
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
    primaryBtn: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    disabledBtn: { backgroundColor: '#334155' },
    secondaryBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#404040', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16, width: '100%' },
    secondaryBtnText: { color: '#94a3b8', fontSize: 16, fontWeight: 'bold' },
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
