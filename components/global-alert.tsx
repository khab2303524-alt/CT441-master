import React, { useRef } from 'react';
import { useCustomAlert } from '../hooks/use-custom-alert';
import { FeedbackModal } from './feedbackmodal';

/**
 * Hiển thị alert dùng chung của app (currentAlert từ useCustomAlert) bằng chính FeedbackModal
 * — cùng giao diện, cùng vị trí (giữa màn hình) với các thông báo khác trong app.
 *
 * Chỉ gắn 1 lần duy nhất ở root layout (sau Stack).
 * - Alert thường (showSuccess/showError...): tự tắt sau 3s do useCustomAlert quản lý.
 * - Alert ghim (VD: mất kết nối thiết bị): không tự tắt, mất khi thiết bị kết nối lại
 *   hoặc khi người dùng bấm đóng (onDismiss -> dismissAlert).
 */
export default function GlobalAlert() {
  const { currentAlert, dismissAlert } = useCustomAlert();

  // Giữ nội dung alert cuối cùng để lúc modal mờ dần không bị nháy nội dung rỗng
  const lastAlertRef = useRef(currentAlert);
  if (currentAlert) lastAlertRef.current = currentAlert;
  const alert = lastAlertRef.current;

  if (!alert) return null;

  return (
    <FeedbackModal
      visible={!!currentAlert}
      // FeedbackModal chỉ có 2 kiểu success/error; 'info' hiển thị như success
      type={alert.type === 'error' ? 'error' : 'success'}
      title={alert.title}
      message={alert.message}
      videoSource={alert.videoSource}
      onDismiss={dismissAlert}
    />
  );
}
