/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Cần Thơ University Colors
const CTU_NavyBlue = '#1F5CA9';
const CTU_SkyBlue = '#00AFEF';
const CTU_Gold = '#FFF200';
const CTU_LightBlue = '#E8F4FB';
const CTU_Red = '#ED1C24';
const tintColorLight = CTU_NavyBlue;
const tintColorDark = CTU_SkyBlue;

export const Colors = {
  light: {
    text: '#11181C',
    background: '#F5F9FF',
    tint: tintColorLight,
    icon: CTU_NavyBlue,
    tabIconDefault: '#999999',
    tabIconSelected: CTU_NavyBlue,
    primary: CTU_NavyBlue,
    secondary: CTU_SkyBlue,
    accent: CTU_Gold,
    lightBg: CTU_LightBlue,
  },
  dark: {
    text: '#ECEDEE',
    background: '#0A1929',
    tint: tintColorDark,
    icon: CTU_SkyBlue,
    tabIconDefault: '#666666',
    tabIconSelected: CTU_SkyBlue,
    primary: CTU_SkyBlue,
    secondary: CTU_LightBlue,
    accent: CTU_Gold,
    lightBg: '#1A3A52',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
