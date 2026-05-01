import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, Image } from 'react-native';
import { getDb } from '../../utils/db'; // Will query local mock array mapped to PWA layout
import { useIdentity } from '../IdentityContext';
import { hexToBytes, encodeUtf8, encodeBase64 } from '../../utils/crypto';
import { sign } from '@noble/ed25519';
import QRCode from 'react-native-qrcode-svg';
import { TextInput, Alert, ScrollView, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

import { router, useLocalSearchParams } from 'expo-router';

type SubView = 'friends' | 'community' | 'invites' | 'guardians';

export default function PeopleScreen() {
    const { view: pView } = useLocalSearchParams<{ view: string }>();
    const [view, setView] = useState<SubView>('friends');

    useEffect(() => {
        if (pView === 'invites') setView('invites');
    }, [pView]);
    const [members, setMembers] = useState<any[]>([]);
    const { identity } = useIdentity();
    const [generating, setGenerating] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [intendedFor, setIntendedFor] = useState('');
    const [invites, setInvites] = useState<any[]>([]);
    const [anchorUrl, setAnchorUrl] = useState('https://review.beanpool.org:8443');

    useEffect(() => {
        if (view === 'community') loadMembers();
        if (view === 'invites') loadOfflineInvites();
        AsyncStorage.getItem('beanpool_anchor_url').then(val => {
            if (val) setAnchorUrl(val);
        }).catch(() => {});
    }, [view]);

    const loadOfflineInvites = async () => {
        if (!identity?.publicKey) return;
        try {
            const stored = await AsyncStorage.getItem(`bp_offline_invites_${identity.publicKey}`);
            if (stored) {
                setInvites(JSON.parse(stored));
            }
        } catch {}
    };

    const handleGenerate = async () => {
        if (!identity) return;
        setGenerating(true);
        try {
            // First attempt Online generation via API
            try {
                const apiPayload = {
                    publicKey: identity.publicKey,
                    intendedFor: intendedFor || undefined
                };
                const apiPayloadStr = JSON.stringify(apiPayload);
                const apiMsgBytes = encodeUtf8(apiPayloadStr);
                const apiSigBytes = await sign(apiMsgBytes, hexToBytes(identity.privateKey));
                const apiSigB64 = encodeBase64(apiSigBytes);

                const res = await fetch(`${anchorUrl}/api/invite/generate`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Public-Key': identity.publicKey,
                        'X-Signature': apiSigB64
                    },
                    body: apiPayloadStr
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.invite) {
                        const code = data.invite.code;
                        setNewCode(code);
                        setIntendedFor('');
                        
                        const inviteObj = {
                            code,
                            createdBy: identity.publicKey,
                            createdAt: new Date().toISOString(),
                            intendedFor: intendedFor || undefined
                        };
                        
                        const updated = [inviteObj, ...invites];
                        setInvites(updated);
                        await AsyncStorage.setItem(`bp_offline_invites_${identity.publicKey}`, JSON.stringify(updated));
                        setGenerating(false);
                        return;
                    }
                }
            } catch (err) {
                console.log('Online invite generation failed. Falling back to offline ticket...', err);
            }

            // Offline Fallback
            const payloadObj = {
                i: identity.publicKey,
                t: Date.now(),
                f: intendedFor || undefined
            };
            const payloadStr = JSON.stringify(payloadObj);
            
            const messageBytes = encodeUtf8(payloadStr);
            const privateKeyBytes = hexToBytes(identity.privateKey);
            const signatureBytes = await sign(messageBytes, privateKeyBytes);
            
            const signatureBase64 = encodeBase64(signatureBytes);
            const payloadBase64 = encodeBase64(messageBytes);
            
            const ticketObj = { p: payloadBase64, s: signatureBase64 };
            const ticketBytes = encodeUtf8(JSON.stringify(ticketObj));
            const ticketB64 = encodeBase64(ticketBytes);
            
            const code = `BP-${ticketB64}`;
            setNewCode(code);
            setIntendedFor('');

            const inviteObj = {
                code,
                createdBy: identity.publicKey,
                createdAt: new Date().toISOString(),
                intendedFor: payloadObj.f
            };
            
            const updated = [inviteObj, ...invites];
            setInvites(updated);
            await AsyncStorage.setItem(`bp_offline_invites_${identity.publicKey}`, JSON.stringify(updated));
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to generate ticket');
        } finally {
            setGenerating(false);
        }
    };

    const shareInvite = async (codeToShare: string) => {
        const magicLink = `${anchorUrl}/?invite=${codeToShare}`;
        
        let message = `Join my private BeanPool Node! ✨\n\n`;
        message += `Click this secure link to join automatically:\n${magicLink}\n\n`;
        message += `Or if you prefer, you can download the BeanPool App at https://beanpool.org and enter this Invite Code manually:\n${codeToShare}`;

        await Share.share({ message });
    };


    const loadMembers = async () => {
        try {
            const database = await getDb();
            const rows = await database.getAllAsync('SELECT * FROM members ORDER BY joined_at DESC');
            setMembers(rows);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header sub-nav */}
            <View style={styles.navRow}>
                {(['friends', 'community', 'invites', 'guardians'] as SubView[]).map(v => {
                    const isActive = view === v;
                    return (
                        <Pressable 
                            key={v}
                            style={[styles.pill, isActive && styles.pillActive]}
                            onPress={() => setView(v)}
                        >
                            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                                {v === 'friends' && '👫 Friends'}
                                {v === 'community' && '🏘️ Community'}
                                {v === 'invites' && '🎟️ Invites'}
                                {v === 'guardians' && '🛡️ Guardians'}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* Views */}
            {view === 'friends' && (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>👫</Text>
                    <Text style={styles.emptyTitle}>No friends yet</Text>
                    <Text style={styles.emptyDesc}>Go to Community to browse members and add friends.</Text>
                </View>
            )}

            {view === 'community' && (
                <FlatList
                    data={members}
                    keyExtractor={item => item.public_key}
                    contentContainerStyle={styles.list}
                    ListHeaderComponent={
                        <View style={styles.infoBanner}>
                            <Text style={styles.infoText}>
                                All members on this node. Tap <Text style={styles.boldGreen}>+ Add</Text> to add someone as a friend.
                            </Text>
                        </View>
                    }
                    ListEmptyComponent={
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Text style={{ color: '#9ca3af' }}>Loading community...</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <View style={styles.avatar}>
                                    {item.avatar_url ? (
                                        <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                                    ) : (
                                        <Text style={styles.avatarEmoji}>👤</Text>
                                    )}
                                </View>
                                <View style={styles.textStack}>
                                    <Text style={styles.callsign}>{item.callsign}</Text>
                                    <Text style={styles.dateText}>Joined recently</Text>
                                </View>
                            </View>
                            <Pressable style={styles.addBtn}>
                                <Text style={styles.addBtnText}>+ Add</Text>
                            </Pressable>
                        </View>
                    )}
                />
            )}

            {view === 'invites' && (
                <ScrollView contentContainerStyle={styles.list}>
                    <Text style={styles.sectionHeader}>🎟️ Invite Someone</Text>
                    <Text style={styles.sectionDesc}>Each offline ticket can only be used once. Generate a cryptographic payload directly on this device.</Text>

                    <TextInput
                        placeholder="Who is this invite for? (Optional)"
                        value={intendedFor}
                        onChangeText={setIntendedFor}
                        style={styles.input}
                        placeholderTextColor="#9ca3af"
                    />

                    <Pressable
                        style={[styles.btnGenerate, generating && { opacity: 0.6 }]}
                        onPress={handleGenerate}
                        disabled={generating}
                    >
                        <Text style={styles.btnGenerateText}>{generating ? 'Generating...' : '✨ Generate Offline Ticket'}</Text>
                    </Pressable>

                    {newCode ? (
                        <View style={styles.qrCard}>
                            <Text style={styles.qrTitle}>Share this cryptographic code</Text>
                            <View style={styles.qrBox}>
                                <QRCode
                                    value={`${anchorUrl}/?invite=${newCode}`}
                                    size={180}
                                />
                            </View>
                            <Pressable 
                                style={styles.btnCopyQR}
                                onPress={() => shareInvite(newCode)}
                            >
                                <Text style={styles.btnCopyQRText}>📤 Share Invite</Text>
                            </Pressable>
                        </View>
                    ) : null}

                    {invites.length > 0 && (
                        <View style={{ marginTop: 24 }}>
                            <Text style={styles.pendingHeader}>⏳ PENDING ({invites.length})</Text>
                            {invites.map((inv) => (
                                <View key={inv.code} style={styles.pendingCard}>
                                    <View style={{ flex: 1 }}>
                                        {inv.intendedFor ? (
                                            <Text style={styles.pendingFor}>For: {inv.intendedFor}</Text>
                                        ) : null}
                                        <Text style={styles.pendingCode} numberOfLines={1} ellipsizeMode="middle">
                                            {inv.code}
                                        </Text>
                                    </View>
                                    <Pressable 
                                        style={styles.btnCopySmall}
                                        onPress={() => shareInvite(inv.code)}
                                    >
                                        <Text style={styles.btnCopySmallText}>Share</Text>
                                    </Pressable>
                                </View>
                            ))}
                        </View>
                    )}
                </ScrollView>
            )}

            {view === 'guardians' && (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>🛡️</Text>
                    <Text style={styles.emptyTitle}>Social Recovery Ready</Text>
                    <Text style={styles.emptyDesc}>Add some friends first, then come back here to choose your guardians.</Text>
                </View>
            )}

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f9fafb' },
    navRow: { flexDirection: 'row', padding: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    pill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, marginHorizontal: 2 },
    pillActive: { backgroundColor: '#f3f4f6', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1, borderWidth: 1, borderColor: '#e5e7eb' },
    pillText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
    pillTextActive: { color: '#1f2937', fontWeight: '800' },
    
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyEmoji: { fontSize: 56, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
    emptyDesc: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },

    list: { padding: 16 },
    infoBanner: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#dcfce7', marginBottom: 16 },
    infoText: { color: '#166534', fontSize: 13, lineHeight: 18 },
    boldGreen: { fontWeight: 'bold', color: '#15803d' },

    card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
    cardHeader: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: '#e5e7eb' },
    avatarEmoji: { fontSize: 20 },
    textStack: { justifyContent: 'center' },
    callsign: { fontSize: 16, fontWeight: '700', color: '#111827' },
    dateText: { fontSize: 12, color: '#9ca3af', marginTop: 2, fontWeight: '500' },
    addBtn: { backgroundColor: '#059669', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    addBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },

    sectionHeader: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 6 },
    sectionDesc: { fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 18 },
    input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db', padding: 16, borderRadius: 12, fontSize: 15, fontWeight: '500', marginBottom: 16, color: '#111827' },
    btnGenerate: { backgroundColor: '#059669', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 24, shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
    btnGenerateText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
    
    qrCard: { backgroundColor: '#f0fdf4', borderWidth: 2, borderColor: '#10b981', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24 },
    qrTitle: { color: '#047857', fontSize: 14, fontWeight: '600', marginBottom: 16 },
    qrBox: { backgroundColor: '#ffffff', padding: 16, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, marginBottom: 16 },
    btnCopyQR: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d1d5db', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
    btnCopyQRText: { color: '#374151', fontSize: 14, fontWeight: '700' },
    
    pendingHeader: { fontSize: 12, fontWeight: '800', color: '#9ca3af', marginBottom: 12, letterSpacing: 1 },
    pendingCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
    pendingFor: { fontSize: 12, fontWeight: '700', color: '#059669', marginBottom: 4 },
    pendingCode: { fontSize: 13, fontFamily: 'monospace', color: '#111827', fontWeight: '600' },
    btnCopySmall: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginLeft: 12 },
    btnCopySmallText: { fontSize: 12, fontWeight: '600', color: '#4b5563' }
});
