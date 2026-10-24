import { useCallback, useEffect, useState } from 'react';

import { hasSavedPin, savePin, verifyPin } from '../lib/pin-lock';

// Hook quản lý việc khóa app bằng mã PIN mỗi khi mở app.
// - isReady: đã đọc xong AsyncStorage, có thể quyết định hiện modal hay không
// - hasPin: app đã từng thiết lập PIN chưa (chưa có -> yêu cầu tạo PIN lần đầu)
// - isUnlocked: người dùng đã nhập đúng PIN trong phiên này chưa
export function useAppLock() {
  const [isReady, setIsReady] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      const co = await hasSavedPin();
      setHasPin(co);
      setIsReady(true);
    })();
  }, []);

  const handleVerify = useCallback(async (pin: string) => {
    return verifyPin(pin);
  }, []);

  const handleCreate = useCallback(async (pin: string) => {
    await savePin(pin);
    setHasPin(true);
  }, []);

  const unlock = useCallback(() => setIsUnlocked(true), []);

  return { isReady, hasPin, isUnlocked, verifyPin: handleVerify, createPin: handleCreate, unlock };
}
