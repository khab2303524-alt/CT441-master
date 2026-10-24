import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppLockModal } from '@/components/app-lock-modal';
import { useAppLock } from '@/hooks';
import { useColorScheme } from '@/hooks/use-color-scheme';
import GlobalAlert from '@/components/global-alert';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { isReady, hasPin, isUnlocked, verifyPin, createPin, unlock } = useAppLock();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>

      {/* Alert dùng chung toàn app (mất kết nối / kết nối lại thiết bị...). Đặt SAU Stack để nổi lên trên mọi màn hình.
          Chỉ hiện khi app đã mở khoá — nếu không, Modal của alert (mount sau) sẽ đè lên AppLockModal. */}
      {isReady && isUnlocked && <GlobalAlert />}

      <StatusBar style="auto" />

      {/* Yêu cầu nhập mã PIN mỗi khi mở app (hoặc tạo PIN nếu lần đầu dùng) */}
      {isReady && !isUnlocked && (
        <AppLockModal
          mode={hasPin ? 'unlock' : 'create'}
          onVerify={verifyPin}
          onCreate={createPin}
          onSuccess={unlock}
        />
      )}
    </ThemeProvider>
  );
}
