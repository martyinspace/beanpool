import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { getMemberProfile, getMemberRatings } from '../utils/db'; // Make sure these are exported correctly
import { useIdentity } from './IdentityContext';

export default function PublicProfileScreen() {
    const { publicKey, callsign } = useLocalSearchParams();
    const { identity } = useIdentity();
    
    const [profile, setProfile] = useState<any>(null);
    const [ratings, setRatings] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const pubKeyStr = Array.isArray(publicKey) ? publicKey[0] : publicKey;
    const callsignStr = Array.isArray(callsign) ? callsign[0] : callsign;

    useEffect(() => {
        if (!pubKeyStr) return;
        
        setLoading(true);
        Promise.all([
            getMemberProfile(pubKeyStr).catch(() => null),
            getMemberRatings(pubKeyStr).catch(() => null)
        ]).then(([prof, rat]) => {
            if (prof) setProfile(prof);
            if (rat) {
                setStats({ average: rat.average, count: rat.count, asProvider: rat.asProvider, asReceiver: rat.asReceiver });
                setRatings(rat.ratings || []);
            }
            setLoading(false);
        });
    }, [pubKeyStr]);

    const renderStars = (avg: number) => {
        const rounded = Math.round(avg || 0);
        return '🫘'.repeat(rounded) + '○'.repeat(5 - rounded);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>✕ Cancel</Text>
                </Pressable>
                <Text style={styles.headerTitle}>Trust Profile</Text>
                <View style={{ width: 60 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
                {/* Banner Profile */}
                <View style={styles.banner}>
                    {profile?.avatar ? (
                        <Image source={{ uri: profile.avatar }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarInitial}>{(callsignStr || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                    )}
                    <Text style={styles.callsignText}>{callsignStr} <Text style={{ color: '#10b981' }}>✓</Text></Text>
                    <Text style={styles.pubkeyText}>{pubKeyStr?.slice(0, 16)}...</Text>

                    {profile?.bio && (
                        <Text style={styles.bioText}>"{profile.bio}"</Text>
                    )}
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color="#fbbf24" style={{ marginTop: 40 }} />
                ) : (
                    <>
                        {/* Stats grid */}
                        {stats && stats.count > 0 && (
                            <View style={styles.statsGrid}>
                                <View style={[styles.statBox, { borderColor: '#404040' }]}>
                                    <Text style={styles.statIcon}>{renderStars(stats.average)}</Text>
                                    <Text style={styles.statValue}>{stats.average.toFixed(1)}</Text>
                                    <Text style={styles.statLabel}>Overall</Text>
                                </View>
                                <View style={[styles.statBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                                    <Text style={styles.statIcon}>📤</Text>
                                    <Text style={[styles.statValue, { color: '#34d399' }]}>{stats.asProvider?.average.toFixed(1) || '-'}</Text>
                                    <Text style={[styles.statLabel, { color: '#10b981' }]}>As Provider</Text>
                                </View>
                                <View style={[styles.statBox, { backgroundColor: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.3)' }]}>
                                    <Text style={styles.statIcon}>📥</Text>
                                    <Text style={[styles.statValue, { color: '#818cf8' }]}>{stats.asReceiver?.average.toFixed(1) || '-'}</Text>
                                    <Text style={[styles.statLabel, { color: '#6366f1' }]}>As Payer</Text>
                                </View>
                            </View>
                        )}

                        {/* Reviews list */}
                        <View style={styles.reviewsWrapper}>
                            <Text style={styles.sectionTitle}>Reviews ({ratings.length})</Text>
                            
                            {ratings.length === 0 ? (
                                <View style={styles.emptyCard}>
                                    <Text style={styles.emptyIcon}>🌱</Text>
                                    <Text style={styles.emptyText}>No ratings yet.</Text>
                                </View>
                            ) : (
                                ratings.map((r, i) => (
                                    <View key={i} style={styles.reviewCard}>
                                        <View style={styles.reviewHeader}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={styles.starText}>{renderStars(r.stars)}</Text>
                                                <View style={[styles.roleBadge, r.role === 'provider' ? styles.roleBadgeProvider : styles.roleBadgeReceiver]}>
                                                    <Text style={[styles.roleText, r.role === 'provider' ? styles.roleTextProvider : styles.roleTextReceiver]}>
                                                        {r.role === 'provider' ? 'Provided Service' : 'Paid for Service'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={styles.dateText}>
                                                {new Date(r.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                            </Text>
                                        </View>
                                        {r.comment ? (
                                            <Text style={styles.commentText}>"{r.comment}"</Text>
                                        ) : (
                                            <Text style={styles.noCommentText}>No comment provided.</Text>
                                        )}
                                    </View>
                                ))
                            )}
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#333'
    },
    backBtn: {
        paddingVertical: 8, paddingRight: 8
    },
    backBtnText: {
        color: '#9ca3af', fontWeight: 'bold'
    },
    headerTitle: {
        color: '#fff', fontSize: 18, fontWeight: 'bold'
    },
    scrollContent: {
        paddingBottom: 40
    },
    banner: {
        alignItems: 'center', padding: 24, borderBottomWidth: 1, borderColor: '#222'
    },
    avatar: {
        width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#333', marginBottom: 16
    },
    avatarPlaceholder: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(245, 158, 11, 0.2)', borderWidth: 3, borderColor: '#333', alignItems: 'center', justifyContent: 'center', marginBottom: 16
    },
    avatarInitial: {
        fontSize: 32, fontWeight: 'bold', color: '#fbbf24'
    },
    callsignText: {
        fontSize: 24, fontWeight: 'bold', color: '#fff'
    },
    pubkeyText: {
        fontSize: 12, color: '#9ca3af', fontFamily: 'Courier', backgroundColor: '#1f2937', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4
    },
    bioText: {
        marginTop: 16, fontSize: 14, color: '#ccc', fontStyle: 'italic', textAlign: 'center'
    },
    statsGrid: {
        flexDirection: 'row', padding: 16, gap: 10
    },
    statBox: {
        flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#333', borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center'
    },
    statIcon: {
        fontSize: 16, marginBottom: 4, color: '#fbbf24'
    },
    statValue: {
        fontSize: 16, fontWeight: 'bold', color: '#fff'
    },
    statLabel: {
        fontSize: 10, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', marginTop: 2
    },
    reviewsWrapper: {
        padding: 16
    },
    sectionTitle: {
        color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 12, marginLeft: 4
    },
    emptyCard: {
        backgroundColor: '#111', padding: 24, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333'
    },
    emptyIcon: {
        fontSize: 32, opacity: 0.5, marginBottom: 8
    },
    emptyText: {
        color: '#9ca3af', fontWeight: '600'
    },
    reviewCard: {
        backgroundColor: '#111', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333', marginBottom: 12
    },
    reviewHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8
    },
    starText: {
        fontSize: 13, color: '#fbbf24'
    },
    roleBadge: {
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4
    },
    roleBadgeProvider: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)'
    },
    roleBadgeReceiver: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)'
    },
    roleText: {
        fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase'
    },
    roleTextProvider: { color: '#34d399' },
    roleTextReceiver: { color: '#818cf8' },
    dateText: {
        fontSize: 10, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase'
    },
    commentText: {
        fontSize: 14, color: '#d1d5db', fontStyle: 'italic', backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8, overflow: 'hidden'
    },
    noCommentText: {
        fontSize: 13, color: '#6b7280', fontStyle: 'italic'
    }
});
