import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Chiều cao "nội dung" mong muốn của tab bar (icon + label), chưa tính safe area
  const CONTENT_HEIGHT = 78;

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          height: CONTENT_HEIGHT + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 16),
          paddingTop: 12,
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          elevation: 5,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarIconStyle: {
          marginBottom: 2,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 2,
        },

        tabBarActiveTintColor: '#1F5CA9',
        tabBarInactiveTintColor: '#000000',

        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hẹn giờ',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="alarm.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="clock"
        options={{
          title: 'Đồng hồ',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Cài đặt',
          tabBarIcon: ({ color }) => <Ionicons size={28} name="settings-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}