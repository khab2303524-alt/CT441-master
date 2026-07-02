# AGENTS.md — Hướng dẫn cho AI Agent (CT441)

> File này cung cấp ngữ cảnh và quy tắc bắt buộc cho bất kỳ AI agent nào (Claude Code, Codex, Copilot…) làm việc trên repo này.

---

## Tổng quan dự án

**Hệ thống chuông báo giờ học thông minh** — Đồ án môn CT441 (Đại học Cần Thơ).

Hệ thống gồm hai thành phần chính:

- **Phần cứng (ESP32):** Vi điều khiển ESP32 đọc thời gian thực từ DS3231 RTC, hiển thị lên LED matrix P10 (HUB12), ghi dữ liệu giờ/phút/giây lên Firebase Realtime Database, và điều khiển chuông 220V qua TRIAC BTA16-600BRG (kích qua opto MOC3021).
- **Phần mềm (repo này):** Ứng dụng mobile React Native (Expo) để xem giờ đồng hồ đồng bộ từ Firebase và quản lý lịch báo chuông (`DongHo/dsBaoThuc`).

---

## Expo & React Native — LƯU Ý QUAN TRỌNG

> **Expo đã thay đổi nhiều giữa các phiên bản.**
> **Bắt buộc đọc docs chính xác theo phiên bản đang dùng trước khi viết bất kỳ dòng code nào:**
> 👉 https://docs.expo.dev/versions/v54.0.0/

Dự án dùng **Expo SDK 54** (`"expo": "~54.0.35"`). Không dùng API, cú pháp, hay import từ các phiên bản cũ hơn (SDK 50, 51, 52, 53…).

---

## Stack công nghệ

| Thành phần | Công nghệ |
|---|---|
| Framework | React Native + Expo SDK 54 |
| Routing | Expo Router v6 (`expo-router: ~6.0.24`) |
| Ngôn ngữ | TypeScript 5.9 |
| Database | Firebase Realtime Database (`firebase: ^12.13.0`) |
| Animations | `react-native-reanimated ~4.1.1` |
| Wheel Picker | `@quidone/react-native-wheel-picker ^1.7.0` |
| Icons | `@expo/vector-icons ^15.0.3` |
| Haptics | `expo-haptics ~15.0.8` |

---

## Cấu trúc thư mục

```
CT441/
├── app/                    # Màn hình (Expo Router file-based routing)
│   ├── (tabs)/             # Tab navigation chính
│   │   ├── clock.tsx       # Màn hình đồng hồ — đọc thời gian từ Firebase
│   │   └── schedule.tsx    # Màn hình lịch báo chuông — CRUD dsBaoThuc
│   └── _layout.tsx         # Root layout
├── components/             # Component tái sử dụng
│   ├── CustomSwitch.tsx    # Toggle switch tùy chỉnh có animation
│   ├── FeedbackModal.tsx   # Modal thông báo/xác nhận (thay thế Alert)
│   └── ScrollPicker.tsx    # (nếu có) Bộ chọn giờ/phút dạng scroll
├── config/                 # Firebase config
├── constants/              # Màu sắc, font, hằng số dùng chung
├── hooks/                  # Custom hooks
├── assets/images/          # Hình ảnh, icon
└── scripts/                # Script tiện ích
```

---

## Firebase Realtime Database — Schema bắt buộc

> **KHÔNG được thay đổi tên key Firebase.** ESP32 đọc/ghi trực tiếp vào các node này; sai tên key sẽ phá vỡ đồng bộ phần cứng.

### Node đồng hồ (chỉ đọc từ app)

```
DongHo/
  GioGiac/         ← Timestamp dạng chuỗi (không dùng trực tiếp)
  Gio/             ← Giờ (number)
  Phut/            ← Phút (number)
  Giay/            ← Giây (number)
  Date/            ← Ngày trong tháng (number)
  Ngay/            ← (alias ngày, kiểm tra trước khi dùng)
  Thang/           ← Tháng (number)
  Nam/             ← Năm (number)
  Thu/             ← Thứ trong tuần (number hoặc chuỗi)
```

