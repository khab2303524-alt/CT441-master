import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlertConfig } from '../hooks/use-custom-alert';

interface CustomAlertProps {
  visible: boolean;
  alert: AlertConfig | null;
  onDismiss: () => void;
}

export const CustomAlert: React.FC<CustomAlertProps> = ({ visible, alert, onDismiss }) => {
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible && alert) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, alert, fadeAnim]);

  if (!alert) return null;

  const colors = {
    success: { bg: '#ffffff', border: '#ffffff', text: '#000000', icon: '#22C55E' },
    error: { bg: '#ffffff', border: '#ffffff', text: '#000000', icon: '#EF4444' },
    info: { bg: '#ffffff', border: '#ffffff', text: '#000000', icon: '#3B82F6' },
  };

  const color = colors[alert.type];
  const iconName = alert.type === 'success' ? 'checkmark-circle' : alert.type === 'error' ? 'close-circle' : 'information-circle';

  return (
    <Animated.View style={[styles.alertWrapper, { opacity: fadeAnim }]} pointerEvents="auto">
      <Pressable onPress={(e) => e.stopPropagation()}>
        <View style={[styles.alertBox, { backgroundColor: color.bg, borderColor: color.border }]}>
          <View style={styles.content}>
            <Ionicons name={iconName as any} size={24} color={color.icon} />
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: color.text }]}>{alert.title}</Text>
              <Text style={[styles.message, { color: color.text }]}>{alert.message}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  alertWrapper: {
    width: '100%',
    pointerEvents: 'auto',
  },
  alertBox: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
  },
});
