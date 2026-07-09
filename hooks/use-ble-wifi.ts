import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';

// UUID phải khớp CHÍNH XÁC với firmware ESP32 (main.cpp)
export const BLE_DEVICE_NAME = 'ESP32-DongHo-BLE';
export const BLE_SERVICE_UUID = 'af9e5539-1e8a-4de6-8b7f-1d2c3e4f5a6b';
export const BLE_CHAR_SSID_UUID = 'af9e5540-1e8a-4de6-8b7f-1d2c3e4f5a6b';
export const BLE_CHAR_PASS_UUID = 'af9e5541-1e8a-4de6-8b7f-1d2c3e4f5a6b';
export const BLE_CHAR_COMMAND_UUID = 'af9e5542-1e8a-4de6-8b7f-1d2c3e4f5a6b';
export const BLE_CHAR_STATUS_UUID = 'af9e5543-1e8a-4de6-8b7f-1d2c3e4f5a6b';
export const BLE_CHAR_WIFILIST_UUID = 'af9e5544-1e8a-4de6-8b7f-1d2c3e4f5a6b';

const BleManagerModule = NativeModules.BleManager;
const bleEmitter = new NativeEventEmitter(BleManagerModule);

export type BleWifiItem = { ssid: string; rssi: number };
export type BleDeviceItem = { id: string; name: string };
export type BleTrangThai =
  | 'CHUA_KET_NOI'
  | 'DANG_QUET_THIET_BI'
  | 'DANG_KET_NOI_BLE'
  | 'DA_KET_NOI_BLE'
  | 'DANG_QUET_WIFI'
  | 'DANG_KET_NOI_WIFI'
  | 'WIFI_THANH_CONG'
  | 'WIFI_THAT_BAI';

// Chuyển mảng byte (BleManager trả về) thành chuỗi UTF-8, không phụ thuộc Buffer/TextDecoder
const bytesToString = (bytes: number[]): string => {
  try {
    const rawBinary = bytes.map((b) => String.fromCharCode(b)).join('');
    return decodeURIComponent(escape(rawBinary));
  } catch (_) {
    return bytes.map((b) => String.fromCharCode(b)).join('');
  }
};

// Chuyển chuỗi UTF-8 thành mảng byte để ghi qua BLE characteristic
const stringToBytes = (s: string): number[] => {
  const rawBinary = unescape(encodeURIComponent(s));
  const bytes: number[] = [];
  for (let i = 0; i < rawBinary.length; i++) bytes.push(rawBinary.charCodeAt(i));
  return bytes;
};

// Bóc tách danh sách WiFi dạng "ssid,rssi;ssid,rssi;..." gửi từ firmware qua BLE
const parseWifiList = (raw: string): BleWifiItem[] => {
  if (!raw) return [];
  return raw
    .split(';')
    .map((part) => {
      const idx = part.lastIndexOf(',');
      if (idx === -1) return null;
      const ssid = part.slice(0, idx).trim();
      const rssi = parseInt(part.slice(idx + 1), 10);
      if (!ssid || isNaN(rssi)) return null;
      return { ssid, rssi } as BleWifiItem;
    })
    .filter((x): x is BleWifiItem => x !== null)
    .sort((a, b) => b.rssi - a.rssi);
};

let bleDaKhoiTao = false;

// Xin quyền Bluetooth/Vị trí cần thiết cho việc quét & kết nối BLE trên Android
const xinQuyenBLE = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const ket = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(ket).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  }

  const ket = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return ket === PermissionsAndroid.RESULTS.GRANTED;
};

