import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';
import { CurrencyDisplay } from '../CurrencyDisplay';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const TIERS = [
    { level: 'Seed', icon: '🌱', req: 'Default', limit: -100, color: '#22c55e' },
    { level: 'Sprout', icon: '🌿', req: '500 Total Cycled', limit: -500, color: '#84cc16' },
    { level: 'Vine', icon: '🪴', req: '2,000 Total Cycled', limit: -1000, color: '#eab308' },
    { level: 'Blossom', icon: '🌸', req: '5,000 Total Cycled', limit: -2500, color: '#f97316' },
    { level: 'Harvest', icon: '🌳', req: '10,000 Total Cycled', limit: -5000, color: '#ef4444' },
];

export function TierInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'tiers',
            label: '🎖️ Membership Tiers',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Your membership tier determines your <Text style={styles.boldWhiteText}>Floor Limit</Text> (how far negative your balance can go). You start at the Seed tier and progress by actively trading in the network.
                    </Text>

                    <View style={styles.tiersContainer}>
                        <View style={styles.tiersHeader}>
                            <Text style={[styles.tiersHeaderText, { flex: 2 }]}>Tier / Requirement</Text>
                            <Text style={[styles.tiersHeaderText, { flex: 1, textAlign: 'right' }]}>Floor Limit</Text>
                        </View>
                        
                        {TIERS.map((tier, i) => (
                            <View key={i} style={styles.tierRow}>
                                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.tierIcon}>{tier.icon}</Text>
                                    <View>
                                        <Text style={[styles.tierLevel, { color: tier.color }]}>{tier.level}</Text>
                                        <Text style={styles.tierReq}>{tier.req}</Text>
                                    </View>
                                </View>
                                <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                                    <Text style={styles.tierLimit}>{tier.limit}</Text>
                                    <CurrencyDisplay hideAmount={true} style={{ fontSize: 12 }} />
                                </View>
                            </View>
                        ))}
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxIcon}>📈</Text>
                        <Text style={styles.infoBoxText}>
                            "Total Cycled" means the total volume of all your trades (both buying and selling) since joining BeanPool.
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'progression',
            label: '⭐ How to Level Up',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        BeanPool is built on trust, and trust is earned through participation. Leveling up grants you a larger credit line to facilitate bigger trades.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>1. CYCLE MORE BEANS</Text>
                        <Text style={styles.cardText}>
                            The primary way to level up is to use the network! Both earning and spending credits count towards your "Total Cycled" metric.
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>2. MAINTAIN GOOD STANDING</Text>
                        <Text style={styles.cardText}>
                            Users who consistently stay at their maximum floor limit without attempting to earn credits back may have their tier progression paused or their floor limit temporarily reduced.
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>3. BECOME A GUARDIAN</Text>
                        <Text style={styles.cardText}>
                            Harvest tier members can be elected as Network Guardians, giving them additional responsibilities to verify new members and arbitrate disputes.
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
            title="Tier Progression"
            icon="🎖️"
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
    tiersContainer: {
        backgroundColor: '#1f2937',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 24,
    },
    tiersHeader: {
        flexDirection: 'row',
        backgroundColor: '#374151',
        padding: 12,
        paddingHorizontal: 16,
    },
    tiersHeaderText: {
        color: '#9ca3af',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    tierRow: {
        flexDirection: 'row',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
    },
    tierIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    tierLevel: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    tierReq: {
        color: '#9ca3af',
        fontSize: 12,
    },
    tierLimit: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: 'Courier',
    },
});
