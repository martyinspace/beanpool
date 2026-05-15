import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';
import { CurrencyDisplay } from '../CurrencyDisplay';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function CirculationInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'demurrage',
            label: 'What is Demurrage?',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        <Text style={styles.boldWhiteText}>Demurrage</Text> is a small monthly reduction applied to positive credit balances. It acts as a circulation incentive to prevent hoarding and keep the economy active.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>HOW IT WORKS</Text>
                        <Text style={styles.cardText}>
                            On the last day of each month, a percentage of your balance is deducted based on progressive tax brackets. The larger your balance, the higher the rate applied to the top brackets.
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>WHERE DOES IT GO?</Text>
                        <Text style={styles.cardText}>
                            100% of collected demurrage goes directly into the <Text style={styles.boldWhiteText}>Community Commons</Text>. These funds are then distributed to community-voted projects through Quadratic Voting.
                        </Text>
                    </View>

                    <View style={styles.infoBox}>
                        <MaterialCommunityIcons name="water" size={24} color="#3b82f6" style={styles.infoBoxIcon} />
                        <Text style={styles.infoBoxText}>
                            Unlike interest which rewards hoarding, demurrage rewards circulation. It encourages you to spend your credits on community services!
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'recovery',
            label: 'Debt Recovery',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        If you have a <Text style={styles.boldWhiteText}>negative balance</Text> (you've spent more than you've earned using your Floor Limit), your account goes into debt recovery mode.
                    </Text>

                    <View style={styles.limitContainer}>
                        <Text style={styles.limitTitle}>Negative Balances</Text>
                        <Text style={styles.limitText}>
                            Negative balances are <Text style={styles.boldWhiteText}>exempt from demurrage</Text>. You will not be charged monthly fees on a negative balance.
                        </Text>
                    </View>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>CLEARING YOUR DEBT</Text>
                        <Text style={styles.cardText}>
                            To return to a positive balance, you must offer goods or services to the community. When you earn credits, they will automatically pay down your negative balance until you reach zero.
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
            title="System Circulation"
            icon={<MaterialCommunityIcons name="sync" size={24} color="#3b82f6" />}
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
        borderLeftColor: '#10b981',
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
});
