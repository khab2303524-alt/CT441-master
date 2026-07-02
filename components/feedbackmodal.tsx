import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef } from 'react';
import {
  Animated, Modal, Pressable, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';

export interface FeedbackModalProps {
  visible: boolean;
  type: 'success' | 'error';
  title: string;
  message: string;
  onDismiss: () => void;
}

export function FeedbackModal({ visible, type, title, message, onDismiss }: FeedbackModalProps) {
  const scale   = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const isSuccess  = type === 'success';
  const accentColor = isSuccess ? '#16A34A' : '#DC2626';
  const iconBg      = isSuccess ? '#DCFCE7' : '#FEE2E2';
  const iconName    = isSuccess ? 'checkmark-circle' : 'close-circle';

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.9);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Animated.View style={[styles.box, { opacity, transform: [{ scale }] }]}>
          <Pressable onPress={e => e.stopPropagation()}>
            {/* Icon */}
            <View style={styles.iconSection}>
              <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                <Ionicons name={iconName as any} size={40} color={accentColor} />
              </View>
            </View>

            {/* Text */}
            <View style={styles.textSection}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>
            </View>

            {/* Divider + Button */}
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.btn}
              onPress={onDismiss}
              activeOpacity={0.6}
            >
              <Text style={[styles.btnText, { color: accentColor }]}>Đồng ý</Text>
            </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#0A0E1E8C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    overflow: 'hidden',
  },
  iconSection: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
  },
  btn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});