export const useBleWifi = () => {
  const [dangQuetThietBi, setDangQuetThietBi] = useState(false);
  const [danhSachThietBi, setDanhSachThietBi] = useState<BleDeviceItem[]>([]);
  const [thietBiDangKetNoi, setThietBiDangKetNoi] = useState<string | null>(null);
  const [trangThai, setTrangThai] = useState<BleTrangThai>('CHUA_KET_NOI');
  const [danhSachWifiBLE, setDanhSachWifiBLE] = useState<BleWifiItem[]>([]);

  const peripheralIdRef = useRef<string | null>(null);
  const listenersRef = useRef<any[]>([]);

  const khoiTaoBleManager = useCallback(async () => {
    if (bleDaKhoiTao) return;
    await BleManager.start({ showAlert: false });
    bleDaKhoiTao = true;
  }, []);

  // Dọn listener khi component unmount
  useEffect(() => {
    return () => {
      listenersRef.current.forEach((l) => l.remove());
      listenersRef.current = [];
      if (dangQuetThietBi) BleManager.stopScan().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quetThietBi = useCallback(async () => {
    const okQuyen = await xinQuyenBLE();
    if (!okQuyen) {
      throw new Error('Chưa cấp quyền Bluetooth/Vị trí, không thể quét thiết bị.');
    }
    await khoiTaoBleManager();

    setDanhSachThietBi([]);
    setDangQuetThietBi(true);

    const subDiscover = bleEmitter.addListener('BleManagerDiscoverPeripheral', (peripheral) => {
      const ten = peripheral?.name || peripheral?.advertising?.localName || '';
      if (!ten || !ten.includes('ESP32-DongHo')) return;
      setDanhSachThietBi((prev) => {
        if (prev.some((p) => p.id === peripheral.id)) return prev;
        return [...prev, { id: peripheral.id, name: ten }];
      });
    });

    const subStop = bleEmitter.addListener('BleManagerStopScan', () => {
      setDangQuetThietBi(false);
      subDiscover.remove();
      subStop.remove();
    });

    listenersRef.current.push(subDiscover, subStop);

    await BleManager.scan([BLE_SERVICE_UUID], 8, false);
  }, [khoiTaoBleManager]);

  const dungQuetThietBi = useCallback(async () => {
    try {
      await BleManager.stopScan();
    } catch (_) { /* bỏ qua */ }
    setDangQuetThietBi(false);
  }, []);

  const ngatKetNoi = useCallback(async () => {
    if (peripheralIdRef.current) {
      try {
        await BleManager.disconnect(peripheralIdRef.current);
      } catch (_) { /* bỏ qua */ }
    }
    peripheralIdRef.current = null;
    setThietBiDangKetNoi(null);
    setTrangThai('CHUA_KET_NOI');
    setDanhSachWifiBLE([]);
  }, []);

  const ketNoiThietBi = useCallback(async (deviceId: string) => {
    await dungQuetThietBi();
    setTrangThai('DANG_KET_NOI_BLE');

    await BleManager.connect(deviceId);
    await BleManager.retrieveServices(deviceId);

    peripheralIdRef.current = deviceId;
    setThietBiDangKetNoi(deviceId);
    setTrangThai('DA_KET_NOI_BLE');

    // Lắng nghe thông báo trạng thái từ ESP32
    await BleManager.startNotification(deviceId, BLE_SERVICE_UUID, BLE_CHAR_STATUS_UUID);
    const subStatus = bleEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', (data) => {
      if (data.characteristic?.toLowerCase() !== BLE_CHAR_STATUS_UUID.toLowerCase()) return;
      const gia_tri = bytesToString(data.value);
      if (gia_tri === 'SCANNING') setTrangThai('DANG_QUET_WIFI');
      else if (gia_tri === 'SCAN_DONE') { /* danh sách sẽ đến ở characteristic riêng */ }
      else if (gia_tri === 'CONNECTING') setTrangThai('DANG_KET_NOI_WIFI');
      else if (gia_tri.startsWith('CONNECTED')) setTrangThai('WIFI_THANH_CONG');
      else if (gia_tri === 'FAILED') setTrangThai('WIFI_THAT_BAI');
    });

    // Lắng nghe danh sách WiFi quét được
    await BleManager.startNotification(deviceId, BLE_SERVICE_UUID, BLE_CHAR_WIFILIST_UUID);
    const subWifiList = bleEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', (data) => {
      if (data.characteristic?.toLowerCase() !== BLE_CHAR_WIFILIST_UUID.toLowerCase()) return;
      const raw = bytesToString(data.value);
      setDanhSachWifiBLE(parseWifiList(raw));
    });

    const subDisconnect = bleEmitter.addListener('BleManagerDisconnectPeripheral', (data) => {
      if (data.peripheral !== deviceId) return;
      peripheralIdRef.current = null;
      setThietBiDangKetNoi(null);
      setTrangThai('CHUA_KET_NOI');
    });

    listenersRef.current.push(subStatus, subWifiList, subDisconnect);
  }, [dungQuetThietBi]);

  const yeuCauQuetWifiQuaBLE = useCallback(async () => {
    if (!peripheralIdRef.current) throw new Error('Chưa kết nối BLE với ESP32.');
    setTrangThai('DANG_QUET_WIFI');
    await BleManager.write(
      peripheralIdRef.current,
      BLE_SERVICE_UUID,
      BLE_CHAR_COMMAND_UUID,
      stringToBytes('SCAN'),
    );
  }, []);

  const guiWifiQuaBLE = useCallback(async (ssid: string, password: string) => {
    if (!peripheralIdRef.current) throw new Error('Chưa kết nối BLE với ESP32.');
    const id = peripheralIdRef.current;

    await BleManager.write(id, BLE_SERVICE_UUID, BLE_CHAR_SSID_UUID, stringToBytes(ssid));
    await BleManager.write(id, BLE_SERVICE_UUID, BLE_CHAR_PASS_UUID, stringToBytes(password));
    setTrangThai('DANG_KET_NOI_WIFI');
    await BleManager.write(id, BLE_SERVICE_UUID, BLE_CHAR_COMMAND_UUID, stringToBytes('CONNECT'));
  }, []);

  return {
    dangQuetThietBi,
    danhSachThietBi,
    thietBiDangKetNoi,
    trangThai,
    danhSachWifiBLE,
    quetThietBi,
    dungQuetThietBi,
    ketNoiThietBi,
    ngatKetNoi,
    yeuCauQuetWifiQuaBLE,
    guiWifiQuaBLE,
  };
};
