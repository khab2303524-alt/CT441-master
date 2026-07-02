import WheelPicker, { withVirtualized } from '@quidone/react-native-wheel-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const VirtualizedWheelPicker = withVirtualized(WheelPicker);

interface ScrollPickerProps {
  options: (string | number)[];
  selectedValue: string | number;
  onValueChange: (value: any) => void;
  itemHeight?: number;
  visibleItems?: number;
  pickerWidth?: number;
}

const REPEATS = 21;
const CENTER = Math.floor(REPEATS / 2); // = 10

export default function ScrollPicker({
  options,
  selectedValue,
  onValueChange,
  itemHeight = 50,
  visibleItems = 3,
  pickerWidth = 75,
}: ScrollPickerProps) {
  const optLen = options.length;

  const data = useMemo(
    () =>
      Array.from({ length: REPEATS }, (_, block) =>
        options.map((opt, origIdx) => ({
          value: block * optLen + origIdx,
          label:
            typeof opt === 'number'
              ? opt > 999
                ? String(opt)
                : String(opt).padStart(2, '0')
              : String(opt),
        }))
      ).flat(),
    [options]
  );

  const origIdx = options.indexOf(selectedValue);
  const initialPickerValue = CENTER * optLen + (origIdx === -1 ? 0 : origIdx);
  const [pickerValue, setPickerValue] = useState(initialPickerValue);
  const pickerValueRef = useRef(initialPickerValue);
  const isScrolling = useRef(false);
  const scrollLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockScroll = useCallback(() => {
    isScrolling.current = true;
    if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current);
    scrollLockTimer.current = setTimeout(() => {
      isScrolling.current = false;
    }, 300);
  }, []);

  const lastSyncedValue = useRef(selectedValue);

  useEffect(() => {
    if (isScrolling.current) return;
    if (selectedValue === lastSyncedValue.current) return;

    const idx = options.indexOf(selectedValue);
    if (idx !== -1) {
      lastSyncedValue.current = selectedValue;
      const newVal = CENTER * optLen + idx;
      pickerValueRef.current = newVal;
      setPickerValue(newVal);
    }
  }, [selectedValue, options, optLen]);

  const handleValueChanged = useCallback(
    ({ item }: { item: { value: number; label: string } }) => {
      lockScroll();

      pickerValueRef.current = item.value;
      setPickerValue(item.value);

      const realIdx = item.value % optLen;
      lastSyncedValue.current = options[realIdx];
      onValueChange(options[realIdx]);
    },
    [options, optLen, onValueChange, lockScroll]
  );

  const renderItem = useCallback(({ item }: { item: any }) => {
    return (
      <View style={[styles.itemContainer, { height: itemHeight }]}>
        <Text style={styles.itemText}>
          {item.label}
        </Text>
      </View>
    );
  }, [itemHeight]);

  return (
    <VirtualizedWheelPicker
      data={data}
      value={pickerValue}
      onValueChanged={handleValueChanged}
      itemHeight={itemHeight}
      visibleItemCount={visibleItems}
      width={pickerWidth}
      style={{ height: itemHeight * visibleItems }}
      overlayItemStyle={{ marginHorizontal: 5}}
      enableScrollByTapOnItem
      renderItem={renderItem as any}
    />
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  itemText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1F5CA9',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
});
