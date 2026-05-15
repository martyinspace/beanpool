import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';
import { CurrencyDisplay } from '../CurrencyDisplay';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function BalanceInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'balance',
            label: '💰 Your Balance',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Your balance represents your current available trading power within the BeanPool network.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>HOW TO EARN</Text>
                        <Text style={styles.cardText}>
                            • Sell goods or services to the community{'\n'}
                            • Complete community bounties{'\n'}
                            • Receive peer-to-peer transfers
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>HOW TO SPEND</Text>
                        <Text style={styles.cardText}>
                            • Purchase goods from the Market{'\n'}
                            • Pay for community services{'\n'}
                            • Transfer to other members
                        </Text>
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxIcon}>💡</Text>
                        <Text style={styles.infoBoxText}>
                            Credits in BeanPool are backed by real community trust and exchange, not fiat currency.
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'floor',
            label: '🛡️ Floor Balance',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Every member has access to a <Text style={styles.boldWhiteText}>Floor Balance</Text> (credit line) based on their community tier. This allows you to trade even if you temporarily have zero credits.
                    </Text>

                    <View style={styles.limitContainer}>
                        <Text style={styles.limitTitle}>Negative Balances</Text>
                        <Text style={styles.limitText}>
                            If you spend past zero, your balance becomes negative up to your tier limit. When you earn credits again, they will first pay off this negative balance.
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>WHY A FLOOR?</Text>
                        <Text style={styles.cardText}>
                            Traditional systems stop you from trading when you're broke. A mutual credit system like BeanPool allows the community to extend trust so trade can continue flowing.
                        </Text>
                    </View>

                    <View style={styles.warningBox}>
                        <Text style={styles.warningIcon}>⚠️</Text>
                        <Text style={styles.warningText}>
                            Members who stay at their maximum floor balance for over 3 months without active trading may face account suspension.
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
            title="Available Balance"
            icon="💰"
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
    limitContainer: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#3b82f6',
        marginBottom: 24,
    },
    limitTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    limitText: {
        color: '#d1d5db',
        fontSize: 14,
        lineHeight: 22,
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
