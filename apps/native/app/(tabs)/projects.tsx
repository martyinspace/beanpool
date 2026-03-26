import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, SafeAreaView, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { getProjects } from '../../utils/db'; // Currently mapped { id, title, goal, current }

export default function ProjectsScreen() {
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;
            getProjects().then((data) => {
                if (isActive) {
                    setProjects(data);
                    setLoading(false);
                }
            }).catch(err => {
                console.error(err);
                if (isActive) setLoading(false);
            });
            return () => { isActive = false; };
        }, [])
    );

    const renderItem = ({ item }: { item: any }) => {
        const progress = Math.min(100, (item.current_amount / item.goal_amount) * 100) || 0;
        const isFunded = item.current_amount >= item.goal_amount;

        let parsedPhotos: string[] = [];
        try {
            if (item.photos) {
                parsedPhotos = typeof item.photos === 'string' ? JSON.parse(item.photos) : item.photos;
            }
        } catch(e) {}
        
        const heroUri = parsedPhotos.length > 0 ? parsedPhotos[0] : null;

        return (
            <Pressable style={styles.card}>
                <View style={[styles.heroImage, { backgroundColor: '#1f2937' }]}>
                    {heroUri && (
                        <Image source={{ uri: heroUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                    )}
                    {isFunded && (
                        <View style={styles.fundedBadge}>
                            <Text style={styles.fundedBadgeText}>🎉 FUNDED</Text>
                        </View>
                    )}
                    <View style={styles.heroOverlay}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    </View>
                </View>

                <View style={styles.cardBody}>
                    <Text style={styles.description} numberOfLines={2}>
                        {item.description || "Community crowdfund initiative."}
                    </Text>
                    
                    <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                            <Text style={[styles.currentText, isFunded && styles.currentTextFunded]}>
                                {item.current_amount} B <Text style={styles.faintText}>raised</Text>
                            </Text>
                            <Text style={styles.goalText}>Goal: {item.goal_amount} B</Text>
                        </View>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: isFunded ? '#10b981' : '#8b5cf6' }]} />
                        </View>
                    </View>
                </View>
            </Pressable>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <Text style={styles.headerEmoji}>🌱</Text>
                <View>
                    <Text style={styles.headerTitle}>Community Projects</Text>
                    <Text style={styles.headerSubtitle}>Crowdfund shared goals with Beans</Text>
                </View>
            </View>
            
            <FlatList
                data={projects}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContainer}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>🌱</Text>
                        <Text style={styles.emptyText}>No projects proposed yet.</Text>
                    </View>
                }
            />
            <Pressable style={styles.fab} onPress={() => router.push('/propose-project')}>
                <MaterialCommunityIcons name="plus" size={30} color="#fff" />
            </Pressable>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#f9fafb' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#111827' },
    headerEmoji: { fontSize: 28, marginRight: 12 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
    listContainer: { padding: 16, paddingBottom: 100 },
    card: { backgroundColor: '#ffffff', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
    heroImage: { height: 120, width: '100%', justifyContent: 'flex-end', position: 'relative' },
    heroOverlay: { padding: 12, backgroundColor: 'rgba(0,0,0,0.4)' },
    cardTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
    fundedBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#10b981', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    fundedBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
    cardBody: { padding: 16 },
    description: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 16 },
    progressSection: { marginTop: 4 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    currentText: { fontSize: 13, fontWeight: 'bold', color: '#1f2937' },
    currentTextFunded: { color: '#10b981' },
    faintText: { fontWeight: 'normal', color: '#9ca3af' },
    goalText: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
    progressBarBg: { height: 8, width: '100%', backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 4 },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
    emptyEmoji: { fontSize: 48, opacity: 0.3, marginBottom: 16 },
    emptyText: { color: '#9ca3af', fontSize: 15 },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#10b981',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6
    }
});
