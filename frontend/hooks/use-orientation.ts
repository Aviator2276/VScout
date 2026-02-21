import { useState, useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';

export type Orientation = 'portrait' | 'landscape-left' | 'landscape-right';

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  useEffect(() => {
    async function getInitialOrientation() {
      const orientationInfo = await ScreenOrientation.getOrientationAsync();
      setOrientation(mapOrientation(orientationInfo));
    }
    
    getInitialOrientation();

    const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
      setOrientation(mapOrientation(event.orientationInfo.orientation));
    });

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  return orientation;
}

function mapOrientation(orientation: ScreenOrientation.Orientation): Orientation {
  switch (orientation) {
    case ScreenOrientation.Orientation.LANDSCAPE_LEFT:
      return 'landscape-left';
    case ScreenOrientation.Orientation.LANDSCAPE_RIGHT:
      return 'landscape-right';
    default:
      return 'portrait';
  }
}

export function isLandscape(orientation: Orientation): boolean {
  return orientation === 'landscape-left' || orientation === 'landscape-right';
}
