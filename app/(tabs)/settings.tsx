import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import { onValue, ref, update } from 'firebase/database';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { FeedbackModal } from '../../components/feedbackmodal';
import { db } from '../../config/firebaseConfig';
import { useESPConnection } from '../../hooks';
import { useDeviceOnline } from '../../hooks/use-device-online';
import { sendWifiConfigViaAP } from '../../lib/ap-wifi-service';
import { isValidPin, PIN_LENGTH, savePin, verifyPin } from '../../lib/pin-lock';

// Người dùng nhập/thấy độ sáng theo thang 0-100, nhưng thiết bị chỉ nhận tối đa 200
const BRIGHTNESS_UI_MAX = 100;
const BRIGHTNESS_DEVICE_MAX = 200;

// Đổi dấu chấm tròn "•" ở đầu dòng thành dấu "-", các dòng khác giữ nguyên
const formatLoiGach = (msg: string): string =>
  msg
    .split('\n')
    .map(line => line.replace(/^\s*[•·●]\s*/, '- '))
    .join('\n');

// Quy đổi giá trị người dùng nhập (0-100) sang giá trị gửi xuống thiết bị (0-200)
const uiToDeviceBrightness = (uiVal: number): number => {
  const clamped = Math.max(0, Math.min(BRIGHTNESS_UI_MAX, uiVal));
  return Math.round((clamped * BRIGHTNESS_DEVICE_MAX) / BRIGHTNESS_UI_MAX);
};

// Quy đổi giá trị đọc từ thiết bị (0-200) sang giá trị hiển thị cho người dùng (0-100)
const deviceToUiBrightness = (deviceVal: number): number => {
  const clamped = Math.max(0, Math.min(BRIGHTNESS_DEVICE_MAX, deviceVal));
  return Math.round((clamped * BRIGHTNESS_UI_MAX) / BRIGHTNESS_DEVICE_MAX);
};

const GuideStep = ({
  index,
  title,
  isLast,
  children,
}: {
  index: number;
  title: string;
  isLast?: boolean;
  children: React.ReactNode;
}) => (
  <View style={styles.guideStep}>
    <View style={styles.guideLeft}>
      <View style={styles.guideBadge}>
        <Text style={styles.guideBadgeText}>{index}</Text>
      </View>
      {!isLast && <View style={styles.guideLine} />}
    </View>
    <View style={[styles.guideContent, !isLast && { paddingBottom: 16 }]}>
      <Text style={styles.guideStepTitle}>{title}</Text>
      <Text style={styles.guideStepText}>{children}</Text>
    </View>
  </View>
);

type WifiApModalProps = {
  visible: boolean;
  onClose: () => void;
  onResult: (result: { success: boolean; message: string }) => void;
};

