import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, Platform } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIdentity } from '../IdentityContext';
import { getConversations } from '../../utils/db';

export default function ChatsScreen() {
    const { identity } = useIdentity();
    const [conversations, setConversations] = useState<any[]>([]);

    useFocusEffect(
        React.useCallback(() => {
            if (identity?.publicKey) {
                getConversations(identity.publicKey).then(setConversations).catch(console.error);
            }
        }, [identity])
    );

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
            <View style={styles.header}>
                <Text style={styles.title}>Messages</Text>
                <Pressable style={styles.newChatBtn} onPress={() => {
                    if (Platform.OS === 'web') {
                        const val = window.prompt("Enter PubKey or Callsign:");
                        if (val) router.push(`/chat/${val}`);
                    } else {
                        import('react-native').then(({ Alert }) => {
                            Alert.prompt(
                                "New Message",
                                "Enter the PubKey or Callsign of the user:",
                                [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Chat", onPress: (val) => {
                                        if (val) router.push(`/chat/${val}`)
                                    }}
                                ]
                            );
                        });
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
    emptyText: { marginTop: 16, fontSize: 15, color: '#9ca3af', fontWeight: '500' }
});
