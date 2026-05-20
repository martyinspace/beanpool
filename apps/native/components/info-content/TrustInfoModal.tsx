import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function TrustInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'levels',
            label: 'Trust Levels',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Your <Text style={styles.boldWhiteText}>Trust Level</Text> reflects your reputation and contribution to the BeanPool community. As you participate more, your level increases, unlocking new perks.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>HOW TO LEVEL UP</Text>
                        <Text style={styles.cardText}>
                            Earn points by:{'\n'}
                            • Completing trades with others (8 pts){'\n'}
                            • Trading with new partners (40 pts){'\n'}
                            • Remaining an active member (2 pts/day)
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>WHAT YOU UNLOCK</Text>
                        <Text style={styles.cardText}>
                            As your level increases, you gain access to:{'\n'}
                            • Larger negative floor limits for trading{'\n'}
                            • The ability to send credits to others{'\n'}
                            • The ability to invite new members
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'perks',
            label: 'Perks & Restrictions',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Different trust tiers provide different capabilities to protect the network from abuse.
                    </Text>

                    <View style={styles.tierContainer}>
                        <Text style={styles.tierTitle}>👻 Ghost (Starting Tier)</Text>
                        <Text style={styles.tierText}>
                            Can trade on the marketplace but cannot invite others or send arbitrary credits. Floor limit is restricted.
                        </Text>
                    </View>

                    <View style={styles.tierContainer}>
                        <Text style={styles.tierTitle}>🏠 Resident (Level 2)</Text>
                        <Text style={styles.tierText}>
                            Unlocks the ability to send credits peer-to-peer and increases your available floor limit.
                        </Text>
                    </View>

                    <View style={styles.tierContainer}>
                        <Text style={styles.tierTitle}>🏛️ Citizen (Level 3)</Text>
                        <Text style={styles.tierText}>
                            Unlocks the ability to invite new members to the community and further expands your floor limit.
                        </Text>
                    </View>

                    <View style={styles.tierContainer}>
                        <Text style={styles.tierTitle}>👑 Elder (Max Level)</Text>
                        <Text style={styles.tierText}>
                            Maximum trust level with the highest available floor limit in the network.
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
            title="Trust & Reputation"
            icon={<MaterialCommunityIcons name="shield-star" size={24} color="#10b981" />}
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
    tierContainer: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#10b981',
        marginBottom: 16,
    },
    tierTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    tierText: {
        color: '#d1d5db',
        fontSize: 14,
        lineHeight: 22,
    }
});
