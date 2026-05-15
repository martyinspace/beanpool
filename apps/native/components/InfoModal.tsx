import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, TouchableWithoutFeedback } from 'react-native';

export interface InfoModalTab {
    id: string;
    label: string;
    content: React.ReactNode;
}

export interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    icon: string;
    tabs: InfoModalTab[];
}

export function InfoModal({ isOpen, onClose, title, icon, tabs }: InfoModalProps) {
    const [activeTab, setActiveTab] = useState<string>(tabs.length > 0 ? tabs[0].id : '');

    if (!isOpen) return null;

    return (
        <Modal
            visible={isOpen}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableWithoutFeedback>
                    <View style={styles.modalContainer}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.headerTitleContainer}>
                                <Text style={styles.headerIcon}>{icon}</Text>
                                <Text style={styles.headerTitle}>{title}</Text>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Text style={styles.closeButtonText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Tabs */}
                        {tabs.length > 1 && (
                            <View style={styles.tabContainer}>
                                {tabs.map(tab => (
                                    <TouchableOpacity
                                        key={tab.id}
                                        style={[
                                            styles.tabButton,
                                            activeTab === tab.id && styles.tabButtonActive
                                        ]}
                                        onPress={() => setActiveTab(tab.id)}
                                    >
                                        <Text style={[
                                            styles.tabText,
                                            activeTab === tab.id && styles.tabTextActive
                                        ]}>{tab.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Content */}
                        <ScrollView style={styles.contentContainer} showsVerticalScrollIndicator={false}>
                            {tabs.find(t => t.id === activeTab)?.content}
                        </ScrollView>
                    </View>
                </TouchableWithoutFeedback>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#111827',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
        minHeight: '60%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1f2937',
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerIcon: {
        fontSize: 24,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ffffff',
    },
    closeButton: {
        padding: 8,
    },
    closeButtonText: {
        color: '#9ca3af',
        fontSize: 20,
        fontWeight: 'bold',
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#1f2937',
    },
    tabButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginRight: 8,
        borderRadius: 8,
    },
    tabButtonActive: {
        backgroundColor: '#064e3b',
    },
    tabText: {
        color: '#9ca3af',
        fontWeight: '600',
        fontSize: 14,
    },
    tabTextActive: {
        color: '#34d399',
    },
    contentContainer: {
        padding: 24,
    },
});
