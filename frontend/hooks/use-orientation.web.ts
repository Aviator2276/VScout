import { useState, useEffect, useCallback } from 'react';

export type Orientation = 'portrait' | 'landscape-left' | 'landscape-right';

// Tailwind md breakpoint is 768px
const MD_BREAKPOINT = 768;

function getOrientation(): Orientation {
  if (typeof window === 'undefined') return 'portrait';
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Wide viewport (desktop/tablet) or landscape on smaller screens (phones)
  if (width >= MD_BREAKPOINT || width > height) return 'landscape-left';
  return 'portrait';
}

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(getOrientation);

  const handleResize = useCallback(() => {
    setOrientation(getOrientation());
  }, []);

  useEffect(() => {
    // Initial check in case value changed between render and effect
    handleResize();

    window.addEventListener('resize', handleResize);

    // iOS Safari needs a delay after orientationchange for dimensions to update
    const handleOrientationChange = () => setTimeout(handleResize, 100);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [handleResize]);

  return orientation;
}

export function isLandscape(orientation: Orientation): boolean {
  return orientation === 'landscape-left' || orientation === 'landscape-right';
}
