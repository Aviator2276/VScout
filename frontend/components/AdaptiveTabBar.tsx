import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useOrientation,
  isLandscape as checkLandscape,
} from '@/hooks/use-orientation';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';

export function AdaptiveTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const orientation = useOrientation();
  const insets = useSafeAreaInsets();
  const isLandscapeMode = checkLandscape(orientation);

  // In landscape-right (counterclockwise rotation), home bar is on the right
  // In landscape-left (clockwise rotation), home bar is on the left
  const isOnRight = orientation === 'landscape-right';

  return (
    <Box
      className={`bg-background-50 ${isLandscapeMode ? (isOnRight ? 'border-l border-outline-100' : 'border-r border-outline-100') : 'border-t border-outline-100'}`}
      style={{
        ...styles.container,
        ...(isLandscapeMode
          ? {
              position: 'absolute',
              left: isOnRight ? undefined : 0,
              right: isOnRight ? 0 : undefined,
              top: 0,
              bottom: 0,
              flexDirection: 'column',
              width: 70,
              paddingTop: insets.top + 10,
              paddingBottom: insets.bottom + 10,
              zIndex: 100,
            }
          : {
              flexDirection: 'row',
              height: 70 + insets.bottom,
              width: '100%',
              paddingTop: 0,
              paddingBottom: insets.bottom,
            }),
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        const color = isFocused ? '#007AFF' : '#8E8E93';

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={{
              ...styles.tab,
              ...(isLandscapeMode ? styles.tabLandscape : styles.tabPortrait),
            }}
          >
            {options.tabBarIcon?.({ focused: isFocused, color, size: 24 })}
            <Text size="2xs" className="mt-0.5" style={{ color }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {},
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPortrait: {
    flex: 1,
    paddingVertical: 8,
  },
  tabLandscape: {
    flex: 1,
    paddingHorizontal: 4,
    width: '100%',
  },
  label: {
    fontSize: 10,
    marginTop: 2,
  },
});
