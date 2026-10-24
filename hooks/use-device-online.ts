import { onValue, ref } from 'firebase/database';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { db } from '../config/firebaseConfig';
import { clearPinnedAlert, showGlobalAlert, showPinnedAlert } from './use-custom-alert';

// Thiết bị ghi '/DongHo/ThoiGian/GioGiac/Giay' lên Firebase mỗi giây (đồng hồ chạy),
// nên dùng chính field này làm "nhịp sống" thay vì gửi Heartbeat riêng.
// Quá ngần này ms không thấy field đó cập nhật thì coi là thiết bị mất kết nối
const HEARTBEAT_TIMEOUT_MS = 10000;
// Chu kỳ kiểm tra
const HEARTBEAT_CHECK_INTERVAL_MS = 5000;

const DEVICE_OFFLINE_ALERT = {
  title: 'Mất kết nối',
  message: 'Thử kiểm tra nguồn thiết bị hoặc Wi-Fi.',
};
const DEVICE_RECONNECT_ALERT = {
  
  title: 'Đã kết nối lại',
  message: 'Thiết bị đã hoạt động trở lại.',
};

// ─────────────────────────────────────────────────────────────
// Trạng thái dùng chung toàn app (singleton ở cấp module).
// Chỉ có MỘT listener Heartbeat + MỘT interval kiểm tra, bất kể có bao nhiêu
// màn hình gọi useDeviceOnline() -> mỗi đợt mất mạng chỉ bắn đúng 1 alert.
// ─────────────────────────────────────────────────────────────
let online = true;
let lastHeartbeat = Date.now();
let lastGiayValue: unknown = null; // giá trị Giay lần gần nhất, để phân biệt "có dữ liệu mới" với onValue fire lại do SDK tự reconnect
let subscriberCount = 0; // số màn hình đang dùng hook
let stopMonitoring: (() => void) | null = null;
const stateListeners = new Set<() => void>();

const setOnline = (next: boolean) => {
  if (online === next) return;
  online = next;
  stateListeners.forEach((l) => l());
};

const startMonitoring = () => {
  lastHeartbeat = Date.now();
  lastGiayValue = null;

  const unsubHeartbeat = onValue(ref(db, 'DongHo/ThoiGian/GioGiac/Giay'), (snap) => {
    const val = snap.val();
    if (val === null) return;
    // onValue có thể fire lại với đúng giá trị cũ khi Firebase SDK tự resync
    // (VD: điện thoại reconnect internet) — không phải ESP32 ghi mới, nên bỏ qua.
    if (val === lastGiayValue) return;
    lastGiayValue = val;
    lastHeartbeat = Date.now();
    if (!online) {
      setOnline(true);
      // Báo đã kết nối lại (tự tắt sau 3s) TRƯỚC, rồi mới gỡ alert ghim "Mất kết nối":
      // alert mới thay thế trực tiếp alert cũ, không bị nháy tắt rồi hiện lại.
      showGlobalAlert('success', DEVICE_RECONNECT_ALERT.title, DEVICE_RECONNECT_ALERT.message);
      clearPinnedAlert();
    }
  });

  const checkInterval = setInterval(() => {
    if (online && Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      setOnline(false);
      // Alert ghim: không tự tắt, chỉ mất khi thiết bị kết nối lại
      showPinnedAlert('error', DEVICE_OFFLINE_ALERT.title, DEVICE_OFFLINE_ALERT.message);
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);

  // Khi app quay lại foreground (mở lại app / chuyển tab về), thời gian ở nền
  // không được tính là "mất kết nối" thật, nên reset mốc thời gian tại đây.
  const appStateSub = AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      lastHeartbeat = Date.now();
      lastGiayValue = null;
    }
  });

  return () => {
    unsubHeartbeat();
    clearInterval(checkInterval);
    appStateSub.remove();
  };
};

const subscribeState = (listener: () => void) => {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
};
const getSnapshot = () => online;

/**
 * Theo dõi 'DongHo/ThoiGian/GioGiac/Giay' (đồng hồ ghi mỗi giây) cho toàn app,
 * dùng nó làm nhịp sống để suy ra thiết bị đang online hay không.
 *
 * - Gọi ở bao nhiêu màn hình cũng được: listener chỉ tạo 1 lần (màn hình đầu tiên mount)
 *   và chỉ hủy khi màn hình cuối cùng unmount.
 * - Khi mất kết nối: hiện 1 alert ghim (không tự tắt) cho cả app.
 * - Khi kết nối lại: gỡ alert ghim và hiện alert "Đã kết nối lại" (tự tắt sau 3s).
 */
export function useDeviceOnline(): boolean {
  useEffect(() => {
    subscriberCount += 1;
    if (subscriberCount === 1) stopMonitoring = startMonitoring();

    return () => {
      subscriberCount -= 1;
      if (subscriberCount === 0) {
        stopMonitoring?.();
        stopMonitoring = null;
        // Không còn ai theo dõi -> reset để alert ghim không bị kẹt lại
        online = true;
        clearPinnedAlert();
      }
    };
  }, []);

  return useSyncExternalStore(subscribeState, getSnapshot, getSnapshot);
}
