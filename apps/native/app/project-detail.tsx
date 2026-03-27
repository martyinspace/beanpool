import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { pledgeToCrowdfundProjectApi, getProjectById } from '../utils/db';
import { loadIdentity } from '../utils/identity';

export default function ProjectDetailScreen() {
    const params = useLocalSearchParams<{ id: string, title?: string, description?: string, goal?: string, current?: string, creator_pubkey?: string, creator_callsign?: string, photos?: string }>();
    
    const [pledgeAmount, setPledgeAmount] = useState('');
    const [pledgeMemo, setPledgeMemo] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [identity, setIdentity] = useState<any>(null);

    const [projectData, setProjectData] = useState<any>(null);

    const title = params.title || 'Untitled Project';
    const description = params.description || 'No description provided.';
    const goal = Number(params.goal || 0);
    const current = Number(params.current || 0);
    const isFunded = current >= goal;
    const progress = Math.min(100, (current / (goal || 1)) * 100);
    const isCreator = identity?.publicKey === params.creator_pubkey;

    let photosArr: string[] = [];
    if (projectData?.photos) {
        try { photosArr = typeof projectData.photos === 'string' ? JSON.parse(projectData.photos) : projectData.photos; } catch {}
    } else if (params.photos) {
        try { photosArr = JSON.parse(params.photos); } catch {}
    }
    const heroUri = photosArr.length > 0 ? photosArr[0] : null;

    useEffect(() => {
        loadIdentity().then((id: any) => setIdentity(id));
        if (params.id) {
            getProjectById(params.id).then(setProjectData).catch(console.error);
        }
    }, [params.id]);

    const handlePledge = async () => {
        if (!pledgeAmount.trim() || isNaN(Number(pledgeAmount)) || Number(pledgeAmount) <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid amount to pledge.");
            return;
        }

        setSubmitting(true);
        try {
            await pledgeToCrowdfundProjectApi(params.id, Number(pledgeAmount), pledgeMemo.trim());
            Alert.alert("Pledge Successful! 🌱", `Thank you for supporting ${title}.`, [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (e: any) {
            Alert.alert("Pledge Failed", e.message || "Could not complete pledge. Are you online?");
        } finally {
            setSubmitting(false);
        }
    };

    const getDaysRemaining = (deadline: string | null) => {
        if (!deadline) return null;
        const diff = new Date(deadline).getTime() - new Date().getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days < 0) return 'Expired';
        if (days === 0) return 'Ends today';
        return `${days} days left`;
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <StatusBar style="light" />
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                
                {/* Fixed Header overlay for back button */}
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backButton}>
                        <MaterialCommunityIcons name="chevron-left" size={32} color="#ffffff" />
                    </Pressable>
                </View>

                <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 100 }} bounces={false}>
                    {/* Hero Header */}
                    <View style={styles.heroContainer}>
                        {heroUri ? (
                            <Image source={{ uri: heroUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                        ) : (
                            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' }]}>
                                <Text style={{ fontSize: 60, opacity: 0.3 }}>🌱</Text>
                            </View>
                        )}
                        <View style={styles.heroOverlay} />
                    </View>

                    <View style={styles.content}>
                        {isFunded && (
                            <View style={styles.fundedBadge}>
                                <Text style={styles.fundedBadgeText}>🎉 SUCCESSFULLY FUNDED</Text>
                            </View>
                        )}
                        <Text style={styles.title}>{title}</Text>
                        <Text style={{ fontSize: 15, color: '#6b7280', fontWeight: '500', marginBottom: 20 }}>
                            Proposed by <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{params.creator_callsign || projectData?.creator_callsign || 'Unknown'}</Text>
                        </Text>
                        
                        {/* Progress Section */}
                        <View style={styles.progressCard}>
                            <View style={styles.progressHeader}>
                                <View>
                                    <Text style={[styles.currentAmt, isFunded && { color: '#10b981' }]}>
                                        {current} <Text style={styles.progressLabel}>Beans raised</Text>
                                    </Text>
                                    <Text style={styles.goalAmt}>Goal: {goal} B</Text>
                                </View>
                                {projectData?.deadline_at && (
                                    <Text style={{ fontSize: 13, backgroundColor: getDaysRemaining(projectData.deadline_at) === 'Expired' ? '#fef2f2' : '#f5f3ff', color: getDaysRemaining(projectData.deadline_at) === 'Expired' ? '#ef4444' : '#8b5cf6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, fontWeight: 'bold', overflow: 'hidden', borderWidth: 1, borderColor: getDaysRemaining(projectData.deadline_at) === 'Expired' ? '#fecaca' : '#ede9fe' }}>
                                        ⏳ {getDaysRemaining(projectData.deadline_at)}
                                    </Text>
                                )}
                            </View>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: isFunded ? '#10b981' : '#f59e0b' }]} />
                            </View>
                            <Text style={styles.escrowNotice}>
                                {isFunded 
                                    ? "🎉 This project successfully reached its goal! Escrowed funds have been securely released to the creator."
                                    : "🔒 Pledges are held securely in a smart escrow account. Funds are only released to the creator if the goal is met. If the creator deletes this project, your Beans will be automatically refunded."}
                            </Text>
                        </View>

                        {/* About */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>About the Project</Text>
                            <Text style={styles.description}>{description}</Text>
                        </View>
                    </View>
                </ScrollView>

                {/* Footer Pledge Bar */}
                {!isCreator && (
                    <View style={styles.footer}>
                        <View style={styles.inputRow}>
                            <View style={styles.inputContainer}>
                                <Text style={styles.beanSymbol}>Ʀ</Text>
                                <TextInput 
                                    style={styles.amountInput}
                                    placeholder="0"
                                    keyboardType="numeric"
                                    value={pledgeAmount}
                                    onChangeText={setPledgeAmount}
                                />
                            </View>
                            <TextInput 
                                style={styles.memoInput}
                                placeholder="Optional memo..."
                                value={pledgeMemo}
                                onChangeText={setPledgeMemo}
                            />
                        </View>
                        <Pressable style={styles.pledgeBtn} onPress={handlePledge} disabled={submitting}>
                            {submitting ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text style={styles.pledgeBtnText}>PLEDGE BEANS 🌱</Text>
                            )}
                        </Pressable>
                    </View>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    header: { position: 'absolute', top: 44, left: 16, zIndex: 10 },
    backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    scroll: { flex: 1 },
    heroContainer: { width: '100%', height: 280, position: 'relative' },
    heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
    content: { padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#ffffff', marginTop: -24 },
    fundedBadge: { alignSelf: 'flex-start', backgroundColor: '#e0fae5', borderWidth: 1, borderColor: '#a7f3d0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 12 },
    fundedBadgeText: { color: '#047857', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 },
    title: { fontSize: 26, fontWeight: '900', color: '#111827', marginBottom: 20, letterSpacing: -0.5 },
    progressCard: { backgroundColor: '#f9fafb', padding: 16, borderRadius: 12, marginBottom: 24 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
    currentAmt: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },
    progressLabel: { fontSize: 14, fontWeight: 'normal', color: '#6b7280' },
    goalAmt: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
    progressBarBg: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 4 },
    escrowNotice: { marginTop: 12, fontSize: 13, color: '#6b7280', fontStyle: 'normal', lineHeight: 18 },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginBottom: 8 },
    description: { fontSize: 15, color: '#4b5563', lineHeight: 24 },
    footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#ffffff' },
    inputRow: { flexDirection: 'row', marginBottom: 16, gap: 12 },
    inputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 16 },
    beanSymbol: { fontSize: 18, fontWeight: 'bold', color: '#10b981', marginRight: 8 },
    amountInput: { flex: 1, height: 48, fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
    memoInput: { flex: 2, height: 48, backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 16, fontSize: 15, color: '#1f2937' },
    pledgeBtn: { backgroundColor: '#10b981', height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    pledgeBtnText: { color: '#ffffff', fontWeight: '800', letterSpacing: 1, fontSize: 15 },
});