- `clock.tsx` **phải** đọc từ đây, không dùng `new Date()` của thiết bị.
- Mapping phải khớp chính xác (phân biệt hoa/thường): `Gio`, `Phut`, `Giay`, `Date`, `Thang`, `Nam`, `Thu`.

### Node lịch báo chuông (đọc/ghi từ app)

```
DongHo/
  dsBaoThuc/
    <id>/
      GioBaoThuc/    ← Giờ báo (number)
      PhutBaoThuc/   ← Phút báo (number)
      GhiChu/        ← Ghi chú/tên báo thức (string)
      BatTat/        ← Bật/tắt (boolean)
```

---

## Palette màu dự án

Luôn dùng các màu này, không tự ý thay màu khác:

```ts
const COLORS = {
  primary:    '#1F5CA9',  // Xanh dương đậm — header, nút chính
  accent:     '#FFF200',  // Vàng — icon chuông, highlight
  secondary:  '#00AFEF',  // Xanh nhạt — accent phụ
  background: '#E4EAF4',  // Nền màn hình
};
```

---

## Quy tắc code bắt buộc

### TypeScript
- Bật strict mode (`tsconfig.json` đã cấu hình). Không dùng `any` trừ khi thực sự cần thiết.
- Khai báo interface/type rõ ràng cho mọi prop của component và dữ liệu Firebase.

### Component
- Mỗi component đặt trong file riêng tại `components/`.
- `FeedbackModal` là component modal dùng chung — **không** dùng `Alert.alert()` của React Native gốc.
- `CustomSwitch` là toggle switch tùy chỉnh — không dùng `Switch` mặc định của React Native.

### Navigation (Expo Router v6)
- Dùng file-based routing của Expo Router. Không cài thêm React Navigation stack riêng (đã có `@react-navigation/native` là peer dep của Expo Router).
- Kiểm tra docs: https://docs.expo.dev/versions/v54.0.0/sdk/router/

### Animation
- Dùng `react-native-reanimated` v4 cho animation.  
  - Cú pháp v4 **khác** v2/v3 (không có `useSharedValue` từ `'react-native-reanimated'` theo cách cũ ở một số API).  
  - Kiểm tra docs trước khi dùng: https://docs.swmansion.com/react-native-reanimated/

### Wheel Picker (chọn giờ/phút)
- Dùng `@quidone/react-native-wheel-picker` — đây là thư viện đã được chọn sau quá trình debug.  
- **Không** thay bằng `react-native-wheel-pick` hoặc các thư viện khác mà không hỏi trước.

### Firebase
- Import từ modular SDK v12: `import { getDatabase, ref, onValue, set } from 'firebase/database'`.
- File config Firebase nằm ở `config/` — không hardcode credentials vào component.
- Luôn `off()` listener khi component unmount (cleanup trong `useEffect`).

---

## Lệnh thường dùng

```bash
# Cài dependencies
npm install

# Chạy dev server
npx expo start

# Chạy trên Android
npx expo start --android

# Build APK preview (cần EAS CLI)
eas build --platform android --profile preview

# Reset project về blank
npm run reset-project
```

---

## Những việc KHÔNG được làm

- ❌ Đổi tên key Firebase (`Gio`, `Phut`, `Giay`, v.v.) — phá vỡ đồng bộ với ESP32.
- ❌ Dùng `Alert.alert()` — thay bằng `FeedbackModal`.
- ❌ Dùng `new Date()` cho màn hình đồng hồ — phải đọc từ Firebase.
- ❌ Upgrade Expo SDK mà không kiểm tra breaking changes.
- ❌ Dùng API/cú pháp Expo từ phiên bản khác SDK 54.
- ❌ Cài thêm thư viện picker/wheel mới mà không thay thế `@quidone/react-native-wheel-picker` đã cấu hình.

---

## Ghi chú phần cứng (để AI hiểu ngữ cảnh)

App này là giao diện điều khiển cho hệ thống nhúng. ESP32 là "source of truth" về thời gian — app chỉ hiển thị và gửi lịch lên Firebase, không tự tính giờ. Khi debug lỗi đồng bộ, kiểm tra Firebase trước khi nghi ngờ code app.
