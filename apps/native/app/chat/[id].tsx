import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, Alert, Image, ActivityIndicator, Platform } from 'react-native';
import { KeyboardAvoidingView, KeyboardController, AndroidSoftInputModes, useKeyboardHandler } from 'react-native-keyboard-controller';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useIdentity } from '../IdentityContext';
import { getMessages, getConversation, insertMessage, sendImageMessage, getDecryptedAttachment, syncMessages, syncSingleConversation, markConversationRead, completeMarketplaceTransaction, cancelMarketplaceTransaction, getDb, toggleMessageReactionApi } from '../../utils/db';
import { hapticSuccess, hapticWarning } from '../../utils/haptics';
import { ReviewModal } from '../../components/ReviewModal';
import { MemberAvatar } from '../../components/MemberAvatar';

/** WhatsApp-style day label: Today / Yesterday / "Mon, 12 May". */
function formatDayLabel(d: Date): string {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Image bubble that lazily fetches + decrypts an encrypted attachment for display. */
function ChatImage({ conversationId, messageId }: { conversationId: string; messageId: string }) {
    const [uri, setUri] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let active = true;
        getDecryptedAttachment(conversationId, messageId)
            .then(u => { if (active) { if (u) { setUri(u); } else { setFailed(true); } } })
            .catch(() => { if (active) setFailed(true); });
        return () => { active = false; };
    }, [conversationId, messageId]);
    if (failed) return <Text style={{ color: '#9ca3af', fontStyle: 'italic', padding: 8 }}>🔒 Image unavailable</Text>;
    if (!uri) return <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#9ca3af" /></View>;
    return <Image source={{ uri }} style={{ width: 200, height: 200, borderRadius: 12 }} resizeMode="cover" />;
}

