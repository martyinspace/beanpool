import 'fast-text-encoding';
import { useEffect, useState, useRef } from 'react';
import { Stack, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { Alert, LogBox, AppState, AppStateStatus, View, Text, TextInput, Pressable, Platform } from 'react-native';
import { MAX_FONT_SCALE } from '../constants/responsive';
import { registerPillarSync } from '../services/background-task';
import { requestSync } from '../services/pillar-sync';
import { startWebSocketSync, stopWebSocketSync } from '../services/ws-client';
import { registerForPushNotifications, setupNotificationResponseHandler } from '../services/push-notifications';
import { initDB, clearDB, closeDB, redeemInvite } from '../utils/db';
import { normaliseInviteCode, extractInviteToken, extractNodeOrigin } from '../utils/invite-parser';
import { IdentityProvider, useIdentity } from './IdentityContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import appConfig from '../app.json';

LogBox.ignoreLogs(['ProgressBarAndroid', 'Clipboard', 'PushNotificationIOS', 'has been extracted']);

// Cap OS font scaling app-wide so enlarged system fonts (common on low-end
// devices in our target markets) can't shatter row layouts. Components in
// fixed-size containers may still override with a tighter local value.
(Text as any).defaultProps = { ...(Text as any).defaultProps, maxFontSizeMultiplier: MAX_FONT_SCALE };
(TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, maxFontSizeMultiplier: MAX_FONT_SCALE };

function RootLayoutNav() {
    const { identity, isLoading } = useIdentity();
    const segments = useSegments();
    const router = useRouter();
    const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);
    const isComponentMounted = useRef(true);

    // Set up deep-link listeners for both cold starts and warm starts
    useEffect(() => {
        let active = true;

        // 1. Cold start deep link
        Linking.getInitialURL().then(url => {
            if (active && url) {
                setDeepLinkUrl(url);
            }
        });

        // 2. Warm start deep link (app in background/foreground)
        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (active && url) {
                setDeepLinkUrl(url);
            }
        });

        return () => {
            active = false;
            subscription.remove();
        };
    }, []);

    // Process incoming deep links (multi-node support and onboarding redirects)
    useEffect(() => {
        if (isLoading || !deepLinkUrl) return;

        const currentUrl = deepLinkUrl;
        // Immediately clear state to prevent double execution or infinite loops
        setDeepLinkUrl(null);

        const inviteToken = extractInviteToken(currentUrl);
        // Valid invite tokens must be present, and not be full HTTP URLs or paths
        if (!inviteToken || inviteToken.startsWith('http') || inviteToken.includes('/') || inviteToken.length < 5) {
            return;
        }
        const parsedCode = normaliseInviteCode(inviteToken);

        // Parse node origin / server address from deep link
        let extractedNodeOrigin: string | null = extractNodeOrigin(currentUrl);
        if (!extractedNodeOrigin) {
            const parsed = Linking.parse(currentUrl);
            const rawServer = parsed.queryParams?.server;
            const serverParam = typeof rawServer === 'string'
                ? rawServer
                : Array.isArray(rawServer)
                    ? rawServer[0]
                    : undefined;
            if (serverParam) {
                let decoded = decodeURIComponent(serverParam).trim();
                if (decoded && !decoded.startsWith('http')) {
                    const isIpOrLocal = /^(?:\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(decoded) || decoded.startsWith('localhost');
                    decoded = (isIpOrLocal ? 'http://' : 'https://') + decoded;
                }
                extractedNodeOrigin = decoded;
            }
        }

        // Case 1: No active identity (New user onboarding or completely wiped DB)
        if (!identity) {
            if (isComponentMounted.current) {
                router.replace({
                    pathname: '/welcome',
                    params: {
                        invite: parsedCode,
                        server: extractedNodeOrigin || undefined
                    }
                });
            }
            return;
        }

        // Case 2: User has active identity (Logged in)
        AsyncStorage.getItem('beanpool_anchor_url').then(current => {
            if (!isComponentMounted.current) return;
            const targetOrigin = extractedNodeOrigin || current;
            if (!targetOrigin) return;

            if (current !== targetOrigin) {
                setTimeout(() => {
                    if (!isComponentMounted.current) return;
                    Alert.alert(
                        'Switch Nodes?',
                        `You have been invited to a community node at ${targetOrigin}. Would you like to switch your active connection to this node and redeem your invite code?`,
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Switch & Join',
                                onPress: () => {
                                    closeDB()
                                        .then(() => AsyncStorage.setItem('beanpool_anchor_url', targetOrigin))
                                        .then(() => initDB())
                                        .then(async () => {
                                            if (!isComponentMounted.current) return;
                                            
                                            // Redeem!
                                            await redeemInvite(parsedCode, identity?.callsign || 'Unknown', identity);

                                            // Fetch and save new node details
                                            try {
                                                const healthRes = await fetch(`${targetOrigin}/api/community/health`, { method: 'GET' });
                                                if (healthRes.ok) {
                                                    const healthData = await healthRes.json();
                                                    const remoteName = healthData.nodeName || healthData.name || targetOrigin;
                                                    const cType = healthData.currency?.type || 'image';
                                                    const cVal = healthData.currency?.value || 'bean';
                                                    const { addSavedNode } = await import('../utils/nodes');
                                                    await addSavedNode(targetOrigin, remoteName, cType, cVal);
                                                }
                                            } catch (e) {
                                                console.warn('Failed to fetch node details for saving in deep link', e);
                                            }

                                            Alert.alert('Success', 'Node switched and invite redeemed successfully!');
                                            requestSync().catch(console.error);
                                            router.replace('/(tabs)');
                                        })
                                        .catch(err => {
                                            Alert.alert('Redemption Failed', err.message || String(err));
                                        });
                                }
                            }
                        ]
                    );
                }, 200);
            } else {
                // Same-node deep link check Guest mode or Repair
                const showActiveNodeDialog = (isMember: boolean) => {
                    setTimeout(() => {
                        if (!isComponentMounted.current) return;
                        Alert.alert(
                            isMember ? 'Already Connected' : 'Active Connection Invite',
                            isMember
                                ? `You are already a member of this community (${targetOrigin}). Would you like to repair/update your connection using this new invite, or wipe and start fresh?`
                                : `You scanned an invite for your active community (${targetOrigin}). How would you like to proceed?`,
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Wipe & Join Fresh',
                                    style: 'destructive',
                                    onPress: () => {
                                        Alert.alert(
                                            'Confirm Wipe',
                                            'This will permanently delete your local database and transaction cache for this community. Your key will be preserved, and you will be routed back to the welcome screen to register with this invite.',
                                            [
                                                { text: 'Cancel', style: 'cancel' },
                                                {
                                                    text: 'Wipe',
                                                    style: 'destructive',
                                                    onPress: async () => {
                                                        try {
                                                            await clearDB();
                                                            await AsyncStorage.removeItem('beanpool_anchor_url');
                                                            const { removeSavedNode } = await import('../utils/nodes');
                                                            await removeSavedNode(targetOrigin);
                                                            router.replace({ pathname: '/welcome', params: { invite: parsedCode, server: targetOrigin } });
                                                        } catch (err: any) {
                                                            Alert.alert('Wipe Failed', err.message);
                                                        }
                                                    }
                                                }
                                            ]
                                        );
                                    }
                                },
                                {
                                    text: 'Update Connection',
                                    onPress: () => {
                                        redeemInvite(parsedCode, identity?.callsign || 'Unknown', identity)
                                            .then(() => {
                                                Alert.alert('Success', 'Invite redeemed! Your connection is repaired and registered.');
                                                requestSync().catch(console.error);
                                                router.replace('/(tabs)');
                                            })
                                            .catch(err => {
                                                Alert.alert('Redemption Failed', err.message || String(err));
                                            });
                                    }
                                }
                            ]
                        );
                    }, 200);
                };

                fetch(`${targetOrigin}/api/community/membership/${identity.publicKey}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (!isComponentMounted.current) return;
                        const isMember = !!(data && data.isMember);
                        showActiveNodeDialog(isMember);
                    })
                    .catch(err => {
                        console.warn('Failed to check membership on same-node deep link', err);
                        if (!isComponentMounted.current) return;
                        // Fallback to active member flow since node is already saved
                        showActiveNodeDialog(true);
                    });
            }
        });
    }, [deepLinkUrl, identity, isLoading]);

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
            <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
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
        async function handleAppUpgrade() {
            try {
                const lastRunVersion = await AsyncStorage.getItem('beanpool_last_run_version');
                const currentVersion = appConfig.expo.version;
                if (lastRunVersion !== currentVersion) {
                    await AsyncStorage.removeItem('beanpool_latest_known_version');
                    await AsyncStorage.removeItem('beanpool_last_version_check_time');
                    if (lastRunVersion) {
                        await AsyncStorage.removeItem(`beanpool_dismissed_update_${lastRunVersion}`);
                    }
                    await AsyncStorage.setItem('beanpool_last_run_version', currentVersion);
                }
            } catch (e) {
                console.warn('[Upgrade] Failed to handle app upgrade cache clear:', e);
            }
        }
        handleAppUpgrade();

        // Start the real-time WebSocket connection manager
        startWebSocketSync();

        initDB()
            .then(() => registerPillarSync())
            // Trigger Immediate foreground sync
            .then(() => requestSync())
            .catch(err => {
                console.error('[Init DB] Error:', err);
                Alert.alert('DB Error', String(err));
            });

        // Set up foreground polling fallback every 5 minutes (safety net)
        const intervalId = setInterval(() => {
            if (appState.current === 'active') {
                requestSync();
            }
        }, 300000);

        // App state listener to trigger sync when returning to foreground
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                requestSync();
                // Clear app icon badge when user opens the app (only in custom client / standalone builds)
                if (Constants.appOwnership !== 'expo') {
                    try {
                        const Notif = require('expo-notifications');
                        Notif.setBadgeCountAsync(0).catch(() => {});
                    } catch {}
                }
            }
            appState.current = nextAppState;
        });

        return () => {
            clearInterval(intervalId);
            subscription.remove();
            // Stop and clean up the WebSocket connection
            stopWebSocketSync();
        };
    }, []);

    return (
        <IdentityProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
        </IdentityProvider>
    );
}
