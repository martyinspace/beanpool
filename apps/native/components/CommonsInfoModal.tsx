import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CurrencyDisplay } from './CurrencyDisplay';
import { InfoModal, InfoModalTab } from './InfoModal';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const BRACKETS = [
    { min: 0, max: 200, rate: 0.5, color: '#22c55e' },
    { min: 200, max: 500, rate: 1.0, color: '#84cc16' },
    { min: 500, max: 1000, rate: 1.5, color: '#eab308' },
    { min: 1000, max: 2000, rate: 2.0, color: '#f97316' },
    { min: 2000, max: Infinity, rate: 2.5, color: '#ef4444' },
];

const FLOW_STEPS = [
    { icon: <MaterialCommunityIcons name="handshake" size={24} color="#10b981" />, label: 'My Trade', desc: 'Credits earned through community exchange' },
    { icon: <MaterialCommunityIcons name="leaf" size={24} color="#10b981" />, label: 'Demurrage', desc: 'Progressive monthly contribution from positive balances' },
    { icon: <MaterialCommunityIcons name="bank" size={24} color="#fcd34d" />, label: 'Commons Pool', desc: 'Community fund growing from all members\' contributions' },
    { icon: <MaterialCommunityIcons name="vote" size={24} color="#3b82f6" />, label: 'My Vote', desc: 'Quadratic Voting: N votes costs N² credits' },
    { icon: <MaterialCommunityIcons name="rocket-launch" size={24} color="#8b5cf6" />, label: 'Community Project', desc: 'Winning projects funded from the Commons Pool' },
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    commonsBalance?: number;
}

