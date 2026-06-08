import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function SliderInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'slider',
            label: 'Credit Slider',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        The balance slider is a continuous, color-coded spectrum showing your current financial state relative to your credit limits and demurrage brackets.
                    </Text>

                    <View style={styles.sweetSpotCard}>
                        <MaterialCommunityIcons name="scale-balance" size={32} color="#10b981" style={styles.centerIcon} />
                        <Text style={styles.sweetSpotTitle}>Zero is the Sweet Spot</Text>
                        <Text style={styles.sweetSpotText}>
                            Having a balance of zero means you have given exactly as much value to the community as you have received from it. You are in perfect reciprocity.
                        </Text>
                    </View>

                    <View style={styles.spectrumCard}>
                        <Text style={styles.cardLabel}>SPECTRUM COLOR ZONES</Text>
                        
                        <View style={styles.zoneRow}>
                            <View style={[styles.zoneIndicator, { backgroundColor: '#ef4444' }]} />
                            <View style={styles.zoneTextContainer}>
                                <Text style={styles.zoneTitle}>Red Zone (Extremes)</Text>
                                <Text style={styles.zoneDesc}>Max overdraft reached (left) or high demurrage bracket (2.5% at +2000B, right).</Text>
                            </View>
                        </View>

                        <View style={styles.zoneRow}>
                            <View style={[styles.zoneIndicator, { backgroundColor: '#f97316' }]} />
                            <View style={styles.zoneTextContainer}>
                                <Text style={styles.zoneTitle}>Orange & Yellow (Warning)</Text>
                                <Text style={styles.zoneDesc}>Approaching overdraft limits, or entering higher demurrage brackets (1.5% to 2.0%).</Text>
                            </View>
                        </View>

                        <View style={styles.zoneRow}>
                            <View style={[styles.zoneIndicator, { backgroundColor: '#22c55e' }]} />
                            <View style={styles.zoneTextContainer}>
                                <Text style={styles.zoneTitle}>Green Zone (Optimal)</Text>
                                <Text style={styles.zoneDesc}>Healthy balance near zero (down to -80B and up to +200B demurrage-free zone).</Text>
                            </View>
                        </View>
                    </View>
                </View>
            )
        },
        {
            id: 'floors',
            label: 'Overdraft Floors',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        The negative (left) side of the slider shows your <Text style={styles.boldWhiteText}>Overdraft Floor</Text>. This allows you to purchase goods and spend even if you temporarily have zero credits.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>FLOOR LIMITS BY TRUST TIER</Text>
                        
                        <View style={styles.limitRow}>
                            <Text style={styles.limitEmoji}>🌱</Text>
                            <View style={styles.limitDetails}>
                                <Text style={styles.limitTier}>Newcomer</Text>
                                <Text style={styles.limitValue}>-80B Overdraft Floor</Text>
                            </View>
                        </View>

                        <View style={styles.limitRow}>
                            <Text style={styles.limitEmoji}>🏠</Text>
                            <View style={styles.limitDetails}>
                                <Text style={styles.limitTier}>Resident</Text>
                                <Text style={styles.limitValue}>-200B Overdraft Floor</Text>
                            </View>
                        </View>

                        <View style={styles.limitRow}>
                            <Text style={styles.limitEmoji}>🏛️</Text>
                            <View style={styles.limitDetails}>
                                <Text style={styles.limitTier}>Citizen</Text>
                                <Text style={styles.limitValue}>-600B Overdraft Floor</Text>
                            </View>
                        </View>

                        <View style={styles.limitRow}>
                            <Text style={styles.limitEmoji}>👑</Text>
                            <View style={styles.limitDetails}>
                                <Text style={styles.limitTier}>Elder</Text>
                                <Text style={styles.limitValue}>-1,400B Overdraft Floor</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.infoBox}>
                        <MaterialCommunityIcons name="information" size={24} color="#6366f1" style={styles.infoBoxIcon} />
                        <Text style={styles.infoBoxText}>
                            Your negative balance is backed by community trust. When you earn credits from new trades, they automatically pay off this debt back toward zero.
                        </Text>
                    </View>
                </View>
            )
        },
        {
            id: 'brackets',
            label: 'Demurrage Brackets',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        The positive (right) side of the slider shows your <Text style={styles.boldWhiteText}>Demurrage Brackets</Text>. Progressive circulation fees apply monthly to positive balances to prevent hoarding.
                    </Text>

                    <View style={styles.cardContainer}>
                        <Text style={styles.cardLabel}>PROGRESSIVE MONTHLY DEMURRAGE</Text>
                        
                        <View style={styles.bracketRow}>
                            <Text style={styles.bracketRange}>0 – 200B</Text>
                            <Text style={[styles.bracketRate, { color: '#22c55e' }]}>0.0% (Demurrage-Free)</Text>
                        </View>
                        
                        <View style={styles.bracketRow}>
                            <Text style={styles.bracketRange}>200 – 500B</Text>
                            <Text style={[styles.bracketRate, { color: '#84cc16' }]}>1.0%</Text>
                        </View>

                        <View style={styles.bracketRow}>
                            <Text style={styles.bracketRange}>500 – 1000B</Text>
                            <Text style={[styles.bracketRate, { color: '#eab308' }]}>1.5%</Text>
                        </View>

                        <View style={styles.bracketRow}>
                            <Text style={styles.bracketRange}>1000 – 2000B</Text>
                            <Text style={[styles.bracketRate, { color: '#f97316' }]}>2.0%</Text>
                        </View>

                        <View style={styles.bracketRow}>
                            <Text style={styles.bracketRange}>2000B+</Text>
                            <Text style={[styles.bracketRate, { color: '#ef4444' }]}>2.5%</Text>
                        </View>
                    </View>

                    <View style={styles.exampleCard}>
                        <Text style={styles.exampleLabel}>CALCULATION EXAMPLE</Text>
                        <Text style={styles.exampleText}>
                            A balance of <Text style={styles.boldWhiteText}>600B</Text> pays monthly demurrage of:{'\n'}
                            • First 200B × 0% = 0.0B{'\n'}
                            • Next 300B (200 to 500) × 1.0% = 3.0B{'\n'}
                            • Remaining 100B (500 to 600) × 1.5% = 1.5B{'\n'}
                            • <Text style={styles.boldWhiteText}>Total demurrage = 4.5B / month</Text>
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
            title="Credit Slider Info"
            icon={<MaterialCommunityIcons name="chart-gantt" size={24} color="#10b981" />}
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
    spectrumCard: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    zoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        gap: 12,
    },
    zoneIndicator: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    zoneTextContainer: {
        flex: 1,
    },
    zoneTitle: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    zoneDesc: {
        color: '#9ca3af',
        fontSize: 12,
        lineHeight: 16,
    },
    sweetSpotCard: {
        backgroundColor: '#064e3b',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#059669',
    },
    centerIcon: {
        marginBottom: 12,
    },
    sweetSpotTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    sweetSpotText: {
        color: '#a7f3d0',
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
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
    limitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    limitEmoji: {
        fontSize: 24,
        width: 32,
        textAlign: 'center',
    },
    limitDetails: {
        flex: 1,
    },
    limitTier: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    limitValue: {
        color: '#9ca3af',
        fontSize: 12,
    },
    bracketRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#374151',
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
    exampleCard: {
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
});
