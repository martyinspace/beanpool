import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, SafeAreaView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getPost } from '../../utils/db';
import { StatusBar } from 'expo-status-bar';

// Mirroring PWA Emoji Categories structurally
const EMOJI_MAP: Record<string, string> = {
    food: '🍎',
    tools: '🔨',
    goods: '📦',
    services: '🛠️'
};

export default function PostDetailModal() {
    const { id } = useLocalSearchParams();
    const [post, setPost] = useState<any>(null);
    
    // In Phase 4, this queries SQLite directly via Libp2p hashes.
    React.useEffect(() => {
        if (id) {
            getPost(id as string).then(setPost);
        }
    }, [id]);

    if (!post) {
        return (
            <SafeAreaView style={styles.errorContainer}>
                <Text style={styles.errorText}>Post not found. It may have been expired by the Network.</Text>
                <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market'); }} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>Return to Map</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    const emoji = EMOJI_MAP[post.category] || '📦';
    const isOffer = post.type === 'offer';
    
    let coverImage = null;
    if (post.photos) {
        try {
            const arr = JSON.parse(post.photos);
            if (arr.length > 0) coverImage = arr[0];
        } catch {}
    }
    
    const cardAuthor = post.author_callsign || post.author_pubkey?.slice(0, 6) || 'Unknown';

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            <View style={styles.header}>
                <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/market'); }} style={styles.backButton}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#111827" />
                </Pressable>
                <Text style={styles.headerTitle}>{isOffer ? 'Offer' : 'Need'}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                {coverImage ? (
                    <View style={styles.imageContainer}>
                        <Image source={{ uri: coverImage }} style={styles.image} />
                        <View style={styles.priceOverlay}>
                            <Text style={styles.priceString}>{post.credits} <Text style={styles.priceExt}>B</Text></Text>
                        </View>
                    </View>
                ) : (
                    <View style={styles.fallbackImage}>
                        <Text style={styles.fallbackEmoji}>{emoji}</Text>
                        <View style={styles.priceOverlay}>
                            <Text style={styles.priceString}>{post.credits} <Text style={styles.priceExt}>B</Text></Text>
                        </View>
                    </View>
                )}

                <View style={styles.body}>
                    <View style={styles.authorRow}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarLetter}>{cardAuthor.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.authorInfo}>
                            <Text style={styles.authorName}>{cardAuthor.toUpperCase()}</Text>
                            <Text style={styles.postTitle}>{post.title}</Text>
                        </View>
                        <View style={styles.categoryBadge}>
                            <Text style={styles.emojiText}>{emoji}</Text>
                        </View>
                    </View>

                    <Text style={styles.description}>
                        {post.description || "No description provided by the peer."}
                    </Text>

                    <Pressable 
                        style={[styles.actionBtn, isOffer ? styles.offerBtn : styles.needBtn]}
                        onPress={() => {
                            router.push({
                                pathname: '/(tabs)/chats',
                                params: { callsign: cardAuthor }
                            });
                        }}
                    >
                        <MaterialCommunityIcons name="message-text-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.actionBtnText}>
                            MESSAGE {cardAuthor.toUpperCase()}
                        </Text>
                    </Pressable>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    errorText: { color: '#6b7280', fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 24 },
    closeBtn: { backgroundColor: '#111827', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
    closeBtnText: { color: '#fff', fontWeight: 'bold' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', letterSpacing: 1, textTransform: 'uppercase' },
    scroll: { paddingBottom: 40 },
    imageContainer: { width: '100%', height: 320, position: 'relative' },
    image: { width: '100%', height: '100%', resizeMode: 'cover' },
    fallbackImage: { width: '100%', height: 250, backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    fallbackEmoji: { fontSize: 72, opacity: 0.2 },
    priceOverlay: { position: 'absolute', bottom: 16, right: 16, backgroundColor: 'rgba(17, 24, 39, 0.9)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 },
    priceString: { color: '#fff', fontSize: 24, fontWeight: 'bold', letterSpacing: -0.5 },
    priceExt: { fontSize: 14, fontWeight: '500', opacity: 0.8 },
    body: { padding: 20 },
    authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffe4e6', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }, // terra-100 equivalent
    avatarLetter: { color: '#e11d48', fontSize: 20, fontWeight: 'bold' }, // terra-700
    authorInfo: { flex: 1, marginLeft: 12 },
    authorName: { color: '#6b7280', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
    postTitle: { color: '#111827', fontSize: 20, fontWeight: 'bold', marginTop: 2 },
    categoryBadge: { backgroundColor: '#f3f4f6', padding: 8, borderRadius: 12 },
    emojiText: { fontSize: 20 },
    description: { color: '#374151', fontSize: 16, lineHeight: 26, marginBottom: 32 },
    actionBtn: { flexDirection: 'row', width: '100%', paddingVertical: 16, borderRadius: 14, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
    offerBtn: { backgroundColor: '#e11d48' }, // terra-600 logic
    needBtn: { backgroundColor: '#111827' },
    actionBtnText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 }
});
