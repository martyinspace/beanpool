import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

// ── SVG Geometry ────────────────────────────────────────
// ViewBox: 56×56 with 5px transparent buffer on all sides.
// Pin head: circle R=18 centred at (28, 23).
// Tail base: ±6px from centre (narrow, matching original CSS arrow).
// Tail tip:  y=50 (10px below base).
const VB_W = 56;
const VB_H = 56;
const CX = 28;
const CY = 23;
const R  = 18;
const TAIL_BASE_Y = 40;
const TAIL_TIP_Y = 50;
const EMOJI_BG_R = 12;

// Single unified SVG path: circle arc + narrow tail
const PIN_PATH = `
  M ${CX - 6},${TAIL_BASE_Y}
  A ${R},${R} 0 1,1 ${CX + 6},${TAIL_BASE_Y}
  L ${CX},${TAIL_TIP_Y}
  Z
`;

// ── Render dimensions (device pixels) ───────────────────
export const PIN_RENDER_W = 56;
export const PIN_RENDER_H = 56;

// ── Anchor: tail tip at y=50 out of 56 ─────────────────
export const PIN_ANCHOR = { x: 0.5, y: TAIL_TIP_Y / VB_H };


// ═══════════════════════════════════════════════════════
// PinVisual — the SVG component (used ONLY for off-screen capture)
// ═══════════════════════════════════════════════════════

interface PinVisualProps {
  emoji: string;
  bgColor: string;
  isElder?: boolean;
}

export const PinVisual = React.memo<PinVisualProps>(({
  emoji,
  bgColor,
  isElder = false,
}) => {
  const strokeColor = isElder ? '#fbbf24' : 'transparent';
  const strokeWidth = isElder ? 2 : 0;

  return (
    <View collapsable={false} style={pinStyles.container}>
      <Svg width={PIN_RENDER_W} height={PIN_RENDER_H} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        {isElder && (
          <Circle cx={CX} cy={CY} r={R + 3} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.6} />
        )}
        <Path d={PIN_PATH} fill={bgColor} stroke={strokeColor} strokeWidth={strokeWidth} />
        <Circle cx={CX} cy={CY} r={EMOJI_BG_R} fill="rgba(255,255,255,0.85)" />
      </Svg>
      <View collapsable={false} style={pinStyles.emojiOverlay}>
        <Text collapsable={false} style={pinStyles.emoji}>{emoji}</Text>
      </View>
    </View>
  );
});

PinVisual.displayName = 'PinVisual';

const pinStyles = StyleSheet.create({
  container: {
    width: PIN_RENDER_W,
    height: PIN_RENDER_H,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible', // Breathing room — prevent Android from clipping before capture
  },
  emojiOverlay: {
    position: 'absolute',
    top: ((CY - EMOJI_BG_R) / VB_H) * PIN_RENDER_H,
    left: ((CX - EMOJI_BG_R) / VB_W) * PIN_RENDER_W,
    width: (EMOJI_BG_R * 2 / VB_W) * PIN_RENDER_W,
    height: (EMOJI_BG_R * 2 / VB_H) * PIN_RENDER_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 16,
    textAlign: 'center',
  },
});


// ═══════════════════════════════════════════════════════
// Image Cache — shared module-level state
// ═══════════════════════════════════════════════════════

export function pinCacheKey(emoji: string, bgColor: string, isElder: boolean): string {
  return `${emoji}|${bgColor}|${isElder ? '1' : '0'}`;
}

const imageCache = new Map<string, string>();

/** Get a cached image URI for a pin, or null */
export function getCachedMarkerImage(
  emoji: string,
  bgColor: string,
  isElder: boolean,
): string | null {
  const key = pinCacheKey(emoji, bgColor, isElder);
  return imageCache.get(key) || null;
}


// ═══════════════════════════════════════════════════════
// MapMarkerManager — off-screen capture factory
// ═══════════════════════════════════════════════════════

export interface CaptureRequest {
  key: string;
  emoji: string;
  bgColor: string;
  isElder: boolean;
}

