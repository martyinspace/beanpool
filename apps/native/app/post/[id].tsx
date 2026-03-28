import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, SafeAreaView, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { 
    getPost, updatePost, deletePost, 
    requestMarketplacePost, approveMarketplaceRequest, rejectMarketplaceRequest, cancelMarketplaceRequest,
    acceptMarketplacePost, completeMarketplaceTransaction, cancelMarketplaceTransaction, 
    submitRating, reportAbuse, getDb, getMemberRatings
} from '../../utils/db';
import { useIdentity } from '../IdentityContext';

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
    const { id } = useLocalSearchParams();
    const { identity } = useIdentity();
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

    const [requests, setRequests] = useState<any[]>([]);

    const [authorAvgRating, setAuthorAvgRating] = useState<number | null>(null);
    const [authorRatingCount, setAuthorRatingCount] = useState<number>(0);

    useEffect(() => {
        if (id) { 
            getPost(id as string).then(setPost);
            const singleId = Array.isArray(id) ? id[0] : id;
            getDb().then(database => {
                database.getAllAsync("SELECT * FROM marketplace_transactions WHERE post_id=? AND status='requested'", [singleId])
                    .then(res => setRequests(res as any[]));
            });
        }
    }, [id]);

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
            <SafeAreaView style={styles.errorContainer}>
                <Text style={styles.errorText}>Post not found. It may have been expired by the Network.</Text>
                <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market'); }} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>Return to Market</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    const isOwnPost = identity?.publicKey === post.author_pubkey;
    
    // --- Escrow Roles ---
    const isAcceptedByMe = identity?.publicKey === post.accepted_by;
    const isPayer = (post.type === 'offer' && isAcceptedByMe) || (post.type === 'need' && isOwnPost);
    const isPayee = (post.type === 'offer' && isOwnPost) || (post.type === 'need' && isAcceptedByMe);
    const targetPeerCallsign = isOwnPost 
        ? (post.accepted_by_callsign || 'Peer') 
        : (post.author_callsign || post.author_pubkey?.slice(0, 6) || 'Unknown');

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
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={goBack} style={styles.backButton}>
                    <Text style={styles.backText}>←</Text>
                </Pressable>
                <Text style={styles.headerTitle}>{isOffer ? 'Offer' : 'Need'}</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {/* Type + Category Badge */}
                <View style={styles.typeBadgeRow}>
                    <View style={styles.catBadge}>
                        <Text style={styles.catEmoji}>{emoji}</Text>
                        <Text style={[styles.catLabel, { color: isOffer ? '#10b981' : '#ea580c' }]}>
                            {isOffer ? '● ' : '● '}{post.type.toUpperCase()} · {(catObj?.label || post.category).toUpperCase()}
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
                    <Text style={styles.priceValue}>{post.credits} <Text style={styles.priceCurrency}>B{
                        { fixed: '', hourly: ' / Hr', daily: ' / d', weekly: ' / w', monthly: ' / m' }[post.price_type as string] || ''
                    }</Text></Text>
                </View>

                {/* Author Card */}
                <View style={styles.authorCard}>
                    <Text style={styles.authorCardLabel}>POSTED BY</Text>
                    <View style={styles.authorRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarLetter}>{cardAuthor.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.authorInfo}>
                            <Text style={styles.authorName}>🤠 {cardAuthor}</Text>
                            <Text style={styles.authorRating}>
                                {authorAvgRating !== null && authorRatingCount > 0 
                                    ? renderBeans(authorAvgRating) + ` (${authorAvgRating.toFixed(1)}) • ${authorRatingCount} Reviews`
                                    : '☆☆☆☆☆ No ratings yet'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Action Buttons */}

                {/* 1. Pending Escrow State (Applies to both Payer and Payee) */}
                {post.status === 'pending' && (isPayer || isPayee) && (
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
                                            <View style={{ marginBottom: 12 }}>
                                                <Text style={styles.confirmBoxLabel}>ACTUAL {
                                                    { hourly: 'HOURS', daily: 'DAYS', weekly: 'WEEKS', monthly: 'MONTHS' }[post.price_type as string] || 'UNITS'
                                                } WORKED</Text>
                                                <TextInput style={styles.confirmBoxInput} value={completeHours} onChangeText={setCompleteHours} keyboardType="numeric" placeholder="e.g. 2.5" placeholderTextColor="#9ca3af" />
                                            </View>
                                        )}
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <Pressable style={styles.cancelActionBtn} onPress={() => setShowCompleteConfirm(false)} disabled={accepting}>
                                                <Text style={styles.cancelActionBtnText}>Cancel</Text>
                                            </Pressable>
                                            <Pressable style={[styles.confirmActionBtn, styles.confirmActionBtnGreen]} disabled={accepting || (post.price_type !== 'fixed' && !completeHours)} onPress={async () => {
                                                if (!identity || !post.pending_transaction_id) return;
                                                setAccepting(true);
                                                try {
                                                    await completeMarketplaceTransaction(post.pending_transaction_id, identity.publicKey, post.price_type !== 'fixed' ? Number(completeHours) : undefined);
                                                    setShowCompleteConfirm(false);
                                                    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market');
                                                } catch(e: any) { Alert.alert('Error', e.message); } finally { setAccepting(false); }
                                            }}>
                                                <Text style={styles.confirmActionBtnText}>{accepting ? 'Processing...' : 'Release Credits'}</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                ) : (
                                    <Pressable style={[styles.acceptBtn, styles.acceptBtnOffer]} onPress={() => { setShowCompleteConfirm(true); if(post.price_type !== 'fixed' && !completeHours) setCompleteHours('1'); }}>
                                        <Text style={styles.acceptBtnText}>✅ Release Credits</Text>
                                    </Pressable>
                                )}
                            </>
                        ) : (
                            <>
                                <Text style={{ color: '#f59e0b', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 8, marginBottom: 8 }}>
                                    ⏳ Pending Release by {targetPeerCallsign}
                                </Text>
                                <Text style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', marginBottom: 16, paddingHorizontal: 16 }}>
                                    You are the Payee. Fulfill the terms exactly as agreed, and the Payer will release your credits.
                                </Text>
                            </>
                        )}
                        
                        <Pressable style={styles.cancelTxBtn} disabled={accepting} onPress={() => {
                            Alert.alert('Cancel Transaction', 'Return post to the market?', [
                                { text: 'No', style: 'cancel' },
                                { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
                                    if(!identity || !post.pending_transaction_id) return;
                                    setAccepting(true);
                                    try {
                                        await cancelMarketplaceTransaction(post.pending_transaction_id, identity.publicKey);
                                        if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market');
                                    } catch(e:any) { Alert.alert('Error', e.message); } finally { setAccepting(false); }
                                }}
                            ]);
                        }}>
                            <Text style={styles.cancelTxBtnText}>❌ Cancel Escrow</Text>
                        </Pressable>
                    </View>
                )}

                {/* 2. Own Active Posts (Edit / Delete) */}
                {isOwnPost && post.status !== 'pending' && (
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
                                }} style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, justifyContent: 'center' }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' }}>{
                                        { fixed: 'Total', hourly: '/ Hr', daily: '/ d', weekly: '/ w', monthly: '/ m' }[editPriceType] || 'Total'
                                    }</Text>
                                </Pressable>
                            </View>

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
                                <Text style={styles.confirmBoxTitle}>⏳ Requested (Waiting for Author)</Text>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                                    You have offered {myRequest.credits} credits {myRequest.hours ? `(${myRequest.hours} hours)` : ''} for this post.
                                </Text>
                                <Pressable style={[styles.cancelActionBtn, { width: '100%' }]} onPress={handleWithdraw} disabled={accepting}>
                                    <Text style={styles.cancelActionBtnText}>{accepting ? 'Withdrawing...' : 'Withdraw Request'}</Text>
                                </Pressable>
                            </View>
                        ) : showAcceptConfirm ? (
                            <View style={styles.confirmBox}>
                                <Text style={styles.confirmBoxTitle}>{isOffer ? 'Accept this Offer?' : 'Request to Fulfill?'}</Text>
                                {post.price_type !== 'fixed' && (
                                    <View style={{ marginBottom: 12 }}>
                                        <Text style={styles.confirmBoxLabel}>ESTIMATED {
                                            { hourly: 'HOURS', daily: 'DAYS', weekly: 'WEEKS', monthly: 'MONTHS' }[post.price_type as string] || 'UNITS'
                                        }</Text>
                                        <TextInput style={styles.confirmBoxInput} value={acceptHours} onChangeText={setAcceptHours} keyboardType="numeric" placeholder="1" placeholderTextColor="#9ca3af" />
                                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textAlign: 'center', marginTop: 4 }}>Credits will be required upon approval.</Text>
                                    </View>
                                )}
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <Pressable style={styles.cancelActionBtn} onPress={() => setShowAcceptConfirm(false)} disabled={accepting}>
                                        <Text style={styles.cancelActionBtnText}>Cancel</Text>
                                    </Pressable>
                                    <Pressable style={[styles.confirmActionBtn, styles.confirmActionBtnGreen]} disabled={accepting || (post.price_type !== 'fixed' && !acceptHours)} onPress={async () => {
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
                                                    id: crypto.randomUUID(), post_id: post.id, buyer_pubkey: identity.publicKey, seller_pubkey: post.author_pubkey,
                                                    credits: post.price_type === 'fixed' ? post.credits : post.credits * Number(acceptHours),
                                                    hours: post.price_type === 'fixed' ? null : Number(acceptHours), status: 'requested'
                                                }]);
                                            }
                                        } catch (e: any) { Alert.alert('Error', e.message); } finally { setAccepting(false); }
                                    }}>
                                        <Text style={styles.confirmActionBtnText}>{accepting ? 'Processing...' : (isOffer ? 'Confirm Acceptance' : 'Confirm Bid')}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ) : (
                            <Pressable style={[styles.acceptBtn, isOffer ? styles.acceptBtnOffer : styles.acceptBtnNeed, (accepting || post.status === 'pending') && { opacity: 0.6 }]} disabled={accepting || post.status === 'pending'} onPress={() => setShowAcceptConfirm(true)}>
                                <Text style={styles.acceptBtnText}>
                                    {accepting ? 'Processing...' : (post.status === 'pending' ? '⏳ Pending Confirmation' : (isOffer ? '🤝 Accept Offer' : '✋ Request to Fulfill'))}
                                </Text>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* 3.5 Author Requests Display */}
                {isOwnPost && post.status === 'active' && requests.length > 0 && (
                    <View style={styles.requestsContainer}>
                        <Text style={styles.requestsTitle}>Inbound Bids ({requests.length})</Text>
                        {requests.map(req => (
                            <View key={req.id} style={styles.requestCard}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.requestName}>{req.buyer_pubkey.slice(0, 8)}</Text>
                                  <Text style={styles.requestAmt}>{req.credits} Credits {req.hours ? `(${req.hours}h)` : ''}</Text>
                                </View>
                                <View style={{flexDirection: 'row', gap: 8}}>
                                    <Pressable style={[styles.approveBtn, accepting && {opacity: 0.5}]} disabled={accepting} onPress={() => handleApprove(req.id)}>
                                        <Text style={styles.approveBtnText}>Approve</Text>
                                    </Pressable>
                                    <Pressable style={[styles.rejectBtn, accepting && {opacity: 0.5}]} disabled={accepting} onPress={() => handleReject(req.id)}>
                                        <Text style={styles.rejectBtnText}>✕</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* 4. Universal Actions for Peer (Message, Rate, Report) */}
                {!isOwnPost && (
                    <View style={[styles.otherPostActions, { marginTop: post.status === 'pending' || post.status === 'active' ? 10 : 0 }]}>
                        <Pressable style={styles.messageBtn} onPress={() => {
                            router.push({ pathname: '/(tabs)/chats', params: { callsign: cardAuthor } });
                        }}>
                            <Text style={styles.messageBtnText}>💬 Message</Text>
                        </Pressable>
                        
                        {identity && post.status === 'completed' && post.pending_transaction_id && (
                            <View style={{ marginTop: 16 }}>
                                <Pressable style={[styles.messageBtn, { borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.05)' }]} onPress={() => setShowRatingForm(!showRatingForm)}>
                                    <Text style={[styles.messageBtnText, { color: '#f59e0b' }]}>🫘 Rate {post.author_callsign || 'Author'}</Text>
                                </Pressable>
                                {showRatingForm && (
                                    <View style={[styles.confirmBox, { marginTop: 8 }]}>
                                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                                            {[1,2,3,4,5].map(star => (
                                                <Pressable key={star} onPress={() => setMyRating(star)}>
                                                    <Text style={{ fontSize: 32, color: star <= myRating ? '#fbbf24' : 'rgba(255,255,255,0.2)' }}>{star <= myRating ? '🫘' : '○'}</Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                        <TextInput style={[styles.confirmBoxInput, { height: 60, textAlign: 'left', textAlignVertical: 'top' }]} value={ratingComment} onChangeText={setRatingComment} placeholder="Leave a comment (optional)..." placeholderTextColor="#9ca3af" multiline />
                                        <Pressable style={[styles.confirmActionBtn, { backgroundColor: myRating >= 1 ? '#f59e0b' : 'rgba(255,255,255,0.2)' }]} disabled={myRating < 1 || submittingRating} onPress={async () => {
                                            try {
                                                setSubmittingRating(true);
                                                await submitRating(identity.publicKey, post.author_pubkey, myRating, ratingComment, post.pending_transaction_id);
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
                                <Pressable style={[styles.confirmActionBtn, { backgroundColor: reportReason ? '#ef4444' : 'rgba(255,255,255,0.2)' }]} disabled={!reportReason || submittingReport} onPress={async () => {
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
        </SafeAreaView>
    );
}

function renderBeans(rating: number): string {
    const r = Math.round(rating) || 0;
    return '🫘'.repeat(Math.min(r, 5)) + '○'.repeat(Math.max(0, 5 - r));
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
    container: { flex: 1, backgroundColor: '#1e261e' },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#1e261e' },
    errorText: { color: '#9ca3af', fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 24 },
    closeBtn: { backgroundColor: '#d97757', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
    closeBtnText: { color: '#fff', fontWeight: 'bold' },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    backText: { color: '#fff', fontSize: 24 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', letterSpacing: 1, textTransform: 'uppercase' },

    scroll: { paddingBottom: 60 },

    // Type Badge
    typeBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
    catBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    catEmoji: { fontSize: 20 },
    catLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
    timeAgo: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },

    // Title & Description
    postTitle: { color: '#fff', fontSize: 24, fontWeight: '800', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    description: { color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 22, paddingHorizontal: 20, paddingBottom: 16 },

    // Photos
    photosScroll: { paddingLeft: 20, marginBottom: 16 },
    photoImage: { width: 160, height: 120, borderRadius: 12, marginRight: 10, backgroundColor: 'rgba(255,255,255,0.1)' },

    // Price Card
    priceCard: { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingVertical: 20, alignItems: 'center', marginBottom: 16 },
    priceLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
    priceValue: { color: '#fff', fontSize: 36, fontWeight: '800' },
    priceCurrency: { fontSize: 20, fontWeight: '500', color: 'rgba(255,255,255,0.5)' },

    // Author Card
    authorCard: { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 16, marginBottom: 20 },
    authorCardLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
    authorRow: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(217,119,87,0.2)', justifyContent: 'center', alignItems: 'center' },
    avatarLetter: { color: '#d97757', fontSize: 20, fontWeight: 'bold' },
    authorInfo: { marginLeft: 12 },
    authorName: { color: '#fff', fontSize: 16, fontWeight: '700' },
    authorRating: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },

    // Own Post Actions
    ownPostActions: { paddingHorizontal: 20, gap: 10 },
    editPostBtn: { backgroundColor: '#d97757', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    editPostBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    deletePostBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(239,68,68,0.4)' },
    deletePostBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },

    // Other's Post Actions
    otherPostActions: { paddingHorizontal: 20, gap: 10 },
    messageBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
    messageBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    acceptBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    acceptBtnOffer: { backgroundColor: '#10b981' },
    acceptBtnNeed: { backgroundColor: '#ea580c' },
    acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    // Edit Section
    editSection: { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 16 },
    editSectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 16 },
    editTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    editTypeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
    editTypeBtnOffer: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    editTypeBtnNeed: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
    editTypeBtnText: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
    editTypeBtnTextActive: { color: '#fff' },
    editPickerWrap: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', marginBottom: 10, overflow: 'hidden' },
    editPicker: { color: '#fff', height: 50 },
    editInput: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, marginBottom: 10 },
    editPhotoLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    editPhotosRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
    editPhotoThumb: { width: 60, height: 60, borderRadius: 12, overflow: 'hidden', position: 'relative' },
    editPhotoImg: { width: 60, height: 60, borderRadius: 12 },
    editPhotoRemove: { position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center' },
    editPhotoRemoveText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    editPhotoAdd: { width: 60, height: 60, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
    editPhotoAddIcon: { color: 'rgba(255,255,255,0.4)', fontSize: 26 },
    editBtnRow: { flexDirection: 'row', gap: 10 },
    editCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center' },
    editCancelBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '700' },
    editSaveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#d97757', alignItems: 'center' },
    editSaveBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.1)' },
    editSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    // Transaction Logic Components
    confirmBox: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    confirmBoxTitle: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
    confirmBoxLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
    confirmBoxInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
    cancelActionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    cancelActionBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700' },
    confirmActionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    confirmActionBtnGreen: { backgroundColor: '#10b981' },
    confirmActionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    cancelTxBtn: { marginTop: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    cancelTxBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
    requestsContainer: {
        marginTop: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)'
    },
    requestsTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12
    },
    requestCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8
    },
    requestName: {
        color: '#fff',
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
        backgroundColor: 'rgba(239,68,68,0.2)',
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
