import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

interface CustomSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  activeColor?: string;
  inactiveColor?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

const SIZES = {
  sm: { trackW: 40, trackH: 22, thumb: 16, padding: 3 },
  md: { trackW: 46, trackH: 24, thumb: 18, padding: 3 },
};

export function CustomSwitch({
  value,
  onValueChange,
  activeColor = '#00AFEF',
  inactiveColor = '#CBD5E0',
  size = 'md',
  disabled = false,
}: CustomSwitchProps) {
  const dim = SIZES[size];
  const travel = dim.trackW - dim.thumb - dim.padding * 2;

  const translateX = useRef(new Animated.Value(value ? travel : 0)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: value ? travel : 0,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  }, [value]);

  return (
    <Pressable
      onPress={() => { if (!disabled) onValueChange(!value); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width: dim.trackW,
            height: dim.trackH,
            borderRadius: dim.trackH / 2,
            backgroundColor: value ? activeColor : inactiveColor,
            padding: dim.padding,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: dim.thumb,
              height: dim.thumb,
              borderRadius: dim.thumb / 2,
              transform: [{ translateX }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
});
