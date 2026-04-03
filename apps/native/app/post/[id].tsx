import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { 
    getPost, updatePost, deletePost, 
    requestMarketplacePost, approveMarketplaceRequest, rejectMarketplaceRequest, cancelMarketplaceRequest,
    acceptMarketplacePost, completeMarketplaceTransaction, cancelMarketplaceTransaction, 
    submitRating, reportAbuse, getDb, getMemberRatings, createConversationApi
} from '../../utils/db';
import { useIdentity } from '../IdentityContext';
import { ReviewModal } from '../../components/ReviewModal';
import { CurrencyDisplay } from '../../components/CurrencyDisplay';

const CATEGORIES = [
    { id: 'food', emoji: '🥕', label: 'Food' },
    { id: 'services', emoji: '🤝', label: 'Services' },
    { id: 'labour', emoji: '👷', label: 'Labour' },
    { id: 'tools', emoji: '🛠️', label: 'Tools' },
    { id: 'goods', emoji: '📦', label: 'Goods' },
    { id: 'housing', emoji: '🏠', label: 'Housing' },
    { id: 'transport', emoji: '🚲', label: 'Transport' },
    { id: 'education', emoji: '📚', label: 'Education' },
    { id: 'arts', emoji: '🎨', label: 'Arts' },
    { id: 'health', emoji: '🌿', label: 'Health' },
    { id: 'care', emoji: '❤️', label: 'Care' },
    { id: 'animals', emoji: '🐾', label: 'Animals' },
    { id: 'energy', emoji: '☀️', label: 'Energy' },
    { id: 'general', emoji: '🌱', label: 'General' },
];

