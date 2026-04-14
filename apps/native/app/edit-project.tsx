import React, { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { updateCrowdfundProjectApi, getProjectById, deleteCrowdfundProjectApi } from '../utils/db';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CurrencyDisplay } from '../components/CurrencyDisplay';

export default function EditProjectModal() {
    const params = useLocalSearchParams<{ id: string, title?: string, description?: string, goal?: string, current?: string, photos?: string }>();
    
    const [title, setTitle] = useState(params.title || '');
    const [description, setDescription] = useState(params.description || '');
    const [goalAmount, setGoalAmount] = useState(params.goal || '');
    const [submitting, setSubmitting] = useState(false);
    const submittingRef = useRef(false);
    const [projectData, setProjectData] = useState<any>(null);
    const [deadlineDate, setDeadlineDate] = useState<Date | null>(null);
    const [showPicker, setShowPicker] = useState(false);

    const [maxExpiryDays, setMaxExpiryDays] = useState<number>(365);
    useEffect(() => {
        AsyncStorage.getItem('beanpool_max_expiry_days').then(val => {
            if (val) setMaxExpiryDays(Number(val));
        });
    }, []);

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + maxExpiryDays);

    useEffect(() => {
        if (params.id) {
            getProjectById(params.id).then(p => {
                setProjectData(p);
                if (p?.deadline_at) {
                    setDeadlineDate(new Date(p.deadline_at));
                }
            }).catch(console.error);
        }
    }, [params.id]);

    const isLocked = Number(params.current || 0) > 0;

    const handleSubmit = async () => {
        if (submittingRef.current) return;
        if (!title.trim() || !goalAmount.trim()) {
            Alert.alert("Missing Fields", "Please provide a project title and requested goal amount.");
            return;
        }

        let parsedDeadline = null;
        if (deadlineDate) {
            parsedDeadline = deadlineDate.toISOString();
        }

        submittingRef.current = true;
        setSubmitting(true);
        try {
            let parsedPhotos: string[] = [];
            if (projectData?.photos) {
                parsedPhotos = typeof projectData.photos === 'string' ? JSON.parse(projectData.photos) : projectData.photos;
            } else if (params.photos) {
                try { parsedPhotos = JSON.parse(params.photos); } catch {}
            }

            await updateCrowdfundProjectApi(
                params.id,
                title.trim(),
                description.trim(),
                parsedPhotos,
                parseInt(goalAmount, 10) || 0,
                parsedDeadline
            );
            Alert.alert("Proposal Updated", "Your community project proposal has been successfully updated on the network.", [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (e: any) {
            Alert.alert("Update Failed", e.message || "Could not update project.");
        } finally {
            setSubmitting(false);
            submittingRef.current = false;
        }
    };

    const handleDelete = async () => {
        Alert.alert(
            "Delete Project?",
            "This will permanently erase the project. Pledges currently held in Escrow will be automatically refunded to backers.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete & Refund",
                    style: "destructive",
                    onPress: async () => {
                        setSubmitting(true);
                        try {
                            await deleteCrowdfundProjectApi(params.id);
                            Alert.alert("Project Deleted", "The project has been successfully erased and any escrowed funds have been refunded.", [
                                { text: "OK", onPress: () => router.push('/projects') }
                            ]);
                        } catch (e: any) {
                            Alert.alert("Delete Failed", e.message || "Could not delete project.");
                            setSubmitting(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <MaterialCommunityIcons name="close" size={28} color="#111827" />
                </Pressable>
                <Text style={styles.headerTitle}>Edit Project</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scroll}>
                    {isLocked ? (
                        <View style={[styles.infoBox, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
                            <MaterialCommunityIcons name="lock" size={20} color="#b91c1c" style={{ marginRight: 8 }} />
                            <Text style={[styles.infoText, { color: '#7f1d1d' }]}>This project has already received community pledges. The funding goal is permanently locked to protect backers.</Text>
                        </View>
                    ) : (
                        <View style={styles.infoBox}>
                            <MaterialCommunityIcons name="information" size={20} color="#f59e0b" style={{ marginRight: 8 }} />
                            <Text style={styles.infoText}>You may edit the funding goal because no pledges have been made yet.</Text>
                        </View>
                    )}

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
                        <Text style={styles.label}>FUNDING GOAL (<CurrencyDisplay hideAmount={true} />)</Text>
                        <TextInput 
                            style={[styles.input, styles.priceInput, isLocked && { backgroundColor: '#f3f4f6', color: '#9ca3af' }]}
                            placeholder="0"
                            keyboardType="numeric"
                            value={goalAmount}
                            onChangeText={setGoalAmount}
                            maxLength={6}
                            editable={!isLocked}
                        />
                        <Text style={styles.hint}>Amount requested from the community pool.</Text>
                    </View>

                    {/* Deadline */}
                    <View style={styles.field}>
                        <Text style={styles.label}>FUNDING DEADLINE (OPTIONAL)</Text>
                        {Platform.OS === 'ios' ? (
                            <View style={{ alignItems: 'flex-start', marginTop: 8 }}>
                                <DateTimePicker
                                    value={deadlineDate || new Date()}
                                    mode="date"
                                    display="default"
                                    minimumDate={new Date()}
                                    maximumDate={maxDate}
                                    onChange={(event: any, selectedDate?: Date) => {
                                        if (selectedDate) setDeadlineDate(selectedDate);
                                    }}
                                />
                            </View>
                        ) : (
                            <>
                                <Pressable 
                                    style={[styles.input, { justifyContent: 'center' }]} 
                                    onPress={() => setShowPicker(true)}
                                >
                                    <Text style={{ color: deadlineDate ? '#111827' : '#9ca3af', fontSize: 16 }}>
                                        {deadlineDate ? deadlineDate.toISOString().split('T')[0] : "Select Deadline Date"}
                                    </Text>
                                </Pressable>
                                {showPicker && (
                                    <DateTimePicker
                                        value={deadlineDate || new Date()}
                                        mode="date"
                                        display="default"
                                        minimumDate={new Date()}
                                        maximumDate={maxDate}
                                        onChange={(event: any, selectedDate?: Date) => {
                                            setShowPicker(false);
                                            if (event.type === 'set' && selectedDate) {
                                                setDeadlineDate(selectedDate);
                                            }
                                        }}
                                    />
                                )}
                            </>
                        )}
                        <Text style={styles.hint}>If set, project will automatically expire on this date.</Text>
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

                <View style={[styles.footer, { flexDirection: 'column', gap: 12 }]}>
                    <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
                        {submitting ? (
                            <ActivityIndicator color="#ffffff" />
                        ) : (
                            <Text style={styles.submitBtnText}>SAVE CHANGES</Text>
                        )}
                    </Pressable>
                    <Pressable style={styles.deleteBtn} onPress={handleDelete} disabled={submitting}>
                        <Text style={styles.deleteBtnText}>DELETE PROJECT</Text>
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
    submitBtn: { backgroundColor: '#10b981', height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    submitBtnText: { color: '#ffffff', fontWeight: '800', letterSpacing: 1, fontSize: 13 },
    deleteBtn: { backgroundColor: '#ef4444', height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    deleteBtnText: { color: '#ffffff', fontWeight: '800', letterSpacing: 1, fontSize: 13 },
});
