import { Tabs } from 'expo-router';
import React from 'react';
import { AdaptiveTabBar } from '@/components/AdaptiveTabBar';
import { House, NotepadText, Swords, Users } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <AdaptiveTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Icon size="lg" as={House} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color }) => <Icon as={Swords} color={color} />,
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarIcon: ({ color }) => <Icon as={Users} color={color} />,
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: 'Records',
          tabBarIcon: ({ color }) => <Icon as={NotepadText} color={color} />,
        }}
      />
      <Tabs.Screen
        name="match/[id]"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="team/[id]"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}
