import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, TextInput, Image, DeviceEventEmitter, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIdentity } from '../IdentityContext';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getBalance, getTransactions, getProjects, getMemberProfile, getAllCommunityMembers, sendTransfer } from '../../utils/db';
import { CurrencyDisplay } from '../../components/CurrencyDisplay';

export default function LedgerScreen() {
    const { identity } = useIdentity();
    const [txns, setTxns] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [balanceState, setBalanceState] = useState({ balance: 0, floor: -100, tier: { name: 'Ghost', emoji: '👻', canGift: false, canInvite: false }, earnedCredit: 0, commons: 0 });
    const [showSend, setShowSend] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    // Send form state
    const [members, setMembers] = useState<{ publicKey: string; callsign: string }[]>([]);
    const [sendTo, setSendTo] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const [sendMemo, setSendMemo] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sendSuccess, setSendSuccess] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');
    const [showMemberPicker, setShowMemberPicker] = useState(false);

    const loadData = () => {
        if (identity?.publicKey) {
            getBalance(identity.publicKey).then(setBalanceState).catch(console.error);
            getTransactions(identity.publicKey).then(setTxns).catch(console.error);
            getProjects().then(setProjects).catch(console.error);
            getMemberProfile(identity.publicKey).then(profile => {
                setAvatarUrl(profile?.avatar_url || null);
            }).catch(console.error);
        }
    };

    const loadMembers = () => {
        getAllCommunityMembers().then(m => {
            setMembers(m.filter(mm => mm.publicKey !== identity?.publicKey));
        }).catch(console.error);
    };

    useFocusEffect(
        React.useCallback(() => {
            loadData();
            loadMembers();
            const sub = DeviceEventEmitter.addListener('transaction_completed', loadData);
            const sub2 = DeviceEventEmitter.addListener('sync_data_updated', loadData);
            return () => {
                sub.remove();
                sub2.remove();
            };
        }, [identity])
    );

    const handleSend = async () => {
        if (!sendTo || !sendAmount || !identity?.publicKey) return;
        const amount = parseFloat(sendAmount);
        if (isNaN(amount) || amount <= 0) {
            setSendError('Enter a valid amount');
            return;
        }
        setSending(true);
        setSendError(null);
        setSendSuccess(false);
        try {
            await sendTransfer(identity.publicKey, sendTo, amount, sendMemo || '');
            setSendSuccess(true);
            setSendTo('');
            setSendAmount('');
            setSendMemo('');
            setMemberSearch('');
            loadData();
            // Auto-close form after 1.5s
            setTimeout(() => {
                setSendSuccess(false);
                setShowSend(false);
            }, 1500);
        } catch (e: any) {
            setSendError(e.message || 'Transfer failed');
        } finally {
            setSending(false);
        }
    };

    const selectedMember = members.find(m => m.publicKey === sendTo);
    const filteredMembers = members.filter(m =>
        m.callsign.toLowerCase().includes(memberSearch.toLowerCase())
    );

    const headerElement = (
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
                
                {/* Tier Badge */}
                <View style={[styles.reputationBadge, {
                    backgroundColor: balanceState.tier.name === 'Ghost' ? '#374151' : balanceState.tier.name === 'Resident' ? '#1e3a5f' : '#312e81',
                    borderColor: balanceState.tier.name === 'Ghost' ? '#4b5563' : balanceState.tier.name === 'Resident' ? '#3b82f6' : '#7c3aed',
                }]}>
                    <Text style={[styles.reputationText, {
                        color: balanceState.tier.name === 'Ghost' ? '#9ca3af' : balanceState.tier.name === 'Resident' ? '#93c5fd' : '#c4b5fd',
                    }]}>{balanceState.tier.emoji} {balanceState.tier.name}</Text>
                </View>
            </View>

            {/* Balance Row */}
            <View style={styles.balanceRow}>
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Balance</Text>
                    <CurrencyDisplay style={[styles.balanceAmount, balanceState.balance >= 0 ? styles.positiveText : styles.negativeText]} amount={`${balanceState.balance >= 0 ? '+' : ''}${balanceState.balance.toFixed(2)}`} />
                    <Text style={styles.hoursEquivalent}>≈ {(Math.abs(balanceState.balance) / 40).toFixed(1)} hrs</Text>
                    <Text style={styles.balanceFloor}>Floor: {balanceState.floor}</Text>
                </View>
                <View style={styles.balanceCard}>
                    <Text style={styles.balanceLabel}>Commons</Text>
                    <CurrencyDisplay style={styles.commonsAmount} amount={balanceState.commons.toFixed(2)} />
                    <Text style={styles.balanceFloor}>🌱 Community Pool</Text>
                </View>
            </View>

            {/* Community Circulation Info */}
            {balanceState.balance > 0 && (() => {
                const brackets = [
                    { maxInBracket: 200, rate: 0.005 },
                    { maxInBracket: 300, rate: 0.010 },
                    { maxInBracket: 500, rate: 0.015 },
                    { maxInBracket: 1000, rate: 0.020 },
                    { maxInBracket: Infinity, rate: 0.025 }
                ];
                let remaining = balanceState.balance;
                let totalCirculation = 0;
                for (const b of brackets) {
                    if (remaining <= 0) break;
                    const amountInBracket = Math.min(remaining, b.maxInBracket);
                    totalCirculation += amountInBracket * b.rate;
                    remaining -= amountInBracket;
                }
                const effectiveRate = ((totalCirculation / balanceState.balance) * 100).toFixed(2);
                const showAmber = balanceState.balance > 1000;

                return (
                    <View style={[styles.circulationBox, showAmber && styles.circulationBoxAbove]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.circulationLabel, showAmber && { color: '#92400e' }]}>🌿 Community Circulation</Text>
                            <CurrencyDisplay 
                                style={[styles.circulationRate, showAmber && { color: '#92400e' }]} 
                                amount={`−${totalCirculation.toFixed(3)} /mo`} 
                            />
                        </View>
                        <Text style={[styles.circulationWarning, !showAmber && { color: '#059669' }]}>
                            ≈ {effectiveRate}% /mo effective • Funds community projects
                        </Text>
                    </View>
                );
            })()}

            {/* Ghost Gift Warning */}
            {!balanceState.tier.canGift && !showSend && (
                <View style={styles.ghostWarning}>
                    <Text style={styles.ghostWarningText}>
                        👻 Direct gifting unlocks at Resident tier. Trade on the Marketplace to build trust.
                    </Text>
                </View>
            )}

            {/* Send Button */}
            <Pressable 
                style={[styles.sendBtn, showSend && styles.sendBtnActive, !balanceState.tier.canGift && styles.sendBtnDisabled]} 
                onPress={() => {
                    if (!balanceState.tier.canGift) return;
                    setShowSend(!showSend);
                    setSendError(null);
                    setSendSuccess(false);
                    if (!showSend) loadMembers();
                }}
                disabled={!balanceState.tier.canGift}
            >
                <Text style={styles.sendBtnText}>
                    {!balanceState.tier.canGift ? '🔒 Send Credits (Locked)' : showSend ? '✕ Cancel' : '💸 Send Credits'}
                </Text>
            </Pressable>

            {showSend && (
                <View style={styles.sendForm}>
                    {/* Recipient Picker */}
                    <Pressable
                        style={styles.recipientPicker}
                        onPress={() => setShowMemberPicker(!showMemberPicker)}
                    >
                        <Text style={[styles.recipientText, !selectedMember && { color: '#9ca3af' }]}>
                            {selectedMember ? `${selectedMember.callsign}` : 'Select recipient...'}
                        </Text>
                        <MaterialCommunityIcons name={showMemberPicker ? 'chevron-up' : 'chevron-down'} size={20} color="#6b7280" />
                    </Pressable>

                    {showMemberPicker && (
                        <View style={styles.memberPickerContainer}>
                            <TextInput
                                style={styles.memberSearchInput}
                                placeholder="Search members..."
                                placeholderTextColor="#9ca3af"
                                value={memberSearch}
                                onChangeText={setMemberSearch}
                                autoCapitalize="none"
                            />
                            <FlatList
                                data={filteredMembers}
                                keyExtractor={item => item.publicKey}
                                style={styles.memberList}
                                nestedScrollEnabled
                                renderItem={({ item }) => (
                                    <Pressable
                                        style={[styles.memberRow, item.publicKey === sendTo && styles.memberRowActive]}
                                        onPress={() => {
                                            setSendTo(item.publicKey);
                                            setShowMemberPicker(false);
                                            setMemberSearch('');
                                        }}
                                    >
                                        <Text style={[styles.memberCallsign, item.publicKey === sendTo && { color: '#fff' }]}>
                                            {item.callsign}
                                        </Text>
                                        <Text style={[styles.memberPk, item.publicKey === sendTo && { color: '#d1fae5' }]}>
                                            {item.publicKey.slice(0, 12)}...
                                        </Text>
                                    </Pressable>
                                )}
                                ListEmptyComponent={
                                    <Text style={styles.memberEmpty}>No members found</Text>
                                }
                            />
                        </View>
                    )}

                    {/* Amount */}
                    <TextInput
                        style={styles.sendInput}
                        placeholder="Amount"
                        placeholderTextColor="#9ca3af"
                        value={sendAmount}
                        onChangeText={setSendAmount}
                        keyboardType="decimal-pad"
                    />

                    {/* Memo */}
                    <TextInput
                        style={styles.sendInput}
                        placeholder="Memo (optional)"
                        placeholderTextColor="#9ca3af"
                        value={sendMemo}
                        onChangeText={setSendMemo}
                    />

                    {/* Error */}
                    {sendError && (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{sendError}</Text>
                        </View>
                    )}

                    {/* Success */}
                    {sendSuccess && (
                        <View style={styles.successBox}>
                            <Text style={styles.successText}>✅ Transfer sent!</Text>
                        </View>
                    )}

                    {/* Confirm Button */}
                    <Pressable
                        style={[styles.confirmBtn, (sending || !sendTo || !sendAmount) && styles.confirmBtnDisabled]}
                        onPress={handleSend}
                        disabled={sending || !sendTo || !sendAmount}
                    >
                        <Text style={styles.confirmBtnText}>
                            {sending ? 'Sending...' : 'Confirm Transfer'}
                        </Text>
                    </Pressable>
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
                        <CurrencyDisplay style={styles.projectStatText} amount={`${proj.current}`} />
                        <CurrencyDisplay style={styles.projectStatText} amount={`Goal: ${proj.goal}`} />
                    </View>
                </View>
            ))}

            <View style={[styles.sectionTitleContainer, { marginTop: 24 }]}>
                <Text style={styles.sectionTitle}>Recent Transactions</Text>
            </View>
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
                <View style={[styles.txnAmountCol, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={[styles.txnAmount, isCredit ? styles.positiveText : styles.negativeText]} numberOfLines={1}>
                        {isCredit ? '+' : '-'}{item.amount}
                    </Text>
                    <Image source={require('../../assets/images/bean.png')} style={{ width: 16, height: 16, marginLeft: 2, resizeMode: 'contain' }} />
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <FlatList
                data={txns}
                keyExtractor={item => item.id}
                ListHeaderComponent={headerElement}
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
    reputationBadge: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 },
    reputationText: { fontSize: 12, fontWeight: '800' },
    balanceRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    balanceCard: { flex: 1, backgroundColor: '#ffffff', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    balanceLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
    balanceAmount: { fontSize: 28, fontWeight: 'bold', fontFamily: 'Courier' },
    commonsAmount: { fontSize: 28, fontWeight: 'bold', color: '#f59e0b', fontFamily: 'Courier' },
    balanceFloor: { fontSize: 11, fontWeight: '500', color: '#9ca3af', marginTop: 4 },
    positiveText: { color: '#10b981' },
    negativeText: { color: '#ef4444' },
    sendBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, backgroundColor: '#d97757', alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    sendBtnActive: { backgroundColor: '#374151' },
    sendBtnDisabled: { backgroundColor: '#9ca3af', opacity: 0.6 },
    sendBtnText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold', letterSpacing: 0.5 },
    hoursEquivalent: { fontSize: 12, fontWeight: '600', color: '#9ca3af', marginTop: 2, fontFamily: 'Courier' } as any,
    circulationBox: { backgroundColor: '#ecfdf5', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#a7f3d0' },
    circulationBoxAbove: { backgroundColor: '#fef3c7', borderColor: '#fbbf24' },
    circulationLabel: { fontSize: 13, fontWeight: '700', color: '#065f46' } as any,
    circulationRate: { fontSize: 13, fontWeight: '700', color: '#047857', fontFamily: 'Courier' } as any,
    circulationWarning: { fontSize: 11, fontWeight: '500', color: '#92400e', marginTop: 6 } as any,
    ghostWarning: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    ghostWarningText: { fontSize: 12, fontWeight: '500', color: '#6b7280', textAlign: 'center' } as any,
    
    // Send form styles
    sendForm: { backgroundColor: '#f3f4f6', padding: 16, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#e5e7eb' },
    recipientPicker: { backgroundColor: '#ffffff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    recipientText: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
    memberPickerContainer: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10, overflow: 'hidden' },
    memberSearchInput: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', fontSize: 14, color: '#1f2937' },
    memberList: { maxHeight: 180 },
    memberRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
    memberRowActive: { backgroundColor: '#10b981' },
    memberCallsign: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
    memberPk: { fontSize: 11, color: '#9ca3af', fontFamily: 'Courier', marginTop: 2 },
    memberEmpty: { padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 13 },
    sendInput: { backgroundColor: '#ffffff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10, fontSize: 15, fontWeight: '500', color: '#1f2937' },
    errorBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 10, marginBottom: 10 },
    errorText: { color: '#dc2626', fontSize: 13, fontWeight: '700', textAlign: 'center' },
    successBox: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 10, padding: 10, marginBottom: 10 },
    successText: { color: '#059669', fontSize: 13, fontWeight: '700', textAlign: 'center' },
    confirmBtn: { backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    confirmBtnDisabled: { backgroundColor: '#d1d5db' },
    confirmBtnText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
    
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1f2937', marginBottom: 16, marginLeft: 4 },
    sectionTitleContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginLeft: 4, marginRight: 4 },
    auditBtn: { backgroundColor: '#f3f4f6', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    auditBtnText: { color: '#4b5563', fontSize: 12, fontWeight: '800' },
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
    proposeBtn: { backgroundColor: '#fcf3e8', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fcdcb6' },
    proposeBtnText: { color: '#c26749', fontSize: 12, fontWeight: '800' },
    projectCard: { backgroundColor: '#ffffff', padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    projectTitle: { fontSize: 15, fontWeight: 'bold', color: '#1f2937', marginBottom: 12 },
    progressContainer: { height: 8, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    progressBar: { height: '100%', backgroundColor: '#f59e0b', borderRadius: 4 },
    projectStats: { flexDirection: 'row', justifyContent: 'space-between' },
    projectStatText: { fontSize: 12, color: '#6b7280', fontWeight: '600' }
});

