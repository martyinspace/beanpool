import { Tabs } from 'expo-router';
import { GlobalHeader } from '../../components/GlobalHeader';
import { View, Image, StyleSheet, Text } from 'react-native';
import { useState, useEffect } from 'react';
import { useIdentity } from '../IdentityContext';
import { getGlobalUnreadCount, syncMessages } from '../../utils/db';

export default function TabLayout() {
    const { identity } = useIdentity();
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        if (!identity?.publicKey) return;
        const checkUnread = async () => {
            try {
                // Discover new messages across active threads globally
                await syncMessages(identity.publicKey);
                // Calculate unread sum across the updated SQLite pool
                const count = await getGlobalUnreadCount(identity.publicKey);
                setUnread(count);
            } catch (e) {}
        };
        checkUnread();
        const iv = setInterval(checkUnread, 5000);
        return () => clearInterval(iv);
    }, [identity]);

    return (
        <Tabs screenOptions={{
            header: () => <GlobalHeader />,
            tabBarBackground: () => (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1a2e1a', overflow: 'hidden' }}>
                    <Image 
                        source={require('../../assets/images/neon-vines-banner.png')} 
                        style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', transform: [{ scale: 1.5 }] }]}
                        resizeMode="cover"
                    />
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
                </View>
            ),
            tabBarStyle: { 
                backgroundColor: 'transparent', 
                borderTopWidth: 0,
                elevation: 0,
            },
            tabBarActiveTintColor: '#ffffff',
            tabBarInactiveTintColor: '#ffffff',
            tabBarLabelStyle: {
                textShadowColor: 'rgba(0,0,0,1)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 5,
                fontWeight: '700',
                fontSize: 10,
            },
        }}>
            <Tabs.Screen 
                name="index" 
                options={{ 
                    title: 'Map',
                    headerTransparent: true,
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: 1, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>🗺️</Text> 
                }} 
            />
            <Tabs.Screen 
                name="projects" 
                options={{ 
                    title: 'Projects',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: 1, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>🌱</Text> 
                }} 
            />
            <Tabs.Screen 
                name="market" 
                options={{ 
                    title: 'Market',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: 1, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>🤝</Text> 
                }} 
            />
            <Tabs.Screen 
                name="chats" 
                options={{ 
                    title: 'Chat',
                    tabBarBadge: unread > 0 ? unread : undefined,
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: 1, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>💬</Text> 
                }} 
            />
            <Tabs.Screen 
                name="people" 
                options={{ 
                    title: 'People',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: 1, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>👥</Text> 
                }} 
            />
            <Tabs.Screen 
                name="ledger" 
                options={{ 
                    title: 'Ledger',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: 1, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>📊</Text> 
                }} 
            />
            <Tabs.Screen 
                name="settings" 
                options={{ 
                    title: 'Settings',
                    href: null,
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: 1, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>⚙️</Text> 
                }} 
            />
        </Tabs>
    );
}
