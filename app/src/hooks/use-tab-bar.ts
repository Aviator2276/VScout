// Immersive pages call useHideTabBar() to hide the tab bar while they're open (FX-11).
import { useEffect, useSyncExternalStore } from "react"
import { tabBarStore } from "@/stores/tab-bar"

export function useHideTabBar(): void {
  useEffect(() => tabBarStore.hold(), [])
}

export function useTabBarHidden(): boolean {
  return useSyncExternalStore(
    tabBarStore.subscribe,
    tabBarStore.hidden,
    () => false
  )
}
