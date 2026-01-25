# App Context Usage Guide

This guide shows how to use the global app context to access shared application state across your screens.

## How It Works

The `AppContext` provides a centralized state management system for:
- **Competition Code**: Current competition being scouted
- **Connection Status**: Real-time server connectivity status
- **Online Status**: Network connectivity detection
- **Loading State**: Initial app load state

All state automatically:
- Loads from the database on app start
- Updates all screens when changed
- Persists to the database automatically
- Monitors network and server connectivity

## Basic Usage

### 1. Import the hook

```tsx
import { useApp } from '@/utils/AppContext';
```

### 2. Use in your component

```tsx
export default function YourScreen() {
  const { 
    competitionCode, 
    setCompetitionCode, 
    isOnline,
    serverStatus,
    isLoading,
    checkServerConnection 
  } = useApp();

  // All values automatically update when changed anywhere in the app
  // No need to manually load from database or listen for changes

  return (
    <View>
      <Text>Competition: {competitionCode || 'Not Set'}</Text>
      <Text>Online: {isOnline ? 'Yes' : 'No'}</Text>
      <Text>Server: {serverStatus}</Text>
    </View>
  );
}
```

## Available State

### `competitionCode: string | null`
The currently selected competition code (e.g., "2025gacmp")

### `setCompetitionCode: (code: string) => Promise<void>`
Function to update the competition code (saves to database automatically)

### `isOnline: boolean`
Whether the device has network connectivity

### `serverStatus: 'connected' | 'disconnected' | 'checking'`
Current server connection status:
- `connected`: Server is reachable
- `disconnected`: Server is not reachable
- `checking`: Currently checking connection

### `isLoading: boolean`
Whether the initial app data is still loading

### `checkServerConnection: () => Promise<void>`
Manually trigger a server connection check

## Example: Display connection status

```tsx
import { useApp } from '@/utils/AppContext';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { Wifi } from 'lucide-react-native';

export default function HeaderScreen() {
  const { competitionCode, serverStatus } = useApp();

  return (
    <HStack className="gap-1">
      <Badge 
        size="lg" 
        variant="solid" 
        action={
          serverStatus === 'connected' ? 'success' : 
          serverStatus === 'checking' ? 'warning' : 
          'error'
        }
      >
        <BadgeIcon as={Wifi} />
      </Badge>
      <Badge size="lg" variant="solid" action="info">
        <BadgeText>{competitionCode || 'N/A'}</BadgeText>
      </Badge>
    </HStack>
  );
}
```

## Example: Screen that reloads data when competition changes

```tsx
import { useEffect, useState } from 'react';
import { useApp } from '@/utils/AppContext';

export default function TeamDataScreen() {
  const { competitionCode, isOnline } = useApp();
  const [data, setData] = useState([]);

  // This effect runs whenever competitionCode changes
  useEffect(() => {
    if (competitionCode && isOnline) {
      loadTeamData();
    }
  }, [competitionCode, isOnline]);

  async function loadTeamData() {
    const response = await fetch(`/api/teams?comp=${competitionCode}`);
    const teams = await response.json();
    setData(teams);
  }

  return (
    <View>
      <Text>Competition: {competitionCode || 'Not Set'}</Text>
      <Text>Status: {isOnline ? 'Online' : 'Offline'}</Text>
      {/* Display your data */}
    </View>
  );
}
```

## Example: Screen that changes competition code

```tsx
import { useState } from 'react';
import { useApp } from '@/utils/AppContext';
import { Button, ButtonText } from '@/components/ui/button';

export default function SettingsScreen() {
  const { competitionCode, setCompetitionCode } = useApp();
  const [newCode, setNewCode] = useState('');

  async function handleSave() {
    try {
      await setCompetitionCode(newCode);
      // All other screens will automatically update!
    } catch (error) {
      console.error('Failed to save:', error);
    }
  }

  return (
    <View>
      <Text>Current: {competitionCode || 'Not Set'}</Text>
      <Input value={newCode} onChangeText={setNewCode} />
      <Button onPress={handleSave}>
        <ButtonText>Save</ButtonText>
      </Button>
    </View>
  );
}
```

## Example: Manual server check

```tsx
import { useApp } from '@/utils/AppContext';
import { Button, ButtonText } from '@/components/ui/button';

export default function DiagnosticsScreen() {
  const { serverStatus, checkServerConnection } = useApp();

  return (
    <View>
      <Text>Server Status: {serverStatus}</Text>
      <Button onPress={checkServerConnection}>
        <ButtonText>Check Connection</ButtonText>
      </Button>
    </View>
  );
}
```

## Benefits

1. **Automatic Updates**: State changes propagate to all screens instantly
2. **No Manual Database Calls**: No need to call `db.config.get()` in every screen
3. **Single Source of Truth**: All screens always show the same values
4. **Persistence**: Changes are automatically saved to the database
5. **Connection Monitoring**: Real-time network and server status tracking
6. **Loading State**: Built-in loading state for initial app load

## Implementation Details

- The context is set up in `/utils/AppContext.tsx`
- The provider wraps the entire app in `/app/_layout.tsx`
- The database is updated automatically when `setCompetitionCode()` is called
- Network status is monitored via browser online/offline events
- Server status is checked via `/api/health` endpoint with 5-second timeout
- All values are loaded from the database on app initialization

## Backwards Compatibility

For existing code, `useCompetitionCode` is aliased to `useApp`, so old imports will continue to work:

```tsx
// Old way (still works)
import { useCompetitionCode } from '@/utils/AppContext';

// New way (recommended)
import { useApp } from '@/utils/AppContext';
```
