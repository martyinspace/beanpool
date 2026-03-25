import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, SafeAreaView, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { getPost, updatePost, deletePost } from '../../utils/db';
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
    const [editPriceType, setEditPriceType] = useState<'fixed' | 'hourly'>('fixed');
    const [editPhotos, setEditPhotos] = useState<string[]>([]);

    useEffect(() => {
        if (id) { getPost(id as string).then(setPost); }
    }, [id]);

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
                    <Text style={styles.priceValue}>{post.credits} <Text style={styles.priceCurrency}>B{post.price_type === 'hourly' ? ' /Hr' : ''}</Text></Text>
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
                            <Text style={styles.authorRating}>☆☆☆☆☆ No ratings yet</Text>
                        </View>
                    </View>
                </View>

                {/* Action Buttons */}
                {isOwnPost ? (
                    // =================== OWN POST ===================
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
                                <Pressable onPress={() => setEditPriceType(editPriceType === 'fixed' ? 'hourly' : 'fixed')} style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, justifyContent: 'center' }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' }}>{editPriceType === 'fixed' ? 'Total' : '/ Hr'}</Text>
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
                ) : (
                    // =================== OTHER'S POST ===================
                    <View style={styles.otherPostActions}>
                        <Pressable style={styles.messageBtn} onPress={() => {
                            router.push({ pathname: '/(tabs)/chats', params: { callsign: cardAuthor } });
                        }}>
                            <Text style={styles.messageBtnText}>💬 Message</Text>
                        </Pressable>
                        <Pressable style={[styles.acceptBtn, isOffer ? styles.acceptBtnOffer : styles.acceptBtnNeed]}>
                            <Text style={styles.acceptBtnText}>
                                {isOffer ? '🤝 Accept Offer' : '🤝 Fulfill Need'}
                            </Text>
                        </Pressable>
                    </View>
                )}
            </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
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
});
