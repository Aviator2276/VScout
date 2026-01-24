# Competition Code Usage Guide

This guide shows how to use the global competition code context in your screens.

## How It Works

The `CompetitionContext` provides a global state for the competition code that:
- Automatically loads from the database on app start
- Updates all screens when changed on the home screen
- Persists to the database automatically

## Basic Usage

### 1. Import the hook

```tsx
import { useCompetitionCode } from '@/contexts/CompetitionContext';
```

### 2. Use in your component

```tsx
export default function YourScreen() {
  const { competitionCode, setCompetitionCode, isLoading } = useCompetitionCode();

  // competitionCode will automatically update when changed on home screen
  // No need to manually load from database or listen for changes

  return (
    <View>
      <Text>Current Competition: {competitionCode || 'Not Set'}</Text>
    </View>
  );
}
```

## Example: Screen that displays competition code

```tsx
import { useCompetitionCode } from '@/contexts/CompetitionContext';
import { Badge, BadgeText } from '@/components/ui/badge';

export default function StatsScreen() {
  const { competitionCode } = useCompetitionCode();

  return (
    <View>
      <Badge size="lg" variant="solid" action="info">
        <BadgeText>{competitionCode || 'N/A'}</BadgeText>
      </Badge>
      {/* Your screen content */}
    </View>
  );
}
```

## Example: Screen that reloads data when competition changes

```tsx
import { useEffect, useState } from 'react';
import { useCompetitionCode } from '@/contexts/CompetitionContext';

export default function TeamDataScreen() {
  const { competitionCode } = useCompetitionCode();
  const [data, setData] = useState([]);

  // This effect runs whenever competitionCode changes
  useEffect(() => {
    if (competitionCode) {
      loadTeamData();
    }
  }, [competitionCode]);

  async function loadTeamData() {
    // Fetch data using the current competition code
    const response = await fetch(`/api/teams?comp=${competitionCode}`);
    const teams = await response.json();
    setData(teams);
  }

  return (
    <View>
      <Text>Competition: {competitionCode || 'Not Set'}</Text>
      {/* Display your data */}
    </View>
  );
}
```

## Example: Screen that can change the competition code

```tsx
import { useState } from 'react';
import { useCompetitionCode } from '@/contexts/CompetitionContext';
import { Button, ButtonText } from '@/components/ui/button';

export default function SettingsScreen() {
  const { competitionCode, setCompetitionCode } = useCompetitionCode();
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

## Benefits

1. **Automatic Updates**: When you change the competition code on the home screen, all other screens automatically receive the new value
2. **No Manual Database Calls**: No need to call `db.config.get()` in every screen
3. **Single Source of Truth**: The context manages the state, so all screens always show the same value
4. **Persistence**: Changes are automatically saved to the database
5. **Loading State**: The context provides an `isLoading` flag for initial load

## Implementation Details

- The context is set up in `/contexts/CompetitionContext.tsx`
- The provider wraps the entire app in `/app/_layout.tsx`
- The database is updated automatically when `setCompetitionCode()` is called
- The value is loaded from the database on app initialization
