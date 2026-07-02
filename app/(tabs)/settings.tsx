import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, onValue, ref, update } from 'firebase/database';
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
import { FeedbackModal } from '../../components/feedbackmodal';
import { db } from '../../config/firebaseConfig';
import { useESPConnection } from '../../hooks';

type WifiItem = { ssid: string; rssi: number };
const WIFI_CACHE_KEY = 'settings_wifi_cache_v1';

const normalizeWifiList = (raw: unknown): WifiItem[] => {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is WifiItem => (
      !!x
      && typeof x === 'object'
      && typeof (x as WifiItem).ssid === 'string'
      && typeof (x as WifiItem).rssi === 'number'
    ));
  }

  if (raw && typeof raw === 'object') {
    return Object.values(raw).filter((x): x is WifiItem => (
      !!x
      && typeof x === 'object'
      && typeof (x as WifiItem).ssid === 'string'
      && typeof (x as WifiItem).rssi === 'number'
    ));
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return normalizeWifiList(parsed);
    } catch (_) {
      return [];
    }
  }

  return [];
};

export default function SettingsScreen() {
  useESPConnection();

  const scrollRef = useRef<any>(null);

  const [currentSsid, setCurrentSsid] = useState<string | null>(null);

  // WiFi scan states
  const [dangQuet, setDangQuet] = useState(false);
  const [danhSachWifi, setDanhSachWifi] = useState<WifiItem[]>([]);
  const [daCo1LanQuet, setDaCo1LanQuet] = useState(false);
  const quetPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Password modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedSsid, setSelectedSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [dangKiemTra, setDangKiemTra] = useState(false);
  const [statusText, setStatusText] = useState('Đang kiểm tra...');
  const trangThaiUnsub = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [brightness, setBrightness] = useState(200);
  const [savedBrightness, setSavedBrightness] = useState(200);
  const [brightnessInput, setBrightnessInput] = useState('200');

  const [ringDuration, setRingDuration] = useState(5);
  const [savedRingDuration, setSavedRingDuration] = useState(5);
  const [ringDurationInput, setRingDurationInput] = useState('5');

  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean; type: 'success' | 'error'; title: string; message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });

  const showSuccess = (title: string, message: string) =>
    setFeedbackModal({ visible: true, type: 'success', title, message });
  const showError = (title: string, message: string) =>
    setFeedbackModal({ visible: true, type: 'error', title, message });
  const hideFeedback = () => setFeedbackModal(prev => ({ ...prev, visible: false }));

  useEffect(() => {
    const loadWifiCache = async () => {
      try {
        const raw = await AsyncStorage.getItem(WIFI_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const list = normalizeWifiList(parsed);
        if (list.length > 0) {
          setDanhSachWifi(list);
          setDaCo1LanQuet(true);
        }
      } catch (_) {
        // Ignore cache read errors and continue with live data.
      }
    };

    loadWifiCache();

    const unsubWifi = onValue(ref(db, 'WiFi/ssidHienTai'), (snap) => {
      const val = snap.val();
      if (typeof val === 'string' && val.length > 0) setCurrentSsid(val);
    });
    const unsubBright = onValue(ref(db, 'DongHo/DoSang'), (snap) => {
      const val = snap.val();
      if (typeof val === 'number') {
        setBrightness(val);
        setSavedBrightness(val);
        setBrightnessInput(String(val));
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
    return () => { unsubWifi(); unsubBright(); unsubRing(); };
  }, []);

  useEffect(() => {
    return () => {
      trangThaiUnsub.current?.();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (quetPollRef.current) clearInterval(quetPollRef.current);
    };
  }, []);

  const stopListening = () => {
    trangThaiUnsub.current?.();
    trangThaiUnsub.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };

  const startTimeout = (ms: number, label: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      stopListening();
      setDangKiemTra(false);
      showError('Hết thời gian', `${label}\nKiểm tra thiết bị có đang bật không.`);
    }, ms);
  };

  const handleSaveWifi = async () => {
    Keyboard.dismiss();
    if (!selectedSsid.trim()) { showError('Chưa chọn Wi-Fi', 'Vui lòng quét và chọn mạng Wi-Fi'); return; }
    if (dangKiemTra) return;
    setShowPasswordModal(false);
    try {
      await update(ref(db, 'WiFi'), {
        ssid: selectedSsid.trim(),
        password: password,
        capNhat: true,
        trangThai: 'choDoi',
      });
      setPassword('');
      setDangKiemTra(true);
      setStatusText('Chờ thiết bị phản hồi...');
      startTimeout(20000, 'Chưa nhận được lệnh đổi Wi-Fi.');

      const pollInterval = setInterval(async () => {
        try {
          const snap = await get(ref(db, 'WiFi/trangThai'));
          const val = snap.val() as string;
          if (!val || val === 'choDoi') return;
          if (val === 'dangKetNoi') {
            setStatusText('Đang kết nối Wi-Fi mới...');
            startTimeout(25000, 'Không kết nối được Wi-Fi.');
            return;
          }
          clearInterval(pollInterval);
          stopListening();
          setDangKiemTra(false);
          if (val === 'thanhCong') {
            showSuccess('Kết nối thành công', 'Đã kết nối Wi-Fi mới.\nThiết bị sẽ tự khởi động lại.');
          } else if (val === 'thatBai') {
            showError('Kết nối thất bại', 'Sai mật khẩu hoặc không tìm thấy mạng.\nTiếp tục dùng Wi-Fi cũ.');
          }
        } catch (_) { }
      }, 1500);
      trangThaiUnsub.current = () => clearInterval(pollInterval);
    } catch (e: any) { showError('Lỗi Firebase', e.message); }
  };

  const handleQuetWifi = async () => {
    if (dangQuet) return;
    setDangQuet(true);
    try {
      await update(ref(db, 'WiFi'), { quetLuoi: true });
      if (quetPollRef.current) clearInterval(quetPollRef.current);
      quetPollRef.current = setInterval(async () => {
        try {
          const snap = await get(ref(db, 'WiFi/quetLuoi'));
          if (snap.val() === false || snap.val() === null) {
            clearInterval(quetPollRef.current!);
            quetPollRef.current = null;
            const snapList = await get(ref(db, 'WiFi/danhSachWifi'));
            const list = normalizeWifiList(snapList.val());
            setDanhSachWifi(list);
            await AsyncStorage.setItem(WIFI_CACHE_KEY, JSON.stringify(list));
            setDangQuet(false);
            setDaCo1LanQuet(true);
          }
        } catch (_) { }
      }, 1500);
    } catch (e: any) {
      setDangQuet(false);
      showError('Lỗi Firebase', (e as any).message);
    }
  };

  const handleChonWifi = (item: WifiItem) => {
    setSelectedSsid(item.ssid);
    setPassword('');
    setShowPassword(false);
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPassword('');
    setShowPassword(false);
  };

  const handleSaveBrightness = async () => {
    Keyboard.dismiss();
    const num = parseInt(brightnessInput, 10);
    if (isNaN(num) || num < 0 || num > 100) {
      showError('Giá trị không hợp lệ', 'Vui lòng nhập số từ 0 đến 100');
      return;
    }
    try {
      await update(ref(db, 'DongHo'), { DoSang: num });
      setBrightness(num);
      setSavedBrightness(num);
      showSuccess('Đã lưu', `Độ sáng LED: ${num}`);
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
    if (isNaN(num) || num < 1 || num > 100) {
      showError('Giá trị không hợp lệ', 'Vui lòng nhập số từ 1 đến 100 giây');
      return;
    }
    try {
      await update(ref(db, 'DongHo'), { ThoiGianReo: num });
      setRingDuration(num);
      setSavedRingDuration(num);
      showSuccess('Đã lưu', `Thời gian chuông reo: ${num} giây`);
    } catch (e: any) { showError('Lỗi Firebase', e.message); }
  };

  const handleCancelRingDuration = () => {
    Keyboard.dismiss();
    setRingDurationInput(String(savedRingDuration));
    setExpandedCard(null);
  };

  const closeAdjustCards = () => {
    if (expandedCard === 'brightness' || expandedCard === 'ring') {
      Keyboard.dismiss();
      setExpandedCard(null);
    }
  };

  const parsedBrightnessInput = parseInt(brightnessInput, 10);
  const brightnessChanged = !isNaN(parsedBrightnessInput) && parsedBrightnessInput !== savedBrightness;

  const parsedRingInput = parseInt(ringDurationInput, 10);
  const ringDurationChanged = !isNaN(parsedRingInput) && parsedRingInput !== savedRingDuration;

  const [expandedCard, setExpandedCard] = useState<'wifi' | 'brightness' | 'ring' | null>(null);

  const toggleCard = (card: 'wifi' | 'brightness' | 'ring') => {
    Keyboard.dismiss();
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
          {/* <Text style={styles.headerSubtitle}>Cấu hình thiết bị</Text> */}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.body} onPress={closeAdjustCards}>

          {/* Card Wi-Fi */}
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
                  <Text style={styles.cardTitle}>Kết nối Wi-Fi</Text>
                  {currentSsid ? (
                    <Text style={styles.cardSubtitle}>
                      Hiện tại: <Text style={styles.cardSubtitleBold}>{currentSsid}</Text>
                    </Text>
                  ) : (
                    <Text style={styles.cardSubtitle}>Chưa cấu hình</Text>
                  )}
                </View>
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color="#7A8FAD"
                  style={{ transform: [{ rotate: expandedCard === 'wifi' ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {expandedCard === 'wifi' && (
                <View style={styles.cardBody}>
                  <View style={styles.scanRow}>
                    <Text style={styles.scanRowLabel}>Mạng lân cận</Text>
                    <TouchableOpacity
                      onPress={handleQuetWifi}
                      activeOpacity={0.6}
                      disabled={dangQuet || dangKiemTra}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {dangQuet ? (
                        <ActivityIndicator size="small" color="#1F5CA9" />
                      ) : (
                        <Text style={styles.scanRowAction}>Làm mới</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Trạng thái đang kết nối */}
                  {dangKiemTra && (
                    <View style={styles.connectingBanner}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.connectingText}>{statusText}</Text>
                    </View>
                  )}

                  {/* Danh sách wifi quét được */}
                  {danhSachWifi.length > 0 && (
                    <View style={styles.wifiList}>
                      {danhSachWifi.map((item, idx) => {
                        const isSelected = item.ssid === currentSsid;
                        const signalColor = isSelected ? '#1F5CA9' : '#4A5568';
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[styles.wifiItem, isSelected && styles.wifiItemActive]}
                            onPress={() => handleChonWifi(item)}
                            activeOpacity={0.7}
                            disabled={dangKiemTra}
                          >
                            <Ionicons name="wifi" size={20} color={signalColor} />
                            <Text style={[styles.wifiItemName, isSelected && styles.wifiItemNameActive]} numberOfLines={1}>
                              {item.ssid}
                            </Text>
                            {isSelected && (
                              <View style={styles.wifiItemBadge}>
                                <Text style={styles.wifiItemBadgeText}>Đã kết nối</Text>
                              </View>
                            )}
                            <Ionicons name="chevron-forward" size={16} color="#C8D3E8" style={{ marginLeft: 'auto' }} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {!dangQuet && daCo1LanQuet && danhSachWifi.length === 0 && (
                    <Text style={styles.noWifiText}>Không tìm thấy mạng Wi-Fi nào.</Text>
                  )}
                </View>
              )}
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
                  <Text style={styles.cardSubtitle}>Hiện tại: {brightness}</Text>
                </View>
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color="#7A8FAD"
                  style={{ transform: [{ rotate: expandedCard === 'brightness' ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {expandedCard === 'brightness' && (
                <View style={styles.cardBody}>
                  <Text style={styles.tuneFieldLabel}>Giá trị (0 – 100)</Text>
                  <TextInput
                    style={styles.tuneInput}
                    onChangeText={(t) => {
                      if (/^\d{0,3}$/.test(t)) setBrightnessInput(t);
                    }}
                    keyboardType="number-pad"
                    maxLength={3} 
                    placeholder="VD: 50"
                    placeholderTextColor="#A0AEC0"
                    selectTextOnFocus
                    onFocus={() => {
                      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
                    }}
                  />

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
                </View>
              )}
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
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color="#7A8FAD"
                  style={{ transform: [{ rotate: expandedCard === 'ring' ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>

              {expandedCard === 'ring' && (
                <View style={styles.cardBody}>
                  <Text style={styles.tuneFieldLabel}>Số giây chuông reo (1 – 100)</Text>
                  <View style={styles.tuneInputWithIcon}>
                    <TextInput
                      style={styles.tuneInputInner}
                      onChangeText={(t) => {
                        if (/^\d{0,3}$/.test(t)) setRingDurationInput(t);
                      }}
                      keyboardType="number-pad"
                      maxLength={3}
                      placeholder="VD: 5"
                      placeholderTextColor="#A0AEC0"
                      selectTextOnFocus
                      onFocus={() => {
                        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
                      }}
                    />
                    <Text style={styles.tuneUnitInner}>giây</Text>
                  </View>

                  <Text style={styles.tuneHintText}>
                    Chuông sẽ reo liên tục trong khoảng thời gian này mỗi khi được kích hoạt.
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
                </View>
              )}
            </View>
          </Pressable>

        </Pressable>
      </ScrollView>

      {/* Modal nhập mật khẩu */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={closePasswordModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closePasswordModal}>
          <Pressable style={styles.passwordModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="wifi" size={22} color="#1F5CA9" />
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedSsid}</Text>
            </View>
            <Text style={styles.fieldLabel}>Mật khẩu</Text>
            <View style={styles.inputWithIcon}>
              <TextInput
                style={styles.inputInner}
                placeholder="Nhập mật khẩu Wi-Fi"
                placeholderTextColor="#A0AEC0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity
                style={styles.eyeInner}
                onPress={() => setShowPassword(p => !p)}
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color="#7A8FAD"
                />
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBottomButton}
                onPress={closePasswordModal}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBottomButton}
                onPress={handleSaveWifi}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBottomButtonTextSubmit}>Kết nối</Text>
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
  headerSubtitle: { fontSize: 13, fontWeight: '500', color: '#ffffff' },

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
  cardSubtitle: { fontSize: 12, color: '#7A8FAD', marginTop: 2 },
  cardSubtitleBold: { fontWeight: '700', color: '#1F5CA9' },
  cardBody: {
    padding: 16, paddingTop: 4,
    borderTopWidth: 1, borderTopColor: '#F0F4FA',
  },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#4A5568', marginBottom: 8, marginTop: 14 },

  // Input thường
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#F8FAFC',
    fontSize: 15,
    color: '#11181C',
  },

  // Container bọc input + icon mắt bên trong
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
    fontSize: 15,
    color: '#11181C',
  },
  eyeInner: {
    paddingLeft: 8,
    paddingVertical: 11,
  },

  unitInner: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A8FAD',
    paddingLeft: 6,
    paddingVertical: 11,
  },
  hintText: { fontSize: 12, color: '#7A8FAD', marginTop: 10, lineHeight: 18 },

  saveBtn: {
    backgroundColor: '#1F5CA9', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center', marginTop: 15,
  },
  saveBtnDisabled: { backgroundColor: '#C8D3E8' },
  saveBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  saveBtnLoading: { flexDirection: 'row', alignItems: 'center' },

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
    fontSize: 12,
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

  scanRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4, marginTop: 4,
  },
  scanRowLabel: { fontSize: 14, fontWeight: '600', color: '#11181C' },
  scanRowAction: { fontSize: 14, fontWeight: '700', color: '#1F5CA9' },

  // WiFi list
  wifiList: { marginTop: 14, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' },
  wifiItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: '#ffffff', gap: 10, borderBottomWidth: 1, borderBottomColor: '#F0F4FA',
  },
  wifiItemActive: { backgroundColor: '#F0F7FF' },
  wifiItemName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#11181C' },
  wifiItemNameActive: { color: '#1F5CA9', fontWeight: '700' },
  wifiItemBadge: {
    backgroundColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderColor: '#1F5CA9', borderWidth: 1, marginLeft: 6,
  },
  wifiItemBadgeText: { fontSize: 11, fontWeight: '600', color: '#1F5CA9' },
  noWifiText: { textAlign: 'center', color: '#7A8FAD', fontSize: 13, marginTop: 16, marginBottom: 4 },

  connectingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1F5CA9', borderRadius: 10, padding: 12, marginTop: 12,
  },
  connectingText: { color: '#ffffff', fontSize: 13, fontWeight: '600', flex: 1 },

  // Password modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  passwordModal: {
    backgroundColor: '#ffffff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 380,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#11181C', flex: 1 },
  modalActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 6, marginTop: 16,
  },
  modalBottomButton: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBottomButtonTextCancel: { fontSize: 16, fontWeight: '700', color: '#000000' },
  modalBottomButtonTextSubmit: { fontSize: 16, fontWeight: '700', color: '#1F5CA9' },
} as any);