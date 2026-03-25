import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, Image } from 'react-native';
import { getDb } from '../../utils/db'; // Will query local mock array mapped to PWA layout

type SubView = 'friends' | 'community' | 'invites' | 'guardians';

export default function PeopleScreen() {
    const [view, setView] = useState<SubView>('friends');
    const [members, setMembers] = useState<any[]>([]);

    useEffect(() => {
        if (view === 'community') loadMembers();
    }, [view]);

    const loadMembers = async () => {
        try {
            const database = await getDb();
            const rows = await database.getAllAsync('SELECT * FROM members ORDER BY joined_at DESC');
            setMembers(rows);
        } catch (e) {
            console.error(e);
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
                                {v === 'invites' && '🎟️ Invites'}
                                {v === 'guardians' && '🛡️ Guardians'}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* Views */}
            {view === 'friends' && (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>👫</Text>
                    <Text style={styles.emptyTitle}>No friends yet</Text>
                    <Text style={styles.emptyDesc}>Go to Community to browse members and add friends.</Text>
                </View>
            )}

            {view === 'community' && (
                <FlatList
                    data={members}
                    keyExtractor={item => item.public_key}
                    contentContainerStyle={styles.list}
                    ListHeaderComponent={
                        <View style={styles.infoBanner}>
                            <Text style={styles.infoText}>
                                All members on this node. Tap <Text style={styles.boldGreen}>+ Add</Text> to add someone as a friend.
                            </Text>
                        </View>
                    }
                    ListEmptyComponent={
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Text style={{ color: '#9ca3af' }}>Loading community...</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <View style={styles.avatar}>
                                    {item.avatar_url ? (
                                        <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                                    ) : (
                                        <Text style={styles.avatarEmoji}>👤</Text>
                                    )}
                                </View>
                                <View style={styles.textStack}>
                                    <Text style={styles.callsign}>{item.callsign}</Text>
                                    <Text style={styles.dateText}>Joined recently</Text>
                                </View>
                            </View>
                            <Pressable style={styles.addBtn}>
                                <Text style={styles.addBtnText}>+ Add</Text>
                            </Pressable>
                        </View>
                    )}
                />
            )}

            {view === 'invites' && (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>🎟️</Text>
                    <Text style={styles.emptyTitle}>Invite friends</Text>
                    <Text style={styles.emptyDesc}>Generates local node invitation links over LAN via offline libp2p.</Text>
                </View>
            )}

            {view === 'guardians' && (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>🛡️</Text>
                    <Text style={styles.emptyTitle}>Social Recovery Ready</Text>
                    <Text style={styles.emptyDesc}>Add some friends first, then come back here to choose your guardians.</Text>
                </View>
            )}

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
    addBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 }
});