// Modal cấu hình Wi-Fi qua AP. State nhập liệu nằm trong component này nên gõ chữ
// chỉ render lại modal, không render lại cả màn hình Cài đặt (đây là nguyên nhân gây đơ).
const WifiApModal = React.memo(function WifiApModal({ visible, onClose, onResult }: WifiApModalProps) {
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Đẩy card lên theo bàn phím bằng animation chạy trên UI thread
  const kbHeight = useSharedValue(0);
  const kbStyle = useAnimatedStyle(() => ({ paddingBottom: kbHeight.value }));

  // Mỗi lần mở modal: xóa dữ liệu cũ
  useEffect(() => {
    if (visible) {
      setSsid('');
      setPass('');
      setShowPass(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;

    const showSub = Keyboard.addListener(showEvt, (e) => {
      kbHeight.value = withTiming(e.endCoordinates.height, {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      });
      // Đợi card đẩy lên xong rồi mới cuộn, để 2 chuyển động không chồng nhau
      scrollTimer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 280);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      kbHeight.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      if (scrollTimer) clearTimeout(scrollTimer);
      kbHeight.value = 0;
    };
  }, [visible, kbHeight]);

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const handleSend = async () => {
    Keyboard.dismiss();
    const name = ssid.trim();
    if (!name) return;
    setSending(true);
    const result = await sendWifiConfigViaAP(name, pass);
    setSending(false);
    if (result.success) setPass('');
    onResult(result);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
    >
      <Animated.View style={[{ flex: 1 }, kbStyle]}>
        <Pressable
          style={styles.modalOverlay}
          onPress={handleClose}
        >
          <Pressable
            style={styles.wifiModal}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Ionicons name="wifi" size={22} color="#1F5CA9" />
              <Text style={styles.modalTitle} numberOfLines={1}>Cấu hình Wi-Fi</Text>
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={sending}
              >
                <Ionicons name="close" size={22} color="#7A8FAD" />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.wifiModalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Hướng dẫn 3 bước */}
              <View style={styles.guideBox}>
                <GuideStep index={1} title="Khởi động lại đồng hồ">
                  Nếu chưa có Wi-Fi đã lưu hoặc mạng cũ bị lỗi, đồng hồ sẽ tự phát Wi-Fi tên{' '}
                  <Text style={styles.guideChip}>LED_P10</Text>
                </GuideStep>

                <GuideStep index={2} title="Kết nối Wi-Fi của đồng hồ">
                  Vào Cài đặt Wi-Fi của điện thoại, chọn mạng{' '}
                  <Text style={styles.guideChip}>LED_P10</Text> (không cần mật khẩu).
                </GuideStep>

                <GuideStep index={3} title="Gửi thông tin Wi-Fi" isLast>
                  Quay lại đây, nhập tên + mật khẩu Wi-Fi và nhấn{' '}
                  <Text style={styles.guideHighlight}>Gửi</Text>.
                </GuideStep>
              </View>

              {/* Nhập thông tin Wi-Fi */}
              <View style={styles.wifiSection}>
                <Text style={styles.tuneFieldLabel}>Tên Wi-Fi</Text>
                <View style={styles.wifiInputWrap}>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="Nhập tên Wi-Fi"
                    placeholderTextColor="#A0AEC0"
                    value={ssid}
                    onChangeText={setSsid}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!sending}
                  />
                </View>

                <Text style={styles.tuneFieldLabel}>Mật khẩu Wi-Fi</Text>
                <View style={styles.inputWithIcon}>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="Nhập mật khẩu (nếu có)"
                    placeholderTextColor="#A0AEC0"
                    value={pass}
                    onChangeText={setPass}
                    secureTextEntry={!showPass}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!sending}
                  />
                  <TouchableOpacity
                    style={styles.eyeInner}
                    onPress={() => setShowPass(p => !p)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showPass ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color="#7A8FAD"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Nút hành động */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBottomButton}
                  onPress={handleClose}
                  activeOpacity={0.7}
                  disabled={sending}
                >
                  <Text style={styles.modalBottomButtonTextCancel}>Hủy</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalBottomButton,
                    (!ssid.trim() || sending) && styles.modalBottomButtonDisabled,
                  ]}
                  onPress={handleSend}
                  activeOpacity={0.7}
                  disabled={!ssid.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#1F5CA9" />
                  ) : (
                    <Text style={styles.modalBottomButtonTextSubmit}>Gửi</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Animated.View>
    </Modal>
  );
});

