import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Prevents pinch-to-zoom and double-tap zoom on web.
 * Modifies the viewport meta tag on mount and restores it on unmount.
 * Only active on web platform.
 */
export function usePreventZoom() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    // 1. Update viewport meta to disable user scaling
    const viewport = document.querySelector('meta[name="viewport"]');
    const originalContent = viewport?.getAttribute('content') || '';
    if (viewport) {
      viewport.setAttribute(
        'content',
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
      );
    }

    // 2. Prevent iOS gesturestart (pinch zoom)
    const preventGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', preventGesture, { passive: false });

    // 3. Prevent double-tap zoom via touchend
    let lastTap = 0;
    const preventDoubleTap = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        e.preventDefault();
      }
      lastTap = now;
    };
    document.addEventListener('touchend', preventDoubleTap, { passive: false });

    return () => {
      // Restore original viewport
      if (viewport) {
        viewport.setAttribute('content', originalContent);
      }
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('touchend', preventDoubleTap);
    };
  }, []);
}
