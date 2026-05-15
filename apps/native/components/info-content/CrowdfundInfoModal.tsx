import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';
import { CurrencyDisplay } from '../CurrencyDisplay';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function CrowdfundInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'voting',
            label: '🗳️ Voting',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        <Text style={styles.boldWhiteText}>Crowdfund Projects</Text> are initiatives proposed by the community to improve the local area. Instead of members paying for them directly, they are funded by the <Text style={styles.boldWhiteText}>Community Commons Fund</Text>.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>HOW IT WORKS</Text>
                        <Text style={styles.cardText}>
                            1. Members propose public goods projects.{'\n'}
                            2. You use your personal credits to <Text style={styles.boldWhiteText}>vote</Text> on projects you support.{'\n'}
                            3. Your votes signal the network to direct funds from the Commons Fund to those projects.
                        </Text>
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxIcon}>💡</Text>
                        <Text style={styles.infoBoxText}>
                            You are NOT spending your own credits to fund the project directly! You are using a small amount of your credits to "buy" votes, which directs a much larger pool of Commons funds.
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'quadratic',
            label: '📈 Quadratic Costs',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        BeanPool uses <Text style={styles.boldWhiteText}>Quadratic Voting</Text>. This means you can vote multiple times for the same project, but each additional vote costs more.
                    </Text>

                    <View style={styles.processContainer}>
                        <Text style={styles.processLabel}>VOTING COSTS</Text>
                        <Text style={styles.processText}>
                            • 1st vote: 1 <CurrencyDisplay hideAmount={true} />{'\n'}
                            • 2nd vote: 4 <CurrencyDisplay hideAmount={true} />{'\n'}
                            • 3rd vote: 9 <CurrencyDisplay hideAmount={true} />{'\n'}
                            • 4th vote: 16 <CurrencyDisplay hideAmount={true} />
                        </Text>
                    </View>

                    <View style={styles.warningBox}>
                        <Text style={styles.warningIcon}>⚖️</Text>
                        <Text style={styles.warningText}>
                            This system prevents a few wealthy members from dominating the vote. It strongly favors projects that have broad support from many different people!
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
            title="Crowdfund Projects"
            icon="🏗️"
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
