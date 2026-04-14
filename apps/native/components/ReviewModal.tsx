import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { submitRating } from '../utils/db';
import { useIdentity } from '../app/IdentityContext';

interface ReviewModalProps {
    visible: boolean;
    txId: string;
    targetPubkey: string;
    targetCallsign: string;
    onClose: () => void;
    onSuccess: () => void;
}

export function ReviewModal({ visible, txId, targetPubkey, targetCallsign, onClose, onSuccess }: ReviewModalProps) {
    const { identity } = useIdentity();
    const [stars, setStars] = useState(5);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!identity) return;
        setSubmitting(true);
        try {
            await submitRating(identity.publicKey, targetPubkey, stars, comment, txId);
            onSuccess();
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.emoji}>🎉</Text>
                    <Text style={styles.title}>Deal Complete!</Text>
                    <Text style={styles.subtitle}>
                        How was your experience with <Text style={styles.bold}>{targetCallsign}</Text>?
                    </Text>

                    <View style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map(s => (
                            <Pressable key={s} onPress={() => setStars(s)}>
                                <Text style={[styles.star, s <= stars ? styles.starActive : styles.starInactive]}>★</Text>
                            </Pressable>
                        ))}
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="Write a short review (optional)..."
                        placeholderTextColor="#9ca3af"
                        multiline
                        numberOfLines={3}
                        value={comment}
                        onChangeText={setComment}
                    />

                    <View style={styles.buttonRow}>
                        <Pressable style={styles.skipBtn} onPress={onClose} disabled={submitting}>
                            <Text style={styles.skipText}>Skip for now</Text>
                        </Pressable>
                        <Pressable style={[styles.submitBtn, submitting && styles.btnDisabled]} onPress={handleSubmit} disabled={submitting}>
                            {submitting ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.submitText}>Submit Rating</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
    emoji: { fontSize: 40, marginBottom: 16 },
    title: { fontSize: 20, fontWeight: '900', color: '#1f2937', marginBottom: 8 },
    subtitle: { fontSize: 14, color: '#4b5563', textAlign: 'center', marginBottom: 24 },
    bold: { fontWeight: '800', color: '#111827' },
    starsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
    star: { fontSize: 40 },
    starActive: { color: '#fbbf24' },
    starInactive: { color: '#e5e7eb' },
    input: { width: '100%', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, fontSize: 14, minHeight: 80, marginBottom: 24, color: '#1f2937' },
    buttonRow: { flexDirection: 'row', gap: 12, width: '100%' },
    skipBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    skipText: { fontWeight: '700', color: '#4b5563', fontSize: 14 },
    submitBtn: { flex: 1.5, backgroundColor: '#f59e0b', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    submitText: { fontWeight: '700', color: '#fff', fontSize: 14 },
    btnDisabled: { opacity: 0.7 },
});