interface MapMarkerManagerProps {
  variants: CaptureRequest[];
  onReady: () => void;
}

export const MapMarkerManager = React.memo<MapMarkerManagerProps>(({ variants, onReady }) => {
  const capturedCount = useRef(0);
  const refs = useRef<Map<string, React.RefObject<any>>>(new Map());
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Create refs for each variant
  for (const v of variants) {
    if (!refs.current.has(v.key)) {
      refs.current.set(v.key, React.createRef());
    }
  }

  const handleCapture = useCallback(async (key: string) => {
    if (imageCache.has(key)) {
      capturedCount.current += 1;
      if (capturedCount.current >= variants.length) {
        console.log(`[MapMarkerManager] All ${variants.length} variants cached (from cache)`);
        onReadyRef.current();
      }
      return;
    }

    const ref = refs.current.get(key);
    if (!ref?.current) {
      console.warn(`[MapMarkerManager] No ref for "${key}"`);
      return;
    }

    try {
      const uri = await captureRef(ref.current, {
        format: 'png',
        quality: 1,
        result: 'data-uri',
      });
      imageCache.set(key, uri);
      console.log(`[MapMarkerManager] Captured "${key}" → ${uri.substring(0, 50)}...`);
    } catch (e) {
      console.warn(`[MapMarkerManager] Failed to capture "${key}":`, e);
    } finally {
      capturedCount.current += 1;
      if (capturedCount.current >= variants.length) {
        console.log(`[MapMarkerManager] All ${variants.length} variants processed. Ready!`);
        onReadyRef.current();
      }
    }
  }, [variants.length]);

  if (Platform.OS === 'web') return null;

  return (
    <View style={[captureStyles.offscreen, { height: Math.max(200, variants.length * (PIN_RENDER_H + 4)) }]} pointerEvents="none">
      {variants.map((v, index) => (
        <View
          key={v.key}
          ref={refs.current.get(v.key)}
          collapsable={false}
          onLayout={() => {
            // 300ms delay + wider stagger to give Android GPU time per capture
            setTimeout(() => handleCapture(v.key), 300 + (index * 50));
          }}
          style={[captureStyles.slot, { top: index * (PIN_RENDER_H + 4) }]}
        >
          <PinVisual
            emoji={v.emoji}
            bgColor={v.bgColor}
            isElder={v.isElder}
          />
        </View>
      ))}
    </View>
  );
});

MapMarkerManager.displayName = 'MapMarkerManager';

const captureStyles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: 0,
    opacity: 1,           // Must be visible for capture
    overflow: 'visible',  // Breathing room — never clip the SVG shadow/glow
    width: 200,           // Constrain parent size so it doesn't get culled
    height: 200,
  },
  slot: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PIN_RENDER_W,
    height: PIN_RENDER_H,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
});


// ═══════════════════════════════════════════════════════
// Cluster Visual & Capture System
// ═══════════════════════════════════════════════════════

const getClusterStyle = (points: number) => {
  if (points >= 50) return { size: 64, glow: 80, fontSize: 20 };
  if (points >= 25) return { size: 56, glow: 72, fontSize: 19 };
  if (points >= 15) return { size: 50, glow: 66, fontSize: 18 };
  if (points >= 10) return { size: 46, glow: 60, fontSize: 17 };
  if (points >= 5)  return { size: 42, glow: 54, fontSize: 16 };
  return { size: 36, glow: 48, fontSize: 15 };
};

export const ClusterVisual = React.memo<{ points: number }>(({ points }) => {
  const { size, glow, fontSize } = getClusterStyle(points);
  // Count 99 is used as the "99+" overflow bucket
  const label = points >= 99 ? '99+' : String(points);
  const labelSize = points >= 99 ? fontSize - 3 : fontSize;
  return (
    <View style={{ width: glow, height: glow, justifyContent: 'center', alignItems: 'center' }}>
      {/* Outer glow ring */}
      <View style={{ position: 'absolute', width: glow, height: glow, borderRadius: glow / 2, backgroundColor: 'rgba(59, 130, 246, 0.25)' }} />
      {/* Inner solid circle */}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', borderColor: '#ffffff', borderWidth: 3 }}>
        <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: labelSize }}>{label}</Text>
      </View>
    </View>
  );
});

