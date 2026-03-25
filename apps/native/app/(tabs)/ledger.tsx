import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, ScrollView, Image } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIdentity } from '../IdentityContext';
import { getBalance, getTransactions, getProjects, getMemberProfile } from '../../utils/db';

export default function LedgerScreen() {
    const { identity } = useIdentity();
    const [txns, setTxns] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [balanceState, setBalanceState] = useState({ balance: 0, floor: 0, commons: 0 });
    const [showSend, setShowSend] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    useFocusEffect(
        React.useCallback(() => {
            if (identity?.publicKey) {
                getBalance(identity.publicKey).then(setBalanceState).catch(console.error);
                getTransactions(identity.publicKey).then(setTxns).catch(console.error);
                getProjects().then(setProjects).catch(console.error);
                getMemberProfile(identity.publicKey).then(profile => {
                    setAvatarUrl(profile?.avatar_url || null);
                }).catch(console.error);
            }
        }, [identity])
    );

    const renderHeader = () => (
        <View style={styles.headerContainer}>
            {/* Identity Card */}
            <View style={styles.identityCard}>
                <View style={styles.avatar}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                    ) : (
                        <Text style={styles.avatarEmoji}>🛡️</Text>
                    )}
                </View>
                <Text style={styles.callsign}>{identity?.callsign || 'GUEST'}</Text>
                <Text style={styles.pubkey}>{identity?.publicKey?.substring(0, 16) || '...'}...</Text>
                
                {/* Reputation Badge */}
                <View style={styles.reputationBadge}>
                    <Text style={styles.reputationText}>Rating: 4.8 ★  •  Trust Level 2</Text>
                </View>
            </View>

            {/* Balance Row */}
            <View style={styles.balanceRow}>
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Balance</Text>
                    <Text style={[styles.balanceAmount, balanceState.balance >= 0 ? styles.positiveText : styles.negativeText]}>
                        {balanceState.balance >= 0 ? '+' : ''}{balanceState.balance.toFixed(2)}B
                    </Text>
                    <Text style={styles.balanceFloor}>Floor: {balanceState.floor}B</Text>
                </View>
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Commons</Text>
                    <Text style={styles.commonsAmount}>{balanceState.commons.toFixed(2)}B</Text>
                    <Text style={styles.balanceFloor}>🌱 Community Pool</Text>
                </View>
            </View>

            {/* Send Button */}
            <Pressable 
                style={[styles.sendBtn, showSend && styles.sendBtnActive]} 
                onPress={() => setShowSend(!showSend)}
            >
                <Text style={styles.sendBtnText}>
                    {showSend ? '✕ Cancel' : '💸 Send Credits'}
                </Text>
            </Pressable>

            {showSend && (
                <View style={styles.sendForm}>
                    <Text style={styles.sendFormContext}>Send P2P Transfer natively implemented in Phase 3.4 / 4.</Text>
                </View>
            )}

            <View style={styles.commonsHeader}>
                <Text style={styles.sectionTitle}>Community Projects</Text>
                <Pressable style={styles.proposeBtn} onPress={() => router.push('/propose-project')}>
                    <Text style={styles.proposeBtnText}>+ Propose</Text>
                </Pressable>
            </View>

            {projects.map(proj => (
                <View key={proj.id} style={styles.projectCard}>
                    <Text style={styles.projectTitle}>{proj.title}</Text>
                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBar, { width: `${Math.min((proj.current / proj.goal) * 100, 100)}%` }]} />
                    </View>
                    <View style={styles.projectStats}>
                        <Text style={styles.projectStatText}>{proj.current} Ʀ raised</Text>
                        <Text style={styles.projectStatText}>Goal: {proj.goal} Ʀ</Text>
                    </View>
                </View>
            ))}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Recent Transactions</Text>
        </View>
    );

    const renderTxn = ({ item }: { item: any }) => {
        const isCredit = item.type === 'credit';
        return (
            <View style={styles.txnRow}>
                <View style={[styles.txnIcon, isCredit ? styles.iconCredit : styles.iconDebit]}>
                    <MaterialCommunityIcons 
                        name={isCredit ? 'arrow-bottom-left' : 'arrow-top-right'} 
                        size={20} 
                        color={isCredit ? '#10b981' : '#ef4444'} 
                    />
                </View>
                <View style={styles.txnDetails}>
                    <Text style={styles.txnPeer}>{item.peer}</Text>
                    <Text style={styles.txnMemo}>{item.memo}</Text>
                    <Text style={styles.txnTime}>{item.timestamp}</Text>
                </View>
                <View style={styles.txnAmountCol}>
                    <Text style={[styles.txnAmount, isCredit ? styles.positiveText : styles.negativeText]}>
                        {isCredit ? '+' : '-'}{item.amount} B
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.topBar}>
                <Text style={styles.topTitle}>Ledger</Text>
            </View>
            <FlatList
                data={txns}
                keyExtractor={item => item.id}
                ListHeaderComponent={renderHeader}
                renderItem={renderTxn}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f9fafb' },
    topBar: { padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    topTitle: { fontSize: 32, fontWeight: '800', color: '#1f2937', letterSpacing: -0.5 },
    listContent: { padding: 16, paddingBottom: 100 },
    headerContainer: { marginBottom: 8 },
    identityCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#10b981', backgroundColor: '#ecfdf5', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    avatarEmoji: { fontSize: 32 },
    callsign: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
    pubkey: { fontSize: 12, color: '#6b7280', fontFamily: 'Courier', marginBottom: 12 },
    reputationBadge: { backgroundColor: '#fef3c7', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#fde68a' },
    reputationText: { color: '#b45309', fontSize: 12, fontWeight: '800' },
    balanceRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    balanceCard: { flex: 1, backgroundColor: '#ffffff', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    balanceLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
    balanceAmount: { fontSize: 28, fontWeight: 'bold', fontFamily: 'Courier' },
    commonsAmount: { fontSize: 28, fontWeight: 'bold', color: '#f59e0b', fontFamily: 'Courier' },
    balanceFloor: { fontSize: 11, fontWeight: '500', color: '#9ca3af', marginTop: 4 },
    positiveText: { color: '#10b981' },
    negativeText: { color: '#ef4444' },
    sendBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, backgroundColor: '#e11d48', alignItems: 'center', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }, // using terra-600 map #e11d48
    sendBtnActive: { backgroundColor: '#374151' },
    sendBtnText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold', letterSpacing: 0.5 },
    sendForm: { backgroundColor: '#f3f4f6', padding: 20, borderRadius: 16, marginBottom: 24 },
    sendFormContext: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1f2937', marginBottom: 16, marginLeft: 4 },
    txnRow: { flexDirection: 'row', backgroundColor: '#ffffff', padding: 16, borderRadius: 16, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#f3f4f6' },
    txnIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    iconCredit: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
    iconDebit: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
    txnDetails: { flex: 1 },
    txnPeer: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 2 },
    txnMemo: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
    txnTime: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
    txnAmountCol: { alignItems: 'flex-end' },
    txnAmount: { fontSize: 16, fontWeight: 'bold' },
    commonsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginLeft: 4 },
    proposeBtn: { backgroundColor: '#fcf3e8', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fcdcb6' }, // terra-based
    proposeBtnText: { color: '#c26749', fontSize: 12, fontWeight: '800' },
    projectCard: { backgroundColor: '#ffffff', padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    projectTitle: { fontSize: 15, fontWeight: 'bold', color: '#1f2937', marginBottom: 12 },
    progressContainer: { height: 8, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    progressBar: { height: '100%', backgroundColor: '#f59e0b', borderRadius: 4 },
    projectStats: { flexDirection: 'row', justifyContent: 'space-between' },
    projectStatText: { fontSize: 12, color: '#6b7280', fontWeight: '600' }
});
