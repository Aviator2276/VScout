import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';

export type Orientation = 'portrait' | 'landscape-left' | 'landscape-right';

// Tailwind md breakpoint is 768px
const MD_BREAKPOINT = 768;

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(getOrientation());

  function getOrientation(): Orientation {
    const { width } = Dimensions.get('window');
    // On web, use width breakpoint to determine if nav should be on side
    return width >= MD_BREAKPOINT ? 'landscape-left' : 'portrait';
  }

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setOrientation(window.width >= MD_BREAKPOINT ? 'landscape-left' : 'portrait');
    });

    return () => subscription.remove();
  }, []);

  return orientation;
}

export function isLandscape(orientation: Orientation): boolean {
  return orientation === 'landscape-left' || orientation === 'landscape-right';
}
