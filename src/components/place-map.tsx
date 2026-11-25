import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type ViewInstance,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DirectionsButtons } from '@/components/directions-sheet';
import { PinMark } from '@/components/pin-mark';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import {
  cameraViewport,
  centreOn,
  fitCamera,
  MAX_USER_ZOOM,
  MIN_ZOOM,
  panCamera,
  tileUrl,
  zoomCamera,
  type Camera,
  type Pin,
} from '@/lib/geo';

const HEIGHT = 220;
const PIN = 32;
const PIN_SELECTED = 44;
const CONTROL = 44;
/** The pin tip sits at y 114 of the 120 artboard (constants/brand.ts). */
const TIP = 114 / 120;
// OpenStreetMap's tile policy asks apps to identify themselves; browsers send a Referer instead.
const TILE_HEADERS = { 'User-Agent': 'StashtagAI/1.0 (ai.stashtag.app)' };
const DOUBLE_TAP_MS = 300;

export type MapPin = Pin & { name: string; address?: string | null };

type Props = {
  pins: MapPin[];
  selectedId: string | null;
  onPinPress: (id: string) => void;
  /** The list name (usually a city), for directions to a place without an address. */
  city?: string | null;
};

const placesLabel = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`;

/**
 * The list map: OpenStreetMap tiles with Stashtag pins on top, fitted to every pin. Drag to pan, pinch or double-tap to
 * zoom, or use the buttons (HAN-141); expands to full screen. Pure JS, so it renders the same on iOS, Android and web
 * without a native maps module or API key (HAN-24), and ships over the air.
 */
export function PlaceMap({ pins, selectedId, onPinPress, city }: Props) {
  const reduceMotion = useReducedMotion();
  // null = fitted to the pins. Shared by the inline and full-screen maps; it doesn't depend on the view's size.
  const [camera, setCamera] = useState<Camera | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [fullSelected, setFullSelected] = useState<string | null>(null);
  const expandRef = useRef<ViewInstance>(null);

  // A different set of pins (e.g. a #tag filter) refits the map.
  const pinsKey = pins.map((p) => p.id).join();
  const [lastKey, setLastKey] = useState(pinsKey);
  if (lastKey !== pinsKey) {
    setLastKey(pinsKey);
    setCamera(null);
  }

  const open = () => {
    setFullSelected(selectedId);
    setExpanded(true);
  };
  const close = () => {
    setExpanded(false);
    // The modal took focus; give it back to the button that opened it.
    setTimeout(() => {
      const node = expandRef.current;
      if (!node) return;
      if (Platform.OS === 'web') (node as unknown as HTMLElement).focus?.();
      else AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
    }, 100);
  };
  const full = pins.find((p) => p.id === fullSelected) ?? null;

  return (
    <>
      <MapCanvas
        pins={pins}
        selectedId={selectedId}
        onPinPress={onPinPress}
        camera={camera}
        onCamera={setCamera}
        style={{ height: HEIGHT }}
        corner={<Control icon={EXPAND} label="Open full-screen map" onPress={open} ref={expandRef} />}
      />
      <Modal
        visible={expanded}
        animationType={reduceMotion ? 'none' : 'slide'}
        presentationStyle="fullScreen"
        onRequestClose={close}>
        <FullScreen
          pins={pins}
          city={city}
          camera={camera}
          onCamera={setCamera}
          selected={full}
          onSelect={(id) => {
            setFullSelected(id);
            const pin = pins.find((p) => p.id === id);
            if (pin) announce(pin.name);
          }}
          onClose={close}
        />
      </Modal>
    </>
  );
}

function FullScreen({
  pins,
  city,
  camera,
  onCamera,
  selected,
  onSelect,
  onClose,
}: {
  pins: MapPin[];
  city?: string | null;
  camera: Camera | null;
  onCamera: (c: Camera | null) => void;
  selected: MapPin | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.full, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.fullHeader}>
        <ThemedText type="defaultBold" accessibilityRole="header" style={styles.fullTitle} numberOfLines={2}>
          {city ? `${city} · ${placesLabel(pins.length)}` : placesLabel(pins.length)}
        </ThemedText>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close map"
          hitSlop={8}
          style={styles.done}>
          <ThemedText type="defaultBold" themeColor="link">
            Done
          </ThemedText>
        </Pressable>
      </View>
      <MapCanvas
        pins={pins}
        selectedId={selected?.id ?? null}
        onPinPress={(id) => onSelect(id === selected?.id ? null : id)}
        camera={camera}
        onCamera={onCamera}
        style={styles.fullMap}
        square
      />
      {selected ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <View style={styles.cardHeader}>
            <ThemedText type="defaultBold">{selected.name}</ThemedText>
            {selected.address ? (
              <ThemedText type="small" themeColor="textSecondary">
                {selected.address}
              </ThemedText>
            ) : null}
          </View>
          <DirectionsButtons item={{ ...selected, address: selected.address ?? null }} city={city} />
          <Button title="Close" variant="secondary" onPress={() => onSelect(null)} />
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Drag to move, pinch or double-tap to zoom. Tap a pin for directions.
        </ThemedText>
      )}
    </SafeAreaView>
  );
}

type Icon = SymbolViewProps['name'];
const ZOOM_IN: Icon = { ios: 'plus', android: 'add', web: 'add' };
const ZOOM_OUT: Icon = { ios: 'minus', android: 'remove', web: 'remove' };
const FIT: Icon = {
  ios: 'scope',
  android: 'center_focus_strong',
  web: 'center_focus_strong',
};
const EXPAND: Icon = {
  ios: 'arrow.up.left.and.arrow.down.right',
  android: 'open_in_full',
  web: 'open_in_full',
};

function Control({
  icon,
  label,
  onPress,
  disabled,
  ref,
}: {
  icon: Icon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  ref?: React.Ref<ViewInstance>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}>
      <SymbolView name={icon} tintColor={theme.text} size={20} weight="semibold" />
    </Pressable>
  );
}

type Touch = { pageX: number; pageY: number };

/**
 * Centroid and spread of the fingers on the map. One pointer comes from the gesture state, which also tracks a mouse
 * drag on web (react-native-web doesn't update `touches` for the mouse).
 */
function touchesOf(e: GestureResponderEvent, s: PanResponderGestureState) {
  const t: readonly Touch[] = e.nativeEvent.touches ?? [];
  if (t.length < 2) return { count: 1, x: s.moveX || s.x0, y: s.moveY || s.y0, dist: 0 };
  return {
    count: t.length,
    x: t.reduce((sum, p) => sum + p.pageX, 0) / t.length,
    y: t.reduce((sum, p) => sum + p.pageY, 0) / t.length,
    dist: Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY),
  };
}

/** What the gesture handlers need from the latest render; updated after each one. */
type Live = {
  cam: Camera | null;
  size: { w: number; h: number };
  onCamera: (c: Camera | null) => void;
};

type Measurable = {
  measure?: (cb: (x: number, y: number, w: number, h: number, pageX: number, pageY: number) => void) => void;
  getBoundingClientRect?: () => { left: number; top: number };
};

/** Where the map's top-left corner is on the page, so a pinch can zoom about the fingers. */
function measurePage(e: GestureResponderEvent, done: (pageX: number, pageY: number) => void) {
  const el = e.currentTarget as unknown as Measurable;
  if (el.getBoundingClientRect) {
    const r = el.getBoundingClientRect();
    done(r.left + window.scrollX, r.top + window.scrollY);
  } else el.measure?.((_x, _y, _w, _h, pageX, pageY) => done(pageX, pageY));
}

/** Drag to pan, pinch to zoom about the fingers, double-tap to zoom in. Reads the latest camera through `live`. */
function mapResponder(live: Live) {
  // The fingers at the last event, the tap being timed, and the map's page offset.
  const g = { count: 0, x: 0, y: 0, dist: 0, moved: false, at: 0, lastTap: 0, tapX: 0, tapY: 0, pageX: 0, pageY: 0 };
  const baseline = (e: GestureResponderEvent, s: PanResponderGestureState) => Object.assign(g, touchesOf(e, s));
  const move = (next: Camera) => {
    live.cam = next;
    live.onCamera(next);
  };
  return PanResponder.create({
    // Pins are Pressables and claim their own taps first; a drag that starts on one still pans the map.
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, s) => Math.abs(s.dx) + Math.abs(s.dy) > 6,
    // Keep the page from scrolling while a finger is moving the map.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e, s) => {
      baseline(e, s);
      g.moved = false;
      g.at = e.nativeEvent.timestamp;
      measurePage(e, (pageX, pageY) => Object.assign(g, { pageX, pageY }));
    },
    onPanResponderMove: (e, s) => {
      const cur = live.cam;
      const t = touchesOf(e, s);
      if (!cur || t.count !== g.count) {
        baseline(e, s);
        return;
      }
      if (Math.abs(s.dx) + Math.abs(s.dy) > 4 || t.count > 1) g.moved = true;
      const { w, h } = live.size;
      let next = panCamera(cur, t.x - g.x, t.y - g.y);
      if (t.count > 1 && g.dist > 0 && t.dist > 0) {
        next = zoomCamera(next, next.zoom + Math.log2(t.dist / g.dist), w, h, t.x - g.pageX, t.y - g.pageY);
      }
      baseline(e, s);
      move(next);
    },
    onPanResponderRelease: (e) => {
      const cur = live.cam;
      const now = e.nativeEvent.timestamp;
      if (g.moved || !cur || now - g.at > 250) return;
      // Double tap: zoom in one step around the tap.
      if (now - g.lastTap < DOUBLE_TAP_MS && Math.hypot(g.x - g.tapX, g.y - g.tapY) < 30) {
        const { w, h } = live.size;
        move(zoomCamera(cur, Math.round(cur.zoom) + 1, w, h, g.x - g.pageX, g.y - g.pageY));
        g.lastTap = 0;
      } else {
        Object.assign(g, { lastTap: now, tapX: g.x, tapY: g.y });
      }
    },
  });
}

function MapCanvas({
  pins,
  selectedId,
  onPinPress,
  camera,
  onCamera,
  style,
  corner,
  square,
}: {
  pins: MapPin[];
  selectedId: string | null;
  onPinPress: (id: string) => void;
  camera: Camera | null;
  onCamera: (c: Camera | null) => void;
  style: object;
  /** Extra control in the top-left corner (the inline map's expand button). */
  corner?: React.ReactNode;
  /** Square corners and no border: the full-screen map. */
  square?: boolean;
}) {
  const theme = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fitted = fitCamera(pins, size.w, size.h, PIN_SELECTED);
  const cam = camera ?? fitted;
  const view = cam ? cameraViewport(cam, pins, size.w, size.h) : null;

  // The responder is made once; it reads the latest camera and size through `live`.
  const [live] = useState<Live>(() => ({ cam, size, onCamera }));
  useLayoutEffect(() => {
    Object.assign(live, { cam, size, onCamera });
  });
  const [responder] = useState(() => mapResponder(live));

  // A place picked from the list scrolls into view if the map has been moved away from it.
  const selected = view?.pins.find((p) => p.id === selectedId);
  const offscreen =
    !!selected && (selected.left < 0 || selected.left > size.w || selected.top < 0 || selected.top > size.h);
  useEffect(() => {
    if (offscreen && cam && selected) onCamera(centreOn(cam, selected));
    // Only when the selection changes, not on every pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const zoomBy = (step: number) => {
    if (!cam) return;
    const next = zoomCamera(cam, Math.round(cam.zoom) + step, size.w, size.h);
    onCamera(next);
    announce(
      step > 0
        ? next.zoom >= MAX_USER_ZOOM
          ? 'Zoomed all the way in'
          : 'Zoomed in'
        : next.zoom <= MIN_ZOOM
          ? 'Zoomed all the way out'
          : 'Zoomed out',
    );
  };

  // Only pins (partly) inside the view, so a screen reader doesn't step through places that can't be seen.
  const shown = (view?.pins ?? [])
    .filter((p) => p.left > -PIN && p.left < size.w + PIN && p.top > -PIN && p.top < size.h + PIN)
    // Draw the selected pin last so it sits on top of its neighbours.
    .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));

  return (
    <View
      style={[
        styles.map,
        square
          ? styles.square
          : {
              borderRadius: Radius.row,
              borderWidth: StyleSheet.hairlineWidth * 2,
            },
        {
          backgroundColor: theme.backgroundSelected,
          borderColor: theme.border,
        },
        style,
      ]}
      onLayout={(e) =>
        setSize({
          w: Math.round(e.nativeEvent.layout.width),
          h: Math.round(e.nativeEvent.layout.height),
        })
      }
      {...responder.panHandlers}>
      {view?.tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: tileUrl(t), headers: TILE_HEADERS }}
          style={[styles.tile, { left: t.left, top: t.top, width: t.size, height: t.size }]}
          cachePolicy="disk"
          transition={150}
          accessible={false}
          accessibilityIgnoresInvertColors
        />
      ))}
      {shown.map((p) => {
        const isSelected = p.id === selectedId;
        const pinSize = isSelected ? PIN_SELECTED : PIN;
        const name = pins.find((x) => x.id === p.id)?.name ?? '';
        return (
          <Pressable
            key={p.id}
            onPress={() => onPinPress(p.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={name}
            accessibilityState={{ selected: isSelected }}
            style={[
              styles.pin,
              {
                left: p.left - pinSize / 2,
                top: p.top - pinSize * TIP,
                width: pinSize,
                height: pinSize,
              },
            ]}>
            <PinMark size={pinSize} pin={isSelected ? theme.danger : undefined} />
          </Pressable>
        );
      })}
      <View style={[styles.controls, styles.left]}>
        {corner}
        {camera ? (
          <Control
            icon={FIT}
            label={`Show all ${placesLabel(pins.length)}`}
            onPress={() => {
              onCamera(null);
              announce(`Showing all ${placesLabel(pins.length)}`);
            }}
          />
        ) : null}
      </View>
      <View style={[styles.controls, styles.right]}>
        <Control
          icon={ZOOM_IN}
          label="Zoom in"
          onPress={() => zoomBy(1)}
          disabled={!cam || cam.zoom >= MAX_USER_ZOOM}
        />
        <Control icon={ZOOM_OUT} label="Zoom out" onPress={() => zoomBy(-1)} disabled={!cam || cam.zoom <= MIN_ZOOM} />
      </View>
      <Pressable
        style={[styles.attribution, { backgroundColor: theme.backgroundElement }]}
        onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}
        accessibilityRole="link">
        <ThemedText style={styles.attributionText} themeColor="textSecondary">
          © OpenStreetMap
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // No text selection: on web a mouse drag would select text, and react-native-web ends the gesture when it does.
  map: { overflow: 'hidden', userSelect: 'none' },
  square: { borderRadius: 0 },
  // Touches go to the map, not the tile: on web a mouse drag on an <img> would start a native image drag instead.
  tile: { position: 'absolute', pointerEvents: 'none' },
  pin: { position: 'absolute' },
  controls: { position: 'absolute', top: Spacing.two, gap: Spacing.two },
  left: { left: Spacing.two },
  right: { right: Spacing.two },
  control: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attribution: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.one,
    borderTopLeftRadius: Spacing.one,
    opacity: 0.85,
  },
  attributionText: { fontSize: 10, lineHeight: 14 },
  full: { flex: 1 },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  fullTitle: { flex: 1 },
  done: {
    minHeight: CONTROL,
    minWidth: CONTROL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullMap: { flex: 1 },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  cardHeader: { gap: Spacing.one, marginBottom: Spacing.one },
  hint: { padding: Spacing.four, textAlign: 'center' },
});
