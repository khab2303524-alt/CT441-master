import { useEffect, useState } from 'react';

export interface AlertConfig {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
  /** Video hướng dẫn kèm theo alert (require('.../x.mp4') hoặc { uri }). Tùy chọn. */
  videoSource?: number | { uri: string };
}

const AUTO_DISMISS_MS = 3000;

// Global state
let alertListeners: Set<(alert: AlertConfig | null) => void> = new Set();

// Alert đang hiển thị hiện tại — để component mount sau vẫn đồng bộ được với app
let visibleAlert: AlertConfig | null = null;

// Alert "ghim": KHÔNG tự tắt, chỉ tắt khi gọi clearPinnedAlert()/dismissAlert().
// Alert thường (success/error/info) vẫn tự tắt sau 3s như cũ; tắt xong thì alert ghim
// (nếu còn) được hiện lại, nên không bị alert thường đè mất.
let pinnedAlert: AlertConfig | null = null;

// Timer tự tắt của alert thường đang hiển thị (null = không có alert thường nào đang chạy)
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

const broadcast = (alert: AlertConfig | null) => {
  visibleAlert = alert;
  alertListeners.forEach(listener => listener(alert));
};

// Export for component to subscribe
export const subscribeToAlerts = (callback: (alert: AlertConfig | null) => void) => {
  alertListeners.add(callback);
  return () => alertListeners.delete(callback);
};

/** Alert thường: hiện rồi tự tắt sau 3s. */
export const showGlobalAlert = (
  type: 'success' | 'error' | 'info',
  title: string,
  message: string,
) => {
  // Hủy timer của alert trước để nó không tắt nhầm alert mới
  if (dismissTimer) clearTimeout(dismissTimer);
  broadcast({ type, title, message });

  // Auto dismiss after 3 seconds
  dismissTimer = setTimeout(() => {
    dismissTimer = null;
    broadcast(pinnedAlert);
  }, AUTO_DISMISS_MS);
};

/** Alert ghim: hiện và giữ nguyên cho tới khi clearPinnedAlert(). */
export const showPinnedAlert = (
  type: 'success' | 'error' | 'info',
  title: string,
  message: string,
  videoSource?: number | { uri: string },
) => {
  pinnedAlert = { type, title, message, videoSource };
  // Nếu đang có alert thường thì đợi nó tắt xong sẽ tự hiện lại alert ghim
  if (!dismissTimer) broadcast(pinnedAlert);
};

/** Gỡ alert ghim (VD: thiết bị đã kết nối lại). */
export const clearPinnedAlert = () => {
  pinnedAlert = null;
  if (!dismissTimer) broadcast(null);
};

/** Tắt ngay mọi alert đang hiển thị, kể cả alert ghim. */
export const dismissAlert = () => {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  pinnedAlert = null;
  broadcast(null);
};

export const useCustomAlert = () => {
  const [currentAlert, setCurrentAlert] = useState<AlertConfig | null>(visibleAlert);

  // Subscribe to global alert changes
  useEffect(() => {
    const unsubscribe = subscribeToAlerts((alert) => {
      setCurrentAlert(alert);
    });
    setCurrentAlert(visibleAlert); // đồng bộ với alert đang hiện (nếu có)
    return () => {
      unsubscribe();
    };
  }, []);

  return {
    currentAlert,
    showSuccess: (title: string, message: string) => showGlobalAlert('success', title, message),
    showError: (title: string, message: string) => showGlobalAlert('error', title, message),
    showInfo: (title: string, message: string) => showGlobalAlert('info', title, message),
    dismissAlert,
  };
};
