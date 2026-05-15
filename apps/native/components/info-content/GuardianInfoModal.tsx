import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function GuardianInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'recovery',
            label: '🛡️ Social Recovery',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        BeanPool uses <Text style={styles.boldWhiteText}>Social Recovery</Text> instead of central passwords. Your chosen Guardians are the only way to recover your account if you lose your device.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>WHAT IS A GUARDIAN?</Text>
                        <Text style={styles.cardText}>
                            A Guardian is a trusted friend you select from your community. You need to assign between 3 and 5 friends as Guardians to activate Social Recovery.
                        </Text>
                    </View>

                    <View style={styles.processContainer}>
                        <Text style={styles.processLabel}>RECOVERY PROCESS</Text>
                        <Text style={styles.processText}>
                            1. You lose access to your device{'\n'}
                            2. You install the app on a new device{'\n'}
                            3. You contact your Guardians offline{'\n'}
                            4. If a majority (e.g., 2 out of 3, or 3 out of 5) of your Guardians approve your recovery request, your account is restored!
                        </Text>
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxIcon}>🔒</Text>
                        <Text style={styles.infoBoxText}>
                            Guardians cannot access your funds or messages. They only have the power to approve your account transfer to a new device.
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'security',
            label: '🔐 Best Practices',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Choosing the right Guardians is critical to keeping your account secure and recoverable.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>DIVERSITY IS KEY</Text>
                        <Text style={styles.cardText}>
                            Don't choose Guardians who all live in the same house or share the same devices. If one event compromises multiple Guardians, you might lose your account.
                        </Text>
                    </View>

                    <View style={styles.warningBox}>
                        <Text style={styles.warningIcon}>⚠️</Text>
                        <Text style={styles.warningText}>
                            If you do not set up Social Recovery and you lose your device or private key, your account and all its credits are permanently lost. There is no central support team that can restore it!
                        </Text>
                    </View>
                </View>
            )
        }
    ];

    return (
        <InfoModal
            isOpen={isOpen}
            onClose={onClose}
            title="Account Guardians"
            icon="🛡️"
            tabs={tabs}
        />
    );
}

const styles = StyleSheet.create({
    tabContent: {
        paddingBottom: 40,
    },
    descriptionText: {
        color: '#9ca3af',
        fontSize: 15,
        lineHeight: 24,
        marginBottom: 24,
    },
    boldWhiteText: {
        color: '#ffffff',
        fontWeight: 'bold',
    },
    cardContainer: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    cardLabel: {
        color: '#9ca3af',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 8,
    },
    cardText: {
        color: '#d1d5db',
        fontSize: 14,
        lineHeight: 24,
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
        alignItems: 'center',
        marginTop: 8,
    },
    infoBoxIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    infoBoxText: {
        flex: 1,
        color: '#e2e8f0',
        fontSize: 14,
        lineHeight: 20,
    },
    processContainer: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#3b82f6',
        marginBottom: 24,
    },
    processLabel: {
        color: '#9ca3af',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 8,
    },
    processText: {
        color: '#d1d5db',
        fontSize: 14,
        lineHeight: 24,
    },
    warningBox: {
        flexDirection: 'row',
        backgroundColor: '#451a03',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#78350f',
        alignItems: 'center',
        marginTop: 8,
    },
    warningIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    warningText: {
        flex: 1,
        color: '#fdba74',
        fontSize: 14,
        lineHeight: 20,
    },
});
