import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { isValidPin, PIN_LENGTH } from '../lib/pin-lock';

type Stage = 'unlock' | 'create' | 'confirm';

export interface AppLockModalProps {
  // 'unlock': app đã có PIN, yêu cầu nhập đúng PIN cũ
  // 'create': app chưa từng thiết lập PIN, yêu cầu tạo PIN mới lần đầu
  mode: 'unlock' | 'create';
  onVerify: (pin: string) => Promise<boolean>;
  onCreate: (pin: string) => Promise<void>;
  onSuccess: () => void;
}

const KEYPAD_ROWS: (string | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'del'],
];

export function AppLockModal({ mode, onVerify, onCreate, onSuccess }: AppLockModalProps) {
  const [stage, setStage] = useState<Stage>(mode === 'create' ? 'create' : 'unlock');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState(''); // PIN nhập lần 1 khi tạo mới, dùng để đối chiếu ở bước confirm
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const runShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // Xử lý khi đủ 6 chữ số
  useEffect(() => {
    if (pin.length < PIN_LENGTH || checking) return;

    (async () => {
      setChecking(true);

      if (stage === 'unlock') {
        const ok = await onVerify(pin);
        if (ok) {
          onSuccess();
        } else {
          setError('Mã PIN không đúng. Vui lòng thử lại.');
          runShake();
          setPin('');
        }
      } else if (stage === 'create') {
        setFirstPin(pin);
        setPin('');
        setError('');
        setStage('confirm');
      } else if (stage === 'confirm') {
        if (pin === firstPin) {
          await onCreate(pin);
          onSuccess();
        } else {
          setError('Hai mã PIN không khớp. Vui lòng nhập lại từ đầu.');
          runShake();
          setPin('');
          setFirstPin('');
          setStage('create');
        }
      }

      setChecking(false);
    })();
  }, [pin]);

  const handlePress = (key: string | null) => {
    if (!key || checking) return;
    if (key === 'del') {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    if (error) setError('');
    setPin(p => (p + key).slice(0, PIN_LENGTH));
  };

  const title =
    stage === 'unlock' ? 'Nhập mã PIN' :
    stage === 'create' ? 'Tạo mã PIN mới' :
    'Xác nhận mã PIN';

  const subtitle =
    stage === 'unlock' ? 'Nhập mã PIN 6 số để mở khóa ứng dụng' :
    stage === 'create' ? 'Thiết lập mã PIN 6 số để bảo vệ ứng dụng' :
    'Nhập lại mã PIN vừa tạo để xác nhận';

  return (
    <Modal visible transparent={false} animationType="fade">
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={32} color="#1F5CA9" />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <Animated.View
          style={[
            styles.dotsRow,
            {
              transform: [{
                translateX: shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }),
              }],
            },
          ]}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </Animated.View>

        <View style={styles.errorBox}>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <View style={styles.keypad}>
          {KEYPAD_ROWS.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.keypadRow}>
              {row.map((key, colIdx) => {
                if (key === null) return <View key={colIdx} style={[styles.key, styles.keyPlain]} />;
                return (
                  <TouchableOpacity
                    key={colIdx}
                    style={[
                      styles.key,
                      key === 'del' && styles.keyPlain,
                    ]}
                    activeOpacity={0.6}
                    onPress={() => handlePress(key)}
                  >
                    {key === 'del' ? (
                      <Ionicons name="backspace-outline" size={26} color="#334155" />
                    ) : (
                      <Text style={styles.keyText}>{key}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4FA',
    alignItems: 'center',
    paddingTop: 90,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#E8F4FB', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#11181C', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#7A8FAD', textAlign: 'center', marginBottom: 32, paddingHorizontal: 20 },

  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: '#C8D3E8', backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: '#1F5CA9', borderColor: '#1F5CA9' },

  errorBox: { height: 36, justifyContent: 'center' },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  keypad: { marginTop: 20, gap: 18 },
  keypadRow: { flexDirection: 'row', gap: 28 },
  key: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff',
    elevation: 1, shadowColor: '#1F5CA9',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  keyPlain: {
    backgroundColor: 'transparent',
    elevation: 0, shadowOpacity: 0,
  },
  keyText: { fontSize: 24, fontWeight: '600', color: '#11181C' },
});
