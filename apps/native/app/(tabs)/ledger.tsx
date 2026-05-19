import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, TextInput, Image,
    DeviceEventEmitter, Alert, ScrollView } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useIdentity } from '../IdentityContext';
import { getBalance, getTransactions, getMemberProfile, getAllCommunityMembers, sendTransfer, getPledgeHistory, getEscrowTotal } from '../../utils/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hapticSuccess, hapticWarning } from '../../utils/haptics';
import { CurrencyDisplay } from '../../components/CurrencyDisplay';
import { MemberAvatar } from '../../components/MemberAvatar';
import { BalanceInfoModal } from '../../components/info-content/BalanceInfoModal';
import { CirculationInfoModal } from '../../components/info-content/CirculationInfoModal';
import { CommonsInfoModal } from '../../components/CommonsInfoModal';

// ── Tier constants (mirrors beanpool-core/protocol.ts) ──
const TIERS = [
    { name: 'Ghost',    emoji: '👻', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db', min: 0    },
    { name: 'Resident', emoji: '🏠', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', min: 120  },
    { name: 'Citizen',  emoji: '🏛️', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', min: 520  },
    { name: 'Elder',    emoji: '👑', color: '#d97706', bg: '#fffbeb', border: '#fde68a', min: 1320 },
];
const W_TRADES = 8, W_PARTNERS = 40, W_DAYS = 2;

function getTierIndex(ec: number) {
    if (ec >= 1320) return 3;
    if (ec >= 520)  return 2;
    if (ec >= 120)  return 1;
    return 0;
}

export default function LedgerScreen() {
    const { identity } = useIdentity();
    const [txns, setTxns] = useState<any[]>([]);
    const [balanceState, setBalanceState] = useState<any>({
        balance: 0, floor: -100,
        tier: { name: 'Ghost', emoji: '👻', canGift: false, canInvite: false },
        earnedCredit: 0, commons: 0, trustStats: null,
    });
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'trust' | 'financials'>('trust');
    const [escrowTotal, setEscrowTotal] = useState(0);
    const [pledgeHistory, setPledgeHistory] = useState<any[]>([]);
    const [exporting, setExporting] = useState(false);

    const [showBalanceInfo, setShowBalanceInfo] = useState(false);
    const [showCommonsInfo, setShowCommonsInfo] = useState(false);
    const [showCirculationInfo, setShowCirculationInfo] = useState(false);

    const [showSend, setShowSend] = useState(false);
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
            getMemberProfile(identity.publicKey).then(p => setAvatarUrl(p?.avatar_url || null)).catch(console.error);
            getEscrowTotal(identity.publicKey).then(setEscrowTotal).catch(() => {});
            getPledgeHistory(identity.publicKey).then(setPledgeHistory).catch(() => {});
        }
    };

    const handleExport = async () => {
        const anchorUrl = await AsyncStorage.getItem('beanpool_anchor_url');
        if (!anchorUrl || !identity?.publicKey) return;
        setExporting(true);
        try {
            const res = await fetch(`${anchorUrl}/api/ledger/export`);
            if (!res.ok) throw new Error('Export failed');
            const { transactionsCsv } = await res.json();
            const path = `${FileSystem.cacheDirectory}beanpool-ledger.csv`;
            await FileSystem.writeAsStringAsync(path, transactionsCsv, { encoding: FileSystem.EncodingType.UTF8 });
            await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Ledger' });
        } catch (e: any) {
            Alert.alert('Export Failed', e.message || 'Could not export ledger.');
        } finally {
            setExporting(false);
        }
    };
    const loadMembers = () => {
        getAllCommunityMembers().then(m => setMembers(m.filter(mm => mm.publicKey !== identity?.publicKey))).catch(console.error);
    };

    useFocusEffect(
        React.useCallback(() => {
            loadData(); loadMembers();
            const s1 = DeviceEventEmitter.addListener('transaction_completed', loadData);
            const s2 = DeviceEventEmitter.addListener('sync_data_updated', loadData);
            return () => { s1.remove(); s2.remove(); };
        }, [identity])
    );

    const handleSend = async () => {
        if (!sendTo || !sendAmount || !identity?.publicKey) return;
        const amount = parseFloat(sendAmount);
        if (isNaN(amount) || amount <= 0) { setSendError('Enter a valid amount'); return; }
        setSending(true); setSendError(null); setSendSuccess(false);
        try {
            await sendTransfer(identity.publicKey, sendTo, amount, sendMemo || '');
            hapticSuccess();
            setSendSuccess(true);
            setSendTo(''); setSendAmount(''); setSendMemo(''); setMemberSearch('');
            loadData();
            setTimeout(() => { setSendSuccess(false); setShowSend(false); }, 1500);
        } catch (e: any) {
            hapticWarning();
            setSendError(e.message || 'Transfer failed');
        } finally { setSending(false); }
    };

    // Trust calculations
    const ec = balanceState.earnedCredit || 0;
    const ts = balanceState.trustStats;
    const tradeCount    = ts?.tradeCount     || 0;
    const uniquePartners = ts?.uniquePartners || 0;
    const ageDays       = ts?.ageDays        || 0;
    const tierIdx = getTierIndex(ec);
    const tier = TIERS[tierIdx];
    const nextTier = TIERS[tierIdx + 1] || null;
    const overallProgress = nextTier ? Math.min(1, (ec - tier.min) / (nextTier.min - tier.min)) : 1;
    const creditsToNext = nextTier ? Math.max(0, nextTier.min - ec) : 0;
    const tradesToLevel   = nextTier ? Math.ceil(creditsToNext / W_TRADES)   : 0;
    const partnersToLevel = nextTier ? Math.ceil(creditsToNext / W_PARTNERS) : 0;
    const daysToLevel     = nextTier ? Math.ceil(creditsToNext / W_DAYS)     : 0;

    const selectedMember = members.find(m => m.publicKey === sendTo);
    const filteredMembers = members.filter(m => m.callsign.toLowerCase().includes(memberSearch.toLowerCase()));

    // ─── Trust Tab ───────────────────────────────────────────────────────────
    const renderTrustTab = () => (
        <ScrollView style={{ flex: 1, backgroundColor: '#f9fafb' }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

            {/* Tier Hero */}
            <View style={[styles.tierHero, { backgroundColor: tier.bg, borderColor: tier.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <View>
                        <Text style={styles.tierHeroLabel}>YOUR TRUST LEVEL</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <Text style={{ fontSize: 32 }}>{tier.emoji}</Text>
                            <Text style={[styles.tierHeroName, { color: tier.color }]}>{tier.name}</Text>
                        </View>
                    </View>
                    <View style={[styles.levelBadge, { borderColor: tier.border, backgroundColor: '#fff' }]}>
                        <Text style={[styles.levelBadgeText, { color: tier.color }]}>Level {tierIdx + 1} / {TIERS.length}</Text>
                    </View>
                </View>

                <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${overallProgress * 100}%`, backgroundColor: tier.color }]} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={styles.progressLabel}>{ec} credits earned</Text>
                    {nextTier
                        ? <Text style={styles.progressLabel}>{nextTier.min} for {nextTier.emoji} {nextTier.name}</Text>
                        : <Text style={[styles.progressLabel, { color: '#d97706', fontWeight: '700' }]}>✨ Maximum level!</Text>
                    }
                </View>

                {/* Perks */}
                <View style={styles.perksRow}>
                    <View style={[styles.perkPill, { borderColor: balanceState.tier.canGift ? '#bbf7d0' : '#e5e7eb', backgroundColor: balanceState.tier.canGift ? '#f0fdf4' : '#f9fafb' }]}>
                        <MaterialCommunityIcons name={balanceState.tier.canGift ? 'check-circle' : 'lock-outline'} size={13} color={balanceState.tier.canGift ? '#10b981' : '#9ca3af'} />
                        <Text style={[styles.perkText, { color: balanceState.tier.canGift ? '#059669' : '#9ca3af' }]}>Send Credits</Text>
                    </View>
                    <View style={[styles.perkPill, { borderColor: balanceState.tier.canInvite ? '#bbf7d0' : '#e5e7eb', backgroundColor: balanceState.tier.canInvite ? '#f0fdf4' : '#f9fafb' }]}>
                        <MaterialCommunityIcons name={balanceState.tier.canInvite ? 'check-circle' : 'lock-outline'} size={13} color={balanceState.tier.canInvite ? '#10b981' : '#9ca3af'} />
                        <Text style={[styles.perkText, { color: balanceState.tier.canInvite ? '#059669' : '#9ca3af' }]}>Invite Members</Text>
                    </View>
                </View>
            </View>

            {/* Path to next tier */}
            {nextTier && (
                <View style={styles.pathCard}>
                    <Text style={styles.pathTitle}>🚀 Fastest paths to {nextTier.emoji} {nextTier.name}</Text>
                    <View style={styles.pathRow}>
                        <View style={styles.pathOption}>
                            <Text style={[styles.pathNumber, { color: '#10b981' }]}>{tradesToLevel}</Text>
                            <Text style={styles.pathLabel}>more trades</Text>
                        </View>
                        <Text style={styles.pathOr}>or</Text>
                        <View style={styles.pathOption}>
                            <Text style={[styles.pathNumber, { color: '#3b82f6' }]}>{partnersToLevel}</Text>
                            <Text style={styles.pathLabel}>new partners</Text>
                        </View>
                        <Text style={styles.pathOr}>or</Text>
                        <View style={styles.pathOption}>
                            <Text style={[styles.pathNumber, { color: '#f97316' }]}>{daysToLevel}</Text>
                            <Text style={styles.pathLabel}>more days</Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Achievement cards */}
            <Text style={styles.sectionLabel}>YOUR ACHIEVEMENTS</Text>
            <View style={styles.achieveRow}>
                {[
                    { icon: '🤝', label: 'TRADES',   count: tradeCount,     contrib: tradeCount * W_TRADES,     target: 50,  color: '#10b981', trackBg: '#f0fdf4' },
                    { icon: '👥', label: 'PARTNERS', count: uniquePartners, contrib: uniquePartners * W_PARTNERS, target: 20, color: '#3b82f6', trackBg: '#eff6ff' },
                    { icon: '📅', label: 'DAYS',     count: ageDays,        contrib: ageDays * W_DAYS,          target: 365, color: '#f97316', trackBg: '#fff7ed' },
                ].map(a => (
                    <View key={a.label} style={[styles.achieveCard, { borderColor: a.color + '30' }]}>
                        <Text style={{ fontSize: 22, marginBottom: 4 }}>{a.icon}</Text>
                        <Text style={[styles.achieveCount, { color: a.color }]}>{a.count}</Text>
                        <Text style={styles.achieveLabel}>{a.label}</Text>
                        <Text style={styles.achieveContrib}>+{a.contrib} pts</Text>
                        <View style={[styles.achieveBarBg, { backgroundColor: a.trackBg }]}>
                            <View style={[styles.achieveBarFill, { width: `${Math.min(100, (a.count / a.target) * 100)}%`, backgroundColor: a.color }]} />
                        </View>
                        <Text style={styles.achieveFooter}>{a.count}/{a.target}</Text>
                    </View>
                ))}
            </View>

            {/* Tier Ladder */}
            <Text style={styles.sectionLabel}>TRUST LADDER</Text>
            <View style={styles.ladder}>
                {TIERS.map((t, i) => {
                    const reached = tierIdx >= i;
                    const isCurrent = tierIdx === i;
                    return (
                        <View key={t.name} style={[styles.ladderRow, isCurrent && { backgroundColor: t.bg, borderColor: t.border }]}>
                            <View style={[styles.ladderDot, { backgroundColor: reached ? t.color : '#e5e7eb', borderColor: t.color }]} />
                            <Text style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{t.emoji}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.ladderName, { color: reached ? t.color : '#9ca3af' }]}>
                                    {t.name}{isCurrent ? '  ← you' : ''}
                                </Text>
                                <Text style={styles.ladderReq}>{t.min === 0 ? 'Starting tier' : `${t.min} credits`}</Text>
                            </View>
                            {reached && <MaterialCommunityIcons name="check-circle" size={18} color={t.color} />}
                        </View>
                    );
                })}
            </View>
            <Text style={styles.formula}>💡 Credits = (trades × 8) + (partners × 40) + (days as member × 2)</Text>
        </ScrollView>
    );

    // ─── Financials Tab ───────────────────────────────────────────────────────
    const renderActivityHeader = () => {
        const brackets = [{ m: 200, r: 0.005 }, { m: 300, r: 0.010 }, { m: 500, r: 0.015 }, { m: 1000, r: 0.020 }, { m: Infinity, r: 0.025 }];
        let rem = balanceState.balance, monthly = 0;
        for (const b of brackets) { if (rem <= 0) break; monthly += Math.min(rem, b.m) * b.r; rem -= b.m; }
        const amber = balanceState.balance > 1000;
        const now = new Date();
        const nextRun = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const daysUntil = Math.ceil((nextRun.getTime() - now.getTime()) / 86400000);

        return (
            <View>
                <View style={styles.balanceRow}>
                    <Pressable style={styles.balanceCard} onPress={() => setShowBalanceInfo(true)}>
                        <Text style={styles.balCardLabel}>Balance ⓘ</Text>
                        <CurrencyDisplay asView style={[styles.balCardAmount, balanceState.balance >= 0 ? styles.pos : styles.neg]} amount={`${balanceState.balance >= 0 ? '+' : ''}${balanceState.balance.toFixed(2)}`} />
                        <Text style={styles.balCardSub}>≈ {(Math.abs(balanceState.balance) / 40).toFixed(1)} hrs · Floor {balanceState.floor}</Text>
                    </Pressable>
                    <Pressable style={styles.balanceCard} onPress={() => setShowCommonsInfo(true)}>
                        <Text style={styles.balCardLabel}>Commons ⓘ</Text>
                        <CurrencyDisplay asView style={styles.commonsAmt} amount={balanceState.commons.toFixed(2)} />
                        <Text style={styles.balCardSub}>🌱 Community Pool</Text>
                    </Pressable>
                </View>

                {balanceState.balance > 0 && (
                    <Pressable style={[styles.circBox, amber && styles.circBoxAmber]} onPress={() => setShowCirculationInfo(true)}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={[styles.circLabel, amber && { color: '#92400e' }]}>🌿 Community Circulation ⓘ</Text>
                            <CurrencyDisplay style={[styles.circRate, amber && { color: '#92400e' }]} amount={monthly.toFixed(2)} />
                        </View>
                        <Text style={[styles.circLabel, { color: '#9ca3af', fontSize: 11, marginTop: 2 }]}>per month → commons pool</Text>
                        {amber && <Text style={{ color: '#d97706', fontSize: 11, marginTop: 4, fontWeight: '600' }}>Balance above 1000 — consider spending!</Text>}
                    </Pressable>
                )}

                {escrowTotal > 0 && (
                    <View style={styles.infoCard}>
                        <View style={styles.infoCardRow}>
                            <MaterialCommunityIcons name="lock-clock" size={18} color="#f59e0b" />
                            <Text style={styles.infoCardLabel}>In Escrow</Text>
                            <CurrencyDisplay style={styles.infoCardValue} amount={escrowTotal.toFixed(2)} />
                        </View>
                        <Text style={styles.infoCardSub}>Beans locked in active marketplace deals</Text>
                    </View>
                )}

                {balanceState.balance > 0 && (
                    <View style={styles.forecastCard}>
                        <View style={styles.infoCardRow}>
                            <MaterialCommunityIcons name="calendar-clock" size={18} color="#8b5cf6" />
                            <Text style={styles.infoCardLabel}>Next Circulation</Text>
                            <Text style={styles.forecastDate}>{nextRun.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} · {daysUntil}d</Text>
                        </View>
                        <View style={styles.infoCardRow}>
                            <Text style={styles.forecastSub}>Est. amount</Text>
                            <CurrencyDisplay style={styles.forecastAmt} amount={`~${monthly.toFixed(1)}`} />
                        </View>
                    </View>
                )}

                {pledgeHistory.length > 0 && (
                    <View style={styles.pledgeSection}>
                        <Text style={styles.sectionLabel}>PROJECT PLEDGES</Text>
                        {pledgeHistory.map((pl: any) => (
                            <View key={pl.id} style={styles.pledgeRow}>
                                <MaterialCommunityIcons name="sprout" size={16} color="#10b981" />
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                    <Text style={styles.pledgeName} numberOfLines={1}>{pl.projectTitle}</Text>
                                    <Text style={styles.pledgeDate}>{new Date(pl.timestamp).toLocaleDateString()}</Text>
                                </View>
                                <Text style={styles.pledgeAmt}>-{pl.amount} B</Text>
                            </View>
                        ))}
                    </View>
                )}

                <Pressable
                    style={[styles.sendBtn, showSend && styles.sendBtnOpen, !balanceState.tier.canGift && styles.sendBtnLocked]}
                    onPress={async () => {
                        if (!balanceState.tier.canGift) return;
                        if (!showSend) {
                            const url = await AsyncStorage.getItem('beanpool_anchor_url');
                            if (!url) { Alert.alert('Not Connected', 'Connect to a community first.', [{ text: 'Cancel' }, { text: 'Connect', onPress: () => router.push({ pathname: '/(tabs)/settings', params: { section: 'advanced' } }) }]); return; }
                            loadMembers();
                        }
                        setShowSend(!showSend); setSendError(null); setSendSuccess(false);
                    }}
                    disabled={!balanceState.tier.canGift}
                >
                    <Text style={styles.sendBtnText}>{!balanceState.tier.canGift ? '🔒 Send Credits (Locked)' : showSend ? '✕ Cancel' : '💸 Send Credits'}</Text>
                </Pressable>

                {showSend && (
                    <View style={styles.sendForm}>
                        <Pressable style={styles.recipientRow} onPress={() => setShowMemberPicker(!showMemberPicker)}>
                            <Text style={[styles.recipientText, !selectedMember && { color: '#9ca3af' }]}>{selectedMember?.callsign || 'Select recipient...'}</Text>
                            <MaterialCommunityIcons name={showMemberPicker ? 'chevron-up' : 'chevron-down'} size={20} color="#6b7280" />
                        </Pressable>
                        {showMemberPicker && (
                            <View style={styles.pickerBox}>
                                <TextInput style={styles.pickerSearch} placeholder="Search members..." placeholderTextColor="#9ca3af" value={memberSearch} onChangeText={setMemberSearch} autoCapitalize="none" />
                                <FlatList data={filteredMembers} keyExtractor={i => i.publicKey} style={{ maxHeight: 180 }} nestedScrollEnabled
                                    renderItem={({ item }) => (
                                        <Pressable style={[styles.pickerRow, item.publicKey === sendTo && styles.pickerRowActive]} onPress={() => { setSendTo(item.publicKey); setShowMemberPicker(false); setMemberSearch(''); }}>
                                            <Text style={[styles.pickerName, item.publicKey === sendTo && { color: '#fff' }]}>{item.callsign}</Text>
                                            <Text style={[styles.pickerPk, item.publicKey === sendTo && { color: '#d1fae5' }]}>{item.publicKey.slice(0, 12)}...</Text>
                                        </Pressable>
                                    )}
                                    ListEmptyComponent={<Text style={{ padding: 16, color: '#9ca3af', textAlign: 'center', fontSize: 13 }}>No members found</Text>}
                                />
                            </View>
                        )}
                        <TextInput style={styles.sendInput} placeholder="Amount" placeholderTextColor="#9ca3af" keyboardType="numeric" value={sendAmount} onChangeText={setSendAmount} />
                        <TextInput style={styles.sendInput} placeholder="Memo (optional)" placeholderTextColor="#9ca3af" value={sendMemo} onChangeText={setSendMemo} />
                        {sendError && <View style={styles.errBox}><Text style={styles.errText}>{sendError}</Text></View>}
                        {sendSuccess && <View style={styles.okBox}><Text style={styles.okText}>✓ Sent!</Text></View>}
                        <Pressable style={[styles.confirmBtn, (sending || !sendTo || !sendAmount) && styles.confirmBtnOff]} onPress={handleSend} disabled={sending || !sendTo || !sendAmount}>
                            <Text style={styles.confirmBtnText}>{sending ? 'Sending...' : 'Confirm Transfer'}</Text>
                        </Pressable>
                    </View>
                )}

                <View style={styles.txnHeaderRow}>
                    <Text style={styles.sectionLabel}>RECENT TRANSACTIONS</Text>
                    <Pressable style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
                        <MaterialCommunityIcons name="download" size={14} color="#6b7280" />
                        <Text style={styles.exportBtnText}>{exporting ? 'Exporting…' : 'Export CSV'}</Text>
                    </Pressable>
                </View>
            </View>
        );
    };

    const renderTxn = ({ item }: { item: any }) => {
        const isCredit = item.type === 'credit';
        return (
            <View style={styles.txnRow}>
                <View style={[styles.txnIcon, isCredit ? styles.txnIconCredit : styles.txnIconDebit]}>
                    <MaterialCommunityIcons name={isCredit ? 'arrow-bottom-left' : 'arrow-top-right'} size={18} color={isCredit ? '#10b981' : '#ef4444'} />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.txnPeer}>{item.peer}</Text>
                    <Text style={styles.txnMemo}>{item.memo}</Text>
                    <Text style={styles.txnTime}>{item.timestamp}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.txnAmount, isCredit ? styles.pos : styles.neg]}>{isCredit ? '+' : '-'}{item.amount}</Text>
                    <Image source={require('../../assets/images/bean.png')} style={{ width: 16, height: 16, marginLeft: 2, resizeMode: 'contain' }} />
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.root}>

            {/* ── Compact profile + balance bar ── */}
            <View style={styles.topBar}>
                {/* Avatar + name + tier — left side */}
                <Pressable style={styles.profileChunk} onPress={() => router.push({ pathname: '/(tabs)/settings', params: { section: 'profile' } })}>
                    <View style={styles.avatarRing}>
                        <MemberAvatar avatarUrl={avatarUrl} pubkey={identity?.publicKey || ''} callsign={identity?.callsign || 'G'} size={48} />
                    </View>
                    <View>
                        <Text style={styles.profileName}>{identity?.callsign || 'GUEST'}</Text>
                        <View style={[styles.tierChip, { backgroundColor: tier.bg, borderColor: tier.border }]}>
                            <Text style={[styles.tierChipText, { color: tier.color }]}>{tier.emoji} {tier.name}</Text>
                        </View>
                    </View>
                    <View style={styles.editHint}>
                        <MaterialCommunityIcons name="pencil-outline" size={14} color="#9ca3af" />
                    </View>
                </Pressable>

                {/* Balance — right side, intentionally large */}
                <Pressable style={styles.balanceChunk} onPress={() => { setActiveTab('financials'); }}>
                    <CurrencyDisplay
                        asView
                        style={[styles.bigBalance, balanceState.balance >= 0 ? styles.pos : styles.neg]}
                        amount={`${balanceState.balance >= 0 ? '+' : ''}${balanceState.balance.toFixed(1)}`}
                    />
                    <Text style={styles.balanceWord}>BEANS</Text>
                </Pressable>
            </View>

            {/* ── Tab bar ── */}
            <View style={styles.tabBar}>
                <Pressable style={[styles.tab, activeTab === 'trust' && [styles.tabActive, { borderBottomColor: tier.color }]]} onPress={() => setActiveTab('trust')}>
                    <MaterialCommunityIcons name="shield-star-outline" size={15} color={activeTab === 'trust' ? tier.color : '#9ca3af'} />
                    <Text style={[styles.tabText, activeTab === 'trust' && { color: tier.color, fontWeight: '800' }]}>Trust Level</Text>
                </Pressable>
                <Pressable style={[styles.tab, activeTab === 'financials' && styles.tabActive]} onPress={() => setActiveTab('financials')}>
                    <MaterialCommunityIcons name="swap-horizontal" size={15} color={activeTab === 'financials' ? '#10b981' : '#9ca3af'} />
                    <Text style={[styles.tabText, activeTab === 'financials' && { color: '#10b981', fontWeight: '800' }]}>Financials</Text>
                </Pressable>
            </View>

            {/* ── Content ── */}
            {activeTab === 'trust' ? renderTrustTab() : (
                <FlatList
                    data={txns}
                    keyExtractor={item => item.id}
                    ListHeaderComponent={renderActivityHeader()}
                    renderItem={renderTxn}
                    contentContainerStyle={styles.activityContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#9ca3af', paddingTop: 32, fontSize: 14 }}>No transactions yet.</Text>}
                />
            )}

            <BalanceInfoModal isOpen={showBalanceInfo} onClose={() => setShowBalanceInfo(false)} />
            <CommonsInfoModal isOpen={showCommonsInfo} onClose={() => setShowCommonsInfo(false)} commonsBalance={balanceState.commons} />
            <CirculationInfoModal isOpen={showCirculationInfo} onClose={() => setShowCirculationInfo(false)} />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#f9fafb' },

    // Top bar
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    profileChunk: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    avatarRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, borderColor: '#10b981', overflow: 'hidden', shadowColor: '#10b981', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
    profileName: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 3 },
    tierChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
    tierChipText: { fontSize: 11, fontWeight: '700' },
    editHint: { marginLeft: 2, marginTop: -14 },

    // Big balance — the whole point of this page
    balanceChunk: { alignItems: 'flex-end', paddingLeft: 8 },
    bigBalance: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
    balanceWord: { fontSize: 10, fontWeight: '800', color: '#9ca3af', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 0 },

    pos: { color: '#10b981' },
    neg: { color: '#ef4444' },

    // Tab bar
    tabBar: { flexDirection: 'row', backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: '#8b5cf6' },
    tabText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },

    // ── Trust Tab ──
    tierHero: { borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 16 },
    tierHeroLabel: { fontSize: 10, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 },
    tierHeroName: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
    levelBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
    levelBadgeText: { fontSize: 13, fontWeight: '800' },
    progressBg: { height: 10, backgroundColor: '#e5e7eb', borderRadius: 5, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 5 },
    progressLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
    perksRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    perkPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
    perkText: { fontSize: 12, fontWeight: '700' },

    pathCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    pathTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 14 },
    pathRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
    pathOption: { alignItems: 'center' },
    pathNumber: { fontSize: 32, fontWeight: '900', lineHeight: 36 },
    pathLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600', marginTop: 2 },
    pathOr: { fontSize: 11, color: '#d1d5db', fontWeight: '600' },

    sectionLabel: { fontSize: 11, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

    achieveRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    achieveCard: { flex: 1, backgroundColor: '#ffffff', borderRadius: 14, padding: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
    achieveCount: { fontSize: 24, fontWeight: '900', marginBottom: 1 },
    achieveLabel: { fontSize: 9, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
    achieveContrib: { fontSize: 10, color: '#9ca3af', fontWeight: '600', marginBottom: 8 },
    achieveBarBg: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
    achieveBarFill: { height: '100%', borderRadius: 3 },
    achieveFooter: { fontSize: 9, color: '#9ca3af', fontWeight: '600' },

    ladder: { backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
    ladderRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', borderColor: 'transparent' },
    ladderDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
    ladderName: { fontSize: 14, fontWeight: '800' },
    ladderReq: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
    formula: { fontSize: 11, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', paddingBottom: 4 },

    // ── Activity Tab ──
    activityContent: { padding: 16, paddingBottom: 100 },
    balanceRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    balanceCard: { flex: 1, backgroundColor: '#ffffff', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
    balCardLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
    balCardAmount: { fontSize: 22, fontWeight: '800' },
    commonsAmt: { fontSize: 22, fontWeight: '800', color: '#d97706', flexShrink: 1 },
    balCardSub: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
    // Escrow / forecast / pledge
    infoCard: { backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#fde68a' },
    infoCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    infoCardLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: '#374151' },
    infoCardValue: { fontSize: 15, fontWeight: '800', color: '#f59e0b' } as any,
    infoCardSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
    forecastCard: { backgroundColor: '#f5f3ff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#ddd6fe', gap: 6 },
    forecastDate: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
    forecastSub: { flex: 1, fontSize: 12, color: '#6b7280' },
    forecastAmt: { fontSize: 15, fontWeight: '800', color: '#8b5cf6' } as any,
    pledgeSection: { marginBottom: 12 },
    pledgeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#e5e7eb' },
    pledgeName: { fontSize: 13, fontWeight: '700', color: '#111827' },
    pledgeDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
    pledgeAmt: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
    txnHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4 },
    exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    exportBtnText: { fontSize: 11, color: '#6b7280', fontWeight: '700' },
    circBox: { backgroundColor: '#ecfdf5', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#a7f3d0' },
    circBoxAmber: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
    circLabel: { fontSize: 13, fontWeight: '700', color: '#065f46' } as any,
    circRate: { fontSize: 13, fontWeight: '700', color: '#047857', fontFamily: 'Courier' } as any,
    sendBtn: { paddingVertical: 16, borderRadius: 14, backgroundColor: '#f97316', alignItems: 'center', marginBottom: 12 },
    sendBtnOpen: { backgroundColor: '#374151' },
    sendBtnLocked: { backgroundColor: '#e5e7eb', opacity: 0.7 },
    sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    sendForm: { backgroundColor: '#f9fafb', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
    recipientRow: { backgroundColor: '#fff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    recipientText: { fontSize: 15, fontWeight: '600', color: '#111827' },
    pickerBox: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10, overflow: 'hidden' },
    pickerSearch: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', fontSize: 14, color: '#111827' },
    pickerRow: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
    pickerRowActive: { backgroundColor: '#10b981' },
    pickerName: { fontSize: 14, fontWeight: '700', color: '#111827' },
    pickerPk: { fontSize: 11, color: '#9ca3af', fontFamily: 'Courier', marginTop: 2 },
    sendInput: { backgroundColor: '#fff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10, fontSize: 15, color: '#111827' },
    errBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 10, marginBottom: 10 },
    errText: { color: '#dc2626', fontSize: 13, fontWeight: '700', textAlign: 'center' },
    okBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, padding: 10, marginBottom: 10 },
    okText: { color: '#16a34a', fontSize: 13, fontWeight: '700', textAlign: 'center' },
    confirmBtn: { backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    confirmBtnOff: { backgroundColor: '#e5e7eb' },
    confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    txnRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    txnIcon: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    txnIconCredit: { backgroundColor: '#f0fdf4' },
    txnIconDebit: { backgroundColor: '#fef2f2' },
    txnPeer: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
    txnMemo: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
    txnTime: { fontSize: 11, color: '#9ca3af' },
    txnAmount: { fontSize: 16, fontWeight: '800' },
});
