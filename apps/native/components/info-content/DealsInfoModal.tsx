import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';
import { CurrencyDisplay } from '../CurrencyDisplay';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function DealsInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'escrow',
            label: '🤝 Held in Trust',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        BeanPool uses a <Text style={styles.boldWhiteText}>Trust Wallet</Text> system to protect both buyers and sellers during a transaction.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>HOW DEALS WORK</Text>
                        <Text style={styles.cardText}>
                            1. Buyer accepts an offer or Seller accepts a need.{'\n'}
                            2. The <CurrencyDisplay hideAmount={true} /> credits are locked in a Trust Wallet (they leave the buyer's account but aren't given to the seller yet).{'\n'}
                            3. Both parties meet to exchange the goods/services.{'\n'}
                            4. The Buyer releases the funds held in trust to complete the deal.
                        </Text>
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxIcon}>💡</Text>
                        <Text style={styles.infoBoxText}>
                            If there is a dispute and the goods aren't delivered, the buyer can cancel the trust hold to get their credits back, or involve a Guardian for arbitration.
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'reviews',
            label: '⭐ Reviews',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        After a deal is completed, both the buyer and seller should leave a <Text style={styles.boldWhiteText}>Review</Text> for each other.
                    </Text>

                    <View style={styles.processContainer}>
                        <Text style={styles.processLabel}>TRUST SCORE</Text>
                        <Text style={styles.processText}>
                            Your reviews directly impact your <Text style={styles.boldWhiteText}>Trust Score</Text>, which is visible on your public profile. Building a high trust score makes it easier to find trading partners!
                        </Text>
                    </View>

                    <View style={styles.warningBox}>
                        <Text style={styles.warningIcon}>⚠️</Text>
                        <Text style={styles.warningText}>
                            Repeated bad reviews or failing to release funds held in trust will result in an automatic review by Network Guardians, which may lead to account suspension.
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
            title="My Deals & Trust Hold"
            icon="🤝"
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
