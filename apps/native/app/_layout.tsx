import 'fast-text-encoding';
import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { Alert, LogBox, AppState, AppStateStatus } from 'react-native';
import { registerPillarSync } from '../services/background-task';
import { performSync } from '../services/pillar-sync';
import { registerForPushNotifications, setupNotificationResponseHandler } from '../services/push-notifications';
import { initDB, clearDB } from '../utils/db';
import { IdentityProvider, useIdentity } from './IdentityContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

LogBox.ignoreLogs(['ProgressBarAndroid', 'Clipboard', 'PushNotificationIOS', 'has been extracted']);

function RootLayoutNav() {
    const { identity, isLoading } = useIdentity();
    const segments = useSegments();
    const router = useRouter();
    const incomingUrl = Linking.useURL();

    const params = useGlobalSearchParams();

    // Handle incoming deep links for logged-in users (multi-node support)
    useEffect(() => {
        if (!identity || !incomingUrl) return;
        let mounted = true;
        const parsed = Linking.parse(incomingUrl);
        if (parsed.queryParams?.invite) {
            if (incomingUrl.startsWith('http')) {
                const originMatch = incomingUrl.match(/^https?:\/\/[^\/?#]+/);
                if (originMatch) {
                    const extracted = originMatch[0];
                    AsyncStorage.getItem('beanpool_anchor_url').then(current => {
                        if (!mounted) return;
                        if (current !== extracted) {
                            Alert.alert(
                                'Switch Nodes?',
                                `You have been invited to a community node at ${extracted}. Would you like to switch your active connection to this node?`,
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Switch',
                                        onPress: () => {
                                            AsyncStorage.setItem('beanpool_anchor_url', extracted)
                                                .then(() => {
                                                    Alert.alert('Success', 'Node switched. Synchronizing...');
                                                    performSync();
                                                });
                                        }
                                    }
                                ]
                            );
                        }
                    });
                }
            }
        }
        return () => { mounted = false; };
    }, [incomingUrl, identity]);

    useEffect(() => {
        if (isLoading) return;

        // If we have no identity and we aren't already on the welcome screen, kick us out
        if (!identity && segments[0] !== 'welcome') {
            setTimeout(() => {
                router.replace('/welcome');
            }, 50);
        }
        // If we DO have an identity and we are stuck on the welcome screen or root, push us into the secure area
        else if (identity && ((segments as string[]).length === 0 || (segments as string[])[0] === 'welcome')) {
            router.replace('/(tabs)');
        }
    }, [identity, isLoading, segments]);

    // Register for push notifications when identity is available
    useEffect(() => {
        if (!identity?.publicKey) return;
        registerForPushNotifications(identity.publicKey).catch(console.warn);
    }, [identity?.publicKey]);

    // Set up notification deep-link handler
    useEffect(() => {
        const subscription = setupNotificationResponseHandler();
        return () => subscription.remove();
    }, []);

    if (isLoading) return null; // Or a splash screen

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="welcome" />
            <Stack.Screen name="post/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="propose-project" options={{ presentation: 'modal' }} />
            <Stack.Screen name="public-profile" options={{ presentation: 'modal' }} />
            <Stack.Screen name="new-message" options={{ headerShown: false, animation: 'slide_from_right' }} />
            <Stack.Screen name="chat/[id]" />
        </Stack>
    );
}

export default function RootLayout() {
    const appState = useRef(AppState.currentState);

    useEffect(() => {
        initDB()
            .then(() => registerPillarSync())
            // Trigger Immediate foreground sync
            .then(() => performSync())
            .then((result) => {
                if (!result.success) {
                    console.log('[Init Sync] Soft failure on initial sync:', result.errorMessage);
                }
            })
            .catch(err => {
                console.error('[Init DB] Error:', err);
                Alert.alert('DB Error', String(err));
            });

        // Set up foreground polling every 15 seconds
        const intervalId = setInterval(() => {
            if (appState.current === 'active') {
                performSync();
            }
        }, 15000);

        // App state listener to trigger sync when returning to foreground
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                performSync();
                // Clear app icon badge when user opens the app
                try {
                    const Notif = require('expo-notifications');
                    Notif.setBadgeCountAsync(0).catch(() => {});
                } catch {}
            }
            appState.current = nextAppState;
        });

        return () => {
            clearInterval(intervalId);
            subscription.remove();
        };
    }, []);

    return (
        <IdentityProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
        </IdentityProvider>
    );
}
