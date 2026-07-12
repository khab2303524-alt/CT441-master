import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { onValue, ref, set } from 'firebase/database';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CustomSwitch } from '../../components/customswitch';
import { FeedbackModal } from '../../components/feedbackmodal';
import ScrollPicker from '../../components/scrollpicker';
import { db } from '../../config/firebaseConfig';
import { useESPConnection } from '../../hooks';

const DAYS_LABEL = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface ScheduleItem {
  id: number;
  alarmTime: string;
  note: string;
  enabled: boolean;
  days: number[];
}

const DayButton = React.memo(({ label, active, onPress }: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    style={[styles.dayBtn, active && styles.dayBtnActive]}
    onPress={onPress}
    activeOpacity={0.75}
    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
  >
    <Text style={[styles.dayBtnText, active && styles.dayBtnTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
));

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTargetId, setEditTargetId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [alarmHour, setAlarmHour] = useState(7);
  const [alarmMinute, setAlarmMinute] = useState(0);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [pickerScrollingCount, setPickerScrollingCount] = useState(0);
  const isPickerScrolling = pickerScrollingCount > 0;
  const handlePickerScrollStateChange = (scrolling: boolean) => {
    setPickerScrollingCount((count) => Math.max(0, count + (scrolling ? 1 : -1)));
  };
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });

  // Tab: 'schedule' | 'manual'
  const [activeTab, setActiveTab] = useState<'schedule' | 'manual'>('schedule');
  const pausedAlarmIdsRef = useRef<number[]>([]);
  const bellScaleAnim = useRef(new Animated.Value(1)).current;
  const [bellRinging, setBellRinging] = useState(false);

  // Ref luôn giữ schedule mới nhất để dùng trong AppState callback
  const scheduleRef = useRef<ScheduleItem[]>([]);
  const activeTabRef = useRef<'schedule' | 'manual'>('schedule');

  const showSuccess = (title: string, message: string) =>
    setFeedbackModal({ visible: true, type: 'success', title, message });
  const showError = (title: string, message: string) =>
    setFeedbackModal({ visible: true, type: 'error', title, message });
  const hideFeedback = () => setFeedbackModal(prev => ({ ...prev, visible: false }));

  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [bottomSheetTargetId, setBottomSheetTargetId] = useState<number | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const bottomSheetAnim = useRef(new Animated.Value(300)).current;

  useESPConnection();

  // Tự động khôi phục báo thức khi rời khỏi màn hình này (chuyển tab clock/settings)
  // Chỉ khôi phục nếu đang ở tab "manual" và có báo thức đang bị tạm tắt
  useFocusEffect(
    useCallback(() => {
      // Khi màn hình được focus lại: reset về tab hẹn giờ và restore alarm nếu đang ở thủ công
      if (activeTabRef.current === 'manual') {
        if (pausedAlarmIdsRef.current.length > 0) {
          const idsToRestore = pausedAlarmIdsRef.current;
          const restored = scheduleRef.current.map(s => ({
            ...s,
            enabled: idsToRestore.includes(s.id) ? true : s.enabled,
          }));
          saveScheduleToFirebase(restored);
          set(ref(db, 'DongHo/ChuongThuCong'), false).catch(() => { });
          pausedAlarmIdsRef.current = [];
        }
        activeTabRef.current = 'schedule';
        setActiveTab('schedule');
        setBellRinging(false);
      }

      return () => {
        // Cleanup khi màn hình mất focus: restore alarm nếu vẫn còn ở thủ công
        if (activeTabRef.current === 'manual' && pausedAlarmIdsRef.current.length > 0) {
          const idsToRestore = pausedAlarmIdsRef.current;
          const restored = scheduleRef.current.map(s => ({
            ...s,
            enabled: idsToRestore.includes(s.id) ? true : s.enabled,
          }));
          saveScheduleToFirebase(restored);
          set(ref(db, 'DongHo/ChuongThuCong'), false).catch(() => { });
          pausedAlarmIdsRef.current = [];
        }
      };
    }, [])
  );

  useEffect(() => {
    const alarmRef = ref(db, 'DongHo/dsBaoThuc');
    const unsubscribe = onValue(alarmRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const loadedSchedule: ScheduleItem[] = [];
        Object.keys(data).forEach((key) => {
          const alarm = data[key];
          // Bỏ qua entry sentinel/placeholder (chỉ dùng để giữ node dsBaoThuc
          // luôn là JSON object hợp lệ cho firmware, không phải báo thức thật)
          if (alarm && alarm.placeholder) return;
          if (alarm && typeof alarm.gio === 'number' && typeof alarm.phut === 'number') {
            const match = key.match(/\d+/);
            const idNum = match ? parseInt(match[0], 10) : loadedSchedule.length + 1;
            const formattedTime = `${String(alarm.gio).padStart(2, '0')}:${String(alarm.phut).padStart(2, '0')}`;
            loadedSchedule.push({
              id: idNum,
              alarmTime: formattedTime,
              note: typeof alarm.note === 'string' ? alarm.note : '',
              enabled: alarm.active ?? false,
              days: Array.isArray(alarm.thu) ? alarm.thu.filter((d: number) => d >= 0 && d <= 6) : [],
            });
          }
        });
        const sorted = loadedSchedule.sort((a, b) => a.alarmTime.localeCompare(b.alarmTime));
        scheduleRef.current = sorted;
        setSchedule(sorted);
      } else {
        scheduleRef.current = [];
        setSchedule([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Đồng bộ trạng thái chuông thủ công theo Firebase: firmware tự tắt chuông sau 3 giây
  // và ghi lại /DongHo/ChuongThuCong = false, nên app chỉ cần lắng nghe để cập nhật UI,
  // không cần người dùng bấm tắt tay nữa.
  useEffect(() => {
    const chuongRef = ref(db, 'DongHo/ChuongThuCong');
    const unsubscribe = onValue(chuongRef, (snapshot) => {
      setBellRinging(!!snapshot.val());
    });
    return () => unsubscribe();
  }, []);

  // Restore khi app về background/bị kill trong lúc đang ở tab thủ công
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        (nextState === 'background' || nextState === 'inactive') &&
        activeTabRef.current === 'manual' &&
        pausedAlarmIdsRef.current.length > 0
      ) {
        const idsToRestore = pausedAlarmIdsRef.current;
        const src = scheduleRef.current;
        if (src.length === 0) return;
        const restored = src.map(s => ({
          ...s,
          enabled: idsToRestore.includes(s.id) ? true : s.enabled,
        }));
        saveScheduleToFirebase(restored);
        set(ref(db, 'DongHo/ChuongThuCong'), false).catch(() => { });
        pausedAlarmIdsRef.current = [];
      }
    });
    return () => sub.remove();
  }, []);

  const saveScheduleToFirebase = (updatedList: ScheduleItem[]) => {
    const alarmObjects: any = {};
    updatedList.forEach((item, index) => {
      const [hours, minutes] = item.alarmTime.split(':');
      const keyName = `BaoThuc${index + 1}`;
      alarmObjects[keyName] = {
        active: item.enabled,
        gio: parseInt(hours, 10) || 0,
        phut: parseInt(minutes, 10) || 0,
        // Firebase RTDB tự xoá mảng rỗng ([]) khỏi node, khiến field "thu" biến mất.
        // Khi đó firmware không đọc được "thu" -> hiểu nhầm là mask 0xFF (chưa cấu hình)
        // thay vì mask 0 (báo thức 1 lần) -> báo thức không tự tắt sau khi reo.
        // Fix: khi không chọn ngày nào (báo thức 1 lần), ghi 1 phần tử sentinel không hợp lệ
        // (-1) để Firebase không xoá field này. Firmware chỉ nhận ngày 0-6 nên -1 bị bỏ qua,
        // mask build ra vẫn đúng là 0 như mong muốn.
        thu: item.days.length > 0 ? item.days : [-1],
        note: item.note || '',
      };
    });

    // Firebase RTDB tự xoá object rỗng ({}) khỏi node khi danh sách trống,
    // khiến /DongHo/dsBaoThuc trở thành null trên Firebase. Firmware ESP32 chỉ
    // tự reset từng báo thức về mặc định khi node là JSON object hợp lệ
    // (dataTypeEnum == json); nếu node là null, logic reset per-index có sẵn
    // trong firmware không có cơ hội chạy -> báo thức cũ bị kẹt "active" mãi
    // trong bộ nhớ local của ESP32, icon báo thức không bao giờ tắt.
    // Ta KHÔNG sửa firmware, mà giữ node luôn là object bằng cách ghi thêm 1
    // entry sentinel (đánh dấu placeholder: true) khi danh sách rỗng. Entry
    // này bị lọc bỏ ở phần đọc dữ liệu bên trên nên không hiện ra như báo
    // thức thật trong danh sách của app.
    if (updatedList.length === 0) {
      alarmObjects['BaoThuc1'] = {
        active: false,
        gio: 0,
        phut: 0,
        thu: [-1],
        note: '',
        placeholder: true,
      };
    }

    set(ref(db, 'DongHo/dsBaoThuc'), alarmObjects)
      .catch((error) => showError('Lỗi Firebase', error.message));
  };

  const switchToManual = () => {
    const enabledIds = schedule.filter(s => s.enabled).map(s => s.id);
    pausedAlarmIdsRef.current = enabledIds;
    if (enabledIds.length > 0) {
      const updated = schedule.map(s => ({ ...s, enabled: false }));
      saveScheduleToFirebase(updated);
    }
    set(ref(db, 'DongHo/ChuongThuCong'), false).catch(() => { });
    activeTabRef.current = 'manual';
    setActiveTab('manual');
  };

  const switchToSchedule = () => {
    const idsToRestore = pausedAlarmIdsRef.current;
    if (idsToRestore.length > 0) {
      const restored = schedule.map(s => ({
        ...s,
        enabled: idsToRestore.includes(s.id) ? true : s.enabled,
      }));
      saveScheduleToFirebase(restored);
    }
    set(ref(db, 'DongHo/ChuongThuCong'), false).catch(() => { });
    pausedAlarmIdsRef.current = [];
    activeTabRef.current = 'schedule';
    setActiveTab('schedule');
    setBellRinging(false);
  };

  const handleTabPress = (tab: 'schedule' | 'manual') => {
    if (tab === activeTab) return;
    if (tab === 'manual') switchToManual();
    else switchToSchedule();
  };

  // ── BẤM CHUÔNG THỦ CÔNG ──
  // Chỉ bật chuông (ghi true lên Firebase). Chuông sẽ tự reo 3 giây rồi firmware
  // tự tắt và ghi lại false lên Firebase (xem listener onValue phía trên), nên
  // không cần bấm lần 2 để tắt nữa. Trong lúc đang reo, bấm nút sẽ không có tác dụng.
  const ringBellNow = () => {
    if (bellRinging) return;
    setBellRinging(true);
    set(ref(db, 'DongHo/ChuongThuCong'), true)
      .then(() => {
        Animated.sequence([
          Animated.timing(bellScaleAnim, { toValue: 1.12, duration: 100, useNativeDriver: true }),
          Animated.timing(bellScaleAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
          Animated.timing(bellScaleAnim, { toValue: 1.08, duration: 80, useNativeDriver: true }),
          Animated.timing(bellScaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
      })
      .catch((err) => {
        showError('Lỗi', err.message);
        setBellRinging(false);
      });
  };

  const toggleDay = useCallback((day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }, []);

  const openBottomSheet = (id: number) => {
    setBottomSheetTargetId(id);
    setShowConfirmDelete(false);
    setShowBottomSheet(true);
    Animated.spring(bottomSheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  };

  const closeBottomSheet = () => {
    Animated.timing(bottomSheetAnim, {
      toValue: 300,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setShowBottomSheet(false);
      setBottomSheetTargetId(null);
      setShowConfirmDelete(false);
    });
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setEditTargetId(null);
    setAlarmHour(7);
    setAlarmMinute(0);
    setNote('');
    setSelectedDays([]);
    setPickerScrollingCount(0);
    setShowModal(true);
  };

  const openEditModal = (item: ScheduleItem) => {
    const [h, m] = item.alarmTime.split(':').map(Number);
    setAlarmHour(h);
    setAlarmMinute(m);
    setNote(item.note);
    setSelectedDays([...item.days]);
    setEditTargetId(item.id);
    setIsEditMode(true);
    setPickerScrollingCount(0);
    setShowModal(true);
  };

  const handleDeleteItem = (id: number) => {
    const updated = schedule.filter(item => item.id !== id);
    setSchedule(updated);
    saveScheduleToFirebase(updated);
    closeBottomSheet();
    showSuccess('Thành công', 'Đã xóa hẹn giờ');
  };

  const handleSubmit = () => {
    const alarmTimeStr = `${String(alarmHour).padStart(2, '0')}:${String(alarmMinute).padStart(2, '0')}`;
    const isDuplicate = schedule.some(item =>
      item.alarmTime === alarmTimeStr &&
      (!isEditMode || item.id !== editTargetId)
    );
    if (isDuplicate) {
      showError('Lỗi', 'Giờ hẹn này đã tồn tại');
      return;
    }
    const sortedDays = [...selectedDays].sort((a, b) => a - b);
    if (isEditMode && editTargetId !== null) {
      const updated = schedule.map(item =>
        item.id === editTargetId
          ? { ...item, alarmTime: alarmTimeStr, note, days: sortedDays }
          : item
      );
      setSchedule(updated);
      saveScheduleToFirebase(updated);
      showSuccess('Thành công', 'Đã cập nhật hẹn giờ');
    } else {
      const newId = Math.max(...schedule.map(s => s.id), 0) + 1;
      const newItem: ScheduleItem = { id: newId, alarmTime: alarmTimeStr, note, enabled: true, days: sortedDays };
      const updated = [...schedule, newItem];
      setSchedule(updated);
      saveScheduleToFirebase(updated);
      showSuccess('Thành công', 'Đã thêm hẹn giờ');
    }
    setShowModal(false);
    setNote('');
    setAlarmHour(7);
    setAlarmMinute(0);
    setSelectedDays([]);
  };

  const formatDaysLabel = (days: number[]) => {
    if (days.length === 0) return '1 lần';
    if (days.length === 7) return 'Hằng ngày';
    if (days.length === 5 && ![0, 6].some(d => days.includes(d))) return 'T2 – T6';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'T7 & CN';
    return days.map(d => DAYS_LABEL[d]).join(' ');
  };

  const bottomSheetTarget = schedule.find(s => s.id === bottomSheetTargetId);

  return (
    <View style={styles.container}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            {activeTab === 'schedule' ? 'Hẹn giờ' : 'Thủ công'}
          </Text>
        </View>
      </View>

      {/* ── TAB BAR ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'schedule' && styles.tabItemActive]}
          onPress={() => handleTabPress('schedule')}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabLabel, activeTab === 'schedule' && styles.tabLabelActive]}>
            Hẹn giờ
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'manual' && styles.tabItemActive]}
          onPress={() => handleTabPress('manual')}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabLabel, activeTab === 'manual' && styles.tabLabelActive]}>
            Thủ công
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── NỘI DUNG TAB HẸN GIỜ ── */}
      {activeTab === 'schedule' && (
        <>
          <ScrollView
            contentContainerStyle={styles.scheduleListContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {schedule.length > 0 ? (
              schedule.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.cardContainer,
                    item.enabled ? styles.cardEnabled : styles.cardDisabled,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => openEditModal(item)}
                  onLongPress={() => openBottomSheet(item.id)}
                  delayLongPress={350}
                >
                  <View style={[styles.timeColumn, !item.enabled && styles.timeColumnDisabled]}>
                    <Text style={[styles.timeText, !item.enabled && styles.timeTextDisabled]}>
                      {item.alarmTime.split(':')[0]}
                    </Text>
                    <Text style={[styles.timeSep, !item.enabled && styles.timeTextDisabled]}>:</Text>
                    <Text style={[styles.timeText, !item.enabled && styles.timeTextDisabled]}>
                      {item.alarmTime.split(':')[1]}
                    </Text>
                  </View>

                  <View style={styles.noteColumn}>
                    {item.note ? (
                      <Text style={[styles.noteText, !item.enabled && styles.noteTextDisabled]}>
                        {item.note}
                      </Text>
                    ) : (
                      <Text style={[styles.notePlaceholder, !item.enabled && styles.noteTextDisabled]}>
                        Không có ghi chú
                      </Text>
                    )}
                    <Text style={[styles.daysLabel, !item.enabled && styles.daysLabelDisabled]}>
                      <FontAwesome6 name="rotate" size={10} color={item.enabled ? '#FFF200' : '#8899B0'} />
                      {'  '}{formatDaysLabel(item.days)}
                    </Text>
                  </View>

                  <View style={styles.switchColumn}>
                    <CustomSwitch
                      value={item.enabled}
                      onValueChange={() => {
                        const updated = schedule.map(s =>
                          s.id === item.id ? { ...s, enabled: !s.enabled } : s
                        );
                        setSchedule(updated);
                        saveScheduleToFirebase(updated);

                      }}
                      activeColor="#00AFEF"
                      inactiveColor="#C8D3E8"
                    />
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyStateContainer}>
                <FontAwesome6 name="bell-slash" size={40} color="#CBD5E0" style={{ marginBottom: 12 }} />
                <Text style={styles.emptyText}>Chưa có hẹn giờ nào</Text>
                <Text style={styles.emptySubText}>Nhấn + để thêm hẹn giờ mới</Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.85}>
            <FontAwesome6 name="plus" size={20} color="#ffffff" />
          </TouchableOpacity>
        </>
      )}

      {/* ── NỘI DUNG TAB THỦ CÔNG ── */}
      {activeTab === 'manual' && (
        <View style={styles.manualModeContainer}>
          <View style={styles.manualModeCenter}>
            <Text style={[styles.bellBtnLabel, bellRinging && styles.bellBtnLabelRinging]}>
              {bellRinging ? 'Đang reo...' : 'Nhấn để bật chuông'}
            </Text>

            <Animated.View style={[styles.bellShadowWrap, { transform: [{ scale: bellScaleAnim }] }]}>
              <TouchableOpacity
                style={styles.bellRingOuter}
                onPress={ringBellNow}
                activeOpacity={0.82}
                disabled={bellRinging}
              >
                <LinearGradient
                  colors={bellRinging ? ['#FF8A65', '#D84315'] : ['#22C3FF', '#0E7FC4']}
                  style={styles.bellRingMid}
                >
                  <LinearGradient
                    colors={bellRinging ? ['#E64A19', '#8C2F00'] : ['#2E72C4', '#173E78']}
                    style={styles.bellRingInner}
                  >
                    <FontAwesome6
                      name="bell"
                      size={74}
                      color={bellRinging ? '#FFF200' : '#FFF200'}
                    />
                  </LinearGradient>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Trạng thái tạm tắt */}
          <View style={[
            styles.pausedBadge,
            pausedAlarmIdsRef.current.length === 0 && styles.pausedBadgeEmpty,
          ]}>
            <Text style={[
              styles.pausedBadgeText,
              pausedAlarmIdsRef.current.length === 0 && styles.pausedBadgeTextEmpty,
            ]}>
              {pausedAlarmIdsRef.current.length > 0
                ? `Đã tạm tắt ${pausedAlarmIdsRef.current.length} hẹn giờ`
                : 'Không có hẹn giờ nào bị tắt'}
            </Text>
          </View>
        </View>
      )}

      {/* ── BOTTOM SHEET ── */}
      <Modal
        visible={showBottomSheet}
        transparent
        animationType="none"
        onRequestClose={closeBottomSheet}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={closeBottomSheet}>
          <Animated.View
            style={[
              styles.bottomSheetContainer,
              { paddingBottom: 20 + insets.bottom, transform: [{ translateY: bottomSheetAnim }] },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.bottomSheetHandle} />

              {bottomSheetTarget && (
                <View style={styles.bsInfoSimple}>
                  <Text style={styles.bsInfoTime}>{bottomSheetTarget.alarmTime}</Text>
                  <Text style={bottomSheetTarget.note ? styles.bsInfoNote : styles.bsInfoNotePlaceholder}>
                    {bottomSheetTarget.note || 'Không có ghi chú'}
                  </Text>
                  <Text style={styles.bsDaysLabel}>
                    <FontAwesome6 name="rotate" size={11} color="#fff200" />
                    {'  '}{formatDaysLabel(bottomSheetTarget.days)}
                  </Text>
                </View>
              )}

              <View style={styles.bottomSheetDivider} />

              {!showConfirmDelete ? (
                <TouchableOpacity
                  style={styles.bottomSheetDeleteBtn}
                  activeOpacity={0.7}
                  onPress={() => setShowConfirmDelete(true)}
                >
                  <FontAwesome6 name="trash" size={17} color="#DC2626" />
                  <Text style={styles.bottomSheetDeleteText}>Xóa hẹn giờ</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.confirmDeleteSection}>
                  <View style={styles.confirmIconRow}>
                    <View style={styles.confirmIconCircle}>
                      <FontAwesome6 name="trash" size={15} color="#DC2626" />
                    </View>
                    <Text style={styles.confirmDeleteTitle}>Xóa giờ hẹn này?</Text>
                  </View>
                  <Text style={styles.confirmDeleteSub}>Thao tác này không thể hoàn tác</Text>
                  <View style={styles.confirmDeleteBtnRow}>
                    <TouchableOpacity
                      style={styles.confirmCancelBtn}
                      activeOpacity={0.7}
                      onPress={() => setShowConfirmDelete(false)}
                    >
                      <Text style={styles.confirmCancelBtnText}>Hủy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmDeleteBtn}
                      activeOpacity={0.7}
                      onPress={() => bottomSheetTargetId !== null && handleDeleteItem(bottomSheetTargetId)}
                    >
                      <FontAwesome6 name="trash" size={13} color="#ffffff" />
                      <Text style={styles.confirmDeleteBtnText}>Xóa</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* ── MODAL THÊM/SỬA ── */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowModal(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {isEditMode ? 'CHỈNH SỬA' : 'THÊM HẸN GIỜ'}
              </Text>
            </View>
            <View style={styles.modalFormContent}>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Ghi chú</Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Nhập ghi chú"
                  placeholderTextColor="#A0AEC0"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  numberOfLines={3}
                />
              </View>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Chọn thời gian</Text>
                <View style={styles.timePickerContainer}>
                  <View style={styles.timePickerCol}>
                    <Text style={styles.timePickerLabel}>GIỜ</Text>
                    <View style={styles.timePickerBox}>
                      <ScrollPicker
                        options={Array.from({ length: 24 }, (_, i) => i)}
                        selectedValue={alarmHour}
                        onValueChange={setAlarmHour}
                        onScrollStateChange={handlePickerScrollStateChange}
                      />
                    </View>
                  </View>
                  <Text style={styles.timePickerSeparator}>:</Text>
                  <View style={styles.timePickerCol}>
                    <Text style={styles.timePickerLabel}>PHÚT</Text>
                    <View style={styles.timePickerBox}>
                      <ScrollPicker
                        options={Array.from({ length: 60 }, (_, i) => i)}
                        selectedValue={alarmMinute}
                        onValueChange={setAlarmMinute}
                        onScrollStateChange={handlePickerScrollStateChange}
                      />
                    </View>
                  </View>
                </View>
              </View>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Lặp lại</Text>
                <View style={styles.dayPickerRow}>
                  {DAYS_LABEL.map((label, index) => (
                    <DayButton
                      key={index}
                      label={label}
                      active={selectedDays.includes(index)}
                      onPress={() => toggleDay(index)}
                    />
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.modalBottomActions}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.modalBottomButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.modalBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.modalBottomButton, isPickerScrolling && styles.modalBottomButtonDisabled]}
                onPress={handleSubmit}
                disabled={isPickerScrolling}
              >
                <Text style={styles.modalBottomButtonTextSubmit}>Xong</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {!showModal && (
        <FeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onDismiss={hideFeedback}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FA' },

  header: {
    backgroundColor: '#1F5CA9',
    paddingVertical: 15,
    paddingHorizontal: 20,
    paddingTop: 50,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  headerSubtitle: { fontSize: 13, fontWeight: '500', color: '#ffffff' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#1F5CA9',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabLabelActive: {
    color: '#1F5CA9',
  },

  scheduleListContainer: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },

  cardContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 20,
    marginBottom: 10,
    minHeight: 72,
  },
  cardEnabled: { backgroundColor: '#1F5CA9' },
  cardDisabled: { backgroundColor: '#DDE4F0' },

  timeColumn: {
    width: 80,
    backgroundColor: '#FFF200',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 1,
    flexShrink: 0,
    alignSelf: 'stretch',
    borderTopLeftRadius: 19,
    borderBottomLeftRadius: 19,
  },
  timeColumnDisabled: { backgroundColor: '#C8D3E8' },
  timeText: { fontSize: 18, fontWeight: '800', color: '#1F5CA9', lineHeight: 28 },
  timeSep: { fontSize: 20, fontWeight: '800', color: '#1F5CA9', lineHeight: 28, marginBottom: 2 },
  timeTextDisabled: { color: '#7A8FAD' },

  noteColumn: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  noteText: { fontSize: 15, fontWeight: '600', color: '#ffffff', lineHeight: 21 },
  notePlaceholder: { fontSize: 14, color: '#8BAACC', fontWeight: '400' },
  noteTextDisabled: { color: '#8899B0' },
  daysLabel: { fontSize: 12, fontWeight: '500', color: '#FFF200' },
  daysLabelDisabled: { color: '#8899B0' },

  switchColumn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  emptyStateContainer: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 80,
  },
  emptyText: { fontSize: 16, color: '#A0AEC0', fontWeight: '600' },
  emptySubText: { fontSize: 13, color: '#CBD5E0', marginTop: 6 },

  fab: {
    position: 'absolute',
    bottom: 30,
    left: '50%',
    marginLeft: -27.5,
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: '#fff200',
    alignItems: 'center',
    justifyContent: 'center',
  },

  manualModeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 40,
    paddingBottom: 36,
  },
  manualModeCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#1F5CA9',
  },
  pausedBadgeEmpty: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  pausedBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F5CA9',
    letterSpacing: 0.2,
  },
  pausedBadgeTextEmpty: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  bellShadowWrap: {
    width: 230,
    height: 230,
    borderRadius: 115,
    shadowColor: '#0E2A52',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 14,
  },
  bellRingOuter: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bellRingOuterRinging: {
    backgroundColor: '#E5E7EB',
    shadowColor: '#6B7280',
    shadowOpacity: 0.3,
  },
  bellRingMid: {
    width: 210,
    height: 210,
    borderRadius: 105,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bellRingInner: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bellBtnLabel: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1F5CA9',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  bellBtnLabelRinging: {
    color: '#D84315',
  },

  bottomSheetOverlay: { flex: 1, backgroundColor: '#00000073', justifyContent: 'flex-end' },
  bottomSheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  bottomSheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginBottom: 20,
  },
  bsInfoSimple: { paddingHorizontal: 4, paddingBottom: 20, gap: 4 },
  bsInfoTime: { fontSize: 40, fontWeight: '800', color: '#1F5CA9', letterSpacing: 1 },
  bsInfoNote: { fontSize: 15, fontWeight: '500', color: '#00AFE1' },
  bsInfoNotePlaceholder: { fontSize: 15, fontWeight: '400', color: '#A0AEC0' },
  bsDaysLabel: { fontSize: 13, fontWeight: '500', color: '#fff200' },
  bottomSheetDivider: { height: 1, backgroundColor: '#F0F4F8', marginBottom: 16 },
  bottomSheetDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 12, backgroundColor: '#F1F5F9', marginBottom: 8,
  },
  bottomSheetDeleteText: { fontSize: 14, fontWeight: '500', color: '#DC2626' },
  confirmDeleteSection: {
    marginBottom: 8, paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 14, backgroundColor: '#F8FAFC',
  },
  confirmIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  confirmIconCircle: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmDeleteTitle: { fontSize: 14, fontWeight: '500', color: '#111827' },
  confirmDeleteSub: { fontSize: 12, color: '#6B7280', marginBottom: 14, paddingLeft: 44, lineHeight: 18 },
  confirmDeleteBtnRow: { flexDirection: 'row', gap: 8 },
  confirmCancelBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E2E8F0', alignItems: 'center',
  },
  confirmCancelBtnText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  confirmDeleteBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: '#DC2626',
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  confirmDeleteBtnText: { fontSize: 13, fontWeight: '500', color: '#ffffff' },

  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center' },
  modalContent: {
    backgroundColor: '#FFFFFF', borderRadius: 24, width: '92%', maxWidth: 380, overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 16, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#F0F4F8', alignItems: 'center',
  },
  modalHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#1F5CA9', letterSpacing: 0.5 },
  modalFormContent: { padding: 20, paddingBottom: 10 },
  modalSection: { marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#000000', marginBottom: 12 },
  timePickerContainer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 8,
    borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12,
  },
  timePickerCol: { flex: 1, alignItems: 'center' },
  timePickerLabel: { fontSize: 14, fontWeight: '700', color: '#000000', letterSpacing: 0.5 },
  timePickerBox: { height: 150, width: '100%', alignItems: 'center', justifyContent: 'center' },
  timePickerSeparator: { fontSize: 22, fontWeight: '600', color: '#1F5CA9', marginTop: 14, paddingHorizontal: 2 },
  noteInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#F8FAFC',
    fontWeight: '500', color: '#000000', textAlignVertical: 'top', minHeight: 80,
  },
  dayPickerRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dayBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F0F4FA', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  dayBtnActive: { backgroundColor: '#1F5CA9', borderColor: '#1F5CA9' },
  dayBtnText: { fontSize: 11, fontWeight: '700', color: '#7A8FAD' },
  dayBtnTextActive: { color: '#FFF200' },
  modalBottomActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: 20, paddingTop: 5, backgroundColor: '#FFFFFF',
  },
  modalBottomButton: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBottomButtonDisabled: { opacity: 0.4 },
  modalBottomButtonTextCancel: { fontSize: 16, fontWeight: '700', color: '#000000' },
  modalBottomButtonTextSubmit: { fontSize: 16, fontWeight: '700', color: '#1F5CA9' },
} as any);