ClusterVisual.displayName = 'ClusterVisual';

// Cluster image cache (keyed by point count)
const clusterImageCache = new Map<number, string>();

export function getCachedClusterImage(points: number): string | null {
  return clusterImageCache.get(points) || null;
}

// Cluster anchor: center of the circle
export const CLUSTER_ANCHOR = { x: 0.5, y: 0.5 };


// ═══════════════════════════════════════════════════════
// buildVariantList — extract unique pin variants from posts
// ═══════════════════════════════════════════════════════

export function buildVariantList(
  posts: any[],
  categories: any[],
): CaptureRequest[] {
  const seen = new Set<string>();
  const result: CaptureRequest[] = [];

  for (const post of posts) {
    const isOffer = post.type === 'offer';
    const bgColor = isOffer ? '#10b981' : '#ea580c';
    const catObj = categories.find((c: any) => c.id === post.category);
    const emoji = catObj?.emoji || (isOffer ? '📦' : '❤️');
    const isElder = (post.author_energy_cycled || 0) >= 10000;
    const key = pinCacheKey(emoji, bgColor, isElder);

    if (!seen.has(key)) {
      seen.add(key);
      result.push({ key, emoji, bgColor, isElder });
    }
  }

  return result;
}


// ═══════════════════════════════════════════════════════
// ClusterCaptureManager — pre-renders cluster images
// ═══════════════════════════════════════════════════════

interface ClusterCaptureManagerProps {
  counts: number[];
  onReady: () => void;
}

export const ClusterCaptureManager = React.memo<ClusterCaptureManagerProps>(({ counts, onReady }) => {
  const capturedCount = useRef(0);
  const refs = useRef<Map<number, React.RefObject<any>>>(new Map());
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  for (const c of counts) {
    if (!refs.current.has(c)) {
      refs.current.set(c, React.createRef());
    }
  }

  const handleCapture = useCallback(async (count: number) => {
    if (clusterImageCache.has(count)) {
      capturedCount.current += 1;
      if (capturedCount.current >= counts.length) onReadyRef.current();
      return;
    }

    const ref = refs.current.get(count);
    if (!ref?.current) return;

    try {
      const { glow } = getClusterStyle(count);
      const uri = await captureRef(ref.current, {
        format: 'png',
        quality: 1,
        result: 'data-uri',
      });
      clusterImageCache.set(count, uri);
      console.log(`[ClusterCapture] Captured count=${count} → ${uri.substring(0, 50)}...`);
    } catch (e) {
      console.warn(`[ClusterCapture] Failed count=${count}:`, e);
    } finally {
      capturedCount.current += 1;
      if (capturedCount.current >= counts.length) {
        console.log(`[ClusterCapture] All ${counts.length} cluster variants processed!`);
        onReadyRef.current();
      }
    }
  }, [counts.length]);

  if (Platform.OS === 'web') return null;

  return (
    <View style={[captureStyles.offscreen, { height: Math.max(200, counts.length * 92) }]} pointerEvents="none">
      {counts.map((count, index) => {
        const { glow } = getClusterStyle(count);
        return (
          <View
            key={`cluster-${count}`}
            ref={refs.current.get(count)}
            collapsable={false}
            onLayout={() => setTimeout(() => handleCapture(count), 300 + (index * 30))}
            style={{ position: 'absolute', top: index * 92, left: 0, width: glow + 8, height: glow + 8, backgroundColor: 'transparent', overflow: 'visible', justifyContent: 'center', alignItems: 'center' }}
          >
            <ClusterVisual points={count} />
          </View>
        );
      })}
    </View>
  );
});

ClusterCaptureManager.displayName = 'ClusterCaptureManager';

export default PinVisual;

