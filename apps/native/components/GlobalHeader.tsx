import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { SyncStatus } from './SyncStatus';

export function GlobalHeader() {
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const [locationEnabled, setLocationEnabled] = useState(true);

    const isMapScreen = pathname === '/';

    return (
        <View style={[styles.headerWrapper, isMapScreen && styles.headerAbsolute]}>
            <View style={StyleSheet.absoluteFillObject}>
                <Image 
                    source={require('../assets/images/neon-vines-banner.png')} 
                    style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', transform: [{ scale: 1.5 }] }]}
                    resizeMode="cover"
                />
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
            </View>

            <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top + 10, 40) }]} pointerEvents="box-none">
                {/* LEFT: Sync Status */}
                <View style={styles.headerLeft}>
                    <SyncStatus />
                </View>

                {/* CENTER: beanpool.org Text Logo */}
                <View style={[styles.headerCenter, { zIndex: 10 }]}>
                    <Image 
                        source={require('../assets/images/logo.png')} 
                        style={{ width: 281, height: 69 }} 
                        resizeMode="contain" 
                    />
                </View>

                {/* RIGHT: Controls */}
                <View style={styles.headerRightControls}>
                    <TouchableOpacity 
                        style={[styles.controlPillBtn, { borderRightWidth: 1, borderColor: '#e5e7eb' }]} 
                        onPress={() => setLocationEnabled(!locationEnabled)} 
                    >
                        <MaterialCommunityIcons name={locationEnabled ? "map-marker-outline" : "map-marker-off-outline"} size={17} color="#4b5563" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={styles.controlPillBtn} 
                        onPress={() => {
                            if (pathname === '/settings') {
                                router.back();
                            } else {
                                router.push('/settings');
                            }
                        }}
                    >
                        <MaterialCommunityIcons name="tune" size={17} color={pathname === '/settings' ? "#8b5cf6" : "#4b5563"} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    headerWrapper: {
        width: '100%',
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        overflow: 'hidden',
    },
    headerAbsolute: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
        borderBottomWidth: 0,
        zIndex: 100,
        elevation: 100,
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    headerLeft: { flex: 1, alignItems: 'flex-start' },
    headerCenter: { flex: 2, alignItems: 'center', justifyContent: 'center' },
    headerRight: { flex: 1, alignItems: 'flex-end' },
    logoBadge: {
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        paddingHorizontal: 20,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    logoText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
        letterSpacing: 2,
        textTransform: 'lowercase',
    },
    logoHighlight: {
        color: '#cb5326', // terra-400 equivalent
    },
    pillBase: {alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', height: 32, overflow: 'hidden' },
    headerRightControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', height: 32, width: 86, overflow: 'hidden' },
    controlPillBtn: { paddingHorizontal: 12, height: '100%', justifyContent: 'center', alignItems: 'center' },
});
