/**
 * Root Layout — Registers the background sync task on mount
 */

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { registerPillarSync } from '../services/background-task';

export default function RootLayout() {
    useEffect(() => {
        registerPillarSync().catch(console.error);
    }, []);

    return (
        <>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: '#0a0a0a' },
                    headerTintColor: '#fff',
                    headerTitleStyle: { fontWeight: '700' },
                    contentStyle: { backgroundColor: '#0a0a0a' },
                }}
            />
        </>
    );
}
