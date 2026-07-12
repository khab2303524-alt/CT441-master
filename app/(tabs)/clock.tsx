import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { onValue, ref, update } from 'firebase/database';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import ScrollPicker from '../../components/scrollpicker';
import { db } from '../../config/firebaseConfig';
import { notifyManualTimeChange, useCustomAlert, useESPConnection, useESPTime } from '../../hooks';

const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export default function ClockScreen() {
  const [time, setTime] = useState('-- --');
  const [seconds, setSeconds] = useState('00');
  const [dateStr, setDateStr] = useState('Đang kết nối...');
  const [temperature, setTemperature] = useState('--°C');
  const [humidity, setHumidity] = useState('--%');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'gio' | 'ngay'>('gio');
  const [editHours, setEditHours] = useState(0);
  const [editMinutes, setEditMinutes] = useState(0);
  const [editSeconds, setEditSeconds] = useState(0);
  const [editNgay, setEditNgay] = useState(1);
  const [editThang, setEditThang] = useState(1);
  const [editNam, setEditNam] = useState(2024);
  const [pickerScrollingCount, setPickerScrollingCount] = useState(0);
  const isPickerScrolling = pickerScrollingCount > 0;
  const handlePickerScrollStateChange = (scrolling: boolean) => {
    setPickerScrollingCount((count) => Math.max(0, count + (scrolling ? 1 : -1)));
  };
  const isESPConnected = useESPConnection();
  const timeData = useESPTime();
  const { showSuccess, showError } = useCustomAlert();

  // "Neo" thời gian lưu dưới dạng epoch (ms) quy đổi từ Gio/Phut/Giay/Ngay/Thang/Nam,
  // kèm thời điểm nhận nó theo đồng hồ máy (Date.now()).
  // Sở dĩ dùng epoch thay vì lưu riêng từng trường là để cộng trừ/tràn ngày-tháng-năm
  // được xử lý tự động bởi đối tượng Date, khỏi phải tự viết logic carry dễ sai.
  const anchorRef = useRef<{ epochMs: number; receivedAtMs: number } | null>(null);

  // Ngưỡng lệch cho phép trước khi coi là "lệch thật" (mất kết nối lâu, chỉnh giờ tay...).
  // Sai lệch nhỏ hơn ngưỡng này chỉ là do độ trễ mạng/Firebase -> BỎ QUA, không nhảy số,
  // để tick nội bộ tiếp tục chạy mượt thay vì giật lùi rồi đếm lên lại.
  const RESYNC_THRESHOLD_MS = 1500;

  const toEpochMs = (d: { Gio: number; Phut: number; Giay: number; Ngay: number; Thang: number; Nam: number }) =>
    new Date(d.Nam, d.Thang - 1, d.Ngay, d.Gio, d.Phut, d.Giay).getTime();

  const applyDisplayFromEpoch = (epochMs: number) => {
    const d = new Date(epochMs);
    const formattedTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setTime(formattedTime);
    setSeconds(String(d.getSeconds()).padStart(2, '0'));

    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dayName = DAY_NAMES[d.getDay()] || `Thứ ${d.getDay() + 1}`;
    setDateStr(`${dayName}, ${dd}/${mm}/${d.getFullYear()}`);
  };

  // Khi có dữ liệu MỚI từ Firebase: chỉ resync (nhảy neo) nếu lệch vượt ngưỡng.
  // Việc gán editHours/editMinutes... tách riêng, KHÔNG phụ thuộc editModalVisible
  // trong effect này nữa (tránh bug: mở/đóng modal cũng làm reset neo -> giật số).
  useEffect(() => {
    if (!timeData) return;
    const { Gio, Phut, Giay, Ngay, Thang, Nam } = timeData;
    const newEpochMs = toEpochMs({ Gio, Phut, Giay, Ngay, Thang, Nam });
    const now = Date.now();
    const anchor = anchorRef.current;

    const predictedMs = anchor ? anchor.epochMs + (now - anchor.receivedAtMs) : null;
    const diffMs = predictedMs === null ? Infinity : Math.abs(newEpochMs - predictedMs);

    if (diffMs > RESYNC_THRESHOLD_MS) {
      anchorRef.current = { epochMs: newEpochMs, receivedAtMs: now };
      applyDisplayFromEpoch(newEpochMs);
    }
    // else: lệch nhỏ do trễ mạng -> giữ nguyên neo cũ, không đụng vào display
  }, [timeData]);

  // Đồng bộ các trường chỉnh giờ/ngày trong modal khi có dữ liệu mới (tách riêng khỏi anchor)
  useEffect(() => {
    if (timeData && !editModalVisible) {
      setEditHours(timeData.Gio);
      setEditMinutes(timeData.Phut);
      setEditSeconds(timeData.Giay);
      setEditNgay(timeData.Ngay);
      setEditThang(timeData.Thang);
      setEditNam(timeData.Nam);
    }
  }, [timeData, editModalVisible]);

  // Tick nội bộ mỗi 1s dựa trên Date.now() của máy, độc lập với tần suất Firebase gửi.
  useEffect(() => {
    const interval = setInterval(() => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      applyDisplayFromEpoch(anchor.epochMs + (Date.now() - anchor.receivedAtMs));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const sensorRef = ref(db, 'CamBien');
    const unsubscribeSensor = onValue(sensorRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.NhietDo !== undefined) setTemperature(`${data.NhietDo}°C`);
        if (data.DoAm !== undefined) setHumidity(`${data.DoAm}%`);
      }
    });

    return () => unsubscribeSensor();
  }, []);

  const openEditModal = () => {
    if (timeData) {
      setEditHours(timeData.Gio);
      setEditMinutes(timeData.Phut);
      setEditSeconds(timeData.Giay);
      setEditNgay(timeData.Ngay);
      setEditThang(timeData.Thang);
      setEditNam(timeData.Nam);
    }
    setActiveTab('gio');
    setPickerScrollingCount(0);
    setEditModalVisible(true);
  };

  const saveTime = async () => {
    try {
      const datGioRef = ref(db, 'DongHo/DatGio');
      await update(datGioRef, {
        Gio: editHours,
        Phut: editMinutes,
        Giay: editSeconds,
        capNhat: true,
      });
      notifyManualTimeChange();
      showSuccess('Thành công', 'Đã gửi lệnh chỉnh giờ đến thiết bị');
      setEditModalVisible(false);
    } catch (error) {
      showError('Lỗi', 'Không thể cập nhật giờ');
      console.error('Error updating time:', error);
    }
  };

  const daysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate();

  const calcThu = (day: number, month: number, year: number) =>
    new Date(year, month - 1, day).getDay();

  const saveDate = async () => {
    const maxDay = daysInMonth(editThang, editNam);
    const safeNgay = Math.min(editNgay, maxDay);
    const thu = calcThu(safeNgay, editThang, editNam);
    try {
      const datNgayRef = ref(db, 'DongHo/DatNgay');
      await update(datNgayRef, {
        Ngay: safeNgay,
        Thang: editThang,
        Nam: editNam,
        Thu: thu,
        capNhat: true,
      });
      notifyManualTimeChange();
      showSuccess('Thành công', 'Đã gửi lệnh chỉnh ngày đến thiết bị');
      setEditModalVisible(false);
    } catch (error) {
      showError('Lỗi', 'Không thể cập nhật ngày');
      console.error('Error updating date:', error);
    }
  };

  return (
    <View style={styles.mainContainer}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Đồng hồ</Text>
          {/* <Text style={styles.headerSubtitle}>Thời gian và môi trường</Text> */}
        </View>
        {/* <Image source={require('../../assets/images/ctu.png')} style={styles.headerLogo} resizeMode="contain" /> */}
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.contentWrapper}>

          <View style={styles.clockCard}>
            <View style={styles.timeWrapper}>
              <Text style={styles.timeDisplay}>{time}</Text>
              <View style={styles.secondsContainer}>
                <Text style={styles.secondsDisplay}>{seconds}s</Text>
              </View>
            </View>

            <View style={styles.dateContainer}>
              <FontAwesome6 name="calendar-day" size={13} color="#1F5CA9" style={{ marginRight: 8 }} />
              <Text style={styles.dateDisplay}>{dateStr}</Text>
            </View>
          </View>

          <View style={styles.sectionLabelContainer}>
            <Text style={styles.sectionLabel}>NHIỆT ĐỘ VÀ ĐỘ ẨM</Text>
            <View style={styles.sectionLine} />
          </View>

          {/* LAYOUT 2 THẺ CẢM BIẾN MINI CARD */}
          <View style={styles.sensorRowContainer}>
            <View style={styles.sensorMiniCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#FFF5F5' }]}>
                <FontAwesome6 name="temperature-three-quarters" size={20} color="#FF4D4F" />
              </View>
              <View style={styles.sensorInfo}>
                <Text style={styles.sensorLabelText}>Nhiệt độ</Text>
                <Text style={[styles.sensorValue, { color: '#FF4D4F' }]}>{temperature}</Text>
              </View>
            </View>

            <View style={styles.sensorMiniCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#E6F7FF' }]}>
                <FontAwesome6 name="droplet" size={18} color="#00AFEF" />
              </View>
              <View style={styles.sensorInfo}>
                <Text style={styles.sensorLabelText}>Độ ẩm</Text>
                <Text style={[styles.sensorValue, { color: '#00AFEF' }]}>{humidity}</Text>
              </View>
            </View>
          </View>

        </View>
      </ScrollView>

      <TouchableOpacity style={styles.editFab} onPress={openEditModal} activeOpacity={0.85}>
        <FontAwesome6 name="pen-to-square" size={20} color="#ffffff" />
      </TouchableOpacity>

      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>

            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>CHỈNH THỜI GIAN</Text>
            </View>

            {/* TAB SWITCHER */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.tabBtn, activeTab === 'gio' && styles.tabBtnActive]}
                onPress={() => setActiveTab('gio')}
              >
                <FontAwesome6 name="clock" size={13} color={activeTab === 'gio' ? '#ffffff' : '#1F5CA9'} style={{ marginRight: 6 }} />
                <Text style={[styles.tabBtnText, activeTab === 'gio' && styles.tabBtnTextActive]}>Chỉnh giờ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.tabBtn, activeTab === 'ngay' && styles.tabBtnActive]}
                onPress={() => setActiveTab('ngay')}
              >
                <FontAwesome6 name="calendar-days" size={13} color={activeTab === 'ngay' ? '#ffffff' : '#1F5CA9'} style={{ marginRight: 6 }} />
                <Text style={[styles.tabBtnText, activeTab === 'ngay' && styles.tabBtnTextActive]}>Chỉnh ngày</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalFormContent}>

              {/* ── TAB GIỜ ── */}
              {activeTab === 'gio' && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Chọn thời gian</Text>

                  <View style={styles.timePickerContainer}>
                    <View style={styles.timePickerCol}>
                      <Text style={styles.timePickerLabel}>GIỜ</Text>
                      <View style={styles.timePickerBox}>
                        <ScrollPicker
                          options={Array.from({ length: 24 }, (_, i) => i)}
                          selectedValue={editHours}
                          onValueChange={setEditHours}
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
                          selectedValue={editMinutes}
                          onValueChange={setEditMinutes}
                          onScrollStateChange={handlePickerScrollStateChange}
                        />
                      </View>
                    </View>

                    <Text style={styles.timePickerSeparator}>:</Text>

                    <View style={styles.timePickerCol}>
                      <Text style={styles.timePickerLabel}>GIÂY</Text>
                      <View style={styles.timePickerBox}>
                        <ScrollPicker
                          options={Array.from({ length: 60 }, (_, i) => i)}
                          selectedValue={editSeconds}
                          onValueChange={setEditSeconds}
                          onScrollStateChange={handlePickerScrollStateChange}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.timeDisplayContainer}>
                    <View style={styles.timeDisplayBox}>
                      <Text style={styles.timeDisplayBoxLabel}>Thời gian mới</Text>
                      <Text style={styles.timeDisplayBoxValue}>
                        {String(editHours).padStart(2, '0')}:{String(editMinutes).padStart(2, '0')}:{String(editSeconds).padStart(2, '0')}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {activeTab === 'ngay' && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalLabel}>Chọn ngày</Text>

                  <View style={styles.datePickerContainer}>
                    {/* Cột NGÀY */}
                    <View style={styles.datePickerCol}>
                      <Text style={styles.timePickerLabel}>NGÀY</Text>
                      <View style={styles.timePickerBox}>
                        <ScrollPicker
                          options={Array.from({ length: daysInMonth(editThang, editNam) }, (_, i) => i + 1)}
                          selectedValue={editNgay}
                          onValueChange={setEditNgay}
                          onScrollStateChange={handlePickerScrollStateChange}
                        />
                      </View>
                    </View>

                    <View style={styles.datePickerSepWrap}>
                      <Text style={styles.datePickerSep}>/</Text>
                    </View>

                    <View style={styles.datePickerCol}>
                      <Text style={styles.timePickerLabel}>THÁNG</Text>
                      <View style={styles.timePickerBox}>
                        <ScrollPicker
                          options={Array.from({ length: 12 }, (_, i) => i + 1)}
                          selectedValue={editThang}
                          onValueChange={(val) => {
                            setEditThang(val);
                            const max = daysInMonth(val, editNam);
                            if (editNgay > max) setEditNgay(max);
                          }}
                          onScrollStateChange={handlePickerScrollStateChange}
                        />
                      </View>
                    </View>

                    <View style={styles.datePickerSepWrap}>
                      <Text style={styles.datePickerSep}>/</Text>
                    </View>

                    {/* Cột NĂM - rộng hơn vì 4 chữ số */}
                    <View style={styles.datePickerColYear}>
                      <Text style={styles.timePickerLabel}>NĂM</Text>
                      <View style={[styles.timePickerBox, { width: '100%' }]}>
                        <ScrollPicker
                          options={Array.from({ length: 100 }, (_, i) => 2000 + i)}
                          selectedValue={editNam}
                          pickerWidth={95}
                          onValueChange={(val) => {
                            setEditNam(val);
                            const max = daysInMonth(editThang, val);
                            if (editNgay > max) setEditNgay(max);
                          }}
                          onScrollStateChange={handlePickerScrollStateChange}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.timeDisplayContainer}>
                    <View style={styles.timeDisplayBox}>
                      <Text style={styles.timeDisplayBoxLabel}>Ngày mới</Text>
                      <Text style={styles.timeDisplayBoxValue}>
                        {String(editNgay).padStart(2, '0')}/{String(editThang).padStart(2, '0')}/{editNam}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

            </View>

            <View style={styles.modalBottomActions}>
              <TouchableOpacity activeOpacity={0.7} style={styles.modalBottomButton} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalBottomButtonTextCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.modalBottomButton, isPickerScrolling && styles.modalBottomButtonDisabled]}
                onPress={activeTab === 'gio' ? saveTime : saveDate}
                disabled={isPickerScrolling}
              >
                <Text style={styles.modalBottomButtonTextSubmit}>Xong</Text>
              </TouchableOpacity>
            </View>

          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 100 },

  header: {
    backgroundColor: '#1F5CA9',
    paddingVertical: 15,
    paddingHorizontal: 20,
    paddingTop: 50,
    // borderBottomLeftRadius: 20,
    // borderBottomRightRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  headerSubtitle: { fontSize: 13, fontWeight: '500', color: '#ffffff' },
  headerLogo: { width: 80, height: 80, marginLeft: 12 },

  contentWrapper: { flex: 1, paddingHorizontal: 20, paddingTop: 24, gap: 24 },

  clockCard: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#EFF2F6'
  },

  timeWrapper: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginVertical: 4 },
  secondsContainer: { marginLeft: 6, marginBottom: 14, width: 48, alignItems: 'flex-start' },
  secondsDisplay: { fontSize: 24, fontWeight: '800', color: '#00AFEF', fontVariant: ['tabular-nums'] },
  timeDisplay: { fontSize: 72, fontWeight: '900', color: '#1F5CA9', letterSpacing: -1, fontVariant: ['tabular-nums'] },

  dateContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 14, backgroundColor: '#F1F5F9', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 100 },
  dateDisplay: { fontSize: 13, color: '#475569', fontWeight: '700' },

  sectionLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '900', color: '#1F5CA9', letterSpacing: 1 },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#00AFEF' },

  sensorRowContainer: { flexDirection: 'row', gap: 16, width: '100%' },

  sensorMiniCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 14,
    borderWidth: 1,
    borderColor: '#EFF2F6',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3
  },
  iconCircle: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sensorInfo: { marginTop: 2 },
  sensorLabelText: { fontSize: 12, color: '#000000', fontWeight: '600', marginBottom: 4 },
  sensorValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

  editFab: {
    position: 'absolute',
    bottom: 30,
    right: 24,
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: '#1F5CA9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 24, width: '92%', maxWidth: 380, overflow: 'hidden' },
  modalHeader: { paddingHorizontal: 16, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#F0F4F8', alignItems: 'center' },
  modalHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#1F5CA9', letterSpacing: 0.5 },
  modalFormContent: { padding: 20, paddingBottom: 10 },
  modalSection: { marginBottom: 8 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#000000', marginBottom: 12 },

  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  timePickerCol: {
    flex: 1,
    alignItems: 'center',
  },
  timePickerLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.5,
  },
  timePickerBox: {
    height: 140,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePickerSeparator: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1F5CA9',
    marginTop: 14,
    paddingHorizontal: 2,
  },
  timeDisplayContainer: { flexDirection: 'row', gap: 10 },
  timeDisplayBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  timeDisplayBoxLabel: { fontSize: 14, fontWeight: '700', color: '#000000', marginBottom: 4 },
  timeDisplayBoxValue: { fontSize: 20, fontWeight: '900', color: '#1F5CA9', letterSpacing: 0.5 },

  modalBottomActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20, paddingTop: 5, backgroundColor: '#FFFFFF' },
  modalBottomButton: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBottomButtonDisabled: { opacity: 0.4 },
  modalBottomButtonTextCancel: { fontSize: 16, fontWeight: '700', color: '#000000' },
  modalBottomButtonTextSubmit: { fontSize: 16, fontWeight: '700', color: '#1F5CA9' },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
    backgroundColor: '#EFF4FB',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: '#1F5CA9',
    shadowColor: '#1F5CA9',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F5CA9',
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },

  datePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  datePickerCol: {
    flex: 1,
    alignItems: 'center',
  },
  datePickerColYear: {
    flex: 1.35,
    alignItems: 'center',
  },
  datePickerSepWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingHorizontal: 2,
  },
  datePickerSep: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1F5CA9',
  },
});