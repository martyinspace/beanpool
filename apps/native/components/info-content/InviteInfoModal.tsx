import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function InviteInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'invites',
            label: '🎟️ Network Invites',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        BeanPool is an invite-only network. To grow the community safely, we rely on a <Text style={styles.boldWhiteText}>Peer Vouching</Text> system.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>HOW TO GET INVITES</Text>
                        <Text style={styles.cardText}>
                            You unlock the ability to invite new members once you reach the <Text style={styles.boldWhiteText}>Vine Tier</Text> (2,000 total volume cycled). The more you trade, the more invite slots you earn over time.
                        </Text>
                    </View>

                    <View style={styles.warningBox}>
                        <Text style={styles.warningIcon}>⚠️</Text>
                        <Text style={styles.warningText}>
                            Your reputation is tied to the people you invite. If you invite someone who scams the community, your own floor limit and tier may be penalized!
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'vouching',
            label: '🤝 Vouching',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        When you invite someone, you are <Text style={styles.boldWhiteText}>vouching</Text> for them. This creates a web of trust across the network.
                    </Text>

                    <View style={styles.processContainer}>
                        <Text style={styles.processLabel}>VOUCHING PROCESS</Text>
                        <Text style={styles.processText}>
                            1. Generate a single-use invite link{'\n'}
                            2. Share it securely with someone you trust{'\n'}
                            3. They create an account and join as a Seed{'\n'}
                            4. Your profile is permanently linked as their inviter
                        </Text>
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxIcon}>💡</Text>
                        <Text style={styles.infoBoxText}>
                            Because of the vouching system, we don't need invasive KYC (Know Your Customer) checks. Trust is maintained peer-to-peer!
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
            title="Invites & Vouching"
            icon="🎟️"
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
        borderLeftColor: '#8b5cf6',
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
