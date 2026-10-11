// Camera with a page frame. Snap page after page, then "Done". Pages can be moved,
// retaken, or removed. If the camera isn't allowed or available, pick photos instead.
//
// TODO(pilot): live edge detection and a blur/glare check before upload. For now, each
// page gets a confidence score when it is read, and hard-to-read pages are flagged with
// a "retake" suggestion on the results.
import React, { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { MAX_PAGES } from '@scr/shared';
import { useCapture } from '../../src/capture/CaptureContext';
import { preparePhoto } from '../../src/capture/prepare';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { BigButton } from '../../src/components/BigButton';
import { colors, sizes } from '../../src/theme';

const COACHING = 'Lay the paper flat in good light. Fit the whole page inside the box, then tap Take Photo.';

export default function Capture() {
  const [permission, requestPermission] = useCameraPermissions();
  const capture = useCapture();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function snap() {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9, shutterSound: false });
      const n = retakeIndex ?? capture.pages.length;
      const page = await preparePhoto(photo.uri, `page-${n + 1}.jpg`);
      if (retakeIndex !== null) capture.replace(retakeIndex, page);
      else capture.add([page]);
      setRetakeIndex(null);
    } catch {
      setError("The photo didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pickPhotos() {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
    if (res.canceled) return;
    setBusy(true);
    try {
      const pages = [];
      for (const [i, a] of res.assets.entries()) pages.push(await preparePhoto(a.uri, a.fileName ?? `photo-${i + 1}.jpg`));
      capture.add(pages);
    } catch {
      setError("We couldn't open one of those photos. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const count = capture.pages.length;
  const cameraAllowed = permission?.granted;

  return (
    <Screen
      title={retakeIndex !== null ? `Retake page ${retakeIndex + 1}` : 'Take a Photo'}
      speak={`${COACHING} You have ${count} ${count === 1 ? 'page' : 'pages'}. When you have every page, tap Done.`}
      back
      footer={
        <BigButton big icon="checkmark-circle" label={count ? `Done (${count} ${count === 1 ? 'page' : 'pages'})` : 'Done'}
          onPress={() => router.push('/confirm')} disabled={!count || busy} />
      }
    >
      {cameraAllowed ? (
        <View style={styles.cameraWrap}>
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
          <View pointerEvents="none" style={styles.frame} />
          <View pointerEvents="none" style={styles.coach}>
            <AppText style={styles.coachText}>{COACHING}</AppText>
          </View>
        </View>
      ) : (
        <View style={styles.noCamera}>
          <Ionicons name="camera-outline" size={40} color={colors.moss} />
          <AppText variant="label">The app needs your camera to take photos of your papers.</AppText>
          {permission?.canAskAgain !== false
            ? <BigButton icon="camera" label="Allow the camera" onPress={requestPermission} />
            : <AppText>Camera is turned off for this app. You can turn it on in your phone settings, or pick photos below.</AppText>}
        </View>
      )}

      {cameraAllowed && (
        <BigButton big icon="aperture" label={busy ? 'Saving…' : 'Take Photo'} onPress={snap}
          busy={busy} disabled={!ready || (capture.full && retakeIndex === null)} />
      )}
      {retakeIndex !== null && <BigButton icon="close" label="Cancel retake" kind="secondary" onPress={() => setRetakeIndex(null)} />}
      <BigButton icon="images" label="Choose from my photos" kind="secondary" onPress={pickPhotos} disabled={busy || capture.full} />

      {error && <View style={styles.error} accessibilityRole="alert"><AppText variant="label">{error}</AppText></View>}
      {capture.full && <AppText variant="muted">That's the most pages ({MAX_PAGES}) for one paper.</AppText>}

      {count > 0 && (
        <View style={{ gap: 8 }}>
          <AppText variant="label">Your pages</AppText>
          <ScrollView horizontal contentContainerStyle={styles.thumbs}>
            {capture.pages.map((p, i) => (
              <View key={i} style={[styles.thumb, retakeIndex === i && styles.thumbActive]}>
                {p.previewUri
                  ? <Image source={{ uri: p.previewUri }} style={styles.thumbImg} accessibilityLabel={`Page ${i + 1}`} />
                  : <Ionicons name="document-text" size={48} color={colors.moss} />}
                <AppText variant="label">Page {i + 1}</AppText>
                <View style={styles.thumbBtns}>
                  <IconBtn icon="arrow-back" label={`Move page ${i + 1} earlier`} onPress={() => capture.move(i, -1)} disabled={i === 0} />
                  <IconBtn icon="arrow-forward" label={`Move page ${i + 1} later`} onPress={() => capture.move(i, 1)} disabled={i === count - 1} />
                </View>
                <View style={styles.thumbBtns}>
                  {cameraAllowed && <IconBtn icon="camera-reverse" label={`Retake page ${i + 1}`} onPress={() => setRetakeIndex(i)} />}
                  <IconBtn icon="trash" label={`Remove page ${i + 1}`} onPress={() => { capture.remove(i); setRetakeIndex(null); }} />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}

function IconBtn({ icon, label, onPress, disabled }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={[styles.iconBtn, disabled && { opacity: 0.35 }]}>
      <Ionicons name={icon} size={24} color={colors.moss} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { height: 460, borderRadius: sizes.radius, overflow: 'hidden', backgroundColor: colors.ink },
  frame: {
    position: 'absolute', top: '6%', bottom: '18%', left: '8%', right: '8%',
    borderWidth: 4, borderColor: colors.cream, borderRadius: 8, borderStyle: 'dashed',
  },
  coach: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(37,17,1,0.82)', padding: 10 },
  coachText: { color: colors.cream, textAlign: 'center' },
  noCamera: { backgroundColor: colors.surface, borderRadius: sizes.radius, padding: 16, gap: 12, alignItems: 'flex-start' },
  error: { backgroundColor: colors.warnBg, borderLeftWidth: 6, borderLeftColor: colors.caramel, borderRadius: sizes.radius, padding: 14 },
  thumbs: { gap: 12, paddingVertical: 4 },
  thumb: { width: 140, backgroundColor: colors.surface, borderRadius: sizes.radius, padding: 8, alignItems: 'center', gap: 6, borderWidth: 2, borderColor: colors.line },
  thumbActive: { borderColor: colors.caramel },
  thumbImg: { width: 120, height: 150, borderRadius: 6, backgroundColor: colors.cream },
  thumbBtns: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: sizes.touch, height: sizes.touch, borderRadius: 10, borderWidth: 2, borderColor: colors.moss, alignItems: 'center', justifyContent: 'center' },
});
