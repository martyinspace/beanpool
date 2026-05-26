import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MemberAvatar } from '../../components/MemberAvatar';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, Image, ActivityIndicator, Platform } from 'react-native';
import { getDb, getFriendsLocal, addFriendLocal, removeFriendLocal, createConversationApi, setGuardianApi } from '../../utils/db';
import { useIdentity } from '../IdentityContext';
import { hexToBytes, encodeUtf8, encodeBase64, signData } from '../../utils/crypto';
import QRCode from 'react-native-qrcode-svg';
import { TextInput, Alert, ScrollView, Share, KeyboardAvoidingView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

import { router, useLocalSearchParams } from 'expo-router';
import { extractNodeOrigin, normaliseInviteCode } from '../../utils/invite-parser';

type SubView = 'friends' | 'community' | 'invites' | 'guardians';

const MEMBER_ROW_HEIGHT = 76;

/** Cache-busting avatar URI keyed to profile timestamp */
function avatarUri(url: string | null | undefined, pubkey: string, updatedAt?: string | null): string | null {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    const cacheKey = updatedAt ? new Date(updatedAt).getTime() : pubkey.slice(0, 8);
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_v=${cacheKey}`;
}

function formatJoinDate(dateStr: string | null) {
    if (!dateStr) return 'Member';
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 1) return 'Joined today';
        if (diffDays < 7) return `Joined ${diffDays}d ago`;
        if (diffDays < 30) return `Joined ${Math.floor(diffDays / 7)}w ago`;
        return `Joined ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    } catch {
        return 'Member';
    }
};

