# Robot Actions Bulk Import API

## Overview

The bulk robot actions API allows you to submit match scouting data in a structured format with separate auto and teleop action arrays. The API automatically calculates start and end times based on action durations.

## Endpoint

**POST** `/api/robot-actions/bulk`

## Request Schema

```json
{
  "team_number": 254,
  "competition_code": "2025gacmp",
  "match_number": 1,
  "is_playoff": false,
  "notes": "Optional general notes about the match",
  "auto": [
    {
      "duration": 2,
      "action": "shoot",
      "fuel": 2
    },
    {
      "duration": 10,
      "action": "traverse",
      "fuel": 0
    },
    {
      "duration": 3,
      "action": "climb",
      "fuel": 0
    }
  ],
  "tele": [
    {
      "duration": 20,
      "action": "shoot",
      "fuel": 20
    },
    {
      "duration": 120,
      "action": "traverse",
      "fuel": 0
    },
    {
      "duration": 30,
      "action": "climb",
      "fuel": 0
    }
  ]
}
```

## Field Descriptions

### Top Level Fields
- `team_number` (int, required): Team number being scouted
- `competition_code` (string, required): Competition code (e.g., "2025gacmp")
- `match_number` (int, required): Match number
- `is_playoff` (bool, optional): Whether this is a playoff match (default: false)
- `notes` (string, optional): General notes about the match
- `auto` (array, required): List of autonomous period actions
- `tele` (array, required): List of teleop period actions

### Action Item Fields
Each item in `auto` and `tele` arrays:
- `duration` (int, required): Duration of the action in seconds
- `action` (string, required): Action type (see valid actions below)
- `fuel` (int, required): Number of game pieces/fuel scored during this action

### Valid Action Types
- `traveling` - Robot moving around the field
- `shooting` - Scoring game pieces
- `passing` - Passing game pieces to another robot
- `collecting` - Picking up game pieces
- `defending` - Playing defense
- `disabled` - Robot is disabled
- `idle` - Robot is idle/waiting
- `climbing` - Climbing/endgame

## Timing Calculation

The API automatically calculates start and end times:

### Autonomous Period (0-15 seconds)
- Starts at **0 seconds**
- Actions are sequential based on their durations
- Example:
  - Action 1: 0s - 2s (duration: 2)
  - Action 2: 2s - 12s (duration: 10)
  - Action 3: 12s - 15s (duration: 3)

### Teleop Period (15-150 seconds)
- Starts at **15 seconds** (after auto)
- Actions are sequential based on their durations
- Example:
  - Action 1: 15s - 35s (duration: 20)
  - Action 2: 35s - 155s (duration: 120)
  - Action 3: 155s - 185s (duration: 30)

## Response

Returns an array of created `RobotAction` objects:

```json
[
  {
    "id": 1,
    "team": {
      "number": 254,
      "name": "The Cheesy Poofs"
    },
    "action_type": "shoot",
    "start_time": "0.00",
    "end_time": "2.00",
    "is_playoff": false,
    "fuel": 2,
    "recorded_by": {
      "id": 1,
      "username": "scout1",
      "first_name": "John",
      "last_name": "Doe"
    },
    "notes": "Optional general notes about the match",
    "created_at": "2025-02-10T12:34:56Z"
  },
  // ... more actions
]
```

## Behavior

1. **Validation**: Checks that team, competition, and match exist
2. **Scout Locking**: Only one scout can record actions for a team/match combination
3. **Overwrite on Re-submit**: If the same scout re-submits, old actions are deleted and replaced
4. **Transaction Safety**: All actions are created in a database transaction (all or nothing)
5. **Automatic Timestamps**: `created_at` is automatically set

## Error Responses

### 403 Forbidden
```json
{
  "detail": "This team and match combination has already been scouted by another user. Only the original scouter can add more actions."
}
```

### 404 Not Found
```json
{
  "detail": "Competition/Team/Match not found"
}
```

### 400 Bad Request
Invalid schema or missing required fields

## Example Usage

### Using curl
```bash
curl -X POST http://localhost:8000/api/robot-actions/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "team_number": 254,
    "competition_code": "2025gacmp",
    "match_number": 1,
    "is_playoff": false,
    "notes": "Strong autonomous, consistent shooter",
    "auto": [
      {"duration": 3, "action": "shoot", "fuel": 3},
      {"duration": 10, "action": "traverse", "fuel": 0},
      {"duration": 2, "action": "collect", "fuel": 0}
    ],
    "tele": [
      {"duration": 30, "action": "shoot", "fuel": 15},
      {"duration": 90, "action": "traverse", "fuel": 0},
      {"duration": 30, "action": "climb", "fuel": 0}
    ]
  }'
```

### Using JavaScript fetch
```javascript
const response = await fetch('http://localhost:8000/api/robot-actions/bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    team_number: 254,
    competition_code: '2025gacmp',
    match_number: 1,
    is_playoff: false,
    notes: 'Strong autonomous, consistent shooter',
    auto: [
      { duration: 3, action: 'shoot', fuel: 3 },
      { duration: 10, action: 'traverse', fuel: 0 },
      { duration: 2, action: 'collect', fuel: 0 }
    ],
    tele: [
      { duration: 30, action: 'shoot', fuel: 15 },
      { duration: 90, action: 'traverse', fuel: 0 },
      { duration: 30, action: 'climb', fuel: 0 }
    ]
  })
});

const actions = await response.json();
console.log('Created actions:', actions);
```

## Database Schema

The data is stored in the `RobotAction` model with these fields:

- `id` - Primary key
- `match` - Foreign key to Match
- `team` - Foreign key to Team
- `action_type` - String (one of the valid action types)
- `start_time` - Decimal (seconds from match start)
- `end_time` - Decimal (seconds from match start)
- `is_playoff` - Boolean
- `fuel` - Integer (game pieces scored)
- `recorded_by` - Foreign key to User (optional)
- `notes` - Text (optional)
- `created_at` - DateTime (auto-set)
- `updated_at` - DateTime (auto-updated)

## Querying Actions

To retrieve actions for a match:

**GET** `/api/robot-actions?competition_code=2025gacmp&match_number=1&team_number=254`

This returns all robot actions for the specified team in the match.
