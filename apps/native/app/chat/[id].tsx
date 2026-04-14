import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useIdentity } from '../IdentityContext';
import { getMessages, getConversation, insertMessage, syncMessages, syncSingleConversation, markConversationRead } from '../../utils/db';

export default function ChatScreen() {
    const { id } = useLocalSearchParams();
    const { identity } = useIdentity();
    const [messages, setMessages] = useState<any[]>([]);
    const [draft, setDraft] = useState('');
    const [peerName, setPeerName] = useState('Loading...');
    const [postContext, setPostContext] = useState<any>(null);
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();

    useFocusEffect(
        useCallback(() => {
            let interval: ReturnType<typeof setInterval>;
            
            const loadConversationData = async () => {
                if (id && identity?.publicKey) {
                    const res = await getConversation(id as string, identity.publicKey);
                    if (res) {
                        setPeerName(res.name || res.otherCallsign || String(id).slice(0, 8));
                        if (res.postId) {
                            setPostContext({
                                id: res.postId,
                                title: res.postTitle,
                                status: res.postStatus,
                                priceType: res.price_type,
                                credits: res.credits
                            });
                        }
                    } else {
                        setPeerName(String(id).slice(0, 8));
                    }
                }
            };

            if (id && identity?.publicKey) {
                // Initial Load
                loadConversationData();
                loadMessages().then(() => {
                    syncMessages(identity!.publicKey).then(() => {
                        loadConversationData();
                        loadMessages(true);
                    });
                });
                
                // Background Poll
                interval = setInterval(() => {
                    syncSingleConversation(id as string).then(() => {
                        loadConversationData();
                        loadMessages(true);
                    });
                }, 3000);
            }
            return () => {
                if (interval) clearInterval(interval);
            };
        }, [id, identity])
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
        
        try {
            await insertMessage(id as string, identity.publicKey, draft.trim());
            setDraft('');
            loadMessages();
        } catch (err: any) {
            Alert.alert("Message Failed", err.message || "Could not execute send.");
        }
    };

    const renderMessage = ({ item }: { item: any }) => {
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
                    
                    {/* Inline Hard Links based on Object Metadata */}
                    {item.systemType === 'ESCROW_FUNDED' && item.metadata?.postId && (
                        <Pressable 
                            style={styles.systemActionBtn}
                            onPress={() => router.push(`/post/${item.metadata.postId}`)}
                        >
                            <MaterialCommunityIcons name="tag-outline" size={14} color="#10b981" style={{ marginRight: 4 }} />
                            <Text style={styles.systemActionText}>View Post</Text>
                        </Pressable>
                    )}
                    
                    {item.systemType === 'ESCROW_RELEASED' && item.metadata?.postId && (
                        <Pressable 
                            style={[styles.systemActionBtn, { borderColor: '#f59e0b' }]}
                            onPress={() => console.log('Reviewing post: ' + item.metadata.postId)}
                        >
                            <MaterialCommunityIcons name="star-outline" size={14} color="#f59e0b" style={{ marginRight: 4 }} />
                            <Text style={[styles.systemActionText, { color: '#f59e0b' }]}>Rate your partner</Text>
                        </Pressable>
                    )}
                </View>
            );
        }

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

            {/* Sticky Marketplace Header */}
            {postContext && (
                <Pressable onPress={() => router.push(`/post/${postContext.id}`)} style={styles.stickyHeader}>
                    <View style={styles.stickyHeaderLeft}>
                        <MaterialCommunityIcons name="shopping-outline" size={24} color="#059669" />
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.stickyPostTitle} numberOfLines={1}>{postContext.title}</Text>
                            <Text style={styles.stickyPostCredits}>{postContext.credits} BP {postContext.priceType === 'hourly' ? '/ hr' : ''}</Text>
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
    stickyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ecfdf5', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
    stickyHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 },
    stickyPostTitle: { fontSize: 15, fontWeight: '700', color: '#065f46' },
    stickyPostCredits: { fontSize: 13, color: '#059669', fontWeight: '600', marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusBadgeText: { fontSize: 11, fontWeight: '800' },
    keyboardView: { flex: 1 },
    listContent: { padding: 16, gap: 12 },
    systemMessageContainer: { width: '100%', alignItems: 'center', marginVertical: 8 },
    systemMessageBubble: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
    systemMessageText: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
    systemActionBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#10b981' },
    systemActionText: { color: '#10b981', fontWeight: '700', fontSize: 12 },
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
