import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, SafeAreaView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { createPost } from '../utils/db';
import { useIdentity } from './IdentityContext';

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

export default function NewPostModal() {
    const [type, setType] = useState<'offer' | 'need'>('offer');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('goods');
    const [credits, setCredits] = useState('');

    const { identity } = useIdentity();

    const handleSubmit = async () => {
        if (!title.trim() || !credits.trim()) {
            Alert.alert("Missing Fields", "Please provide at least a title and credit value.");
            return;
        }
        
        if (!identity) {
            Alert.alert("Authentication", "You must be authenticated to publish posts.");
            return;
        }

        try {
            await createPost({
                id: crypto.randomUUID(),
                type,
                category,
                title: title.trim(),
                description: description.trim(),
                credits: parseInt(credits),
                author_pubkey: identity.publicKey,
                author_callsign: identity.callsign,
                created_at: new Date().toISOString()
            });

            router.replace('/(tabs)/market');
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not publish post to your local ledger.");
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <MaterialCommunityIcons name="close" size={28} color="#111827" />
                </Pressable>
                <Text style={styles.headerTitle}>New Post</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scroll}>
                {/* Type Selection */}
                <View style={styles.typeSelector}>
                    <Pressable 
                        style={[styles.typeBtn, type === 'offer' ? styles.offerBtnActive : styles.typeBtnInactive]}
                        onPress={() => setType('offer')}
                    >
                        <Text style={[styles.typeBtnText, type === 'offer' && styles.typeBtnTextActive]}>I HAVE AN OFFER</Text>
                    </Pressable>
                    <Pressable 
                        style={[styles.typeBtn, type === 'need' ? styles.needBtnActive : styles.typeBtnInactive]}
                        onPress={() => setType('need')}
                    >
                        <Text style={[styles.typeBtnText, type === 'need' && styles.typeBtnTextActive]}>I HAVE A NEED</Text>
                    </Pressable>
                </View>

                {/* Title */}
                <View style={styles.field}>
                    <Text style={styles.label}>TITLE</Text>
                    <TextInput 
                        style={styles.input}
                        placeholder={type === 'offer' ? "e.g. Fresh Sourdough Bread" : "e.g. Looking for a Power Drill"}
                        value={title}
                        onChangeText={setTitle}
                        maxLength={50}
                    />
                </View>

                {/* Category */}
                <View style={styles.field}>
                    <Text style={styles.label}>CATEGORY</Text>
                    <View style={styles.categoryGrid}>
                        {CATEGORIES.map(cat => (
                            <Pressable 
                                key={cat.id} 
                                style={[styles.categoryCard, category === cat.id && styles.categoryCardActive]}
                                onPress={() => setCategory(cat.id)}
                            >
                                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                                <Text style={[styles.categoryLabel, category === cat.id && styles.categoryLabelActive]}>{cat.label}</Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                {/* Credits */}
                <View style={styles.field}>
                    <Text style={styles.label}>CREDITS (Ʀ)</Text>
                    <TextInput 
                        style={[styles.input, styles.priceInput]}
                        placeholder="0"
                        keyboardType="numeric"
                        value={credits}
                        onChangeText={setCredits}
                        maxLength={5}
                    />
                    <Text style={styles.hint}>Local community credits requested or offered.</Text>
                </View>

                {/* Description */}
                <View style={styles.field}>
                    <Text style={styles.label}>DESCRIPTION</Text>
                    <TextInput 
                        style={[styles.input, styles.textarea]}
                        placeholder="Add more details about your item or service..."
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        textAlignVertical="top"
                    />
                </View>

            </ScrollView>

            <View style={styles.footer}>
                <Pressable style={[styles.submitBtn, type === 'offer' ? styles.submitOffer : styles.submitNeed]} onPress={handleSubmit}>
                    <Text style={styles.submitBtnText}>PUBLISH POST</Text>
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
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', letterSpacing: 1, textTransform: 'uppercase' },
    scroll: { padding: 20 },
    typeSelector: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    typeBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center', borderWidth: 2 },
    typeBtnInactive: { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' },
    offerBtnActive: { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10b981' },
    needBtnActive: { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: '#f59e0b' },
    typeBtnText: { fontSize: 13, fontWeight: '800', color: '#6b7280', letterSpacing: 0.5 },
    typeBtnTextActive: { color: '#1f2937' },
    field: { marginBottom: 24 },
    label: { fontSize: 11, fontWeight: 'bold', color: '#6b7280', letterSpacing: 1, marginBottom: 8 },
    hint: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
    input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, fontSize: 16, color: '#1f2937' },
    priceInput: { fontSize: 24, fontWeight: 'bold', color: '#8b5cf6' },
    textarea: { height: 120, paddingTop: 16 },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    categoryCard: { width: '48%', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, alignItems: 'center' },
    categoryCardActive: { backgroundColor: 'rgba(139, 92, 246, 0.1)', borderColor: '#8b5cf6' },
    categoryEmoji: { fontSize: 28, marginBottom: 8 },
    categoryLabel: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
    categoryLabelActive: { color: '#8b5cf6' },
    footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#ffffff' },
    submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    submitOffer: { backgroundColor: '#10b981' },
    submitNeed: { backgroundColor: '#f59e0b' },
    submitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 }
});
