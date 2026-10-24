export const AP_GATEWAY_URL = 'http://192.168.4.1/wifi';

export interface WifiConfigPayload {
  ssid: string;
  password?: string;
  gio?: number;
  phut?: number;
  giay?: number;
  ngay?: number;
  thang?: number;
  nam?: number;
}

/** Thực hiện 1 lần POST tới ESP32 AP với AbortController timeout */
async function postToESP(payload: WifiConfigPayload, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(AP_GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Gửi cấu hình Wi-Fi và thời gian hiện tại của điện thoại tới ESP32 đang phát AP "LED_P10".
 * URL: POST http://192.168.4.1/wifi
 * Có retry 1 lần nếu lần đầu thất bại (do routing AP chưa ổn định ngay sau khi kết nối).
 */
export async function sendWifiConfigViaAP(
  ssid: string,
  pass: string
): Promise<{ success: boolean; message: string }> {
  const now = new Date();
  const payload: WifiConfigPayload = {
    ssid: ssid.trim(),
    password: pass,
    gio: now.getHours(),
    phut: now.getMinutes(),
    giay: now.getSeconds(),
    ngay: now.getDate(),
    thang: now.getMonth() + 1,
    nam: now.getFullYear(),
  };

  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 15000; // 15s — đủ thời gian cho routing AP ổn định

  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await postToESP(payload, TIMEOUT_MS);

      if (response.ok) {
        let resJson: any = null;
        try { resJson = await response.json(); } catch (_) { }
        const msg = resJson?.message
          ?? `Đã gửi Wi-Fi "${ssid}" thành công. Đồng hồ sẽ tắt AP và kết nối vào mạng mới!`;
        return { success: true, message: msg };
      } else {
        // HTTP lỗi từ ESP32 (400, 500...) — không retry
        return {
          success: false,
          message: `Đồng hồ phản hồi mã lỗi ${response.status}. Vui lòng thử lại.`,
        };
      }
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        // Đợi 2s trước khi retry — cho routing AP ổn định
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // Tất cả retries đều thất bại
  if (lastError?.name === 'AbortError') {
    return {
      success: false,
      message:
        `Hết thời gian chờ (${TIMEOUT_MS / 1000}s). Hãy đảm bảo:\n` +
        '• Điện thoại đã kết nối vào Wi-Fi "LED_P10"\n' +
        '• Đồng hồ đang ở chế độ AP (mạng cũ bị lỗi hoặc chưa có Wi-Fi)',
    };
  }
  return {
    success: false,
    message:
      'Không thể kết nối tới đồng hồ qua Wi-Fi "LED_P10". Hãy kiểm tra:\n' +
      '• Điện thoại đã kết nối vào mạng "LED_P10" chưa\n' +
      '• Đồng hồ đang bật và ở chế độ AP',
  };
}