export default function SettingsScreen() {
  useESPConnection();

  const scrollRef = useRef<any>(null);
  const [currentSsid, setCurrentSsid] = useState<string | null>(null);

  const [brightness, setBrightness] = useState(100);
  const [savedBrightness, setSavedBrightness] = useState(100);
  const [brightnessInput, setBrightnessInput] = useState('100');

  const [ringDuration, setRingDuration] = useState(5);
  const [savedRingDuration, setSavedRingDuration] = useState(5);
  const [ringDurationInput, setRingDurationInput] = useState('5');

  // Định dạng hiển thị giờ trên đồng hồ: true = 24 giờ, false = 12 giờ (AM/PM)
  const [dinhDang24Gio, setDinhDang24Gio] = useState(true);
  const [savedDinhDang24Gio, setSavedDinhDang24Gio] = useState(true);
  const [dinhDang24GioInput, setDinhDang24GioInput] = useState(true);

  // Đổi mã PIN khóa app
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [dangDoiPin, setDangDoiPin] = useState(false);
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean; type: 'success' | 'error'; title: string; message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });

  const showSuccess = (title: string, message: string) =>
    setFeedbackModal({ visible: true, type: 'success', title, message });
  const showError = (title: string, message: string) =>
    setFeedbackModal({ visible: true, type: 'error', title, message });
  const hideFeedback = () => setFeedbackModal(prev => ({ ...prev, visible: false }));

  // Trạng thái online dùng chung toàn app. Alert mất kết nối / kết nối lại do hook tự hiển thị
  // (1 lần cho cả app); thietBiOnline ở đây dùng cho badge trong modal Wi-Fi.
  const thietBiOnline = useDeviceOnline();

  useEffect(() => {
    const unsubWifi = onValue(ref(db, 'WiFi/ssidHienTai'), (snap) => {
      const val = snap.val();
      // Có tên -> hiện tên; bị xóa / rỗng / không phải chuỗi -> quay về null (hiện "Chưa có")
      setCurrentSsid(typeof val === 'string' && val.length > 0 ? val : null);
    });
    const unsubBright = onValue(ref(db, 'DongHo/DoSang'), (snap) => {
      const val = snap.val();
      if (typeof val === 'number') {
        const uiVal = deviceToUiBrightness(val);
        setBrightness(uiVal);
        setSavedBrightness(uiVal);
        setBrightnessInput(String(uiVal));
      }
    });
    const unsubRing = onValue(ref(db, 'DongHo/ThoiGianReo'), (snap) => {
      const val = snap.val();
      if (typeof val === 'number' && val > 0) {
        setRingDuration(val);
        setSavedRingDuration(val);
        setRingDurationInput(String(val));
      }
    });
    const unsubDinhDang = onValue(ref(db, 'DongHo/DinhDang24Gio'), (snap) => {
      const val = snap.val();
      const la24Gio = typeof val === 'boolean' ? val : true;
      setDinhDang24Gio(la24Gio);
      setSavedDinhDang24Gio(la24Gio);
      setDinhDang24GioInput(la24Gio);
    });
    return () => {
      unsubWifi(); unsubBright(); unsubRing(); unsubDinhDang();
    };
  }, []);

  const handleCloseWifiModal = () => {
    Keyboard.dismiss();
    setExpandedCard(null);
  };

  const handleWifiResult = (result: { success: boolean; message: string }) => {
    if (result.success) {
      setExpandedCard(null);
      showSuccess('Gửi thành công', result.message);
    } else {
      showError('Gửi thất bại', formatLoiGach(result.message));
    }
  };

  const handleSaveBrightness = async () => {
    Keyboard.dismiss();
    const num = parseInt(brightnessInput, 10);
    if (isNaN(num) || num < 0 || num > 100) {
      showError('Giá trị không hợp lệ', 'Vui lòng nhập số từ 0 đến 100');
      return;
    }
    const deviceVal = uiToDeviceBrightness(num);
    try {
      await update(ref(db, 'DongHo'), { DoSang: deviceVal });
      setBrightness(num);
      setSavedBrightness(num);
      setExpandedCard(null);
      showSuccess('Đã lưu', `Độ sáng LED: ${num}%`);
    } catch (e: any) { showError('Lỗi Firebase', e.message); }
  };

  const handleCancelBrightness = () => {
    Keyboard.dismiss();
    setBrightnessInput(String(savedBrightness));
    setExpandedCard(null);
  };

  const handleSaveRingDuration = async () => {
    Keyboard.dismiss();
    const num = parseInt(ringDurationInput, 10);
    if (isNaN(num) || num < 1 || num > 30) {
      showError('Giá trị không hợp lệ', 'Vui lòng nhập số từ 1 đến 30 giây');
      return;
    }
    try {
      await update(ref(db, 'DongHo'), { ThoiGianReo: num });
      setRingDuration(num);
      setSavedRingDuration(num);
      setExpandedCard(null);
      showSuccess('Đã lưu', `Thời gian chuông reo: ${num} giây`);
    } catch (e: any) { showError('Lỗi Firebase', e.message); }
  };

  const handleCancelRingDuration = () => {
    Keyboard.dismiss();
    setRingDurationInput(String(savedRingDuration));
    setExpandedCard(null);
  };

  const handleSaveDinhDang = async () => {
    try {
      await update(ref(db, 'DongHo'), { DinhDang24Gio: dinhDang24GioInput });
      setDinhDang24Gio(dinhDang24GioInput);
      setSavedDinhDang24Gio(dinhDang24GioInput);
      setExpandedCard(null);
      showSuccess('Đã lưu', 'Định dạng giờ đã được cập nhật.');
    } catch (e: any) { showError('Lỗi Firebase', e.message); }
  };

  const handleCancelDinhDang = () => {
    setDinhDang24GioInput(savedDinhDang24Gio);
    setExpandedCard(null);
  };

  const handleCancelPin = () => {
    Keyboard.dismiss();
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setShowCurrentPin(false);
    setShowNewPin(false);
    setShowConfirmPin(false);
    setExpandedCard(null);
  };

  const handleSavePin = async () => {
    Keyboard.dismiss();
    if (dangDoiPin) return;

    if (!isValidPin(currentPinInput)) {
      showError('Mã PIN không hợp lệ', 'Vui lòng nhập đủ 6 chữ số của mã PIN hiện tại.');
      return;
    }
    if (!isValidPin(newPinInput)) {
      showError('Mã PIN không hợp lệ', 'Mã PIN mới phải gồm đúng 6 chữ số.');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      showError('Không khớp', 'Xác nhận mã PIN mới không khớp. Vui lòng nhập lại.');
      return;
    }
    if (newPinInput === currentPinInput) {
      showError('Không hợp lệ', 'Mã PIN mới phải khác mã PIN hiện tại.');
      return;
    }

    setDangDoiPin(true);
    try {
      const dung = await verifyPin(currentPinInput);
      if (!dung) {
        showError('Sai mã PIN', 'Mã PIN hiện tại không đúng.');
        return;
      }
      await savePin(newPinInput);
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      setShowCurrentPin(false);
      setShowNewPin(false);
      setShowConfirmPin(false);
      setExpandedCard(null);
      showSuccess('Đã đổi mã PIN', 'Mã PIN mới sẽ được dùng cho lần mở khóa app tiếp theo.');
    } catch (e: any) {
      showError('Lỗi', e?.message ?? 'Không thể đổi mã PIN, vui lòng thử lại.');
    } finally {
      setDangDoiPin(false);
    }
  };

  const parsedBrightnessInput = parseInt(brightnessInput, 10);
  const brightnessChanged = !isNaN(parsedBrightnessInput) && parsedBrightnessInput !== savedBrightness;

  const parsedRingInput = parseInt(ringDurationInput, 10);
  const ringDurationChanged = !isNaN(parsedRingInput) && parsedRingInput !== savedRingDuration;

  const dinhDangChanged = dinhDang24GioInput !== savedDinhDang24Gio;

  const [expandedCard, setExpandedCard] = useState<'wifi' | 'brightness' | 'ring' | 'format' | 'pin' | null>(null);

  const toggleCard = (card: 'wifi' | 'brightness' | 'ring' | 'format' | 'pin') => {
    Keyboard.dismiss();
    if (card === 'format') setDinhDang24GioInput(savedDinhDang24Gio);
    if (card === 'pin') {
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      setShowCurrentPin(false);
      setShowNewPin(false);
      setShowConfirmPin(false);
    }
    setExpandedCard(prev => {
      const next = prev === card ? null : card;
      return next;
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Cài đặt</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.body}>
          {/* Card Cấu hình Wi-Fi qua AP */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleCard('wifi')}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconBox}>
                  <Ionicons name="wifi" size={20} color="#1F5CA9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Cấu hình Wi-Fi</Text>
                  <Text style={styles.cardSubtitle}>
                    Hiện tại: <Text style={styles.cardSubtitleBold}>{currentSsid || 'Chưa có'}</Text>
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>

          {/* Card Định dạng giờ */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleCard('format')}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconBox}>
                  <Ionicons name="time" size={20} color="#1F5CA9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Định dạng giờ</Text>
                  <Text style={styles.cardSubtitle}>Hiện tại: {dinhDang24Gio ? '24 giờ' : '12 giờ (AM/PM)'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>

          {/* Card Độ sáng */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleCard('brightness')}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconBox}>
                  <Ionicons name="sunny" size={20} color="#1F5CA9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Độ sáng LED</Text>
                  <Text style={styles.cardSubtitle}>Hiện tại: {brightness}%</Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>

          {/* Card Thời gian chuông reo */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleCard('ring')}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconBox}>
                  <FontAwesome6 name="bell" size={18} color="#1F5CA9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Thời gian chuông reo</Text>
                  <Text style={styles.cardSubtitle}>Hiện tại: {ringDuration} giây</Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>

          {/* Card Đổi mã PIN khóa app */}
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleCard('pin')}
                activeOpacity={0.7}
              >
                <View style={styles.cardIconBox}>
                  <Ionicons name="lock-closed" size={20} color="#1F5CA9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Đổi mã PIN</Text>
                  <Text style={styles.cardSubtitle}>Mã PIN 6 số dùng để mở khóa app</Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Modal: Cài đặt Wi-Fi qua AP (LED_P10) - tách riêng để gõ chữ không render lại cả màn hình */}
      <WifiApModal
        visible={expandedCard === 'wifi'}
        onClose={handleCloseWifiModal}
        onResult={handleWifiResult}
      />

      {/* Modal: Độ sáng LED */}
      <Modal
        visible={expandedCard === 'brightness'}
        transparent
        animationType="fade"
        onRequestClose={handleCancelBrightness}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCancelBrightness}>
          <Pressable style={styles.settingsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="sunny" size={22} color="#1F5CA9" />
              <Text style={styles.modalTitle} numberOfLines={1}>Độ sáng LED</Text>
              <TouchableOpacity
                onPress={handleCancelBrightness}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#7A8FAD" />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneFieldLabel}>Giá trị (0 – 100)</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                onChangeText={(t) => {
                  if (/^\d{0,3}$/.test(t)) setBrightnessInput(t);
                }}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="VD: 50"
                placeholderTextColor="#A0AEC0"
                selectTextOnFocus
                autoFocus
              />
              <Text style={styles.tuneUnitInner}>%</Text>
            </View>

            <View style={styles.tuneBottomActions}>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleCancelBrightness}
                activeOpacity={0.7}
              >
                <Text style={styles.tuneBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleSaveBrightness}
                activeOpacity={0.7}
                disabled={!brightnessChanged}
              >
                <Text style={[styles.tuneBottomButtonTextSubmit, !brightnessChanged && styles.tuneBottomButtonTextDisabled]}>Xong</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Thời gian chuông reo */}
      <Modal
        visible={expandedCard === 'ring'}
        transparent
        animationType="fade"
        onRequestClose={handleCancelRingDuration}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCancelRingDuration}>
          <Pressable style={styles.settingsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <FontAwesome6 name="bell" size={18} color="#1F5CA9" />
              <Text style={styles.modalTitle} numberOfLines={1}>Thời gian chuông reo</Text>
              <TouchableOpacity
                onPress={handleCancelRingDuration}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#7A8FAD" />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneFieldLabel}>Số giây chuông reo (1 – 30)</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                onChangeText={(t) => {
                  if (/^\d{0,2}$/.test(t)) setRingDurationInput(t);
                }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="VD: 5"
                placeholderTextColor="#A0AEC0"
                selectTextOnFocus
                autoFocus
              />
              <Text style={styles.tuneUnitInner}>giây</Text>
            </View>

            <Text style={styles.tuneHintText}>
              Chuông sẽ reo trong khoảng thời gian này mỗi khi được kích hoạt.
            </Text>

            <View style={styles.tuneBottomActions}>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleCancelRingDuration}
                activeOpacity={0.7}
              >
                <Text style={styles.tuneBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleSaveRingDuration}
                activeOpacity={0.7}
                disabled={!ringDurationChanged}
              >
                <Text style={[styles.tuneBottomButtonTextSubmit, !ringDurationChanged && styles.tuneBottomButtonTextDisabled]}>Xong</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Định dạng giờ */}
      <Modal
        visible={expandedCard === 'format'}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDinhDang}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCancelDinhDang}>
          <Pressable style={styles.settingsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="time" size={22} color="#1F5CA9" />
              <Text style={styles.modalTitle} numberOfLines={1}>Định dạng giờ</Text>
              <TouchableOpacity
                onPress={handleCancelDinhDang}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#7A8FAD" />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneFieldLabel}>Chọn định dạng hiển thị trên đồng hồ</Text>
            <View style={styles.formatRow}>
              <TouchableOpacity
                style={[styles.formatOption, dinhDang24GioInput && styles.formatOptionActive]}
                onPress={() => setDinhDang24GioInput(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.formatOptionText, dinhDang24GioInput && styles.formatOptionTextActive]}>
                  24 giờ
                </Text>
                <Text style={[styles.formatOptionHint, dinhDang24GioInput && styles.formatOptionTextActive]}>
                  VD: 14:05
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formatOption, !dinhDang24GioInput && styles.formatOptionActive]}
                onPress={() => setDinhDang24GioInput(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.formatOptionText, !dinhDang24GioInput && styles.formatOptionTextActive]}>
                  12 giờ
                </Text>
                <Text style={[styles.formatOptionHint, !dinhDang24GioInput && styles.formatOptionTextActive]}>
                  VD: 02:05
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tuneBottomActions}>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleCancelDinhDang}
                activeOpacity={0.7}
              >
                <Text style={styles.tuneBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleSaveDinhDang}
                activeOpacity={0.7}
                disabled={!dinhDangChanged}
              >
                <Text style={[styles.tuneBottomButtonTextSubmit, !dinhDangChanged && styles.tuneBottomButtonTextDisabled]}>Xong</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Đổi mã PIN khóa app */}
      <Modal
        visible={expandedCard === 'pin'}
        transparent
        animationType="fade"
        onRequestClose={handleCancelPin}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCancelPin}>
          <Pressable style={styles.settingsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="lock-closed" size={20} color="#1F5CA9" />
              <Text style={styles.modalTitle} numberOfLines={1}>Đổi mã PIN</Text>
              <TouchableOpacity
                onPress={handleCancelPin}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color="#7A8FAD" />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneFieldLabel}>Mã PIN hiện tại</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                value={currentPinInput}
                onChangeText={(t) => {
                  if (/^\d{0,6}$/.test(t)) setCurrentPinInput(t);
                }}
                keyboardType="number-pad"
                maxLength={PIN_LENGTH}
                placeholder="••••••"
                placeholderTextColor="#A0AEC0"
                secureTextEntry={!showCurrentPin}
                autoFocus
              />
              <TouchableOpacity
                style={styles.eyeInner}
                onPress={() => setShowCurrentPin(p => !p)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showCurrentPin ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color="#7A8FAD"
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneFieldLabel}>Mã PIN mới (6 chữ số)</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                value={newPinInput}
                onChangeText={(t) => {
                  if (/^\d{0,6}$/.test(t)) setNewPinInput(t);
                }}
                keyboardType="number-pad"
                maxLength={PIN_LENGTH}
                placeholder="••••••"
                placeholderTextColor="#A0AEC0"
                secureTextEntry={!showNewPin}
              />
              <TouchableOpacity
                style={styles.eyeInner}
                onPress={() => setShowNewPin(p => !p)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showNewPin ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color="#7A8FAD"
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneFieldLabel}>Xác nhận mã PIN mới</Text>
            <View style={styles.tuneInputWithIcon}>
              <TextInput
                style={styles.tuneInputInner}
                value={confirmPinInput}
                onChangeText={(t) => {
                  if (/^\d{0,6}$/.test(t)) setConfirmPinInput(t);
                }}
                keyboardType="number-pad"
                maxLength={PIN_LENGTH}
                placeholder="••••••"
                placeholderTextColor="#A0AEC0"
                secureTextEntry={!showConfirmPin}
              />
              <TouchableOpacity
                style={styles.eyeInner}
                onPress={() => setShowConfirmPin(p => !p)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showConfirmPin ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color="#7A8FAD"
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.tuneHintText}>
              Mã PIN mới sẽ được áp dụng từ lần mở app tiếp theo.
            </Text>

            <View style={styles.tuneBottomActions}>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleCancelPin}
                activeOpacity={0.7}
              >
                <Text style={styles.tuneBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tuneBottomButton}
                onPress={handleSavePin}
                activeOpacity={0.7}
                disabled={dangDoiPin}
              >
                {dangDoiPin ? (
                  <ActivityIndicator size="small" color="#1F5CA9" />
                ) : (
                  <Text style={styles.tuneBottomButtonTextSubmit}>Xong</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <FeedbackModal
        visible={feedbackModal.visible}
        type={feedbackModal.type}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onDismiss={hideFeedback}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FA' },
  scrollContent: { paddingBottom: 140 },

  header: {
    backgroundColor: '#1F5CA9',
    paddingVertical: 15, paddingHorizontal: 20, paddingTop: 50,
    flexDirection: 'row', alignItems: 'center',
  },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 4 },

  body: { padding: 16, gap: 14 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 20, overflow: 'hidden',
    elevation: 2, shadowColor: '#1F5CA9',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 12,
  },
  cardIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#E8F4FB', alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  cardSubtitle: { fontSize: 12, color: '#7A8FAD', marginTop: 2, textAlign: 'justify' },
  cardSubtitleBold: { fontWeight: '700', color: '#1F5CA9' },
  cardBody: {
    padding: 16, paddingTop: 4,
    borderTopWidth: 1, borderTopColor: '#F0F4FA',
  },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#4A5568', marginBottom: 8, marginTop: 14 },

  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
  },
  inputInner: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 13,
    color: '#11181C',
  },
  eyeInner: {
    paddingLeft: 8,
    paddingVertical: 11,
  },

  tuneFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginTop: 14,
    letterSpacing: 0.2,
  },
  tuneInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#F8FAFC',
    fontSize: 13,
    color: '#11181C',
  },
  tuneInputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
  },
  tuneInputInner: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 13,
    color: '#11181C',
  },
  tuneUnitInner: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A8FAD',
    paddingLeft: 6,
    paddingVertical: 11,
  },
  tuneHintText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10,
    lineHeight: 18,
  },
  tuneBottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  tuneBottomButton: { paddingVertical: 10, paddingHorizontal: 6 },
  tuneBottomButtonTextCancel: { fontSize: 16, fontWeight: '700', color: '#000000' },
  tuneBottomButtonTextSubmit: { fontSize: 16, fontWeight: '700', color: '#1F5CA9' },
  tuneBottomButtonTextDisabled: { color: '#A3B3CC' },

  formatRow: {
    flexDirection: 'row', gap: 10, marginTop: 4,
  },
  formatOption: {
    flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    backgroundColor: '#F8FAFC', paddingVertical: 14, paddingHorizontal: 10,
    alignItems: 'center', gap: 4,
  },
  formatOptionActive: {
    borderColor: '#1F5CA9', backgroundColor: '#E8F4FB',
  },
  formatOptionText: { fontSize: 15, fontWeight: '700', color: '#4A5568' },
  formatOptionHint: { fontSize: 11, color: '#7A8FAD' },
  formatOptionTextActive: { color: '#1F5CA9' },

  // Modal chung
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  settingsModal: {
    backgroundColor: '#ffffff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 420,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4,
  },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#11181C' },
  modalActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
  },
  modalBottomButton: { paddingVertical: 10, paddingHorizontal: 6, minWidth: 48, alignItems: 'center' },
  modalBottomButtonTextCancel: { fontSize: 16, fontWeight: '700', color: '#000000' },
  modalBottomButtonTextSubmit: { fontSize: 16, fontWeight: '700', color: '#1F5CA9' },
  modalBottomButtonDisabled: { opacity: 0.4 },

  // Modal Wi-Fi AP
  wifiModal: {
    backgroundColor: '#ffffff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 420, maxHeight: '90%',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12,
  },
  wifiModalScroll: { flexGrow: 0 },
  guideBox: {
    marginTop: 16,
    marginBottom: 2, // + marginTop 14 của label = 16, đều với khoảng cách giữa các bước
  },
  guideStep: { flexDirection: 'row', gap: 12 },
  guideLeft: { alignItems: 'center', width: 26 },
  guideBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#1F5CA9', alignItems: 'center', justifyContent: 'center',
  },
  guideBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  guideLine: {
    flex: 1, width: 2, marginTop: 4,
    backgroundColor: '#BFD6F0', borderRadius: 1,
  },
  guideContent: { flex: 1, paddingTop: 2 },
  guideStepTitle: { fontSize: 13.5, fontWeight: '700', color: '#11181C', marginBottom: 3 },
  guideStepText: { fontSize: 12.5, color: '#475569', lineHeight: 19, textAlign: 'justify' },
  guideChip: { fontWeight: '700', color: '#1F5CA9' },
  guideHighlight: { fontWeight: '700', color: '#1F5CA9' },
  wifiSection: { marginBottom: 16 },
  wifiInputWrap: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, backgroundColor: '#F8FAFC', paddingHorizontal: 14,
  },
} as any);