export default function PostDetailModal() {
    const insets = useSafeAreaInsets();
    const { id, txId } = useLocalSearchParams();
    const { identity } = useIdentity();
    const [activeTx, setActiveTx] = useState<any>(null);
    const [post, setPost] = useState<any>(null);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Edit form state
    const [editType, setEditType] = useState<'offer' | 'need'>('offer');
    const [editCategory, setEditCategory] = useState('general');
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editCredits, setEditCredits] = useState('');
    const [editPriceType, setEditPriceType] = useState<string>('fixed');
    const [editRepeatable, setEditRepeatable] = useState(false);
    const [editPhotos, setEditPhotos] = useState<string[]>([]);

    // Transactions / Reporting state
    const [accepting, setAccepting] = useState(false);
    const [showAcceptConfirm, setShowAcceptConfirm] = useState(false);
    const [acceptHours, setAcceptHours] = useState('1');
    const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
    const [completeHours, setCompleteHours] = useState('');
    const [showRatingForm, setShowRatingForm] = useState(false);
    const [myRating, setMyRating] = useState(0);
    const [ratingComment, setRatingComment] = useState('');
    const [submittingRating, setSubmittingRating] = useState(false);
    const [showReportForm, setShowReportForm] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [submittingReport, setSubmittingReport] = useState(false);
    const [promptReviewForTx, setPromptReviewForTx] = useState<{ txId: string; targetPubkey: string; targetCallsign: string } | null>(null);

    const [requests, setRequests] = useState<any[]>([]);

    const [authorAvgRating, setAuthorAvgRating] = useState<number | null>(null);
    const [authorRatingCount, setAuthorRatingCount] = useState<number>(0);

    useEffect(() => {
        if (id) { 
            const singleId = Array.isArray(id) ? id[0] : id;
            const singleTxId = Array.isArray(txId) ? txId[0] : txId;
            const reload = () => {
                getPost(singleId).then(setPost);
                getDb().then(database => {
                    if (singleTxId) {
                        database.getFirstAsync('SELECT * FROM marketplace_transactions WHERE id = ?', [singleTxId]).then(setActiveTx);
                    } else if (identity) {
                        database.getFirstAsync("SELECT * FROM marketplace_transactions WHERE post_id=? AND status='pending' AND (buyer_pubkey=? OR seller_pubkey=?) ORDER BY created_at DESC LIMIT 1", [singleId, identity.publicKey, identity.publicKey]).then(setActiveTx);
                    }
                    database.getAllAsync(`
                        SELECT t.*, m.callsign as buyer_callsign 
                        FROM marketplace_transactions t 
                        LEFT JOIN members m ON t.buyer_pubkey = m.public_key 
                        WHERE t.post_id=? AND t.status='requested'
                    `, [singleId])
                        .then(async (res: any[]) => {
                            const enriched = await Promise.all(res.map(async req => {
                                try {
                                    const r = await getMemberRatings(req.buyer_pubkey);
                                    return { ...req, avgRating: r.average, count: r.count };
                                } catch(e) { return { ...req, avgRating: 0, count: 0 }; }
                            }));
                            setRequests(enriched);
                        });
                });
            };
            reload();
            
            const { DeviceEventEmitter } = require('react-native');
            const sub = DeviceEventEmitter.addListener('sync_data_updated', reload);
            return () => sub.remove();
        }
    }, [id, txId, identity]);

    useEffect(() => {
        if (post?.author_pubkey) {
            getMemberRatings(post.author_pubkey).then(res => {
                setAuthorAvgRating(res.average);
                setAuthorRatingCount(res.count);
            }).catch(console.error);
        }
    }, [post?.author_pubkey]);

    if (!post) {
        return (
            <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
                <Text style={styles.errorText}>Post not found. It may have been expired by the Network.</Text>
                <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market'); }} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>Return to Market</Text>
                </Pressable>
            </View>
        );
    }

    const isOwnPost = identity?.publicKey === post.author_pubkey;
    
    // --- Escrow Roles ---
    const isAcceptedByMe = activeTx 
        ? (activeTx.buyer_pubkey === identity?.publicKey || activeTx.seller_pubkey === identity?.publicKey) && !isOwnPost
        : (identity?.publicKey === post.accepted_by);
    const isPayer = activeTx
        ? activeTx.buyer_pubkey === identity?.publicKey
        : ((post.type === 'offer' && isAcceptedByMe) || (post.type === 'need' && isOwnPost));
    const isPayee = activeTx
        ? activeTx.seller_pubkey === identity?.publicKey
        : ((post.type === 'offer' && isOwnPost) || (post.type === 'need' && isAcceptedByMe));
    const targetPeerCallsign = activeTx 
        ? (isPayer ? activeTx.seller_callsign || 'Peer' : activeTx.buyer_callsign || 'Peer')
        : (isOwnPost ? (post.accepted_by_callsign || 'Peer') : (post.author_callsign || post.author_pubkey?.slice(0, 6) || 'Unknown'));

    const isOffer = post.type === 'offer';
    const catObj = CATEGORIES.find(c => c.id === post.category);
    const emoji = catObj?.emoji || '📦';
    const cardAuthor = post.author_callsign || post.author_pubkey?.slice(0, 6) || 'Unknown';
    const priceLabel = isOffer ? 'ASKING PRICE' : 'WILLING TO PAY';

    let photos: string[] = [];
    if (post.photos) {
        try { photos = JSON.parse(post.photos); } catch {}
    }

    const startEdit = () => {
        setEditType(post.type);
        setEditCategory(post.category);
        setEditTitle(post.title);
        setEditDescription(post.description || '');
        setEditCredits(String(post.credits));
        setEditPriceType(post.price_type || 'fixed');
        setEditRepeatable(!!post.repeatable);
        setEditPhotos(photos);
        setEditMode(true);
    };

    const handleSave = async () => {
        if (!editTitle.trim()) { Alert.alert('Error', 'Title is required'); return; }
        setSaving(true);
        try {
            await updatePost(post.id, {
                type: editType,
                category: editCategory,
                title: editTitle.trim(),
                description: editDescription.trim(),
                credits: Number(editCredits) || 0,
                price_type: editPriceType,
                repeatable: editRepeatable,
                photos: editPhotos.length > 0 ? JSON.stringify(editPhotos) : null,
            });
            // Refresh the post
            const updated = await getPost(post.id);
            setPost(updated);
            setEditMode(false);
        } catch (e) {
            Alert.alert('Error', 'Failed to save changes');
        }
        setSaving(false);
    };

    const handleDelete = () => {
        Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                setDeleting(true);
                try {
                    await deletePost(post.id);
                    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market');
                } catch (e) {
                    Alert.alert('Error', 'Failed to delete post');
                    setDeleting(false);
                }
            }},
        ]);
    };

    const myRequest = requests.find(r => r.buyer_pubkey === identity?.publicKey);

    const handleApprove = async (transactionId: string) => {
        if (!identity) return;
        setAccepting(true);
        try {
            await approveMarketplaceRequest(transactionId, identity.publicKey);
            const updated = await getPost(post.id);
            setPost(updated);
            Alert.alert('Approved', 'Escrow locked successfully.');
        } catch (e: any) { Alert.alert('Error', e.message); }
        setAccepting(false);
    };

    const handleReject = async (transactionId: string) => {
        if (!identity) return;
        try {
            await rejectMarketplaceRequest(transactionId, identity.publicKey);
            setRequests(prev => prev.filter(r => r.id !== transactionId));
        } catch (e: any) { Alert.alert('Error', e.message); }
    };

    const handleWithdraw = async () => {
        if (!identity || !myRequest) return;
        setAccepting(true);
        try {
            await cancelMarketplaceRequest(myRequest.id, identity.publicKey);
            setRequests(prev => prev.filter(r => r.id !== myRequest.id));
        } catch (e: any) { Alert.alert('Error', e.message); }
        setAccepting(false);
    };

    const pickEditPhoto = async () => {
        if (editPhotos.length >= 3) return;
        Alert.alert('Add Photo', 'Choose a source', [
            { text: 'Camera', onPress: async () => {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) return;
                const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
                if (!result.canceled && result.assets[0]) setEditPhotos(prev => [...prev, result.assets[0].uri]);
            }},
            { text: 'Gallery', onPress: async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
                if (!result.canceled && result.assets[0]) setEditPhotos(prev => [...prev, result.assets[0].uri]);
            }},
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market'); };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={goBack} style={styles.backButton}>
                    <Text style={styles.backText}>←</Text>
                    <Text style={{ color: '#1f2937', fontSize: 16, fontWeight: 'bold', marginLeft: 4 }}>Back</Text>
                </Pressable>
                <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center' }]}>{isOffer ? 'Offer' : 'Need'}</Text>
                <View style={{ width: 68 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {/* Type + Category Badge */}
                <View style={styles.typeBadgeRow}>
                    <View style={styles.catBadge}>
                        <Text style={styles.catEmoji}>{emoji}</Text>
                        <Text style={[styles.catLabel, { color: isOffer ? '#10b981' : '#ea580c' }]}>
                            {isOffer ? '● ' : '● '}{post.type.toUpperCase()} · {(catObj?.label || post.category).toUpperCase()}
                            {post.repeatable ? ' · RECURRING' : ''}
                        </Text>
                    </View>
                    <Text style={styles.timeAgo}>{getTimeAgo(post.created_at)}</Text>
                </View>

                {/* Title */}
                <Text style={styles.postTitle}>{post.title}</Text>

                {/* Description */}
                <Text style={styles.description}>{post.description || 'No description provided.'}</Text>

                {/* Photos */}
                {photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                        {photos.map((uri, i) => (
                            <Image key={i} source={{ uri }} style={styles.photoImage} />
                        ))}
                    </ScrollView>
                )}

                {/* Price Card */}
                <View style={styles.priceCard}>
                    <Text style={styles.priceLabel}>{priceLabel}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <CurrencyDisplay amount={post.credits} style={styles.priceValue} />
                        <Text style={[styles.priceCurrency, { marginLeft: 2 }]}>{
                            { fixed: '', hourly: ' / Hr', daily: ' / Dy', weekly: ' / Wk', monthly: ' / Mo' }[post.price_type as string] || ''
                        }</Text>
                    </View>
                </View>

                {/* Author Card */}
                <Pressable style={styles.authorCard} onPress={() => router.push({ pathname: '/public-profile', params: { publicKey: post.author_pubkey, callsign: cardAuthor } })}>
                    <Text style={styles.authorCardLabel}>POSTED BY</Text>
                    <View style={styles.authorRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarLetter}>{cardAuthor.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.authorInfo}>
                            <Text style={styles.authorName}>🤝 {cardAuthor}</Text>
                            <Text style={styles.authorRating}>
                                {authorAvgRating !== null && authorRatingCount > 0 
                                    ? renderBeans(authorAvgRating) + ` (${authorAvgRating.toFixed(1)}) • ${authorRatingCount} Reviews`
                                    : '☆☆☆☆☆ No ratings yet'}
                            </Text>
                        </View>
                    </View>
                </Pressable>

                {/* Action Buttons */}

                {/* 1. Pending Escrow State (Applies to both Payer and Payee) */}
                {(post.status === 'pending' || activeTx?.status === 'pending') && (isPayer || isPayee) && (
                    <View style={styles.ownPostActions}>
                        {isPayer ? (
                            <>
                                <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
                                    ✅ Action Required: Release Credits
                                </Text>
                                <Text style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', marginBottom: 12, paddingHorizontal: 16 }}>
                                    You are the Payer. Once {targetPeerCallsign} has fulfilled the terms, release the escrow to complete the transaction.
                                </Text>
                                
                                {showCompleteConfirm ? (
                                    <View style={styles.confirmBox}>
                                        <Text style={styles.confirmBoxTitle}>Finalize Transaction</Text>
                                        {post.price_type !== 'fixed' && (
                                            <View style={{ marginBottom: 16 }}>
                                                <Text style={styles.confirmBoxLabel}>CONFIRM ACTUAL {
                                                    { hourly: 'HOURS', daily: 'DAYS', weekly: 'WEEKS', monthly: 'MONTHS' }[post.price_type as string] || 'UNITS'
                                                } WORKED</Text>
                                                <TextInput style={styles.confirmBoxInput} value={completeHours} onChangeText={setCompleteHours} keyboardType="numeric" placeholder="e.g. 2.5" placeholderTextColor="#9ca3af" />
                                                <Text style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 12 }}>
                                                    Adjust the final time up or down if the scope changed. The final credits released will be calculated automatically.
                                                </Text>
                                            </View>
                                        )}
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <Pressable style={styles.cancelActionBtn} onPress={() => setShowCompleteConfirm(false)} disabled={accepting}>
                                                <Text style={styles.cancelActionBtnText}>Cancel</Text>
                                            </Pressable>
                                            <Pressable style={[styles.confirmActionBtn, styles.confirmActionBtnGreen]} disabled={accepting || (post.price_type !== 'fixed' && !completeHours)} onPress={async () => {
                                                const txToComplete = activeTx?.id || post.pending_transaction_id;
                                                if (!identity || !txToComplete) return;
                                                setAccepting(true);
                                                try {
                                                    await completeMarketplaceTransaction(txToComplete, identity.publicKey, post.price_type !== 'fixed' ? Number(completeHours) : undefined);
                                                    setShowCompleteConfirm(false);
                                                    
                                                    const targetPubkey = isPayer ? (activeTx?.seller_pubkey || post.accepted_by) : (activeTx?.buyer_pubkey || post.author_pubkey);
                                                    setPromptReviewForTx({ 
                                                        txId: txToComplete, 
                                                        targetPubkey, 
                                                        targetCallsign: targetPeerCallsign 
                                                    });
                                                } catch(e: any) { Alert.alert('Error', e.message); } finally { setAccepting(false); }
                                            }}>
                                                <Text style={styles.confirmActionBtnText}>{accepting ? 'Processing...' : 'Release Credits'}</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                ) : (
                                    <Pressable style={[styles.acceptBtn, styles.acceptBtnOffer]} onPress={() => { setShowCompleteConfirm(true); if(post.price_type !== 'fixed' && !completeHours) setCompleteHours(activeTx?.hours ? String(activeTx.hours) : '1'); }}>
                                        <Text style={styles.acceptBtnText}>✅ Release Credits</Text>
                                    </Pressable>
                                )}
                            </>
                        ) : (
                            <>
                                <Text style={{ color: '#f59e0b', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 8, marginBottom: 8 }}>
                                    ⏳ Pending Release by {targetPeerCallsign}
                                </Text>
                                <View style={{ paddingHorizontal: 16, marginBottom: 16, gap: 8 }}>
                                    <Text style={{ color: '#1f2937', fontSize: 14, textAlign: 'center', fontWeight: '600', lineHeight: 20 }}>
                                        You are the Payee. Fulfill the terms exactly as agreed, then ask the Payer to release your credits.
                                    </Text>
                                    <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                                        <Text style={{ color: '#b91c1c', fontSize: 13, textAlign: 'center', fontWeight: '700' }}>
                                            Note: If this post is still visible here, you have not yet received your credits.
                                        </Text>
                                    </View>
                                </View>
                            </>
                        )}
                        
                        <Pressable style={styles.cancelTxBtn} disabled={accepting} onPress={() => {
                            Alert.alert('Cancel Transaction', 'Return post to the market?', [
                                { text: 'No', style: 'cancel' },
                                { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
                                    const txToCancel = activeTx?.id || post.pending_transaction_id;
                                    if(!identity || !txToCancel) return;
                                    setAccepting(true);
                                    try {
                                        await cancelMarketplaceTransaction(txToCancel, identity.publicKey);
                                        if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market');
                                    } catch(e:any) { 
                                        if (e.message?.includes('not found') || e.message?.includes('not authorized')) {
                                            Alert.alert('Already Updated', 'This transaction was already cancelled or completed on another device. Your feed will automatically refresh.');
                                            const { performSync } = require('../../services/pillar-sync');
                                            performSync().catch(console.error);
                                            if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market');
                                        } else {
                                            Alert.alert('Error', e.message); 
                                        }
                                    } finally { setAccepting(false); }
                                }}
                            ]);
                        }}>
                            <Text style={styles.cancelTxBtnText}>❌ Cancel Escrow</Text>
                        </Pressable>
                    </View>
                )}

                {/* 2. Own Completed Posts (Badge) */}
                {isOwnPost && (post.status === 'completed' || activeTx?.status === 'completed') && (
                    <View style={styles.confirmBox}>
                        <Text style={[styles.confirmBoxTitle, { color: '#10b981' }]}>✅ Deal Completed</Text>
                        <Text style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                            This deal has concluded successfully and credits have been processed on the Ledger.
                        </Text>
                    </View>
                )}

                {/* 3. Own Active Posts (Edit / Delete) */}
                {isOwnPost && post.status === 'active' && (!activeTx || activeTx.status !== 'pending') && (
                    editMode ? (
                        <View style={styles.editSection}>
                            <Text style={styles.editSectionTitle}>✏️ Edit Post</Text>

                            {/* Type Toggle */}
                            <View style={styles.editTypeRow}>
                                <Pressable style={[styles.editTypeBtn, editType === 'offer' && styles.editTypeBtnOffer]} onPress={() => setEditType('offer')}>
                                    <Text style={[styles.editTypeBtnText, editType === 'offer' && styles.editTypeBtnTextActive]}>🔵 Offer</Text>
                                </Pressable>
                                <Pressable style={[styles.editTypeBtn, editType === 'need' && styles.editTypeBtnNeed]} onPress={() => setEditType('need')}>
                                    <Text style={[styles.editTypeBtnText, editType === 'need' && styles.editTypeBtnTextActive]}>🟠 Need</Text>
                                </Pressable>
                            </View>

                            {/* Category */}
                            <View style={styles.editPickerWrap}>
                                <Picker selectedValue={editCategory} onValueChange={v => setEditCategory(v)} style={styles.editPicker} dropdownIconColor="#6b7280">
                                    {CATEGORIES.map(c => <Picker.Item key={c.id} label={`${c.emoji} ${c.label}`} value={c.id} />)}
                                </Picker>
                            </View>

                            {/* Title */}
                            <TextInput style={styles.editInput} value={editTitle} onChangeText={setEditTitle} placeholder="Title" placeholderTextColor="#9ca3af" />

                            {/* Description */}
                            <TextInput style={[styles.editInput, { minHeight: 80 }]} value={editDescription} onChangeText={setEditDescription} placeholder="Description" placeholderTextColor="#9ca3af" multiline textAlignVertical="top" />

                            {/* Credits + Price Type */}
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                                <TextInput style={[styles.editInput, { flex: 1, marginBottom: 0 }]} value={editCredits} onChangeText={setEditCredits} placeholder="Credits (B)" placeholderTextColor="#9ca3af" keyboardType="numeric" />
                                <Pressable onPress={() => {
                                    const types = ['fixed', 'hourly', 'daily', 'weekly', 'monthly'];
                                    setEditPriceType(types[(types.indexOf(editPriceType) + 1) % types.length]);
                                }} style={{ backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 16, justifyContent: 'center' }}>
                                    <Text style={{ color: '#1f2937', fontSize: 13, fontWeight: '700' }}>{
                                        { fixed: 'Total', hourly: '/ Hr', daily: '/ Dy', weekly: '/ Wk', monthly: '/ Mo' }[editPriceType] || 'Total'
                                    }</Text>
                                </Pressable>
                            </View>

                            {/* Repeatable Toggle */}
                            <Pressable 
                                onPress={() => setEditRepeatable(!editRepeatable)}
                                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 15 }}
                            >
                                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: editRepeatable ? '#f97316' : '#d1d5db', backgroundColor: editRepeatable ? '#f97316' : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                    {editRepeatable && <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>✓</Text>}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#111827', fontSize: 14, fontWeight: '700' }}>Recurring Need / Offer</Text>
                                    <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>Post remains active after completion.</Text>
                                </View>
                            </Pressable>

                            {/* Photos */}
                            <Text style={styles.editPhotoLabel}>PHOTOS ({editPhotos.length}/3)</Text>
                            <View style={styles.editPhotosRow}>
                                {editPhotos.map((uri, i) => (
                                    <View key={i} style={styles.editPhotoThumb}>
                                        <Image source={{ uri }} style={styles.editPhotoImg} />
                                        <Pressable style={styles.editPhotoRemove} onPress={() => setEditPhotos(prev => prev.filter((_, j) => j !== i))}>
                                            <Text style={styles.editPhotoRemoveText}>✕</Text>
                                        </Pressable>
                                    </View>
                                ))}
                                {editPhotos.length < 3 && (
                                    <Pressable style={styles.editPhotoAdd} onPress={pickEditPhoto}>
                                        <Text style={styles.editPhotoAddIcon}>+</Text>
                                    </Pressable>
                                )}
                            </View>

                            {/* Save / Cancel */}
                            <View style={styles.editBtnRow}>
                                <Pressable style={styles.editCancelBtn} onPress={() => setEditMode(false)}>
                                    <Text style={styles.editCancelBtnText}>Cancel</Text>
                                </Pressable>
                                <Pressable style={[styles.editSaveBtn, (saving || !editTitle.trim()) && styles.editSaveBtnDisabled]} onPress={handleSave} disabled={saving || !editTitle.trim()}>
                                    <Text style={styles.editSaveBtnText}>{saving ? 'Saving...' : '💾 Save'}</Text>
                                </Pressable>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.ownPostActions}>
                            <Pressable style={styles.editPostBtn} onPress={startEdit}>
                                <Text style={styles.editPostBtnText}>✏️ Edit Post</Text>
                            </Pressable>
                            <Pressable style={styles.deletePostBtn} onPress={handleDelete} disabled={deleting}>
                                <Text style={styles.deletePostBtnText}>{deleting ? 'Deleting...' : '🗑️ Delete Post'}</Text>
                            </Pressable>
                        </View>
                    )
                )}

                {/* 3. Unaccepted Posts Displayed to Browsers */}
                {!isOwnPost && post.status === 'active' && !isAcceptedByMe && (
                    <View style={styles.otherPostActions}>
                        {myRequest ? (
                            <View style={styles.confirmBox}>
                                <Text style={[styles.confirmBoxTitle, { color: '#10b981' }]}>Deal Established</Text>
                                <Text style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                                    {isOffer 
                                        ? `You have committed ${myRequest.credits} credits ${myRequest.hours ? `(${myRequest.hours} hours)` : ''} to Escrow for this offer.`
                                        : `You have requested to earn ${myRequest.credits} credits ${myRequest.hours ? `(${myRequest.hours} hours)` : ''} for fulfilling this need.`
                                    }
                                </Text>
                                <Pressable style={[styles.cancelActionBtn, { width: '100%' }]} onPress={handleWithdraw} disabled={accepting}>
                                    <Text style={styles.cancelActionBtnText}>{accepting ? 'Withdrawing...' : 'Withdraw Request'}</Text>
                                </Pressable>
                            </View>
                        ) : showAcceptConfirm ? (
                            <View style={styles.confirmBox}>
                                <Text style={styles.confirmBoxTitle}>{isOffer ? 'Accept this Offer?' : 'Offer to Fulfill?'}</Text>
                                
                                <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 8, borderColor: 'rgba(245, 158, 11, 0.3)', borderWidth: 1, marginBottom: 16 }}>
                                    <Text style={{ color: '#c2410c', fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>🔒 Escrow Protocol</Text>
                                    <Text style={{ color: '#4b5563', fontSize: 12, lineHeight: 18 }}>
                                        {isOffer 
                                            ? `By proceeding, you commit ${post.price_type === 'fixed' ? post.credits : `your authorized`} credits to an Escrow smart contract. The credits will only be transferred to the seller once you mark the transaction as complete.`
                                            : `This transaction is protected by Escrow. The payer has already committed the credits to a secure contract. Once you complete the task, they will release the funds to your wallet.`}
                                    </Text>
                                </View>
                                {post.price_type !== 'fixed' && (
                                    <View style={{ marginBottom: 12 }}>
                                        <Text style={styles.confirmBoxLabel}>ESCROW AMOUNT (HOURS)</Text>
                                        <TextInput style={styles.confirmBoxInput} value={acceptHours} onChangeText={setAcceptHours} placeholder="Hours" placeholderTextColor="#9ca3af" keyboardType="numeric" editable={post.price_type !== 'fixed'} />
                                        <Text style={{ color: '#9ca3af', fontSize: 10, textAlign: 'center', marginTop: 4 }}>Credits will be required upon approval.</Text>
                                    </View>
                                )}
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <Pressable style={styles.cancelActionBtn} onPress={() => setShowAcceptConfirm(false)} disabled={accepting}>
                                        <Text style={styles.cancelActionBtnText}>Cancel</Text>
                                    </Pressable>
                                    <Pressable style={[styles.confirmActionBtn, styles.confirmActionBtnGreen]} disabled={accepting || (post.price_type !== 'fixed' && !acceptHours)} onPress={async () => {
                                        if (accepting) return;
                                        if (!identity || !post.id) return;
                                        setAccepting(true);
                                        try {
                                            const estimatedHrs = post.price_type !== 'fixed' ? Number(acceptHours) : undefined;
                                            if (isOffer) {
                                                await acceptMarketplacePost(post.id, identity.publicKey, estimatedHrs);
                                                setShowAcceptConfirm(false);
                                            } else {
                                                await requestMarketplacePost(post.id, identity.publicKey, estimatedHrs);
                                                setShowAcceptConfirm(false);
                                                // Optimistically add to local state
                                                setRequests(prev => [...prev, {
                                                    id: Math.random().toString(36).substring(2, 11), post_id: post.id, buyer_pubkey: identity.publicKey, seller_pubkey: post.author_pubkey,
                                                    credits: post.price_type === 'fixed' ? post.credits : post.credits * Number(acceptHours),
                                                    hours: post.price_type === 'fixed' ? null : Number(acceptHours), status: 'requested'
                                                }]);
                                            }
                                        } catch (e: any) { 
                                            if (e.message?.includes('not found') || e.message?.includes('not active')) {
                                                Alert.alert('Already Updated', 'This post was already accepted or modified elsewhere. Refreshing your screen...');
                                                const { performSync } = require('../../services/pillar-sync');
                                                performSync().catch(console.error);
                                                setShowAcceptConfirm(false);
                                            } else {
                                                Alert.alert('Error', e.message); 
                                            }
                                        } finally { 
                                            setAccepting(false); 
                                        }
                                    }}>
                                        <Text style={styles.confirmActionBtnText}>{accepting ? 'Processing...' : 'Confirm'}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : (
                            <Pressable style={[styles.acceptBtn, isOffer ? styles.acceptBtnOffer : styles.acceptBtnNeed, (accepting || post.status === 'pending') && { opacity: 0.6 }]} disabled={accepting || post.status === 'pending'} onPress={() => setShowAcceptConfirm(true)}>
                                <Text style={styles.acceptBtnText}>
                                    {accepting ? 'Processing...' : (post.status === 'pending' ? '⏳ Pending Confirmation' : (isOffer ? '🤝 Accept Offer' : '✋ Offer to Fulfill'))}
                                </Text>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* 3.5 Author Requests Display */}
                {isOwnPost && post.status === 'active' && requests.length > 0 && (
                    <View style={styles.requestsContainer}>
                        <Text style={styles.requestsTitle}>✋ Fulfillment Requests ({requests.length})</Text>
                        {requests.map(req => (
                            <View key={req.id} style={styles.requestCard}>
                                <View style={{ flex: 1, marginBottom: 8 }}>
                                  <Pressable onPress={() => router.push({ pathname: '/public-profile', params: { publicKey: req.buyer_pubkey, callsign: req.buyer_callsign || req.buyer_pubkey.slice(0,8) } })}>
                                      <Text style={[styles.requestName, { textDecorationLine: 'underline', color: '#fbbf24' }]}>
                                          🤝 {req.buyer_callsign || req.buyer_pubkey.slice(0, 8)}
                                      </Text>
                                  </Pressable>
                                  <Text style={{ fontSize: 12, color: '#fbbf24', marginTop: 2, fontWeight: '600' }}>
                                    {req.count > 0 ? `★ ${req.avgRating.toFixed(1)} (${req.count} reviews)` : '☆☆☆☆☆ No ratings yet'}
                                  </Text>
                                  <Text style={styles.requestAmt}>{req.hours ? `${req.hours} hours estimated` : 'Offered to fulfill'}</Text>
                                </View>
                                <View style={{flexDirection: 'row', gap: 8}}>
                                    <Pressable style={[styles.rejectBtn, accepting && {opacity: 0.5}]} disabled={accepting} onPress={() => handleReject(req.id)}>
                                        <Text style={styles.rejectBtnText}>Deny</Text>
                                    </Pressable>
                                    <Pressable style={[styles.approveBtn, accepting && {opacity: 0.5}, { flex: 2 }]} disabled={accepting} onPress={() => handleApprove(req.id)}>
                                        <Text style={styles.approveBtnText}>Approve & Escrow</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* 4. Universal Actions for Peer (Message, Rate, Report) */}
                {!isOwnPost && (
                    <View style={[styles.otherPostActions, { marginTop: post.status === 'pending' || post.status === 'active' ? 10 : 0 }]}>
                        <Pressable style={styles.messageBtn} onPress={async () => {
                            if (!identity) return;
                            try {
                                const conv = await createConversationApi('dm', [post.author_pubkey, identity.publicKey], identity.publicKey, undefined, post.id);
                                if (conv) router.push(`/chat/${conv.id}`);
                            } catch (e: any) {
                                Alert.alert("Error", e.message || "Failed to start chat.");
                            }
                        }}>
                            <Text style={styles.messageBtnText}>💬 Message</Text>
                        </Pressable>
                        
                        {identity && (post.status === 'completed' || activeTx?.status === 'completed') && (activeTx?.id || post.pending_transaction_id) && (
                            <View style={{ marginTop: 16 }}>
                                <Pressable style={[styles.messageBtn, { borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.05)' }]} onPress={() => setShowRatingForm(!showRatingForm)}>
                                    <Text style={[styles.messageBtnText, { color: '#f59e0b' }]}>★ Rate {post.author_callsign || 'Author'}</Text>
                                </Pressable>
                                {showRatingForm && (
                                    <View style={[styles.confirmBox, { marginTop: 8 }]}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                                            {[1,2,3,4,5].map(star => (
                                                <Pressable key={star} onPress={() => setMyRating(star)}>
                                                    <Text style={{ fontSize: 32, color: star <= myRating ? '#fbbf24' : '#d1d5db' }}>{star <= myRating ? '★' : '☆'}</Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                        <TextInput style={[styles.editInput, { minHeight: 60, marginBottom: 12 }]} value={ratingComment} onChangeText={setRatingComment} placeholder="Leave an optional comment..." placeholderTextColor="#9ca3af" multiline />
                                        <Pressable style={[styles.confirmActionBtn, { backgroundColor: myRating >= 1 ? '#f59e0b' : '#e5e7eb' }]} disabled={myRating < 1 || submittingRating} onPress={async () => {
                                            if(!identity || !activeTx) return;
                                            try {
                                                const txToRate = activeTx?.id || post.pending_transaction_id;
                                                setSubmittingRating(true);
                                                await submitRating(identity.publicKey, post.author_pubkey, myRating, ratingComment, txToRate);
                                                setShowRatingForm(false);
                                                Alert.alert('Success', 'Rating submitted!');
                                            } catch(e:any) { Alert.alert('Error', e.message); } finally { setSubmittingRating(false); }
                                        }}>
                                            <Text style={styles.confirmActionBtnText}>{submittingRating ? 'Submitting...' : 'Submit Rating'}</Text>
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                        )}

                        <Pressable style={[styles.messageBtn, { marginTop: 12, borderColor: 'transparent', backgroundColor: 'transparent' }]} onPress={() => setShowReportForm(!showReportForm)}>
                            <Text style={[styles.messageBtnText, { color: '#ef4444', fontSize: 13 }]}>🚩 Report Post</Text>
                        </Pressable>
                        {showReportForm && (
                            <View style={[styles.confirmBox, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }]}>
                                <Text style={styles.confirmBoxLabel}>REPORT REASON</Text>
                                <View style={styles.editPickerWrap}>
                                    <Picker selectedValue={reportReason} onValueChange={v => setReportReason(v)} style={styles.editPicker} dropdownIconColor="#ef4444">
                                        <Picker.Item label="Select a reason..." value="" />
                                        <Picker.Item label="Spam or scam" value="Spam or scam" />
                                        <Picker.Item label="Offensive content" value="Offensive content" />
                                        <Picker.Item label="Misleading post" value="Misleading post" />
                                        <Picker.Item label="Other" value="Other" />
                                    </Picker>
                                </View>
                                <Pressable style={[styles.confirmActionBtn, { backgroundColor: reportReason ? '#ef4444' : '#e5e7eb' }]} disabled={!reportReason || submittingReport} onPress={async () => {
                                    if(!identity || !post.id) return;
                                    try {
                                        setSubmittingReport(true);
                                        await reportAbuse(identity.publicKey, post.author_pubkey, reportReason, post.id);
                                        setShowReportForm(false);
                                        Alert.alert('Reported', 'Post was flagged for review.');
                                    } catch(e:any) { Alert.alert('Error', e.message); } finally { setSubmittingReport(false); }
                                }}>
                                    <Text style={styles.confirmActionBtnText}>{submittingReport ? 'Sending...' : 'Submit Report'}</Text>
                                </Pressable>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
            </KeyboardAvoidingView>
            {promptReviewForTx && (
                <ReviewModal 
                    visible={!!promptReviewForTx}
                    txId={promptReviewForTx.txId}
                    targetPubkey={promptReviewForTx.targetPubkey}
                    targetCallsign={promptReviewForTx.targetCallsign}
                    onClose={() => {
                        setPromptReviewForTx(null);
                        if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market');
                    }}
                    onSuccess={() => {
                        setPromptReviewForTx(null);
                        if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market');
                    }}
                />
            )}
        </View>
    );
}

function renderBeans(rating: number): string {
    const r = Math.round(rating) || 0;
    return '★'.repeat(Math.min(r, 5)) + '☆'.repeat(Math.max(0, 5 - r));
}

function getTimeAgo(dateStr: string): string {
    try {
        const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (secs < 60) return 'just now';
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    } catch { return ''; }
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f9fafb' },
    errorText: { color: '#6b7280', fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 24 },
    closeBtn: { backgroundColor: '#d97757', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
    closeBtnText: { color: '#fff', fontWeight: 'bold' },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    backButton: { flexDirection: 'row', width: 68, height: 40, alignItems: 'center' },
    backText: { color: '#1f2937', fontSize: 24, marginTop: -2 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', letterSpacing: 1, textTransform: 'uppercase' },

    scroll: { paddingBottom: 60 },

    // Type Badge
    typeBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
    catBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    catEmoji: { fontSize: 20 },
    catLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
    timeAgo: { color: '#9ca3af', fontSize: 12, fontWeight: '600' },

    // Title & Description
    postTitle: { color: '#1f2937', fontSize: 24, fontWeight: '800', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    description: { color: '#4b5563', fontSize: 15, lineHeight: 22, paddingHorizontal: 20, paddingBottom: 16 },

    // Photos
    photosScroll: { paddingLeft: 20, marginBottom: 16 },
    photoImage: { width: 160, height: 120, borderRadius: 12, marginRight: 10, backgroundColor: '#f3f4f6' },

    // Price Card
    priceCard: { marginHorizontal: 20, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 20, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    priceLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
    priceValue: { color: '#1f2937', fontSize: 36, fontWeight: '800' },
    priceCurrency: { fontSize: 20, fontWeight: '500', color: '#6b7280' },

    // Author Card
    authorCard: { marginHorizontal: 20, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    authorCardLabel: { color: '#9ca3af', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
    authorRow: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(217,119,87,0.1)', justifyContent: 'center', alignItems: 'center' },
    avatarLetter: { color: '#d97757', fontSize: 20, fontWeight: 'bold' },
    authorInfo: { marginLeft: 12 },
    authorName: { color: '#1f2937', fontSize: 16, fontWeight: '700' },
    authorRating: { color: '#6b7280', fontSize: 12, marginTop: 2 },

    // Own Post Actions
    ownPostActions: { paddingHorizontal: 20, gap: 10 },
    editPostBtn: { backgroundColor: '#d97757', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    editPostBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    deletePostBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(239,68,68,0.2)' },
    deletePostBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },

    // Other's Post Actions
    otherPostActions: { paddingHorizontal: 20, gap: 10 },
    messageBtn: { backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
    messageBtnText: { color: '#1f2937', fontSize: 16, fontWeight: '700' },
    acceptBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    acceptBtnOffer: { backgroundColor: '#10b981' },
    acceptBtnNeed: { backgroundColor: '#ea580c' },
    acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    // Edit Section
    editSection: { marginHorizontal: 20, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
    editSectionTitle: { color: '#1f2937', fontSize: 18, fontWeight: '800', marginBottom: 16 },
    editTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    editTypeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center' },
    editTypeBtnOffer: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    editTypeBtnNeed: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
    editTypeBtnText: { fontSize: 14, fontWeight: '800', color: '#9ca3af' },
    editTypeBtnTextActive: { color: '#fff' },
    editPickerWrap: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10, overflow: 'hidden' },
    editPicker: { color: '#1f2937', height: 50 },
    editInput: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 12, color: '#1f2937', fontSize: 15, marginBottom: 10 },
    editPhotoLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    editPhotosRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
    editPhotoThumb: { width: 60, height: 60, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    editPhotoImg: { width: 60, height: 60, borderRadius: 12 },
    editPhotoRemove: { position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
    editPhotoRemoveText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    editPhotoAdd: { width: 60, height: 60, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
    editPhotoAddIcon: { color: '#9ca3af', fontSize: 26 },
    editBtnRow: { flexDirection: 'row', gap: 10 },
    editCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', alignItems: 'center' },
    editCancelBtnText: { color: '#6b7280', fontSize: 15, fontWeight: '700' },
    editSaveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#d97757', alignItems: 'center' },
    editSaveBtnDisabled: { backgroundColor: '#d1d5db' },
    editSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    // Transaction Logic Components
    confirmBox: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    confirmBoxTitle: { color: '#1f2937', fontSize: 15, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
    confirmBoxLabel: { color: '#9ca3af', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
    confirmBoxInput: { backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 14, color: '#1f2937', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
    cancelActionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
    cancelActionBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '700' },
    confirmActionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    confirmActionBtnGreen: { backgroundColor: '#10b981' },
    confirmActionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    cancelTxBtn: { marginTop: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', backgroundColor: '#ffffff', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    cancelTxBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
    requestsContainer: {
        marginTop: 20,
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb'
    },
    requestsTitle: {
        color: '#1f2937',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12
    },
    requestCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#f3f4f6',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8
    },
    requestName: {
        color: '#1f2937',
        fontWeight: '600',
        fontSize: 14,
        marginBottom: 4
    },
    requestAmt: {
        color: '#10b981',
        fontSize: 12,
        fontWeight: '700'
    },
    approveBtn: {
        backgroundColor: '#10b981',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6
    },
    approveBtnText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: 'bold'
    },
    rejectBtn: {
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)'
    },
    rejectBtnText: {
        color: '#ef4444',
        fontSize: 13,
        fontWeight: 'bold'
    }
});