export function CommonsInfoModal({ isOpen, onClose, commonsBalance }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'flow',
            label: 'How It Works',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        The Community Commons is a self-sustaining fund that redistributes value back to the community through democratically-voted projects.
                    </Text>

                    {commonsBalance !== undefined && (
                        <View style={styles.balanceContainer}>
                            <Text style={styles.balanceLabel}>CURRENT COMMONS BALANCE</Text>
                            <CurrencyDisplay amount={commonsBalance.toFixed(2)} style={styles.balanceAmount} />
                        </View>
                    )}

                    <View style={styles.flowContainer}>
                        {FLOW_STEPS.map((step, i) => (
                            <View key={i}>
                                <View style={styles.flowStep}>
                                    <View style={styles.flowStepIcon}>{step.icon}</View>
                                    <View style={styles.flowStepTextContainer}>
                                        <Text style={styles.flowStepLabel}>{step.label}</Text>
                                        <Text style={styles.flowStepDesc}>{step.desc}</Text>
                                    </View>
                                </View>
                                {i < FLOW_STEPS.length - 1 && (
                                    <View style={styles.flowConnector}>
                                        <MaterialCommunityIcons name="arrow-down" size={24} color="#4b5563" />
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                </View>
            )
        },
        {
            id: 'brackets',
            label: 'Tax Brackets',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        Demurrage is a <Text style={styles.boldWhiteText}>progressive monthly contribution</Text> from positive balances.
                        Like income tax brackets, only the portion of your balance within each tier is taxed at that tier's rate.
                    </Text>

                    <View style={styles.bracketsContainer}>
                        {BRACKETS.map((b, i) => {
                            const range = b.max === Infinity ? `${b.min}+` : `${b.min}–${b.max}`;
                            const width = b.max === Infinity ? 100 : (b.rate / 2.5) * 100;
                            return (
                                <View key={i} style={styles.bracketRow}>
                                    <View style={styles.bracketHeader}>
                                        <Text style={styles.bracketRange}>{range}</Text>
                                        <CurrencyDisplay hideAmount={true} style={{ fontSize: 14, marginLeft: 2 }} />
                                        <Text style={[styles.bracketRate, { color: b.color }]}>{b.rate}%</Text>
                                    </View>
                                    <View style={styles.bracketBarBg}>
                                        <View style={[
                                            styles.bracketBarFill,
                                            { width: `${width}%`, backgroundColor: b.color }
                                        ]} />
                                    </View>
                                </View>
                            );
                        })}
                    </View>

                    <View style={styles.exampleContainer}>
                        <Text style={styles.exampleLabel}>EXAMPLE</Text>
                        <Text style={styles.exampleText}>
                            A balance of <Text style={styles.boldWhiteText}>600 </Text><CurrencyDisplay hideAmount={true} style={{ fontSize: 14, marginLeft: 2 }} /> pays:{'\n'}
                            200 × 0.5% = 1.0 + 300 × 1.0% = 3.0 + 100 × 1.5% = 1.5 = <Text style={styles.exampleResult}>5.5 </Text><CurrencyDisplay hideAmount={true} style={{ fontSize: 14, marginLeft: 2 }} />/month
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'qv',
            label: 'Voting',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        <Text style={styles.boldWhiteText}>Quadratic Voting</Text> ensures fair allocation — many small voices outweigh a few large ones.
                    </Text>

                    <View style={styles.formulaContainer}>
                        <Text style={styles.formulaLabel}>FORMULA</Text>
                        <Text style={styles.formulaText}>Cost = Votes²</Text>
                    </View>

                    <View style={styles.qvTable}>
                        {[1, 2, 3, 5, 10].map(n => (
                            <View key={n} style={styles.qvRow2}>
                                <Text style={styles.qvRowVotes}>{n} vote{n > 1 ? 's' : ''}</Text>
                                <Text style={styles.qvRowCost}>{n * n} credits</Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.creditsInfoSection}>
                        <Text style={styles.creditsInfoLabel}>HOW CREDITS ARE EARNED</Text>
                        <Text style={styles.descriptionText}>
                            Your governance credits are earned through <Text style={styles.boldWhiteText}>community participation</Text> — the total beans you've transacted (energy cycled).
                            The more you trade and contribute, the more voice you earn in shaping community projects.
                        </Text>
                    </View>

                    <View style={styles.processContainer}>
                        <Text style={styles.processLabel}>PROCESS</Text>
                        <Text style={styles.processText}>
                            1. Members propose projects{'\n'}
                            2. Admin opens a voting round with a close date{'\n'}
                            3. Members allocate votes to projects{'\n'}
                            4. At round end, the top-voted project is paid its requested amount from the Commons Pool. Any leftover stays in the pool for future rounds.
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
            title="Community Commons"
            icon={<MaterialCommunityIcons name="bank" size={24} color="#fcd34d" />}
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
    balanceContainer: {
        backgroundColor: '#064e3b',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#059669',
    },
    balanceLabel: {
        color: '#34d399',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 8,
    },
    balanceAmount: {
        color: '#ffffff',
        fontSize: 36,
        fontWeight: 'bold',
    },
    flowContainer: {
        marginLeft: 8,
    },
    flowStep: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
    },
    flowStepIcon: {
        marginRight: 16,
    },
    flowStepTextContainer: {
        flex: 1,
    },
    flowStepLabel: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    flowStepDesc: {
        color: '#9ca3af',
        fontSize: 13,
        lineHeight: 18,
    },
    flowConnector: {
        alignItems: 'center',
        paddingVertical: 8,
        marginLeft: 28,
        alignSelf: 'flex-start',
    },
    bracketsContainer: {
        marginBottom: 24,
    },
    bracketRow: {
        marginBottom: 16,
    },
    bracketHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    bracketRange: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    bracketRate: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    bracketBarBg: {
        height: 8,
        backgroundColor: '#1f2937',
        borderRadius: 4,
        overflow: 'hidden',
    },
    bracketBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    exampleContainer: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#374151',
    },
    exampleLabel: {
        color: '#9ca3af',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 8,
    },
    exampleText: {
        color: '#d1d5db',
        fontSize: 14,
        lineHeight: 22,
    },
    exampleResult: {
        color: '#10b981',
        fontWeight: 'bold',
    },
    formulaContainer: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 24,
    },
    formulaLabel: {
        color: '#9ca3af',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 8,
    },
    formulaText: {
        color: '#60a5fa',
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: 'Courier',
    },
    qvTable: {
        backgroundColor: '#1f2937',
        borderRadius: 12,
        padding: 16,
        marginBottom: 32,
    },
    qvRow2: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
    },
    qvRowVotes: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '500',
    },
    qvRowCost: {
        color: '#f87171',
        fontSize: 16,
        fontWeight: 'bold',
    },
    creditsInfoSection: {
        marginBottom: 24,
    },
    creditsInfoLabel: {
        color: '#9ca3af',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 12,
    },
    processContainer: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#3b82f6',
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
});