export default function PeopleScreen() {
    const params = useLocalSearchParams<{ view: string }>();
    const [view, setView] = useState<SubView>((params.view as SubView) || 'community');
    const [invites, setInvites] = useState<any[]>([]);
    const [generating, setGenerating] = useState(false);
    const [intendedFor, setIntendedFor] = useState('');
    const [newCode, setNewCode] = useState('');
    
    const [redeemCode, setRedeemCode] = useState('');
    const [redeemNodeUrl, setRedeemNodeUrl] = useState('');
    const [redeeming, setRedeeming] = useState(false);
    const [anchorUrl, setAnchorUrl] = useState('');
    const [canInvite, setCanInvite] = useState(true);
    const [tierName, setTierName] = useState('');
    const [isGuest, setIsGuest] = useState(false);

    const [members, setMembers] = useState<any[]>([]);
    const { identity } = useIdentity();

    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [guardianSyncing, setGuardianSyncing] = useState<string | null>(null);
    const PAGE_SIZE = 20;

    const [friends, setFriends] = useState<any[]>([]);
    const [friendPubkeys, setFriendPubkeys] = useState<Set<string>>(new Set());
    const [friendsLoading, setFriendsLoading] = useState(false);

    useEffect(() => {
        // Reset and reload when switching back to community view
        if (view === 'community') {
            setSearchQuery('');
            setPage(0);
            setHasMore(true);
            loadMembers(0, '', true);
        }
        if (view === 'invites') loadOfflineInvites();
        AsyncStorage.getItem('beanpool_anchor_url').then(async val => {
            if (val) {
                setAnchorUrl(val);
                if (identity?.publicKey) {
                    try {
                        const res = await fetch(`${val}/api/community/membership/${identity.publicKey}`);
                        if (res.ok) {
                            const data = await res.json();
                            setIsGuest(!data.isMember);
                        }
                    } catch (e) {
                        console.warn('Failed to probe guest state in people.tsx', e);
                    }
                }
            }
        }).catch(() => {});
        // Load tier data for invite gating
        if (identity?.publicKey) {
            AsyncStorage.getItem(`bp_tier_${identity.publicKey}`).then(cached => {
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setCanInvite(parsed.tier?.canInvite ?? true);
                    setTierName(parsed.tier?.name ?? '');
                }
            }).catch(() => {});
        }
        if (view === 'friends') loadFriends();
    }, [view]);

    const loadFriends = async () => {
        if (!identity?.publicKey) return;
        setFriendsLoading(true);
        try {
            const result = await getFriendsLocal(identity.publicKey);
            setFriends(result);
            setFriendPubkeys(new Set(result.map((f: any) => f.publicKey)));
        } catch (e) {
            console.error('[People] Failed to load friends:', e);
        } finally {
            setFriendsLoading(false);
        }
    };

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
                const apiSigBytes = await signData(apiMsgBytes, hexToBytes(identity.privateKey));
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
            const signatureBytes = await signData(messageBytes, privateKeyBytes);
            
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
        message += `Or if you prefer, you can download the BeanPool App at https://beanpool.org and enter this Invite Code manually:\n${codeToShare}\n\n`;
        message += `Node URL: ${anchorUrl}`;

        await Share.share({ message });
    };

    const handleRedeem = async () => {
        const rawInvite = redeemCode.trim();
        if (!rawInvite) return;
        setRedeeming(true);
        try {
            const extractedOrigin = extractNodeOrigin(rawInvite);
            let targetNodeUrl = anchorUrl;

            if (extractedOrigin) {
                targetNodeUrl = extractedOrigin;
            } else {
                let nodeUrl = redeemNodeUrl.trim();
                if (nodeUrl && !nodeUrl.startsWith('http')) {
                    const isIpOrLocal = /^(?:\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(nodeUrl) || nodeUrl.startsWith('localhost');
                    nodeUrl = (isIpOrLocal ? 'http://' : 'https://') + nodeUrl;
                }
                if (nodeUrl) targetNodeUrl = nodeUrl;
            }

            if (targetNodeUrl === anchorUrl) {
                let isMember = false;
                try {
                    const res = await fetch(`${targetNodeUrl}/api/community/membership/${identity?.publicKey}`);
                    if (res.ok) {
                        const data = await res.json();
                        isMember = !!data.isMember;
                    }
                } catch (e) {
                    console.warn('Membership check failed, assuming Guest', e);
                }

                if (isMember) {
                    Alert.alert('Already a Member', 'You are already a member of this community node.');
                    setRedeeming(false);
                    return;
                }

                // If they are in Guest Mode on the active node, redeem directly without database swap!
                const parsedCode = normaliseInviteCode(rawInvite);
                const { redeemInvite } = await import('../../utils/db');
                await redeemInvite(parsedCode, identity?.callsign || 'Unknown', identity);

                const { requestSync } = await import('../../services/pillar-sync');
                requestSync().catch(console.error);

                Alert.alert('Success', 'Invite redeemed! You have successfully registered as a member on this community.');
                setIsGuest(false);
                setRedeemCode('');
                setRedeemNodeUrl('');
                router.replace('/');
                setRedeeming(false);
                return;
            }

            const parsedCode = normaliseInviteCode(rawInvite);

            const { closeDB, initDB, redeemInvite } = await import('../../utils/db');
            
            // Switch DB context temporarily or permanently
            await closeDB();
            await AsyncStorage.setItem('beanpool_anchor_url', targetNodeUrl);
            await initDB();

            try {
                await redeemInvite(parsedCode, identity?.callsign || 'Unknown', identity);
                
                const { requestSync } = await import('../../services/pillar-sync');
                requestSync().catch(console.error);

                try {
                    const healthRes = await fetch(`${targetNodeUrl}/api/community/health`, { method: 'GET' });
                    if (healthRes.ok) {
                        const healthData = await healthRes.json();
                        const remoteName = healthData.nodeName || healthData.name || targetNodeUrl;
                        const cType = healthData.currency?.type || 'image';
                        const cVal = healthData.currency?.value || 'bean';
                        const { addSavedNode } = await import('../../utils/nodes');
                        await addSavedNode(targetNodeUrl, remoteName, cType, cVal);
                    }
                } catch (e) {
                    console.warn('Failed to fetch node details for saving', e);
                }

                Alert.alert('Success', 'Invite redeemed! You have successfully switched to the new community.');
                setRedeemCode('');
                setRedeemNodeUrl('');
                router.replace('/');
            } catch (err: any) {
                // Revert DB on failure
                await closeDB();
                await AsyncStorage.setItem('beanpool_anchor_url', anchorUrl);
                await initDB();
                throw err;
            }
        } catch (e: any) {
            Alert.alert('Redemption Failed', e.message);
        } finally {
            setRedeeming(false);
        }
    };

    const handleTroubleWipe = () => {
        Alert.alert(
            'Wipe Connection?',
            'This will permanently delete the local database and transaction cache for this community. Your key will be preserved, and you will be routed back to the welcome screen to register with a new invite link.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Wipe & Restart',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { clearDB } = await import('../../utils/db');
                            await clearDB();
                            
                            const activeUrl = anchorUrl;
                            await AsyncStorage.removeItem('beanpool_anchor_url');
                            
                            if (activeUrl) {
                                const { removeSavedNode } = await import('../../utils/nodes');
                                await removeSavedNode(activeUrl);
                            }
                            
                            setIsGuest(false);
                            router.replace('/welcome');
                        } catch (err: any) {
                            Alert.alert('Wipe Failed', err.message);
                        }
                    }
                }
            ]
        );
    };


    // Debounced Search Effect
    useEffect(() => {
        if (view !== 'community') return;
        const timeout = setTimeout(() => {
            setPage(0);
            setHasMore(true);
            loadMembers(0, searchQuery, true);
        }, 400);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const loadMembers = async (pageIndex = 0, query = '', reset = false) => {
        if (loadingMore || (!hasMore && !reset)) return;
        
        try {
            setLoadingMore(true);
            const database = await getDb();
            
            let sql = 'SELECT * FROM members WHERE public_key NOT LIKE \'escrow_%\' AND public_key NOT LIKE \'project_%\'';
            const params: any[] = [];
            
            if (query.trim()) {
                sql += ' AND (callsign LIKE ? OR public_key LIKE ?)';
                const likeTerm = `%${query.trim()}%`;
                params.push(likeTerm, likeTerm);
            }
            
            sql += ' ORDER BY joined_at DESC LIMIT ? OFFSET ?';
            params.push(PAGE_SIZE, pageIndex * PAGE_SIZE);
            
            const rows = await database.getAllAsync<any>(sql, params);
            
            if (rows.length < PAGE_SIZE) setHasMore(false);
            
            setMembers(prev => {
                if (reset) return rows;
                const newRows = rows.filter(r => !prev.some(p => p.public_key === r.public_key));
                return [...prev, ...newRows];
            });
            setPage(pageIndex + 1);
        } catch (e) {
            console.error('Error loading members:', e);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        if (hasMore && !loadingMore && view === 'community') {
            loadMembers(page, searchQuery);
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
                                {v === 'invites' && (isGuest ? '🎟️ Register' : '🎟️ Invites')}
                                {v === 'guardians' && '🛡️ Guardians'}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* Views */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
                style={{ flex: 1 }}
            >
            {view === 'friends' && (
                friendsLoading ? (
                    <View style={styles.emptyContainer}>
                        <ActivityIndicator size="large" color="#8b5cf6" />
                    </View>
                ) : friends.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyEmoji}>👫</Text>
                        <Text style={styles.emptyTitle}>No friends yet</Text>
                        <Text style={styles.emptyDesc}>Go to Community to browse members and add friends.</Text>
                    </View>
                ) : (
                    <FlatList
                        data={friends}
                        keyExtractor={(item, index) => `${item.publicKey}_${index}`}
                        contentContainerStyle={styles.list}
                        renderItem={({ item }) => {
                            const uri = avatarUri(item.avatar_url, item.publicKey);
                            return (
                            <View style={styles.card}>
                                <Pressable 
                                    style={styles.cardHeader}
                                    onPress={() => router.push({ pathname: '/public-profile', params: { publicKey: item.publicKey, callsign: item.callsign || 'Unknown' } })}
                                >
                                    <View style={styles.avatar}>
                                        <MemberAvatar avatarUrl={item.avatar_url} pubkey={item.publicKey} callsign={item.callsign || '?'} size={44} />
                                    </View>
                                    <View style={styles.textStack}>
                                        <Text style={styles.callsign}>{item.callsign}</Text>
                                        <Text style={styles.dateText}>
                                            Added {item.addedAt ? new Date(item.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently'}
                                        </Text>
                                    </View>
                                </Pressable>
                                <View style={styles.friendActions}>
                                    <Pressable 
                                        style={styles.msgBtn}
                                        onPress={async () => {
                                            if (!identity?.publicKey) return;
                                            try {
                                                const conv = await createConversationApi('dm', [identity.publicKey, item.publicKey], identity.publicKey);
                                                router.push(`/chat/${conv.id}`);
                                            } catch (e: any) {
                                                Alert.alert('Error', e.message);
                                            }
                                        }}
                                    >
                                        <Text style={styles.msgBtnText}>💬</Text>
                                    </Pressable>
                                    <Pressable 
                                        style={styles.removeFriendBtn}
                                        onPress={() => {
                                            Alert.alert('Remove Friend', `Remove ${item.callsign} from your friends?`, [
                                                { text: 'Cancel', style: 'cancel' },
                                                { text: 'Remove', style: 'destructive', onPress: async () => {
                                                    if (!identity?.publicKey) return;
                                                    await removeFriendLocal(identity.publicKey, item.publicKey);
                                                    loadFriends();
                                                }}
                                            ]);
                                        }}
                                    >
                                        <Text style={styles.removeFriendBtnText}>✕</Text>
                                    </Pressable>
                                </View>
                            </View>
                        );}}
                    />
                )
            )}

            {view === 'community' && (
                <>
                    <View style={styles.searchWrap}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="🔍 Search callsign or public key..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholderTextColor="#9ca3af"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                    <FlatList
                        data={members}
                        keyExtractor={item => item.public_key}
                        contentContainerStyle={styles.list}
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.5}
                        getItemLayout={(_data, index) => ({
                            length: MEMBER_ROW_HEIGHT,
                            offset: MEMBER_ROW_HEIGHT * index,
                            index,
                        })}
                        initialNumToRender={15}
                        maxToRenderPerBatch={20}
                        windowSize={7}
                        removeClippedSubviews={Platform.OS !== 'web'}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        ListHeaderComponent={
                            <View style={styles.infoBanner}>
                                <Text style={styles.infoText}>
                                    {members.length} members on this node. Tap <Text style={styles.boldGreen}>+ Add</Text> to follow as a friend.
                                </Text>
                            </View>
                        }
                        ListEmptyComponent={
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <Text style={{ color: '#9ca3af', fontSize: 15, fontWeight: '500' }}>
                                    {searchQuery ? 'No members match your search.' : 'Loading community...'}
                                </Text>
                            </View>
                        }
                        ListFooterComponent={
                            (loadingMore && members.length > 0) ? (
                                <View style={{ padding: 20, alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color="#059669" />
                                </View>
                            ) : null
                        }
                        renderItem={({ item }) => {
                        const isFriend = friendPubkeys.has(item.public_key);
                        const isSelf = item.public_key === identity?.publicKey;
                        const joinDateText = formatJoinDate(item.joined_at);
                        const uri = avatarUri(item.avatar_url, item.public_key);
                        return (
                        <View style={styles.communityRow}>
                            <Pressable 
                                style={styles.cardHeader}
                                onPress={() => router.push({ pathname: '/public-profile', params: { publicKey: item.public_key, callsign: item.callsign || 'Unknown' } })}
                            >
                                <View style={styles.avatar}>
                                    <MemberAvatar avatarUrl={item.avatar_url} pubkey={item.public_key} callsign={item.callsign || '?'} size={44} />
                                    {isFriend && (
                                        <View style={styles.communityFriendDot}>
                                            <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>★</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.textStack}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={styles.callsign} numberOfLines={1}>{item.callsign}</Text>
                                        {isFriend && <Text style={styles.friendChip}>Friend</Text>}
                                    </View>
                                    <Text style={styles.dateText} numberOfLines={1}>
                                        {item.public_key?.substring(0, 8).toUpperCase()} · {joinDateText}
                                    </Text>
                                </View>
                            </Pressable>
                            {!isSelf && (
                                <Pressable 
                                    style={[styles.addBtn, isFriend && styles.addBtnFriended]}
                                    onPress={async () => {
                                        if (!identity?.publicKey) return;
                                        if (isFriend) {
                                            await removeFriendLocal(identity.publicKey, item.public_key);
                                        } else {
                                            await addFriendLocal(identity.publicKey, item.public_key);
                                        }
                                        loadFriends();
                                    }}
                                >
                                    <Text style={[styles.addBtnText, isFriend && styles.addBtnTextFriended]}>
                                        {isFriend ? '✓ Added' : '+ Add'}
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                    );
                    }}
                />
                </>
            )}

            {view === 'invites' && (
                <ScrollView contentContainerStyle={styles.list}>
                    {isGuest ? (
                        <View style={{ backgroundColor: '#fffbeb', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#fde68a' }}>
                            <Text style={{ color: '#d97706', fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                                ⚠️ Guest Connection Mode
                            </Text>
                            <Text style={{ color: '#b45309', fontSize: 13, lineHeight: 18 }}>
                                You are currently connected to this node in **Guest Mode**. You cannot generate invites or participate in community trade until you register your identity.
                            </Text>
                        </View>
                    ) : (
                        <>
                            {/* GENERATE INVITE SECTION */}
                            <Text style={styles.sectionHeader}>📤 Invite Someone</Text>
                            <Text style={styles.sectionDesc}>Each offline ticket can only be used once. Generate a cryptographic payload directly on this device.</Text>

                            {!canInvite && (
                                <View style={{ backgroundColor: '#374151', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#4b5563' }}>
                                    <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                                        👻 Invite generation unlocks at <Text style={{ color: '#c4b5fd', fontWeight: '800' }}>Resident</Text> tier.
                                        Trade on the Marketplace to build trust.
                                    </Text>
                                </View>
                            )}

                            <TextInput
                                placeholder="Who is this invite for? (Optional)"
                                value={intendedFor}
                                onChangeText={setIntendedFor}
                                style={styles.input}
                                placeholderTextColor="#9ca3af"
                                editable={canInvite}
                            />

                            <Pressable
                                style={[styles.btnGenerate, (generating || !canInvite) && { opacity: 0.6 }]}
                                onPress={handleGenerate}
                                disabled={generating || !canInvite}
                            >
                                <Text style={styles.btnGenerateText}>{!canInvite ? '🔒 Invites Locked' : generating ? 'Generating...' : '✨ Generate Offline Ticket'}</Text>
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
                        </>
                    )}

                    <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 32 }} />

                    {/* REDEEM INVITE SECTION */}
                    <Text style={styles.sectionHeader}>{isGuest ? '🎟️ Complete Registration' : '🎟️ Join Another Community'}</Text>
                    <Text style={styles.sectionDesc}>
                        {isGuest 
                            ? `You are currently connected to this node (${anchorUrl}) in Guest Mode. Enter a valid invite code to register your identity and unlock full membership features.`
                            : 'Enter an invite code to join a different node. Once registered, you can switch between your accounts by tapping the title in the top banner.'
                        }
                    </Text>
                    
                    <View style={{ flexDirection: 'column', gap: 8, marginBottom: 32 }}>
                        <TextInput 
                            style={[styles.input, { marginBottom: 0 }]}
                            placeholder="Invite URL or token"
                            placeholderTextColor="#9ca3af"
                            value={redeemCode}
                            onChangeText={setRedeemCode}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {redeemCode && !redeemCode.startsWith('http') && (
                            <TextInput
                                style={[styles.input, { marginBottom: 0 }]}
                                placeholder="Community Node URL (Optional)"
                                placeholderTextColor="#9ca3af"
                                value={redeemNodeUrl}
                                onChangeText={setRedeemNodeUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                        )}
                        <Pressable 
                            style={{ backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 }}
                            onPress={handleRedeem}
                            disabled={redeeming || !redeemCode.trim()}
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                                {redeeming 
                                    ? (isGuest ? 'Registering...' : 'Joining...') 
                                    : (isGuest ? 'Complete Registration' : 'Join Community')
                                }
                            </Text>
                        </Pressable>
                    </View>

                    {isGuest && (
                        <View style={{ marginTop: 8, backgroundColor: '#fef2f2', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#fca5a5', marginBottom: 32 }}>
                            <Text style={{ color: '#dc2626', fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                                🛠️ Connection Troubleshooting
                            </Text>
                            <Text style={{ color: '#991b1b', fontSize: 13, lineHeight: 18, marginBottom: 12 }}>
                                If your local profile data is mismatched or out of sync with the node's server (e.g. if the node was completely wiped or reinstalled), you can wipe this community's local database cache and start fresh. Your master key and other saved communities are safe.
                            </Text>
                            <Pressable 
                                style={{ backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                                onPress={handleTroubleWipe}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                                    Wipe Local Node Data & Start Fresh
                                </Text>
                            </Pressable>
                        </View>
                    )}
                </ScrollView>
            )}

            {view === 'guardians' && (
                <ScrollView contentContainerStyle={styles.list}>
                    {friends.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyEmoji}>🛡️</Text>
                            <Text style={styles.emptyTitle}>Social Recovery Ready</Text>
                            <Text style={styles.emptyDesc}>Add some friends first, then come back here to choose your guardians.</Text>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.sectionHeader}>🛡️ Choose Guardians</Text>
                            <Text style={styles.sectionDesc}>
                                Select 3 to 5 trusted friends to act as your guardians. If you lose your device, they can help you recover your identity.
                            </Text>

                            {friends.filter(f => f.isGuardian).length >= 3 && (
                                <View style={styles.infoBanner}>
                                    <Text style={styles.infoText}>
                                        <Text style={styles.boldGreen}>✅ Social Recovery Ready.</Text> You have enough guardians selected to recover your account if you lose access.
                                    </Text>
                                </View>
                            )}

                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' }}>
                                    Selected ({friends.filter(f => f.isGuardian).length}/5)
                                </Text>
                            </View>

                            {friends.map((friend) => (
                                <View key={friend.publicKey} style={styles.card}>
                                    <Pressable 
                                        style={styles.cardHeader}
                                        onPress={() => router.push({ pathname: '/public-profile', params: { publicKey: friend.publicKey, callsign: friend.callsign || 'Unknown' } })}
                                    >
                                        <View style={styles.avatar}>
                                            <MemberAvatar avatarUrl={friend.avatar_url} pubkey={friend.publicKey} callsign={friend.callsign || '?'} size={44} />
                                        </View>
                                        <View style={styles.textStack}>
                                            <Text style={styles.callsign}>{friend.callsign}</Text>
                                            <Text style={styles.dateText}>Friend</Text>
                                        </View>
                                    </Pressable>
                                    
                                    <Pressable 
                                        style={[styles.addBtn, friend.isGuardian && styles.addBtnFriended]}
                                        disabled={guardianSyncing === friend.publicKey || (!friend.isGuardian && friends.filter(f => f.isGuardian).length >= 5)}
                                        onPress={async () => {
                                            setGuardianSyncing(friend.publicKey);
                                            const newStatus = !friend.isGuardian;
                                            const success = await setGuardianApi(friend.publicKey, newStatus);
                                            if (success) {
                                                setFriends(prev => prev.map(f => f.publicKey === friend.publicKey ? { ...f, isGuardian: newStatus } : f));
                                            } else {
                                                Alert.alert('Error', 'Failed to update guardian status. Check your connection.');
                                            }
                                            setGuardianSyncing(null);
                                        }}
                                    >
                                        {guardianSyncing === friend.publicKey ? (
                                            <ActivityIndicator size="small" color={friend.isGuardian ? "#059669" : "#fff"} />
                                        ) : (
                                            <Text style={[styles.addBtnText, friend.isGuardian && styles.addBtnTextFriended]}>
                                                {friend.isGuardian ? 'Remove' : 'Make Guardian'}
                                            </Text>
                                        )}
                                    </Pressable>
                                </View>
                            ))}
                        </>
                    )}
                </ScrollView>
            )}
            </KeyboardAvoidingView>

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

    searchWrap: { paddingHorizontal: 16, paddingTop: 16, backgroundColor: '#f9fafb' },
    searchInput: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, fontSize: 15, color: '#111827', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },

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
    btnCopySmallText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },

    // Friend-specific styles
    friendChip: { fontSize: 10, fontWeight: '800', color: '#f59e0b', backgroundColor: '#fffbeb', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
    addBtnFriended: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db', shadowOpacity: 0 },
    addBtnTextFriended: { color: '#059669' },
    friendActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    msgBtn: { backgroundColor: '#f0fdf4', width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#dcfce7' },
    msgBtnText: { fontSize: 18 },
    removeFriendBtn: { backgroundColor: '#fef2f2', width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
    removeFriendBtnText: { fontSize: 16, color: '#ef4444', fontWeight: '700' },

    // Community virtualized row (fixed height)
    communityRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        height: MEMBER_ROW_HEIGHT,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6',
        backgroundColor: '#ffffff',
    },
    communityFriendDot: {
        position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8,
        backgroundColor: '#f59e0b', justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#fff',
    },
});
