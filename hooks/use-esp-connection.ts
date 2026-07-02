import { onValue, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import { db } from '../config/firebaseConfig';

// Định dạng cấu trúc dữ liệu thời gian
interface TimeData {
  Gio: number;
  Phut: number;
  Giay: number;
  Ngay: number;
  Thang: number;
  Nam: number;
  Thu: number;
}

// ===== TRẠNG THÁI TOÀN CỤC =====
// "Mốc" thời gian gần nhất nhận được từ Firebase + thời điểm (theo clock của App) nhận mốc đó.
// Giờ hiển thị luôn = mốc + số giây THỰC đã trôi qua kể từ lúc nhận mốc -> không bao giờ "đứng hình",
// kể cả khi ESP32 mất kết nối, vì không phụ thuộc vào việc có dữ liệu mới hay không.
let globalAnchorData: TimeData | null = null;
let globalAnchorTimestamp = Date.now();

let globalLastUpdateTime = Date.now();
let globalIsESPConnected = false;

let tickInterval: any = null;
let connectionCheckInterval: any = null;
let firebaseListenerActive = false;

let connectionStateListeners: Set<(status: boolean) => void> = new Set();
let timeDataListeners: Set<(data: TimeData) => void> = new Set();

// Cửa sổ "bỏ qua chống-nhảy-lùi" sau khi người dùng vừa gửi lệnh chỉnh giờ/ngày
// -> trong khoảng thời gian này, dữ liệu Firebase luôn được tin tưởng tuyệt đối,
// dù nó "nhỏ hơn" giờ đang hiển thị (vì đây là chỉnh giờ chủ động, không phải trễ mạng)
let manualOverrideUntil = 0;
export const notifyManualTimeChange = () => {
  manualOverrideUntil = Date.now() + 8000;
};

// Chỉ dùng để hiển thị trạng thái "Đã kết nối / Mất kết nối", KHÔNG ảnh hưởng đến việc đồng hồ chạy
const DISCONNECT_THRESHOLD = 2500;

// Cộng/trừ N giây vào một mốc TimeData, tự xử lý tràn phút/giờ/ngày/tháng/năm/năm nhuận qua Date của JS
const addSeconds = (base: TimeData, secondsToAdd: number): TimeData => {
  const baseDate = new Date(base.Nam, base.Thang - 1, base.Ngay, base.Gio, base.Phut, base.Giay);
  const newDate = new Date(baseDate.getTime() + secondsToAdd * 1000);
  return {
    Gio: newDate.getHours(),
    Phut: newDate.getMinutes(),
    Giay: newDate.getSeconds(),
    Ngay: newDate.getDate(),
    Thang: newDate.getMonth() + 1,
    Nam: newDate.getFullYear(),
    Thu: newDate.getDay(),
  };
};

const toMillis = (t: TimeData) =>
  new Date(t.Nam, t.Thang - 1, t.Ngay, t.Gio, t.Phut, t.Giay).getTime();

// Tính giờ đang hiển thị tại thời điểm gọi = mốc gần nhất + số giây thực đã trôi qua
const tinhGioHienTai = (): TimeData | null => {
  if (!globalAnchorData) return null;
  const elapsedSeconds = Math.floor((Date.now() - globalAnchorTimestamp) / 1000);
  return addSeconds(globalAnchorData, elapsedSeconds);
};

// Bộ đếm chạy liên tục mỗi giây, dựa trên thời gian thực trôi qua (Date.now())
// -> luôn chạy đều, không phụ thuộc trạng thái kết nối ESP
const startTick = () => {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    const hienTai = tinhGioHienTai();
    if (hienTai) {
      timeDataListeners.forEach(listener => listener(hienTai));
    }
  }, 1000);
};

// Kiểm tra trạng thái kết nối dựa trên tần suất cập nhật dữ liệu từ Firebase (chỉ để hiển thị badge)
const startGlobalConnectionCheck = () => {
  if (connectionCheckInterval) return;

  connectionCheckInterval = setInterval(() => {
    const timeSinceLastUpdate = Date.now() - globalLastUpdateTime;
    const newStatus = timeSinceLastUpdate <= DISCONNECT_THRESHOLD;

    if (newStatus !== globalIsESPConnected) {
      globalIsESPConnected = newStatus;
      connectionStateListeners.forEach(listener => listener(newStatus));
    }
  }, 500);
};

