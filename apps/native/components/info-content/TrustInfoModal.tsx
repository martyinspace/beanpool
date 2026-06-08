import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'levels' | 'perks';
}

export function TrustInfoModal({ isOpen, onClose, initialTab }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'levels',
            label: 'Trust Formula',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Your <Text style={styles.boldWhiteText}>Trust Points</Text> represent your contribution and reputation. They are calculated dynamically using trade activity, transaction volume, and reviews:
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>1. BASE SCORE</Text>
                        <Text style={styles.cardText}>
                            • completed trades (+8 pts each){'\n'}
                            • unique partners (+40 pts each){'\n'}
                            • days as active member (+2 pts/day){'\n'}
                            {'\n'}
                            💡 <Text style={styles.boldWhiteText}>Tenure Gate:</Text> Points from days as active member can never exceed points from trades + unique partners. This prevents idle accounts from opening large credit lines.
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>2. VOLUME BONUS</Text>
                        <Text style={styles.cardText}>
                            You earn <Text style={styles.boldWhiteText}>+1 point</Text> for every <Text style={styles.boldWhiteText}>100B</Text> cycled through marketplace deals, capped at a maximum bonus of <Text style={styles.boldWhiteText}>+200 points</Text>.
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>3. REPUTATION MULTIPLIER</Text>
                        <Text style={styles.cardText}>
                            Ratings left by counterparties directly scale your final points:{'\n'}
                            • 5.0 stars = 100% of score{'\n'}
                            • 4.0 stars = 90% of score{'\n'}
                            • 3.0 stars = 80% of score{'\n'}
                            • 1.0 star = 60% of score{'\n'}
                            • No reviews = 100% of score
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>4. PROGRESS SLIDER & MILESTONES</Text>
                        <Text style={styles.cardText}>
                            The progress bar shows your path towards becoming an <Text style={styles.boldWhiteText}>Elder (1,320 pts)</Text>:{'\n'}
                            • Milestones: 🥚 Newcomer (0 pts) → 🏠 Resident (120 pts) → 🏛️ Citizen (520 pts) → 👑 Elder (1,320 pts){'\n'}
                            • Standard Newcomers with no completed trades display a <Text style={styles.boldWhiteText}>🔑 Founding</Text> badge (a temporary status that graduates after your first trade).
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'perks',
            label: 'Tiers & Perks',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Your Trust Tier determines your spending capabilities, overdraft limits, and network permissions.
                    </Text>

                    <View style={[styles.tierContainer, { borderLeftColor: '#10b981' }]}>
                        <Text style={styles.tierTitle}>🔑 Founding Status (0 Trades)</Text>
                        <Text style={styles.tierText}>
                            • A temporary level that only lasts until you complete your very first trade{'\n'}
                            • Shows as <Text style={styles.boldWhiteText}>🔑 FOUNDING</Text> on profiles and listings{'\n'}
                            • Alerts other members to prioritize helping you complete your first trade{'\n'}
                            • Automatically graduates to Newcomer once your first transaction is completed!
                        </Text>
                    </View>

                    <View style={[styles.tierContainer, { borderLeftColor: '#6b7280' }]}>
                        <Text style={styles.tierTitle}>🥚 Newcomer (0 - 119 pts)</Text>
                        <Text style={styles.tierText}>
                            • Base overdraft floor: -80B (unlocks after 1st trade){'\n'}
                            • Rolling 20B daily spending limit for safety{'\n'}
                            • Can receive credits and view marketplace
                        </Text>
                    </View>

                    <View style={[styles.tierContainer, { borderLeftColor: '#2563eb' }]}>
                        <Text style={styles.tierTitle}>🏠 Resident (120 - 519 pts)</Text>
                        <Text style={styles.tierText}>
                            • Overdraft floor deepens to -200B{'\n'}
                            • Daily spending limits removed{'\n'}
                            • Unlocks P2P credit sending
                        </Text>
                    </View>

                    <View style={[styles.tierContainer, { borderLeftColor: '#7c3aed' }]}>
                        <Text style={styles.tierTitle}>🏛️ Citizen (520 - 1319 pts)</Text>
                        <Text style={styles.tierText}>
                            • Overdraft floor deepens to -600B{'\n'}
                            • Unlocks member invitations
                        </Text>
                    </View>

                    <View style={[styles.tierContainer, { borderLeftColor: '#d97706' }]}>
                        <Text style={styles.tierTitle}>👑 Elder (1320+ pts)</Text>
                        <Text style={styles.tierText}>
                            • Overdraft floor deepens to -1400B{'\n'}
                            • Premium gold highlight border on listings{'\n'}
                            • Unlocks community governance voice
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
            defaultTab={initialTab}
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
