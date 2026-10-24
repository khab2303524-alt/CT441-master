import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { get, ref, remove, set } from 'firebase/database';

import { db } from '../config/firebaseConfig';

// Đường dẫn lưu PIN (dạng hash) trên Firebase Realtime Database — dùng chung
// cho mọi thiết bị đăng nhập cùng 1 app, thay vì chỉ lưu local trên 1 máy.
export const PIN_FIREBASE_PATH = 'AppLock/pinHash';

// Cache hash PIN trong AsyncStorage để vẫn mở khóa được khi thiết bị mất mạng.
// Giữ tên cũ để tương thích ngược nếu có chỗ khác còn tham chiếu.
export const PIN_STORAGE_KEY = 'app_lock_pin_hash_cache_v1';

export const PIN_LENGTH = 6;

// Kiểm tra chuỗi có phải là PIN hợp lệ (đúng 6 chữ số) hay không
export const isValidPin = (pin: string): boolean => /^\d{6}$/.test(pin);

// Băm PIN bằng SHA-256 trước khi lưu — không bao giờ lưu PIN dạng thô lên Firebase
async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

// Lấy hash PIN đã lưu: ưu tiên đọc từ Firebase (đồng bộ giữa các điện thoại),
// nếu mất mạng thì fallback về cache local đã lưu lần gần nhất.
export async function getSavedPinHash(): Promise<string | null> {
  try {
    const snap = await get(ref(db, PIN_FIREBASE_PATH));
    const remoteHash = snap.exists() ? (snap.val() as string) : null;

    if (remoteHash) {
      // Cập nhật cache local để lần sau offline vẫn mở khóa được
      AsyncStorage.setItem(PIN_STORAGE_KEY, remoteHash).catch(() => { });
      return remoteHash;
    }

    // Firebase không có PIN nào (chưa từng thiết lập, hoặc đã bị xóa)
    return null;
  } catch (_) {
    // Không kết nối được Firebase -> dùng cache cục bộ làm dự phòng
    try {
      return await AsyncStorage.getItem(PIN_STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }
}

// Giữ tên hàm cũ (getSavedPin) để tương thích, trả về hash thay vì PIN thô
export const getSavedPin = getSavedPinHash;

// Kiểm tra app đã từng thiết lập PIN chưa (đã có PIN trên Firebase hoặc cache)
export async function hasSavedPin(): Promise<boolean> {
  const saved = await getSavedPinHash();
  return !!saved;
}

// So khớp PIN người dùng nhập với PIN đã lưu (so sánh theo hash)
export async function verifyPin(pin: string): Promise<boolean> {
  const savedHash = await getSavedPinHash();
  if (!savedHash) return false;
  const inputHash = await hashPin(pin);
  return inputHash === savedHash;
}

// Lưu/đổi mã PIN mới: ghi hash lên Firebase để đồng bộ mọi thiết bị,
// đồng thời cập nhật cache local.
export async function savePin(pin: string): Promise<void> {
  const hash = await hashPin(pin);
  await set(ref(db, PIN_FIREBASE_PATH), hash);
  await AsyncStorage.setItem(PIN_STORAGE_KEY, hash).catch(() => { });
}

// Xóa mã PIN trên Firebase lẫn cache local (không dùng tới trong luồng hiện tại, để dự phòng)
export async function clearPin(): Promise<void> {
  await remove(ref(db, PIN_FIREBASE_PATH));
  await AsyncStorage.removeItem(PIN_STORAGE_KEY).catch(() => { });
}
