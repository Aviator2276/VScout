import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { RobotAction } from '@/types/scouting';

interface UseScoutingInputParams {
  disabled: boolean;
  onActionChange: (action: RobotAction) => void;
  onToggleDisabled: () => void;
  onToggleClimbing: () => void;
  onToggleDefending: () => void;
  sessionRunning: boolean;
}

const KEY_TO_ACTION: Record<string, RobotAction> = {
  ArrowUp: 'shooting',
  ArrowDown: 'outtake',
  ArrowLeft: 'intake',
  ArrowRight: 'herding',
};

export function useScoutingInput({
  disabled,
  onActionChange,
  onToggleDisabled,
  onToggleClimbing,
  onToggleDefending,
  sessionRunning,
}: UseScoutingInputParams) {
  const gamepadIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDpadRef = useRef<string>('center');
  const lastAButtonRef = useRef<boolean>(false);
  const lastBButtonRef = useRef<boolean>(false);
  const lastXButtonRef = useRef<boolean>(false);

  // Keyboard input
  useEffect(() => {
    if (Platform.OS !== 'web' || !sessionRunning) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!sessionRunning) return;

      // Toggle disabled with Space
      if (e.code === 'Space') {
        e.preventDefault();
        onToggleDisabled();
        return;
      }

      // Toggle climbing with C
      if (e.code === 'KeyC') {
        e.preventDefault();
        onToggleClimbing();
        return;
      }

      // Toggle defending with D
      if (e.code === 'KeyD') {
        e.preventDefault();
        onToggleDefending();
        return;
      }

      // Direction keys
      if (disabled) return;
      const action = KEY_TO_ACTION[e.key];
      if (action) {
        e.preventDefault();
        onActionChange(action);
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (!sessionRunning || disabled) return;

      // Return to traversing when arrow key released
      if (KEY_TO_ACTION[e.key]) {
        e.preventDefault();
        onActionChange('traversing');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [disabled, onActionChange, onToggleDisabled, onToggleClimbing, onToggleDefending, sessionRunning]);

  // Gamepad input
  const pollGamepad = useCallback(() => {
    if (!sessionRunning) return;

    const gamepads = navigator.getGamepads();
    const gamepad = gamepadIndexRef.current !== null 
      ? gamepads[gamepadIndexRef.current] 
      : null;

    if (!gamepad) {
      rafRef.current = requestAnimationFrame(pollGamepad);
      return;
    }

    // D-pad or left stick for directions
    // Standard mapping: buttons 12-15 are d-pad (up, down, left, right)
    // Axes 0,1 are left stick
    let currentDpad = 'center';

    // Check d-pad buttons first
    if (gamepad.buttons[12]?.pressed) currentDpad = 'up';
    else if (gamepad.buttons[13]?.pressed) currentDpad = 'down';
    else if (gamepad.buttons[14]?.pressed) currentDpad = 'left';
    else if (gamepad.buttons[15]?.pressed) currentDpad = 'right';
    else {
      // Check left stick
      const axisX = gamepad.axes[0] || 0;
      const axisY = gamepad.axes[1] || 0;
      const threshold = 0.5;

      if (axisY < -threshold) currentDpad = 'up';
      else if (axisY > threshold) currentDpad = 'down';
      else if (axisX < -threshold) currentDpad = 'left';
      else if (axisX > threshold) currentDpad = 'right';
    }

    // Handle direction change
    if (currentDpad !== lastDpadRef.current && !disabled) {
      lastDpadRef.current = currentDpad;
      const dpadToAction: Record<string, RobotAction> = {
        up: 'shooting',
        down: 'outtake',
        left: 'intake',
        right: 'herding',
        center: 'traversing',
      };
      onActionChange(dpadToAction[currentDpad]);
    }

    // A button (button 0) - toggle climbing
    const aPressed = gamepad.buttons[0]?.pressed || false;
    if (aPressed && !lastAButtonRef.current) {
      onToggleClimbing();
    }
    lastAButtonRef.current = aPressed;

    // B button (button 1) - toggle disabled
    const bPressed = gamepad.buttons[1]?.pressed || false;
    if (bPressed && !lastBButtonRef.current) {
      onToggleDisabled();
    }
    lastBButtonRef.current = bPressed;

    // X button (button 2) - toggle defending
    const xPressed = gamepad.buttons[2]?.pressed || false;
    if (xPressed && !lastXButtonRef.current) {
      onToggleDefending();
    }
    lastXButtonRef.current = xPressed;

    rafRef.current = requestAnimationFrame(pollGamepad);
  }, [disabled, onActionChange, onToggleDisabled, onToggleClimbing, onToggleDefending, sessionRunning]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !sessionRunning) return;

    function handleGamepadConnected(e: GamepadEvent) {
      console.log('Gamepad connected:', e.gamepad.id);
      gamepadIndexRef.current = e.gamepad.index;
    }

    function handleGamepadDisconnected(e: GamepadEvent) {
      console.log('Gamepad disconnected:', e.gamepad.id);
      if (gamepadIndexRef.current === e.gamepad.index) {
        gamepadIndexRef.current = null;
      }
    }

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);

    // Check for already connected gamepads
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        gamepadIndexRef.current = i;
        break;
      }
    }

    // Start polling
    rafRef.current = requestAnimationFrame(pollGamepad);

    return () => {
      window.removeEventListener('gamepadconnected', handleGamepadConnected);
      window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [pollGamepad, sessionRunning]);
}
