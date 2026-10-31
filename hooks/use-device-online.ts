import { onValue, ref } from 'firebase/database';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { db } from '../config/firebaseConfig';
import { clearPinnedAlert } from './use-custom-alert';

// Thiết bị ghi '/DongHo/ThoiGian/GioGiac/Giay' lên Firebase mỗi giây (đồng hồ chạy),
// nên dùng chính field này làm "nhịp sống" để biết thiết bị có đang online hay không.
const HEARTBEAT_TIMEOUT_MS = 10000;
// Chu kỳ kiểm tra
const HEARTBEAT_CHECK_INTERVAL_MS = 5000;

// ─────────────────────────────────────────────────────────────
// Trạng thái dùng chung toàn app (singleton ở cấp module).
// Đã bỏ toàn bộ popup/alert thông báo mất kết nối hoặc trạng thái tắt Wi-Fi.
// ─────────────────────────────────────────────────────────────
let online = true;
let lastHeartbeat = Date.now();
let lastGiayValue: unknown = null;
let subscriberCount = 0;
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
  clearPinnedAlert();

  const unsubHeartbeat = onValue(ref(db, 'DongHo/ThoiGian/GioGiac/Giay'), (snap) => {
    const val = snap.val();
    if (val === null) return;
    if (val === lastGiayValue) return;
    lastGiayValue = val;
    lastHeartbeat = Date.now();
    if (!online) {
      setOnline(true);
    }
  });

  const checkInterval = setInterval(() => {
    if (online && Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      setOnline(false);
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
 * Theo dõi trạng thái online của thiết bị cho toàn app mà KHÔNG bắn alert popup.
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
        online = true;
        clearPinnedAlert();
      }
    };
  }, []);

  return useSyncExternalStore(subscribeState, getSnapshot, getSnapshot);
}

