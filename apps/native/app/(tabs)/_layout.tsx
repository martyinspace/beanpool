import { Tabs } from 'expo-router';
import { GlobalHeader } from '../../components/GlobalHeader';
import { View, Image, StyleSheet, Text } from 'react-native';

export default function TabLayout() {
    return (
        <Tabs screenOptions={{
            header: () => <GlobalHeader />,
            tabBarBackground: () => (
                <View style={{ flex: 1 }}>
                    <Image 
                        source={require('../../assets/images/neon-vines-banner.png')} 
                        style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', transform: [{ scale: 1.5 }] }]}
                        resizeMode="cover"
                    />
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
                </View>
            ),
            tabBarStyle: { 
                backgroundColor: 'transparent', 
                borderTopColor: '#111',
                paddingTop: 4
            },
            tabBarActiveTintColor: '#ffffff', // White for dark neon layout
            tabBarInactiveTintColor: 'rgba(255,255,255,0.8)', // Faded white
        }}>
            <Tabs.Screen 
                name="index" 
                options={{ 
                    title: 'Map',
                    headerTransparent: true,
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.8, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>🗺️</Text> 
                }} 
            />
            <Tabs.Screen 
                name="projects" 
                options={{ 
                    title: 'Projects',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.8, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>🌱</Text> 
                }} 
            />
            <Tabs.Screen 
                name="market" 
                options={{ 
                    title: 'Market',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.8, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>🤝</Text> 
                }} 
            />
            <Tabs.Screen 
                name="chats" 
                options={{ 
                    title: 'Chat',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.8, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>💬</Text> 
                }} 
            />
            <Tabs.Screen 
                name="people" 
                options={{ 
                    title: 'People',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.8, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>👥</Text> 
                }} 
            />
            <Tabs.Screen 
                name="ledger" 
                options={{ 
                    title: 'Ledger',
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.8, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>📊</Text> 
                }} 
            />
            <Tabs.Screen 
                name="settings" 
                options={{ 
                    title: 'Settings',
                    href: null,
                    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.8, textShadowColor: 'rgba(0,0,0,1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>⚙️</Text> 
                }} 
            />
        </Tabs>
    );
}
