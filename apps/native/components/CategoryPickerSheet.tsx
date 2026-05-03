import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORIES = [
    { id: 'all', emoji: '🏷️', label: 'All' },
    { id: 'food', emoji: '🥕', label: 'Food' },
    { id: 'services', emoji: '🤝', label: 'Services' },
    { id: 'labour', emoji: '👷', label: 'Labour' },
    { id: 'tools', emoji: '🛠️', label: 'Tools' },
    { id: 'goods', emoji: '📦', label: 'Goods' },
    { id: 'garden', emoji: '🌻', label: 'Garden' },
    { id: 'housing', emoji: '🏠', label: 'Housing' },
    { id: 'transport', emoji: '🚗', label: 'Transport' },
    { id: 'education', emoji: '📚', label: 'Education' },
    { id: 'arts', emoji: '🎨', label: 'Arts' },
    { id: 'health', emoji: '🌿', label: 'Health' },
    { id: 'care', emoji: '❤️', label: 'Care' },
    { id: 'animals', emoji: '🐾', label: 'Animals' },
    { id: 'tech', emoji: '💻', label: 'Tech' },
    { id: 'energy', emoji: '☀️', label: 'Energy' },
    { id: 'general', emoji: '🌱', label: 'General' },
];

// Grid: 4 columns
const ITEM_SIZE = (SCREEN_WIDTH - 48 - 36) / 4; // padding + gaps

interface CategoryPickerSheetProps {
    visible: boolean;
    selected: string;
    onSelect: (categoryId: string) => void;
    onClose: () => void;
}

export function CategoryPickerSheet({ visible, selected, onSelect, onClose }: CategoryPickerSheetProps) {
    return (
        <Modal visible={visible} transparent animationType="slide">
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
                    {/* Handle bar */}
                    <View style={styles.handleBar} />

                    <Text style={styles.title}>Category</Text>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
                        {CATEGORIES.map(cat => {
                            const isActive = selected === cat.id;
                            return (
                                <Pressable
                                    key={cat.id}
                                    style={[styles.item, isActive && styles.itemActive]}
                                    onPress={() => { onSelect(cat.id); onClose(); }}
                                >
                                    <Text style={styles.itemEmoji}>{cat.emoji}</Text>
                                    <Text style={[styles.itemLabel, isActive && styles.itemLabelActive]} numberOfLines={1}>
                                        {cat.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        maxHeight: '60%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
    },
    handleBar: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
        alignSelf: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '900',
        color: '#1f2937',
        marginBottom: 20,
        textAlign: 'center',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    item: {
        width: ITEM_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
        backgroundColor: '#f9fafb',
    },
    itemActive: {
        backgroundColor: '#ede9fe',
        borderColor: '#8b5cf6',
    },
    itemEmoji: {
        fontSize: 24,
        marginBottom: 4,
    },
    itemLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#6b7280',
    },
    itemLabelActive: {
        color: '#6d28d9',
        fontWeight: '800',
    },
});
