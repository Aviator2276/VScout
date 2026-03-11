import React from 'react';
import { Platform, View, ViewProps } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  useOrientation,
  isLandscape as checkLandscape,
} from '@/hooks/use-orientation';
import { Box } from '@/components/ui/box';

interface AdaptiveSafeAreaProps extends ViewProps {
  children: React.ReactNode;
  hasTabBar?: boolean;
}

export function AdaptiveSafeArea({
  children,
  style,
  hasTabBar = true,
  ...props
}: AdaptiveSafeAreaProps) {
  const orientation = useOrientation();
  const insets = useSafeAreaInsets();
  const isLandscapeMode = checkLandscape(orientation);

  // In landscape-right (counterclockwise rotation), tab bar is on the right
  // In landscape-left (clockwise rotation), tab bar is on the left
  const isOnRight = orientation === 'landscape-right';
  const tabBarWidth = 70;

  // On Android web, SafeAreaView doubles up insets with explicit padding — zero them out
  const isAndroidWeb =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /android/i.test(navigator.userAgent);
  const effectiveInsets = {
    ...insets,
    left: isAndroidWeb && isLandscapeMode ? 0 : insets.left,
    right: isAndroidWeb && isLandscapeMode ? 0 : insets.right,
  };

  const paddingStyle = {
    paddingTop: effectiveInsets.top,
    paddingBottom: isLandscapeMode ? effectiveInsets.bottom : 0,
    paddingLeft: isLandscapeMode
      ? isOnRight
        ? effectiveInsets.left
        : hasTabBar
          ? tabBarWidth
          : effectiveInsets.left
      : effectiveInsets.left,
    paddingRight: isLandscapeMode
      ? isOnRight
        ? hasTabBar
          ? tabBarWidth
          : effectiveInsets.right
        : effectiveInsets.right
      : effectiveInsets.right,
    ...(typeof style === 'object' && style !== null ? style : {}),
  };

  // On Android web, SafeAreaView adds CSS env() padding that can't be disabled.
  // Use a plain View to avoid doubling.
  if (isAndroidWeb && isLandscapeMode) {
    return (
      <View
        className="bg-background-0 flex-1"
        style={paddingStyle}
        {...props}
      >
        {children}
      </View>
    );
  }

  return (
    <SafeAreaView
      className="bg-background-0 flex-1"
      style={paddingStyle}
      {...props}
    >
      {children}
    </SafeAreaView>
  );
}