// Lắng nghe dữ liệu realtime từ Firebase
const setupFirebaseListener = () => {
  if (firebaseListenerActive) return;
  firebaseListenerActive = true;

  const timeRef = ref(db, 'DongHo/ThoiGian');
  onValue(timeRef, (snapshot) => {
    if (!snapshot.exists()) return;

    const data = snapshot.val();
    if (!data?.GioGiac || !data?.Date) return;

    globalLastUpdateTime = Date.now();
    if (!globalIsESPConnected) {
      globalIsESPConnected = true;
      connectionStateListeners.forEach(listener => listener(true));
    }

    const moiNhan: TimeData = {
      Gio: data.GioGiac.Gio,
      Phut: data.GioGiac.Phut,
      Giay: data.GioGiac.Giay,
      Ngay: data.Date.Ngay,
      Thang: data.Date.Thang,
      Nam: data.Date.Nam,
      Thu: data.Date.Thu,
    };

    // Tránh hiển thị NHẢY LÙI giây: nếu dữ liệu mới (do trễ mạng) nhỏ hơn giờ đang hiển thị,
    // giữ nguyên giờ đang hiển thị làm mốc mới, chỉ "reset" lại đồng hồ đếm thực về thời điểm này.
    // NGOẠI TRỪ: nếu đang trong cửa sổ vừa chỉnh giờ/ngày thủ công -> luôn tin dữ liệu mới.
    // Lưu ý: KHÔNG tắt cửa sổ này ngay khi nhận gói đầu tiên, vì trong lúc ESP32 chưa kịp xử lý
    // lệnh DatGio/DatNgay, nó vẫn đẩy giờ CŨ lên Firebase mỗi giây như bình thường -> nếu tắt sớm,
    // tới khi giờ ĐÃ CHỈNH thực sự được đẩy lên thì cửa sổ đã hết, lại bị chặn như cũ.
    // Để cửa sổ tự hết hạn theo thời gian, đảm bảo bắt được đúng gói đã chỉnh dù nó đến sau vài giây.
    const dangHienThi = tinhGioHienTai();
    const dangTrongCuaSoChinhTay = Date.now() < manualOverrideUntil;
    if (!dangTrongCuaSoChinhTay && dangHienThi && toMillis(moiNhan) < toMillis(dangHienThi)) {
      globalAnchorData = dangHienThi;
    } else {
      globalAnchorData = moiNhan;
    }
    globalAnchorTimestamp = Date.now();

    const hienTai = tinhGioHienTai();
    if (hienTai) {
      timeDataListeners.forEach(listener => listener(hienTai));
    }
  });
};

export const useESPConnection = () => {
  const [isConnected, setIsConnected] = useState(globalIsESPConnected);

  useEffect(() => {
    startGlobalConnectionCheck();
    setupFirebaseListener();
    startTick();

    const listener = (status: boolean) => setIsConnected(status);
    connectionStateListeners.add(listener);

    return () => {
      connectionStateListeners.delete(listener);
    };
  }, []);

  return isConnected;
};

export const useESPTime = () => {
  const [timeData, setTimeData] = useState<TimeData | null>(tinhGioHienTai());

  useEffect(() => {
    startGlobalConnectionCheck();
    setupFirebaseListener();
    startTick();

    const listener = (data: TimeData) => setTimeData(data);
    timeDataListeners.add(listener);

    const hienTai = tinhGioHienTai();
    if (hienTai) {
      setTimeData(hienTai);
    }

    return () => {
      timeDataListeners.delete(listener);
    };
  }, []);

  return timeData;
};

export const getESPConnectionStatus = () => globalIsESPConnected;
export const setESPLastUpdateTime = () => {
  globalLastUpdateTime = Date.now();
  if (!globalIsESPConnected) {
    globalIsESPConnected = true;
    connectionStateListeners.forEach(listener => listener(true));
  }
};