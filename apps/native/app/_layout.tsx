import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, LogBox } from 'react-native';
import { registerPillarSync } from '../services/background-task';
import { performSync } from '../services/pillar-sync';
import { initDB } from '../utils/db';
import { IdentityProvider, useIdentity } from './IdentityContext';

LogBox.ignoreLogs(['ProgressBarAndroid', 'Clipboard', 'PushNotificationIOS', 'has been extracted']);

function RootLayoutNav() {
    const { identity, isLoading } = useIdentity();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;

        const inAuthGroup = segments[0] === '(tabs)';
        
        if (!identity && inAuthGroup) {
            router.replace('/welcome');
        } else if (identity && segments[0] === 'welcome') {
            router.replace('/(tabs)');
        }
    }, [identity, isLoading, segments]);

    if (isLoading) return null; // Or a splash screen

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="welcome" />
            <Stack.Screen name="post/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="new-post" options={{ presentation: 'modal' }} />
            <Stack.Screen name="propose-project" options={{ presentation: 'modal' }} />
            <Stack.Screen name="chat/[id]" />
        </Stack>
    );
}

export default function RootLayout() {
    useEffect(() => {
        initDB()
            .then(() => registerPillarSync())
            // Trigger Immediate foreground sync
            .then(() => performSync())
            .then((result) => {
                if (!result.success) {
                    Alert.alert('Sync Failed', result.errorMessage || 'Could not reach BeanPool node or sync data.');
                }
            })
            .catch(err => {
                console.error(err);
                Alert.alert('DB Error', String(err));
            });
    }, []);

    return (
        <IdentityProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
        </IdentityProvider>
    );
}
