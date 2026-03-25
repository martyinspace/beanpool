import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useIdentity } from '../IdentityContext';
import { getMessages, getConversation, insertMessage } from '../../utils/db';

export default function ChatScreen() {
    const { id } = useLocalSearchParams();
    const { identity } = useIdentity();
    const [messages, setMessages] = useState<any[]>([]);
    const [draft, setDraft] = useState('');
    const [peerName, setPeerName] = useState('Loading...');
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();

    useFocusEffect(
        useCallback(() => {
            if (id) {
                getConversation(id as string).then(res => setPeerName(res?.name || String(id).slice(0, 8)));
                loadMessages();
            }
        }, [id])
    );

    const loadMessages = async () => {
        const data = await getMessages(id as string);
        setMessages(data);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const handleSend = async () => {
        if (!draft.trim() || !identity?.publicKey) return;
        
        try {
            await insertMessage(id as string, identity.publicKey, draft.trim());
            setDraft('');
            loadMessages();
        } catch (err: any) {
            Alert.alert("Message Failed", err.message || "Could not execute send.");
        }
    };

    const renderMessage = ({ item }: { item: any }) => {
        const isMe = identity?.publicKey ? item.senderId === identity.publicKey : false;
        return (
            <View style={[styles.messageBubble, isMe ? styles.messageMe : styles.messageOther]}>
                <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>
                    {item.text}
                </Text>
                <Text style={[styles.messageTime, isMe ? styles.messageTimeMe : styles.messageTimeOther]}>
                    {item.timestamp}
                </Text>
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
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>{peerName.toUpperCase()}</Text>
                    <Text style={styles.headerSubtitle}>Connected via Mullum Node</Text>
                </View>
                <Pressable style={styles.moreButton}>
                    <MaterialCommunityIcons name="dots-horizontal" size={28} color="#6b7280" />
                </Pressable>
            </View>

            <KeyboardAvoidingView 
                style={styles.keyboardView} 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                {/* Messages List */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={item => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                />

                {/* Input Area */}
                <View style={[styles.inputContainer, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 12) : 12 }]}>
                    <Pressable style={styles.attachBtn}>
                        <MaterialCommunityIcons name="plus-circle-outline" size={26} color="#9ca3af" />
                    </Pressable>
                    <TextInput
                        style={styles.input}
                        placeholder="Secure message..."
                        placeholderTextColor="#9ca3af"
                        value={draft}
                        onChangeText={setDraft}
                        multiline
                    />
                    <Pressable 
                        style={[styles.sendBtn, draft.trim().length > 0 ? styles.sendBtnActive : styles.sendBtnInactive]} 
                        onPress={handleSend}
                    >
                        <MaterialCommunityIcons name="send" size={20} color={draft.trim().length > 0 ? '#fff' : '#9ca3af'} />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: '#1f2937', letterSpacing: 0.5 },
    headerSubtitle: { fontSize: 11, color: '#10b981', fontWeight: '600', marginTop: 2 },
    moreButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
    keyboardView: { flex: 1 },
    listContent: { padding: 16, gap: 12 },
    messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 20 },
    messageMe: { backgroundColor: '#8b5cf6', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
    messageOther: { backgroundColor: '#f3f4f6', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
    messageText: { fontSize: 16, lineHeight: 22 },
    messageTextMe: { color: '#ffffff' },
    messageTextOther: { color: '#1f2937' },
    messageTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
    messageTimeMe: { color: 'rgba(255, 255, 255, 0.7)' },
    messageTimeOther: { color: '#9ca3af' },
    inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#ffffff' },
    attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    input: { flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16, maxHeight: 100, minHeight: 44, color: '#1f2937' },
    sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8, marginBottom: 4 },
    sendBtnActive: { backgroundColor: '#8b5cf6' },
    sendBtnInactive: { backgroundColor: '#f3f4f6' }
});
