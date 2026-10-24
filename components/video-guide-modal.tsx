import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoSource, VideoView } from 'expo-video';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface VideoGuideModalProps {
  visible: boolean;
  source: VideoSource;
  onClose: () => void;
}

export function VideoGuideModal({ visible, source, onClose }: VideoGuideModalProps) {
  const insets = useSafeAreaInsets();
  const [isReady, setIsReady] = useState(false);

  const videoSource = useMemo(() => source, [source]);

  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (visible) {
      // Đợi Modal mount & render xong nền đen hoàn toàn (150ms)
      timeoutId = setTimeout(() => {
        setIsReady(true);
        try {
          player.currentTime = 0;
          player.play();
        } catch (_) { }
      }, 150);
    } else {
      setIsReady(false);
      try {
        player.pause();
      } catch (_) { }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [visible, player]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.container}>
        {/* Thanh nút đóng */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Chỉ render VideoView khi đã ready để tránh nháy Surface Native */}
        {isReady && (
          <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: { flex: 1, width: '100%' },
});