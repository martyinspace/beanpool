import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { InfoModal, InfoModalTab } from '../InfoModal';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function PricingInfoModal({ isOpen, onClose }: Props) {
    const tabs: InfoModalTab[] = [
        {
            id: 'guide',
            label: '💡 Pricing Guide',
            content: (
                <View style={styles.tabContent}>
                    <Text style={styles.descriptionText}>
                        BeanPool uses a mutual credit system. Since credits represent real value and time, we recommend following this general pricing guide for your offers and needs.
                    </Text>

                    <View style={styles.processContainer}>
                        <Text style={styles.processLabel}>SUGGESTED PRICING BRACKETS</Text>

                        <View style={styles.priceRow}>
                            <View style={styles.priceCol}>
                                <Text style={styles.priceText}>0</Text>
                                <Image source={require('../../assets/images/bean.png')} style={styles.beanIcon} />
                            </View>
                            <View style={styles.descCol}>
                                <Text style={styles.descText}>Gifts, freebies, and community contributions.</Text>
                            </View>
                        </View>

                        <View style={styles.priceRow}>
                            <View style={styles.priceCol}>
                                <Text style={styles.priceText}>1–10</Text>
                                <Image source={require('../../assets/images/bean.png')} style={styles.beanIcon} />
                            </View>
                            <View style={styles.descCol}>
                                <Text style={styles.descText}>Small favours, home produce, quick tasks, or simple tools.</Text>
                            </View>
                        </View>

                        <View style={styles.priceRow}>
                            <View style={styles.priceCol}>
                                <Text style={styles.priceText}>10–40</Text>
                                <Image source={require('../../assets/images/bean.png')} style={styles.beanIcon} />
                            </View>
                            <View style={styles.descCol}>
                                <Text style={styles.descText}>Skilled labour (per hour), substantial goods, or tech repairs.</Text>
                            </View>
                        </View>

                        <View style={styles.priceRow}>
                            <View style={styles.priceCol}>
                                <Text style={styles.priceText}>40–100</Text>
                                <Image source={require('../../assets/images/bean.png')} style={styles.beanIcon} />
                            </View>
                            <View style={styles.descCol}>
                                <Text style={styles.descText}>Professional services, large items, or event catering.</Text>
                            </View>
                        </View>

                        <View style={styles.priceRow}>
                            <View style={styles.priceCol}>
                                <Text style={styles.priceText}>100+</Text>
                                <Image source={require('../../assets/images/bean.png')} style={styles.beanIcon} />
                            </View>
                            <View style={styles.descCol}>
                                <Text style={styles.descText}>Major projects, housing rentals, vehicles, or commercial contracts.</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoBoxIcon}>🤝</Text>
                        <Text style={styles.infoBoxText}>
                            These are just guidelines. You are free to negotiate prices with other members based on your own needs and the value of your time!
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
            title="Pricing Guide"
            icon={<Text style={{ fontSize: 24 }}>💡</Text>}
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
    processContainer: {
        backgroundColor: '#1f2937',
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#10b981',
        marginBottom: 24,
    },
    processLabel: {
        color: '#9ca3af',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 16,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    priceCol: {
        flexDirection: 'row',
        alignItems: 'center',
        width: 70,
        justifyContent: 'flex-start',
    },
    priceText: {
        color: '#10b981',
        fontWeight: '900',
        fontSize: 15,
        marginRight: 4,
    },
    beanIcon: {
        width: 16,
        height: 16,
        resizeMode: 'contain',
    },
    descCol: {
        flex: 1,
    },
    descText: {
        color: '#d1d5db',
        fontSize: 14,
        lineHeight: 20,
    },
    infoBox: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#1e293b',
        alignItems: 'center',
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
});
