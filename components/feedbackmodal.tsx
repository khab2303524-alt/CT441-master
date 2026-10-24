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
  videoSource?: any;
  onDismiss: () => void;
}

// Tên Wi-Fi của đồng hồ: bỏ dấu ngoặc kép, hiển thị chữ xanh đậm như phần hướng dẫn
const renderMessage = (message: string) =>
  message.split(/(["“”]?LED_P10["“”]?)/g).map((part, i) =>
    /LED_P10/.test(part)
      ? <Text key={i} style={styles.chip}>LED_P10</Text>
      : part,
  );

export function FeedbackModal({ visible, type, title, message, onDismiss }: FeedbackModalProps) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const isSuccess = type === 'success';
  const accentColor = isSuccess ? '#16A34A' : '#DC2626';
  const iconName = isSuccess ? 'checkmark-circle' : 'close-circle';

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.92);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Animated.View style={[styles.box, { opacity, transform: [{ scale }] }]}>
          <Pressable onPress={e => e.stopPropagation()}>
            {/* Header: icon + tiêu đề */}
            <View style={styles.header}>
              <Ionicons name={iconName as any} size={28} color={accentColor} />
              <Text style={styles.title} numberOfLines={2}>{title}</Text>
            </View>

            {/* Nội dung: luôn căn trái */}
            <Text style={styles.message}>{renderMessage(message)}</Text>

            {/* Nút OK căn phải */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.btn}
                onPress={onDismiss}
                activeOpacity={0.6}
              >
                <Text style={[styles.btnText, { color: accentColor }]}>Đồng ý</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  box: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#11181C',
  },
  message: {
    fontSize: 13.5,
    color: '#64748B',
    lineHeight: 20,
    textAlign: 'left',
    marginTop: 22,
  },
  chip: { fontWeight: '700', color: '#1F5CA9' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
