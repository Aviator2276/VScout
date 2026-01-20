import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrientation, isLandscape as checkLandscape } from '@/hooks/use-orientation';
import { Text } from '@/components/ui/text';

export function AdaptiveTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const orientation = useOrientation();
  const insets = useSafeAreaInsets();
  const isLandscapeMode = checkLandscape(orientation);
  
  // In landscape-right (counterclockwise rotation), home bar is on the right
  // In landscape-left (clockwise rotation), home bar is on the left
  const isOnRight = orientation === 'landscape-right';

  return (
    <View
      style={[
        styles.container,
        isLandscapeMode
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
              borderLeftWidth: isOnRight ? 1 : 0,
              borderRightWidth: isOnRight ? 0 : 1,
              borderLeftColor: '#E5E5E5',
              borderRightColor: '#E5E5E5',
              zIndex: 100,
            }
          : {
              flexDirection: 'row',
              height: 60 + insets.bottom,
              width: '100%',
              paddingTop: 10,
              paddingBottom: insets.bottom,
              borderTopWidth: 1,
              borderTopColor: '#E5E5E5',
            },
      ]}
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
            style={[
              styles.tab,
              isLandscapeMode ? styles.tabLandscape : styles.tabPortrait,
            ]}
          >
            {options.tabBarIcon?.({ focused: isFocused, color, size: 24 })}
            <Text
              size="2xs"
              className="mt-0.5"
              style={{ color }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8F8F8',
  },
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
