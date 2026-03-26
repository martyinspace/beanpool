import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { createProject } from '../utils/db';

export default function ProposeProjectModal() {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [goalAmount, setGoalAmount] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!title.trim() || !goalAmount.trim()) {
            Alert.alert("Missing Fields", "Please provide a project title and requested goal amount.");
            return;
        }

        setSubmitting(true);
        try {
            await createProject({
                title: title.trim(),
                description: description.trim(),
                goal_amount: parseInt(goalAmount, 10) || 0,
            });
            Alert.alert("Proposal Submitted", "Your community project proposal has been broadcast to the network.", [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (e: any) {
            Alert.alert("Submission Failed", e.message || "Could not propose project.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <MaterialCommunityIcons name="close" size={28} color="#111827" />
                </Pressable>
                <Text style={styles.headerTitle}>Propose Project</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={styles.infoBox}>
                    <MaterialCommunityIcons name="information" size={20} color="#f59e0b" style={{ marginRight: 8 }} />
                    <Text style={styles.infoText}>Project proposals must be voted on and approved by the community before any funds are released.</Text>
                </View>

                {/* Title */}
                <View style={styles.field}>
                    <Text style={styles.label}>PROJECT TITLE</Text>
                    <TextInput 
                        style={styles.input}
                        placeholder="e.g. Community Garden Tool Shed"
                        value={title}
                        onChangeText={setTitle}
                        maxLength={60}
                    />
                </View>

                {/* Goal Amount */}
                <View style={styles.field}>
                    <Text style={styles.label}>FUNDING GOAL (Ʀ)</Text>
                    <TextInput 
                        style={[styles.input, styles.priceInput]}
                        placeholder="0"
                        keyboardType="numeric"
                        value={goalAmount}
                        onChangeText={setGoalAmount}
                        maxLength={6}
                    />
                    {/* PWA states "Commons allocation limit bounds this locally". */}
                    <Text style={styles.hint}>Amount requested from the community pool.</Text>
                </View>

                {/* Description */}
                <View style={styles.field}>
                    <Text style={styles.label}>PROPOSAL DETAILS</Text>
                    <TextInput 
                        style={[styles.input, styles.textarea]}
                        placeholder="Describe the project, who benefits, and how the credits will be allocated..."
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        textAlignVertical="top"
                    />
                </View>

            </ScrollView>

            <View style={styles.footer}>
                <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
                    {submitting ? (
                        <ActivityIndicator color="#ffffff" />
                    ) : (
                        <Text style={styles.submitBtnText}>SUBMIT TO NETWORK</Text>
                    )}
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', letterSpacing: 1, textTransform: 'uppercase' },
    infoBox: { flexDirection: 'row', backgroundColor: '#fffbeb', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#fef3c7' },
    infoText: { flex: 1, fontSize: 15, color: '#92400e', lineHeight: 22 },
    scroll: { padding: 20 },
    field: { marginBottom: 24 },
    label: { fontSize: 11, fontWeight: 'bold', color: '#6b7280', letterSpacing: 1, marginBottom: 8 },
    hint: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
    input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, fontSize: 16, color: '#1f2937' },
    priceInput: { fontSize: 24, fontWeight: 'bold', color: '#f59e0b' },
    textarea: { height: 160, paddingTop: 16 },
    footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#ffffff' },
    submitBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', backgroundColor: '#f59e0b', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    submitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 }
});