export default function ChatScreen() {
    const { id, triggerReview } = useLocalSearchParams();
    const { identity } = useIdentity();
    const [messages, setMessages] = useState<any[]>([]);
    const [activeMessageActionsId, setActiveMessageActionsId] = useState<string | null>(null);
    const [activeEmojiPickerId, setActiveEmojiPickerId] = useState<string | null>(null);
    const [pickerPosition, setPickerPosition] = useState<'top' | 'bottom'>('top');
    const [draft, setDraft] = useState('');
    const [peerName, setPeerName] = useState('Loading...');
    const [peerPubkey, setPeerPubkey] = useState<string | null>(null);
    const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
    // True when this thread is a 2-party DM (the only threads we E2E-encrypt).
    const [isEncrypted, setIsEncrypted] = useState(false);
    const [postContext, setPostContext] = useState<any>(null);
    const [pendingTx, setPendingTx] = useState<{ id: string; amount: number; isPayer: boolean } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [promptReviewForTx, setPromptReviewForTx] = useState<{ txId: string; targetPubkey: string; targetCallsign: string } | null>(null);
    const [ratedPostIds, setRatedPostIds] = useState<Set<string>>(new Set());
    const [replyToMessage, setReplyToMessage] = useState<any | null>(null);
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();
    const sendingRef = useRef(false);
    const promptedRef = useRef(false);

    const scrollToBottom = useCallback((animated: boolean) => {
        flatListRef.current?.scrollToEnd({ animated });
    }, []);

    // On Android, take explicit control of the soft input mode so that
    // react-native-keyboard-controller's KeyboardAvoidingView is the sole
    // owner of keyboard compensation (prevents double-resize races with
    // the OS-level softwareKeyboardLayoutMode "resize" from app.json).
    useEffect(() => {
        if (Platform.OS === 'android') {
            KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_RESIZE);
        }
        return () => {
            if (Platform.OS === 'android') {
                KeyboardController.setDefaultMode();
            }
        };
    }, []);

    // Keep the latest messages pinned to the bottom as the keyboard slides in,
    // following it frame-by-frame (WhatsApp-style) instead of a single delayed
    // jump that lands before the avoid-view padding has settled.
    useKeyboardHandler({
        onMove: () => {
            'worklet';
            scheduleOnRN(scrollToBottom, false);
        },
        onEnd: () => {
            'worklet';
            scheduleOnRN(scrollToBottom, false);
        },
    }, [scrollToBottom]);

    const loadRatedTransactions = useCallback(async () => {
        if (!identity?.publicKey) return;
        try {
            const db = await getDb();
            const ratedRows = await db.getAllAsync<any>(
                "SELECT mt.post_id FROM ratings r JOIN marketplace_transactions mt ON r.transaction_id = mt.id WHERE r.rater_pubkey = ?",
                [identity.publicKey]
            );
            const ids = new Set<string>(ratedRows.map(r => r.post_id).filter(Boolean));
            setRatedPostIds(ids);
        } catch (e) {
            console.error("[Chat] Failed to load rated transaction list:", e);
        }
    }, [identity?.publicKey]);

    const loadConversationData = useCallback(async () => {
        if (id && identity?.publicKey) {
            const res = await getConversation(id as string, identity.publicKey);
            if (res) {
                setPeerName(res.name || res.otherCallsign || String(id).slice(0, 8));
                if (res.otherPubkey) setPeerPubkey(res.otherPubkey);
                setIsEncrypted(res.type === 'dm' && !!res.otherPubkey);
                setPeerAvatar(res.otherAvatar || null);
                if (res.postId) {
                    setPostContext({
                        id: res.postId,
                        title: res.postTitle,
                        status: res.postStatus,
                        priceType: res.price_type,
                        credits: res.credits
                    });

                    if (triggerReview === 'true' && !promptedRef.current) {
                        promptedRef.current = true;
                        try {
                            const db = await getDb();
                            const txRow = await db.getFirstAsync<any>(
                                "SELECT id, buyer_pubkey, seller_pubkey FROM marketplace_transactions WHERE post_id=? AND status='completed' LIMIT 1",
                                [res.postId]
                            );
                            if (txRow) {
                                const targetPubkey = txRow.buyer_pubkey === identity.publicKey ? txRow.seller_pubkey : txRow.buyer_pubkey;
                                setPromptReviewForTx({
                                    txId: txRow.id,
                                    targetPubkey,
                                    targetCallsign: res.name || res.otherCallsign || String(id).slice(0, 8)
                                });
                            }
                        } catch (e) {
                            console.error('[Rating] Auto-trigger review load failed:', e);
                        }
                    }
                }
                // Track pending transaction for inline action bar
                if (res.pendingTxId && identity.publicKey) {
                    setPendingTx({
                        id: res.pendingTxId,
                        amount: res.pendingAmount,
                        isPayer: res.txBuyerPubkey === identity.publicKey
                    });
                } else {
                    setPendingTx(null);
                }
            } else {
                setPeerName(String(id).slice(0, 8));
            }
        }
    }, [id, identity, triggerReview]);

    useFocusEffect(
        useCallback(() => {
            setReplyToMessage(null);
            let interval: ReturnType<typeof setInterval>;
            promptedRef.current = false;
            
            let sub: any = null;
            let wsSub: any = null;
            if (id && identity?.publicKey) {
                // Initial Load
                loadConversationData();
                loadRatedTransactions();
                loadMessages().then(() => {
                    syncMessages(identity!.publicKey).then(() => {
                        loadConversationData();
                        loadMessages(true);
                        loadRatedTransactions();
                    });
                });
                
                // Background Poll
                interval = setInterval(() => {
                    syncSingleConversation(id as string).then(() => {
                        loadConversationData();
                        loadMessages(true);
                    });
                }, 3000);

                const { DeviceEventEmitter } = require('react-native');
                sub = DeviceEventEmitter.addListener('sync_data_updated', () => {
                    loadConversationData();
                    loadMessages(true);
                    loadRatedTransactions();
                });

                // Fast path: the WebSocket doorbell nudges us to refresh THIS
                // conversation immediately with a single targeted fetch, rather
                // than waiting for the heavier full reconciliation (requestSync)
                // to finish and emit 'sync_data_updated'.
                wsSub = DeviceEventEmitter.addListener('ws_activity', () => {
                    syncSingleConversation(id as string).then(() => {
                        loadConversationData();
                        loadMessages(true);
                    });
                });
            }
            return () => {
                if (interval) clearInterval(interval);
                if (sub) sub.remove();
                if (wsSub) wsSub.remove();
            };
        }, [id, identity, loadConversationData])
    );

    const loadMessages = async (isBackgroundPoll = false) => {
        const data = await getMessages(id as string);
        if (identity?.publicKey) {
            await markConversationRead(id as string, identity.publicKey).catch(() => {});
        }
        
        setMessages(prev => {
            if (data.length > prev.length) {
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
            } else if (!isBackgroundPoll && prev.length === 0) {
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
            }
            return data;
        });
    };

    const handleSend = async () => {
        if (!draft.trim() || !identity?.publicKey) return;
        if (sendingRef.current) return;

        sendingRef.current = true;
        try {
            const currentDraft = draft.trim();
            setDraft('');
            let metadata: string | undefined = undefined;
            if (replyToMessage) {
                metadata = JSON.stringify({ replyToId: replyToMessage.id });
            }
            await insertMessage(id as string, identity.publicKey, currentDraft, metadata);
            setReplyToMessage(null);
            loadMessages();
        } catch (err: any) {
            Alert.alert("Message Failed", err.message || "Could not execute send.");
        } finally {
            sendingRef.current = false;
        }
    };

    const pickAndSendImage = async () => {
        if (!identity?.publicKey || sendingRef.current) return;
        const sendUri = async (uri: string) => {
            sendingRef.current = true;
            try {
                const manip = await ImageManipulator.manipulateAsync(
                    uri,
                    [{ resize: { width: 1000 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
                );
                if (!manip.base64) throw new Error('Could not process image.');
                let metadata: string | undefined = undefined;
                if (replyToMessage) {
                    metadata = JSON.stringify({ replyToId: replyToMessage.id });
                }
                await sendImageMessage(id as string, `data:image/jpeg;base64,${manip.base64}`, '', metadata);
                setReplyToMessage(null);
                hapticSuccess();
                loadMessages();
            } catch (err: any) {
                hapticWarning();
                Alert.alert('Image Failed', err.message || 'Could not send image.');
            } finally {
                sendingRef.current = false;
            }
        };
        Alert.alert('Send Photo', 'Choose a source', [
            { text: 'Camera', onPress: async () => {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) { Alert.alert('Permission needed', 'Camera access is required.'); return; }
                const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
                if (!r.canceled && r.assets[0]?.uri) sendUri(r.assets[0].uri);
            }},
            { text: 'Gallery', onPress: async () => {
                const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
                if (!r.canceled && r.assets[0]?.uri) sendUri(r.assets[0].uri);
            }},
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const handleReleaseCredits = () => {
        if (!pendingTx || !identity?.publicKey) return;
        Alert.alert(
            'Release Credits',
            `Release ${pendingTx.amount} Beans to the provider? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Release',
                    style: 'destructive',
                    onPress: async () => {
                        setActionLoading(true);
                        try {
                            await completeMarketplaceTransaction(pendingTx.id, identity.publicKey);
                            hapticSuccess();
                            Alert.alert('Success', 'Credits have been released!');
                            
                            // Immediately prompt for review
                            const targetPubkey = peerPubkey;
                            if (targetPubkey) {
                                setPromptReviewForTx({
                                    txId: pendingTx.id,
                                    targetPubkey,
                                    targetCallsign: peerName
                                });
                            }
                            
                            // Refresh conversation state
                            syncSingleConversation(id as string).then(() => {
                                loadConversationData();
                                loadMessages(true);
                            });
                        } catch (e: any) {
                            hapticWarning();
                            Alert.alert('Failed', e.message || 'Could not release credits.');
                        } finally {
                            setActionLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleCancelEscrow = () => {
        if (!pendingTx || !identity?.publicKey) return;
        Alert.alert(
            'Cancel Escrow',
            'Are you sure you want to cancel this escrow? The credits will be refunded.',
            [
                { text: 'Keep', style: 'cancel' },
                {
                    text: 'Cancel Escrow',
                    style: 'destructive',
                    onPress: async () => {
                        setActionLoading(true);
                        try {
                            await cancelMarketplaceTransaction(pendingTx.id, identity.publicKey);
                            hapticWarning();
                            Alert.alert('Cancelled', 'Escrow has been cancelled and credits refunded.');
                            syncSingleConversation(id as string).then(() => {
                                loadConversationData();
                                loadMessages(true);
                            });
                        } catch (e: any) {
                            hapticWarning();
                            Alert.alert('Failed', e.message || 'Could not cancel escrow.');
                        } finally {
                            setActionLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // Interleave day-separator pills between messages from different calendar days
    const listItems = React.useMemo(() => {
        const items: any[] = [];
        let lastDay: string | null = null;
        for (const m of messages) {
            const d = m.rawTimestamp ? new Date(m.rawTimestamp) : null;
            if (d && !isNaN(d.getTime())) {
                const dayKey = d.toDateString();
                if (dayKey !== lastDay) {
                    items.push({ id: `day-${dayKey}`, type: 'day-separator', label: formatDayLabel(d) });
                    lastDay = dayKey;
                }
            }
            items.push(m);
        }
        return items;
    }, [messages]);

    const renderMessage = ({ item }: { item: any }) => {
        if (item.type === 'day-separator') {
            return (
                <View style={styles.daySeparatorRow}>
                    <View style={styles.daySeparatorPill}>
                        <Text style={styles.daySeparatorText}>{item.label}</Text>
                    </View>
                </View>
            );
        }

        const isSystem = item.type === 'system' || item.senderId === 'SYSTEM';
        
        if (isSystem) {
            let iconName: any = 'information-outline';
            let iconColor = '#6b7280';
            let bgColor = 'rgba(243, 244, 246, 0.8)';
            let borderColor = 'rgba(229, 231, 235, 1)';
            
            if (item.systemType === 'ESCROW_FUNDED') { 
                iconName = 'lock-check'; 
                iconColor = '#10b981'; 
                bgColor = 'rgba(209, 250, 229, 0.7)'; 
                borderColor = '#10b981'; 
            }
            if (item.systemType === 'ESCROW_RELEASED') { 
                iconName = 'check-decagram'; 
                iconColor = '#059669'; 
                bgColor = 'rgba(167, 243, 208, 0.7)'; 
                borderColor = '#059669';
            }
            if (item.systemType === 'ESCROW_CANCELLED') { 
                iconName = 'cash-refund'; 
                iconColor = '#ef4444'; 
                bgColor = 'rgba(254, 226, 226, 0.7)';
                borderColor = '#ef4444';
            }

            return (
                <View style={[styles.systemMessageContainer, { marginTop: 16, marginBottom: 16 }]}>
                    <View style={[styles.systemMessageBubble, { backgroundColor: bgColor, borderColor: borderColor, borderWidth: 1 }]}>
                        <MaterialCommunityIcons name={iconName} size={16} color={iconColor} style={{ marginRight: 6 }} />
                        <Text style={[styles.systemMessageText, { color: '#374151', fontSize: 13, fontWeight: '500' }]}>{item.text}</Text>
                    </View>
                    <Text style={styles.systemTimestamp}>{item.timestamp}</Text>
                    
                    {/* Inline post link — only when it points somewhere the sticky header doesn't already cover */}
                    {item.metadata?.postId && item.metadata.postId !== postContext?.id && (
                        <Pressable
                            style={styles.systemActionBtn}
                            onPress={() => router.push(`/post/${item.metadata.postId}`)}
                        >
                            <MaterialCommunityIcons name="tag-outline" size={14} color="#10b981" style={{ marginRight: 4 }} />
                            <Text style={styles.systemActionText}>View Post</Text>
                        </Pressable>
                    )}
                    
                    {item.systemType === 'ESCROW_RELEASED' && item.metadata?.postId && (() => {
                        const hasRated = ratedPostIds.has(item.metadata.postId);
                        return (
                            <Pressable 
                                style={[styles.systemActionBtn, { borderColor: hasRated ? '#10b981' : '#f59e0b' }]}
                                onPress={async () => {
                                    try {
                                        const db = await getDb();
                                        const txRow = await db.getFirstAsync<any>(
                                            "SELECT id, buyer_pubkey, seller_pubkey FROM marketplace_transactions WHERE post_id=? AND status='completed' LIMIT 1",
                                            [item.metadata.postId]
                                        );
                                        if (txRow && identity?.publicKey) {
                                            const targetPubkey = txRow.buyer_pubkey === identity.publicKey ? txRow.seller_pubkey : txRow.buyer_pubkey;
                                            setPromptReviewForTx({
                                                txId: txRow.id,
                                                targetPubkey,
                                                targetCallsign: peerName
                                            });
                                        } else {
                                            Alert.alert("Notice", "Transaction details not found locally. Please try viewing the post.");
                                        }
                                    } catch (e) {
                                        console.error(e);
                                        Alert.alert("Error", "Could not load transaction details for rating.");
                                    }
                                }}
                            >
                                <MaterialCommunityIcons 
                                    name={hasRated ? "star" : "star-outline"} 
                                    size={14} 
                                    color={hasRated ? '#10b981' : '#f59e0b'} 
                                    style={{ marginRight: 4 }} 
                                />
                                <Text style={[styles.systemActionText, { color: hasRated ? '#10b981' : '#f59e0b' }]}>
                                    {hasRated ? '✓ Rating submitted (Tap to edit)' : 'Rate your partner'}
                                </Text>
                            </Pressable>
                        );
                    })()}
                </View>
            );
        }

        const isMe = identity?.publicKey ? item.senderId === identity.publicKey : false;
        const showActions = activeMessageActionsId === item.id;
        const showEmojiPicker = activeEmojiPickerId === item.id;

        // Parse reactions
        const reactions: { emoji: string; author: string }[] = item.metadata?.reactions || [];
        const reactionCounts = reactions.reduce((acc: { [key: string]: number }, r: any) => {
            acc[r.emoji] = (acc[r.emoji] || 0) + 1;
            return acc;
        }, {});
        const uniqueEmojis = Object.keys(reactionCounts);
        const totalReactionsCount = reactions.length;

        const handleEmojiSelect = async (emoji: string) => {
            if (!identity?.publicKey) return;
            try {
                await toggleMessageReactionApi(item.id, identity.publicKey, emoji);
                hapticSuccess();
                setActiveEmojiPickerId(null);
                setActiveMessageActionsId(null);
                loadMessages(true);
            } catch (e) {
                console.error('Failed to react to message:', e);
                Alert.alert('Error', 'Could not react to message');
            }
        };

        const toggleActions = (event: any) => {
            const pageY = event?.nativeEvent?.pageY;
            // If the touch is within the top 230px of the viewport, position the picker below the bubble
            const isNearTop = pageY && pageY < 230;
            setPickerPosition(isNearTop ? 'bottom' : 'top');

            if (activeMessageActionsId === item.id) {
                setActiveMessageActionsId(null);
                setActiveEmojiPickerId(null);
            } else {
                setActiveMessageActionsId(item.id);
                setActiveEmojiPickerId(null);
            }
        };

        const handleSmileyPress = () => {
            if (activeEmojiPickerId === item.id) {
                setActiveEmojiPickerId(null);
            } else {
                setActiveEmojiPickerId(item.id);
            }
        };

        const handleReplyPress = () => {
            setReplyToMessage(item);
            setActiveMessageActionsId(null);
        };

        const renderActionButtons = () => {
            return (
                <View style={[styles.actionButtonsContainer, isMe ? styles.actionButtonsMe : styles.actionButtonsOther]}>
                    <Pressable 
                        style={styles.circleActionButton}
                        onPress={handleReplyPress}
                    >
                        <MaterialCommunityIcons name="reply" size={16} color="#ffffff" />
                    </Pressable>
                    <Pressable 
                        style={[styles.circleActionButton, showEmojiPicker ? styles.circleActionButtonActive : {}]}
                        onPress={handleSmileyPress}
                    >
                        <MaterialCommunityIcons name="emoticon-happy-outline" size={16} color="#ffffff" />
                    </Pressable>
                </View>
            );
        };

        return (
            <View style={[
                styles.messageRowContainer,
                isMe ? styles.messageRowMe : styles.messageRowOther
            ]}>
                {showEmojiPicker && (
                    <View style={[
                        styles.reactionPickerContainer, 
                        isMe ? styles.reactionPickerMe : styles.reactionPickerOther,
                        pickerPosition === 'bottom' ? { top: undefined, bottom: -45 } : { bottom: undefined, top: -45 }
                    ]}>
                        {['👍', '❤️', '😂', '😮', '😢', '🙏', '😁'].map((emoji) => (
                            <Pressable 
                                key={emoji} 
                                style={styles.reactionEmojiButton}
                                onPress={() => handleEmojiSelect(emoji)}
                            >
                                <Text style={styles.reactionEmojiText}>{emoji}</Text>
                            </Pressable>
                        ))}
                    </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: '85%' }}>
                    {isMe && showActions && renderActionButtons()}
                    
                    <Pressable 
                        onPress={toggleActions}
                        style={[
                            styles.messageBubble, 
                            isMe ? styles.messageMe : styles.messageOther,
                            { position: 'relative', zIndex: 1 },
                            totalReactionsCount > 0 ? { paddingBottom: 24 } : null
                        ]}
                    >
                        {item.metadata?.replyToId && (() => {
                            const parentMsg = messages.find(m => m.id === item.metadata.replyToId);
                            const parentText = parentMsg ? (parentMsg.type === 'image' ? '🔒 Photo' : parentMsg.text) : 'Message not found';
                            const parentAuthor = parentMsg ? (parentMsg.senderId === identity?.publicKey ? 'You' : (peerName || 'Someone')) : 'Someone';
                            return (
                                <Pressable
                                    onPress={() => {
                                        const index = listItems.findIndex(m => m.id === item.metadata.replyToId);
                                        if (index > -1) {
                                            try {
                                                flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                                            } catch (e) {
                                                console.warn(e);
                                            }
                                        }
                                    }}
                                    style={[
                                        styles.quoteContainer,
                                        isMe ? styles.quoteMe : styles.quoteOther
                                    ]}
                                >
                                    <Text style={[styles.quoteAuthor, isMe ? styles.quoteAuthorMe : styles.quoteAuthorOther]}>
                                        {parentAuthor}
                                    </Text>
                                    <Text style={[styles.quoteText, isMe ? styles.quoteTextMe : styles.quoteTextOther]} numberOfLines={1}>
                                        {parentText}
                                    </Text>
                                </Pressable>
                            );
                        })()}
                        {item.type === 'image' ? (
                            <>
                                <ChatImage conversationId={id as string} messageId={item.id} />
                                {!!item.text && (
                                    <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther, { marginTop: 6 }]}>
                                        {item.text}
                                        {"  "}
                                        <Text style={[styles.messageTime, isMe ? styles.messageTimeMe : styles.messageTimeOther, { fontSize: 10 }]}>
                                            {item.timestamp}
                                        </Text>
                                        {isMe && item.outgoing && (
                                            <Text style={{ fontSize: 10, color: item.readByPeer ? '#a5f3fc' : 'rgba(255,255,255,0.65)' }}>
                                                {item.readByPeer ? ' ✓✓' : ' ✓'}
                                            </Text>
                                        )}
                                    </Text>
                                )}
                            </>
                        ) : (
                            <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>
                                {item.text}
                                {"  "}
                                <Text style={[styles.messageTime, isMe ? styles.messageTimeMe : styles.messageTimeOther, { fontSize: 10 }]}>
                                    {item.timestamp}
                                </Text>
                                {isMe && item.outgoing && (
                                    <Text style={{ fontSize: 10, color: item.readByPeer ? '#a5f3fc' : 'rgba(255,255,255,0.65)' }}>
                                        {item.readByPeer ? ' ✓✓' : ' ✓'}
                                    </Text>
                                )}
                            </Text>
                        )}
                        {item.type === 'image' && !item.text && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: isMe ? 'flex-end' : 'flex-start', marginTop: 4 }}>
                                <Text style={[styles.messageTime, isMe ? styles.messageTimeMe : styles.messageTimeOther]}>
                                    {item.timestamp}
                                </Text>
                                {isMe && item.outgoing && (
                                    <MaterialCommunityIcons
                                        name={item.readByPeer ? 'check-all' : 'check'}
                                        size={14}
                                        color={item.readByPeer ? '#a5f3fc' : 'rgba(255,255,255,0.65)'}
                                        style={{ marginLeft: 3 }}
                                    />
                                )}
                            </View>
                        )}

                        {totalReactionsCount > 0 && (
                            <View style={[
                                styles.reactionBadgeContainer, 
                                isMe ? styles.reactionBadgeMe : styles.reactionBadgeOther,
                                totalReactionsCount === 1 ? { width: 28, paddingHorizontal: 0, justifyContent: 'center' } : {}
                            ]}>
                                <Text style={[
                                    styles.reactionBadgeText,
                                    totalReactionsCount === 1 
                                        ? { fontSize: 14, lineHeight: 14, marginTop: 1.5, marginLeft: 3.5 } 
                                        : { marginTop: -1 }
                                ]}>
                                    {uniqueEmojis.join(' ')} {totalReactionsCount > 1 ? totalReactionsCount : ''}
                                </Text>
                            </View>
                        )}
                    </Pressable>

                    {!isMe && showActions && renderActionButtons()}
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />
            
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#1f2937" />
                </Pressable>
                
                <Pressable 
                    onPress={() => {
                        if (peerPubkey) {
                            router.push({
                                pathname: '/public-profile',
                                params: { publicKey: peerPubkey, callsign: peerName }
                            });
                        }
                    }} 
                    style={styles.headerProfileContainer}
                >
                    <MemberAvatar 
                        avatarUrl={peerAvatar} 
                        pubkey={peerPubkey || ''} 
                        callsign={peerName} 
                        size={38} 
                    />
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.headerTitle} numberOfLines={1}>{peerName}</Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>
                            {isEncrypted ? '🔒 End-to-end encrypted' : 'Connected via Mullum Node'}
                        </Text>
                    </View>
                </Pressable>

                <Pressable style={styles.moreButton}>
                    <MaterialCommunityIcons name="dots-horizontal" size={28} color="#6b7280" />
                </Pressable>
            </View>

            {/* Sticky Marketplace Header */}
            {postContext && (
                <Pressable onPress={() => router.push(`/post/${postContext.id}`)} style={styles.stickyHeader}>
                    <View style={styles.stickyHeaderLeft}>
                        <MaterialCommunityIcons name="shopping-outline" size={24} color="#059669" />
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.stickyPostTitle} numberOfLines={1}>{postContext.title}</Text>
                            <Text style={styles.stickyPostCredits}>{postContext.credits} Beans{postContext.priceType === 'hourly' ? ' / hr' : ''}</Text>
                        </View>
                    </View>
                    <View style={[styles.statusBadge, 
                        postContext.status === 'active' ? { backgroundColor: '#d1fae5' } : 
                        postContext.status === 'pending' ? { backgroundColor: '#fef3c7' } : 
                        { backgroundColor: '#e5e7eb' }
                    ]}>
                        <Text style={[styles.statusBadgeText,
                            postContext.status === 'active' ? { color: '#059669' } : 
                            postContext.status === 'pending' ? { color: '#d97706' } : 
                            { color: '#4b5563' }
                        ]}>{postContext.status?.toUpperCase() || 'UNKNOWN'}</Text>
                    </View>
                </Pressable>
            )}

            {/* Inline Action Bar — Release/Cancel when escrow is pending and user is the payer */}
            {pendingTx && pendingTx.isPayer && postContext?.status === 'pending' && (
                <View style={[styles.inlineActionBar, { flexDirection: 'column' }]}>
                    <View style={{ width: '100%', marginBottom: 10 }}>
                        <Text style={{ color: '#d97706', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
                            ⚠️ Action Required: Release Credits
                        </Text>
                        <Text style={{ color: '#78350f', fontSize: 11, textAlign: 'center', paddingHorizontal: 16 }}>
                            Only release credits ONCE the provider has fulfilled the terms of the agreement. This action is final.
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable 
                            style={[styles.inlineActionBtn, styles.inlineActionRelease]}
                            onPress={handleReleaseCredits}
                            disabled={actionLoading}
                        >
                            <MaterialCommunityIcons name="check-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                            <Text style={styles.inlineActionReleaseText}>
                                {actionLoading ? 'Processing...' : `Release ${pendingTx.amount} 🫘`}
                            </Text>
                        </Pressable>
                        <Pressable 
                            style={[styles.inlineActionBtn, styles.inlineActionCancel]}
                            onPress={handleCancelEscrow}
                            disabled={actionLoading}
                        >
                            <MaterialCommunityIcons name="close-circle-outline" size={18} color="#ef4444" style={{ marginRight: 6 }} />
                            <Text style={styles.inlineActionCancelText}>Cancel</Text>
                        </Pressable>
                    </View>
                </View>
            )}

            <KeyboardAvoidingView
                style={styles.keyboardView}
                behavior="translate-with-padding"
            >
                {/* Messages List */}
                <FlatList
                    ref={flatListRef}
                    data={listItems}
                    keyExtractor={item => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                    onScrollBeginDrag={() => {
                        setActiveMessageActionsId(null);
                        setActiveEmojiPickerId(null);
                    }}
                />

                {/* Reply Preview */}
                {replyToMessage && (
                    <View style={styles.replyPreviewContainer}>
                        <View style={styles.replyPreviewBar}>
                            <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: '#8b5cf6', paddingLeft: 8 }}>
                                <Text style={styles.replyPreviewAuthor}>
                                    Replying to {replyToMessage.senderId === identity?.publicKey ? 'You' : (peerName || 'Someone')}
                                </Text>
                                <Text style={styles.replyPreviewText} numberOfLines={1}>
                                    {replyToMessage.type === 'image' ? '🔒 Photo' : replyToMessage.text}
                                </Text>
                            </View>
                            <Pressable onPress={() => setReplyToMessage(null)} style={styles.replyPreviewClose}>
                                <MaterialCommunityIcons name="close" size={20} color="#6b7280" />
                            </Pressable>
                        </View>
                    </View>
                )}

                {/* Input Area */}
                <View style={[
                    styles.inputContainer,
                    { paddingBottom: Math.max(insets.bottom, 12) }
                ]}>
                    <Pressable style={styles.attachBtn} onPress={pickAndSendImage}>
                        <MaterialCommunityIcons name="plus-circle-outline" size={26} color="#9ca3af" />
                    </Pressable>
                    <TextInput
                        style={styles.input}
                        placeholder="Message..."
                        placeholderTextColor="#9ca3af"
                        value={draft}
                        onChangeText={setDraft}
                        multiline
                        blurOnSubmit={false}
                        submitBehavior="submit"
                        onSubmitEditing={handleSend}
                    />
                    <Pressable 
                        style={[styles.sendBtn, draft.trim().length > 0 ? styles.sendBtnActive : styles.sendBtnInactive]} 
                        onPress={handleSend}
                    >
                        <MaterialCommunityIcons name="send" size={20} color={draft.trim().length > 0 ? '#fff' : '#9ca3af'} />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>

            {promptReviewForTx && (
                <ReviewModal 
                    visible={!!promptReviewForTx}
                    txId={promptReviewForTx.txId}
                    targetPubkey={promptReviewForTx.targetPubkey}
                    targetCallsign={promptReviewForTx.targetCallsign}
                    onClose={() => {
                        setPromptReviewForTx(null);
                        if (triggerReview === 'true') {
                            router.navigate('/(tabs)/chats');
                        }
                    }}
                    onSuccess={() => {
                        Alert.alert("Success", "Your rating has been submitted!");
                        setPromptReviewForTx(null);
                        loadRatedTransactions();
                        if (triggerReview === 'true') {
                            router.navigate('/(tabs)/chats');
                        }
                    }}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerProfileContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 8, gap: 10 },
    headerTextContainer: { flex: 1, justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: '#1f2937', letterSpacing: 0.5 },
    headerSubtitle: { fontSize: 11, color: '#10b981', fontWeight: '600', marginTop: 2 },
    moreButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
    stickyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ecfdf5', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
    stickyHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
    stickyPostTitle: { fontSize: 15, fontWeight: '700', color: '#065f46' },
    stickyPostCredits: { fontSize: 13, color: '#059669', fontWeight: '600', marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusBadgeText: { fontSize: 11, fontWeight: '800' },
    keyboardView: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 32, gap: 4 },
    systemMessageContainer: { width: '100%', alignItems: 'center', marginVertical: 8 },
    systemMessageBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
    systemMessageText: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
    systemActionBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#10b981' },
    systemActionText: { color: '#10b981', fontWeight: '700', fontSize: 12 },
    messageBubble: { maxWidth: '80%', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
    messageMe: { backgroundColor: '#8b5cf6', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    messageOther: { backgroundColor: '#f3f4f6', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
    messageText: { fontSize: 16, lineHeight: 22 },
    messageTextMe: { color: '#ffffff' },
    messageTextOther: { color: '#1f2937' },
    messageTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
    messageTimeMe: { color: 'rgba(255, 255, 255, 0.7)' },
    messageTimeOther: { color: '#9ca3af' },
    inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#ffffff' },
    attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    input: { flex: 1, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, fontSize: 16, maxHeight: 100, minHeight: 40, color: '#1f2937' },
    sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
    sendBtnActive: { backgroundColor: '#8b5cf6' },
    sendBtnInactive: { backgroundColor: '#f3f4f6' },
    systemTimestamp: { fontSize: 10, color: '#9ca3af', marginTop: 4 },
    daySeparatorRow: { alignItems: 'center', marginVertical: 4 },
    daySeparatorPill: { backgroundColor: 'rgba(229, 231, 235, 0.85)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    daySeparatorText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
    // Inline Action Bar
    inlineActionBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8, backgroundColor: '#fefce8', borderBottomWidth: 1, borderBottomColor: '#fef08a' },
    inlineActionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
    inlineActionRelease: { backgroundColor: '#059669' },
    inlineActionReleaseText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    inlineActionCancel: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fca5a5' },
    inlineActionCancelText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
    // Reactions and Custom Message Rows
    messageRowContainer: {
        width: '100%',
        marginVertical: 2,
        position: 'relative',
    },
    messageRowMe: {
        alignItems: 'flex-end',
    },
    messageRowOther: {
        alignItems: 'flex-start',
    },
    actionButtonsContainer: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
    },
    actionButtonsMe: {
        marginRight: 8,
    },
    actionButtonsOther: {
        marginLeft: 8,
    },
    circleActionButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#4b5563',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
        elevation: 2,
    },
    circleActionButtonActive: {
        backgroundColor: '#8b5cf6',
    },
    reactionPickerContainer: {
        position: 'absolute',
        top: -45,
        backgroundColor: '#1f2937',
        borderRadius: 24,
        paddingHorizontal: 12,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 8,
        zIndex: 100,
        gap: 10,
    },
    reactionPickerMe: {
        right: 10,
    },
    reactionPickerOther: {
        left: 10,
    },
    reactionEmojiButton: {
        padding: 2,
    },
    reactionEmojiText: {
        fontSize: 22,
    },
    reactionBadgeContainer: {
        position: 'absolute',
        bottom: -5,
        height: 28,
        minWidth: 28,
        backgroundColor: '#f3f4f6',
        borderWidth: 1.5,
        borderColor: '#ffffff',
        borderRadius: 14,
        paddingHorizontal: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 1.5,
        elevation: 3,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    reactionBadgeMe: {
        right: 12,
    },
    reactionBadgeOther: {
        left: 12,
    },
    reactionBadgeText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
        textAlign: 'center',
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
    // Reply & Quotes styling
    replyPreviewContainer: {
        backgroundColor: '#f9fafb',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    replyPreviewBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    replyPreviewAuthor: {
        fontSize: 12,
        fontWeight: '700',
        color: '#8b5cf6',
        marginBottom: 2,
    },
    replyPreviewText: {
        fontSize: 14,
        color: '#4b5563',
    },
    replyPreviewClose: {
        padding: 4,
    },
    quoteContainer: {
        padding: 8,
        borderRadius: 8,
        marginBottom: 6,
        borderLeftWidth: 3,
        maxWidth: '100%',
    },
    quoteMe: {
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
        borderLeftColor: '#ffffff',
    },
    quoteOther: {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderLeftColor: '#8b5cf6',
    },
    quoteAuthor: {
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 2,
    },
    quoteAuthorMe: {
        color: '#ffffff',
    },
    quoteAuthorOther: {
        color: '#8b5cf6',
    },
    quoteText: {
        fontSize: 13,
    },
    quoteTextMe: {
        color: 'rgba(255, 255, 255, 0.9)',
    },
    quoteTextOther: {
        color: '#4b5563',
    },
});
