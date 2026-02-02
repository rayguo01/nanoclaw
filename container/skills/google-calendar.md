# Google Calendar Skill

Access Google Calendar to view and manage events.

## Location

```bash
python3 /workspace/skills/google-calendar.py <command> [args...]
```

## Commands

### List Calendars

```bash
python3 /workspace/skills/google-calendar.py list-calendars
```

Lists all calendars accessible to the user.

### List Events

```bash
python3 /workspace/skills/google-calendar.py list-events [calendar_id] [--days N]
```

- `calendar_id`: Calendar to list events from (default: `primary`)
- `--days N`: Number of days to look ahead (default: 7)

Example:
```bash
python3 /workspace/skills/google-calendar.py list-events --days 14
```

### Create Event

```bash
python3 /workspace/skills/google-calendar.py create-event <title> <start> <end> [options]
```

Options:
- `--calendar_id ID`: Target calendar (default: `primary`)
- `--description DESC`: Event description
- `--location LOC`: Event location

Date/time formats:
- ISO 8601: `2024-01-15T10:00:00`
- Date only (all-day): `2024-01-15`
- Relative: `tomorrow`, `next monday`

Examples:
```bash
# Create a meeting tomorrow at 2pm
python3 /workspace/skills/google-calendar.py create-event "Team Meeting" "tomorrow 14:00" "tomorrow 15:00"

# Create an all-day event
python3 /workspace/skills/google-calendar.py create-event "Conference" "2024-03-15" "2024-03-17" --location "Convention Center"
```

### Update Event

```bash
python3 /workspace/skills/google-calendar.py update-event <event_id> [options]
```

Options:
- `--calendar_id ID`: Calendar containing the event
- `--title T`: New title
- `--description D`: New description
- `--location L`: New location
- `--start S`: New start time
- `--end E`: New end time

Example:
```bash
python3 /workspace/skills/google-calendar.py update-event abc123 --title "Updated Meeting" --start "2024-01-16T15:00:00"
```

### Delete Event

```bash
python3 /workspace/skills/google-calendar.py delete-event <event_id> [--calendar_id ID]
```

Example:
```bash
python3 /workspace/skills/google-calendar.py delete-event abc123
```

## Authentication

The skill reads OAuth tokens from `/workspace/tokens/google-calendar.json`.

If no valid token exists, the skill outputs:
```
AUTH_REQUIRED:google-calendar:calendar,calendar.events
```

This triggers the OAuth flow through Nango. After the user completes authorization, the token is stored and subsequent calls will work.

## Token File Format

The token file should contain:
```json
{
  "access_token": "ya29...",
  "refresh_token": "1//...",
  "expires_at": "2024-01-15T10:00:00Z"
}
```
