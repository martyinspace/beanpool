import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Image, ScrollView, ActivityIndicator, Alert, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { processProfileImage } from '../utils/image-processing';
import { BUNDLED_AVATARS } from '../utils/bundled-avatars';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface AvatarPickerSheetProps {
    visible: boolean;
    onClose: () => void;
    onSelectImage: (uri: string) => void;
}

export function AvatarPickerSheet({ visible, onClose, onSelectImage }: AvatarPickerSheetProps) {
    const [loading, setLoading] = useState(false);
    const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);

    const handleTakePhotos = async () => {
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Permission required', 'Camera access is needed.');
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: false
            });
            if (!result.canceled && result.assets[0].uri) {
                setLoading(true);
                const dataUri = await processProfileImage(result.assets[0].uri);
                if (dataUri) {
                    onSelectImage(dataUri);
                    onClose();
                } else {
                    Alert.alert('Error', 'Could not process photo.');
                }
            }
        } catch (e) {
            Alert.alert('Error', 'Could not take photo.');
        } finally {
            setLoading(false);
        }
    };

    const handleGallery = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: false
            });
            if (!result.canceled && result.assets[0].uri) {
                setLoading(true);
                const dataUri = await processProfileImage(result.assets[0].uri);
                if (dataUri) {
                    onSelectImage(dataUri);
                    onClose();
                } else {
                    Alert.alert('Error', 'Could not process photo.');
                }
            }
        } catch (e) {
            Alert.alert('Error', 'Could not pick image.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectBundled = () => {
        if (!selectedAvatarId) return;
        // Store as bundled:// protocol reference — universally resolvable on all devices
        onSelectImage(`bundled://${selectedAvatarId}`);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Profile Photo</Text>
                        <Pressable onPress={onClose} style={styles.closeButton}>
                            <Text style={styles.closeText}>✕</Text>
                        </Pressable>
                    </View>

                    {/* Content */}
                    <View style={styles.content}>
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#2563eb" />
                                <Text style={styles.loadingText}>Processing image...</Text>
                            </View>
                        ) : (
                            <>
                                <View style={styles.sourceButtonsRow}>
                                    <Pressable style={styles.sourceButton} onPress={handleTakePhotos}>
                                        <Text style={styles.sourceEmoji}>📸</Text>
                                        <Text style={styles.sourceLabel}>Camera</Text>
                                    </Pressable>
                                    <Pressable style={styles.sourceButton} onPress={handleGallery}>
                                        <Text style={styles.sourceEmoji}>🖼️</Text>
                                        <Text style={styles.sourceLabel}>Gallery</Text>
                                    </Pressable>
                                </View>

                                <Text style={styles.sectionTitle}>Or choose an avatar:</Text>
                                
                                <ScrollView 
                                    horizontal 
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.avatarScrollContent}
                                >
                                    {BUNDLED_AVATARS.map((avatar) => {
                                        const isSelected = selectedAvatarId === avatar.id;
                                        return (
                                            <Pressable
                                                key={avatar.id}
                                                style={[
                                                    styles.avatarItem,
                                                    isSelected && styles.avatarItemSelected
                                                ]}
                                                onPress={() => setSelectedAvatarId(avatar.id)}
                                            >
                                                <Image
                                                    source={avatar.source}
                                                    style={isSelected ? styles.avatarImageSelected : styles.avatarImage}
                                                />
                                            </Pressable>
                                        );
                                    })}
                                </ScrollView>

                                {selectedAvatarId && (
                                    <Pressable style={styles.confirmButton} onPress={handleSelectBundled}>
                                        <Text style={styles.confirmButtonText}>Use Selected Avatar</Text>
                                    </Pressable>
                                )}
                            </>
                        )}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: SCREEN_HEIGHT * 0.8,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#64748b',
    },
    content: {
        padding: 20,
    },
    sourceButtonsRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 24,
    },
    sourceButton: {
        flex: 1,
        backgroundColor: '#f8fafc',
        borderWidth: 2,
        borderColor: '#e2e8f0',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
    },
    sourceEmoji: {
        fontSize: 32,
        marginBottom: 8,
    },
    sourceLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#334155',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 16,
    },
    avatarScrollContent: {
        gap: 16,
        paddingVertical: 10,
        paddingHorizontal: 4,
    },
    avatarItem: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 3,
        borderColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
    },
    avatarItemSelected: {
        borderColor: '#3b82f6',
        backgroundColor: '#eff6ff',
        transform: [{ scale: 1.1 }],
    },
    avatarImage: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    avatarImageSelected: {
        width: 70,
        height: 70,
        borderRadius: 35,
    },
    confirmButton: {
        marginTop: 24,
        backgroundColor: '#3b82f6',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    confirmButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        color: '#64748b',
        fontWeight: '600',
    },
});
