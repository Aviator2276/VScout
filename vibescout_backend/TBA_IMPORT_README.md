# The Blue Alliance Data Import

This Django management command imports event and match data from The Blue Alliance API into your VibeScout database.

## Setup

1. **Install dependencies:**
   ```bash
   cd vibescout_backend
   uv sync
   ```

2. **Get a TBA API Key:**
   - Go to https://www.thebluealliance.com/account
   - Generate an API key
   - Set it as an environment variable:
     ```bash
     export TBA_API_KEY='your_api_key_here'
     ```

3. **Run migrations:**
   ```bash
   make makemigrations
   make migrate
   ```

## Usage

### Import specific events:

```bash
# Import 2020 Georgia events
uv run python manage.py import_tba_data 2020gagai 2020gadal

# Or with API key as argument
uv run python manage.py import_tba_data 2020gagai 2020gadal --api-key YOUR_KEY_HERE
```

### Import 2026 events from stuff.md:

```bash
uv run python manage.py import_tba_data 2026gaalb 2026gacmp 2026gacol 2026gadal 2026gagai 2026gagwi
```

## What Gets Imported

The command imports:

### Competitions
- Creates or retrieves competitions by event name

### Teams
- Creates teams with their FRC number
- Team names default to "Team {number}" (can be updated later)

### Matches
- All matches from the event
- Blue and Red alliance teams (3 per side)
- Score data:
  - Total points
  - Total blue/red fuel cells
  - Auto fuel cells per alliance
  - Teleop fuel cells per alliance
  - Fuel scored per alliance
  - Calculated points

## Data Structure

The command maps TBA data to your Match model:
- `blue_team_1`, `blue_team_2`, `blue_team_3` - Blue alliance teams
- `red_team_1`, `red_team_2`, `red_team_3` - Red alliance teams
- `total_points` - Combined score from both alliances
- `total_blue_fuels` - Total fuel cells scored by blue alliance
- `total_red_fuels` - Total fuel cells scored by red alliance
- Auto and teleop fuel fields (currently aggregated at alliance level)

## Example Output

```
Processing event: 2020gagai
  Created competition: Gainesville District Event
  Found 89 matches
    Created match: 2020gagai_qm1
    Created match: 2020gagai_qm2
    ...
  Imported 89 matches for 2020gagai
Successfully imported 2020gagai
```

## Notes

- The command uses transactions, so if an event import fails, no partial data is saved
- Duplicate matches are updated rather than creating duplicates
- Individual team fuel statistics are aggregated at the alliance level (TBA doesn't provide per-robot breakdowns)
- Matches with incomplete team data are skipped
