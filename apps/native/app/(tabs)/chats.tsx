import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, Platform, Modal, TextInput, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIdentity } from '../IdentityContext';
import { getConversations, createConversationApi, syncMessages } from '../../utils/db';

export default function ChatsScreen() {
    const { identity } = useIdentity();
    const [conversations, setConversations] = useState<any[]>([]);
    const [showPrompt, setShowPrompt] = useState(false);
    const [promptVal, setPromptVal] = useState('');
    const [members, setMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useFocusEffect(
        React.useCallback(() => {
            if (identity?.publicKey) {
                getConversations(identity.publicKey).then(setConversations).catch(console.error);
                
                // Background sync messages
                syncMessages(identity.publicKey).then(() => {
                    getConversations(identity.publicKey).then(setConversations).catch(console.error);
                });
            }
        }, [identity])
    );

    const loadDirectory = async () => {
        setLoadingMembers(true);
        setShowPrompt(true);
        try {
            const anchor = await AsyncStorage.getItem('beanpool_anchor_url');
            if (anchor) {
                const res = await fetch(`${anchor}/api/members`);
                if (res.ok) {
                    const data = await res.json();
                    setMembers(data.filter((m: any) => m.publicKey !== identity?.publicKey));
                }
            }
        } catch (e) {
            console.warn("Could not load directory", e);
        } finally {
            setLoadingMembers(false);
        }
    };

    const handleCreateChat = async (pubKeyInput?: string) => {
        const target = (pubKeyInput || promptVal).trim();
        if (!target || !identity?.publicKey) return;
        
        setSubmitting(true);
        try {
            const apiConv = await createConversationApi('dm', [identity.publicKey, target], identity.publicKey);
            
            setShowPrompt(false);
            setPromptVal('');
            router.push(`/chat/${apiConv.id}`);
            
            // Refresh conversation list underneath
            getConversations(identity.publicKey).then(setConversations).catch(console.error);
        } catch (e: any) {
            Alert.alert("Failed", e.message || "Could not initialize thread on node.");
        } finally {
            setSubmitting(false);
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <Pressable 
            style={styles.chatRow}
            onPress={() => router.push(`/chat/${item.id}`)}
        >
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.peer.charAt(0)}</Text>
            </View>
            <View style={styles.chatDetails}>
                <View style={styles.chatHeader}>
                    <Text style={[styles.peerName, item.unread > 0 && styles.peerNameUnread]}>{item.peer}</Text>
                    <Text style={[styles.timestamp, item.unread > 0 && styles.timestampUnread]}>{item.timestamp}</Text>
                </View>
                <View style={styles.messageRow}>
                    <Text style={[styles.lastMessage, item.unread > 0 && styles.lastMessageUnread]} numberOfLines={1}>
                        {item.lastMessage}
                    </Text>
                    {item.unread > 0 && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadCount}>{item.unread}</Text>
                        </View>
                    )}
                </View>
            </View>
        </Pressable>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={[styles.header, { justifyContent: 'flex-end', borderBottomWidth: 0, paddingBottom: 8 }]}>
                <Pressable style={styles.newChatBtn} onPress={() => {
                    if (Platform.OS === 'web') {
                        const val = window.prompt("Enter PubKey or Callsign:");
                        if (val) router.push(`/chat/${val}`);
                    } else {
                        loadDirectory();
                    }
                }}>
                    <MaterialCommunityIcons name="pencil-outline" size={24} color="#8b5cf6" />
                </Pressable>
            </View>

            <FlatList
                data={conversations}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <MaterialCommunityIcons name="message-outline" size={48} color="#d1d5db" />
                        <Text style={styles.emptyText}>No active P2P connections found.</Text>
                    </View>
                }
            />

            <Modal visible={showPrompt} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>New Message</Text>
                        
                        {loadingMembers ? (
                            <ActivityIndicator size="small" color="#8b5cf6" style={{ marginVertical: 20 }} />
                        ) : members.length > 0 ? (
                            <ScrollView style={styles.directoryList} nestedScrollEnabled>
                                {members.map(m => (
                                    <Pressable 
                                        key={m.publicKey} 
                                        style={styles.directoryRow}
                                        onPress={() => handleCreateChat(m.publicKey)}
                                    >
                                        <View style={styles.directoryAvatar}>
                                            <Text style={styles.directoryAvatarText}>{m.callsign.charAt(0).toUpperCase()}</Text>
                                        </View>
                                        <Text style={styles.directoryName}>{m.callsign}</Text>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        ) : (
                            <Text style={styles.modalSubtitle}>No members found on grid. Enter a PubKey string directly below to bypass.</Text>
                        )}
                        
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Or enter specific PubKey..."
                            placeholderTextColor="#9ca3af"
                            value={promptVal}
                            onChangeText={setPromptVal}
                        />
                        
                        <View style={styles.modalActions}>
                            <Pressable style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => { setShowPrompt(false); setPromptVal(''); }}>
                                <Text style={styles.modalBtnCancelText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={[styles.modalBtn, styles.modalBtnSubmit]} onPress={() => handleCreateChat()}>
                                <Text style={styles.modalBtnSubmitText}>Chat</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    title: { fontSize: 32, fontWeight: '800', color: '#1f2937', letterSpacing: -0.5 },
    newChatBtn: { padding: 8, backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 12 },
    list: { paddingBottom: 100 },
    chatRow: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f9fafb', alignItems: 'center' },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    avatarText: { fontSize: 20, fontWeight: 'bold', color: '#6b7280' },
    chatDetails: { flex: 1 },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    peerName: { fontSize: 16, fontWeight: '600', color: '#374151' },
    peerNameUnread: { color: '#111827', fontWeight: '800' },
    timestamp: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
    timestampUnread: { color: '#8b5cf6', fontWeight: '700' },
    messageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    lastMessage: { fontSize: 15, color: '#6b7280', flex: 1, paddingRight: 16 },
    lastMessageUnread: { color: '#111827', fontWeight: '600' },
    unreadBadge: { backgroundColor: '#8b5cf6', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    unreadCount: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 100 },
    emptyText: { marginTop: 16, fontSize: 15, color: '#9ca3af', fontWeight: '500' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: '100%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#1f2937', marginBottom: 12 },
    modalSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 18 },
    directoryList: { maxHeight: 250, marginBottom: 16 },
    directoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    directoryAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    directoryAvatarText: { fontSize: 16, fontWeight: 'bold', color: '#6b7280' },
    directoryName: { fontSize: 16, fontWeight: '600', color: '#374151' },
    modalInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, fontSize: 16, color: '#1f2937', marginBottom: 24 },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    modalBtnCancel: { backgroundColor: '#f3f4f6' },
    modalBtnCancelText: { color: '#4b5563', fontSize: 16, fontWeight: '600' },
    modalBtnSubmit: { backgroundColor: '#8b5cf6' },
    modalBtnSubmitText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
