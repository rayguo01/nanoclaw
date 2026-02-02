#!/usr/bin/env python3
"""
Google Calendar Skill for NanoClaw
Provides access to Google Calendar API for listing, creating, and managing events.

Usage:
    python3 /workspace/skills/google-calendar.py <command> [args...]

Commands:
    list-calendars                          List all calendars
    list-events [calendar_id] [--days N]    List events (default: primary, next 7 days)
    create-event <title> <start> <end>      Create an event
                 [--calendar_id ID]
                 [--description DESC]
                 [--location LOC]
    update-event <event_id> [--title T]     Update an event
                 [--start S] [--end E]
                 [--description D]
                 [--calendar_id ID]
    delete-event <event_id>                 Delete an event
                 [--calendar_id ID]

Date/Time formats:
    - ISO 8601: 2024-01-15T10:00:00
    - Date only: 2024-01-15 (all-day event)
    - Relative: tomorrow, next monday

Token file: /workspace/tokens/google-calendar.json
If no token exists, outputs AUTH_REQUIRED for the router to handle.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Optional

# Google API imports
try:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    print("Error: Google API libraries not installed", file=sys.stderr)
    print("Run: pip install google-api-python-client google-auth-oauthlib", file=sys.stderr)
    sys.exit(1)

import pytz
from dateutil import parser as date_parser

TOKEN_PATH = "/workspace/tokens/google-calendar.json"
SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"]


def load_credentials() -> Optional[Credentials]:
    """Load credentials from token file."""
    if not os.path.exists(TOKEN_PATH):
        return None

    try:
        with open(TOKEN_PATH, "r") as f:
            token_data = json.load(f)

        # Handle both direct token format and Nango format
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_at = token_data.get("expires_at")

        if not access_token:
            return None

        # Convert expires_at to expiry if present
        expiry = None
        if expires_at:
            try:
                expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass

        return Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            expiry=expiry,
        )
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Error reading token file: {e}", file=sys.stderr)
        return None


def get_calendar_service():
    """Get authenticated Calendar service."""
    creds = load_credentials()

    if not creds:
        # Signal that authentication is required
        print("AUTH_REQUIRED:google-calendar:calendar,calendar.events")
        sys.exit(0)

    if creds.expired:
        print("AUTH_REQUIRED:google-calendar:calendar,calendar.events")
        sys.exit(0)

    return build("calendar", "v3", credentials=creds)


def parse_datetime(dt_str: str, timezone: str = None) -> dict:
    """Parse datetime string into Google Calendar format."""
    tz = pytz.timezone(timezone) if timezone else pytz.UTC

    # Handle relative dates
    now = datetime.now(tz)
    lower = dt_str.lower().strip()

    if lower == "today":
        dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif lower == "tomorrow":
        dt = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif lower.startswith("next "):
        # Parse "next monday", "next tuesday", etc.
        day_name = lower[5:].strip()
        days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        try:
            target_day = days.index(day_name)
            current_day = now.weekday()
            days_ahead = target_day - current_day
            if days_ahead <= 0:
                days_ahead += 7
            dt = (now + timedelta(days=days_ahead)).replace(hour=9, minute=0, second=0, microsecond=0)
        except ValueError:
            dt = date_parser.parse(dt_str)
    else:
        dt = date_parser.parse(dt_str)

    # If no time component, treat as all-day event
    if dt.hour == 0 and dt.minute == 0 and dt.second == 0 and ":" not in dt_str:
        return {"date": dt.strftime("%Y-%m-%d")}

    # Ensure timezone
    if dt.tzinfo is None:
        dt = tz.localize(dt)

    return {"dateTime": dt.isoformat(), "timeZone": str(tz)}


def format_event(event: dict) -> str:
    """Format an event for display."""
    start = event.get("start", {})
    end = event.get("end", {})

    start_str = start.get("dateTime", start.get("date", ""))
    end_str = end.get("dateTime", end.get("date", ""))

    # Parse and format nicely
    if "dateTime" in start:
        start_dt = date_parser.parse(start_str)
        end_dt = date_parser.parse(end_str)
        time_str = f"{start_dt.strftime('%Y-%m-%d %H:%M')} - {end_dt.strftime('%H:%M')}"
    else:
        time_str = start_str

    summary = event.get("summary", "(No title)")
    event_id = event.get("id", "")
    location = event.get("location", "")
    description = event.get("description", "")

    lines = [f"  - {time_str}: {summary}"]
    if location:
        lines.append(f"    Location: {location}")
    if description:
        lines.append(f"    Description: {description[:100]}...")
    lines.append(f"    ID: {event_id}")

    return "\n".join(lines)


def cmd_list_calendars(args):
    """List all calendars."""
    service = get_calendar_service()

    try:
        calendar_list = service.calendarList().list().execute()
        calendars = calendar_list.get("items", [])

        if not calendars:
            print("No calendars found.")
            return

        print("Calendars:")
        for cal in calendars:
            primary = " (primary)" if cal.get("primary") else ""
            print(f"  - {cal['summary']}{primary}")
            print(f"    ID: {cal['id']}")

    except HttpError as e:
        print(f"Error listing calendars: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_list_events(args):
    """List upcoming events."""
    service = get_calendar_service()
    calendar_id = args.calendar_id or "primary"
    days = args.days or 7

    now = datetime.utcnow().isoformat() + "Z"
    time_max = (datetime.utcnow() + timedelta(days=days)).isoformat() + "Z"

    try:
        events_result = (
            service.events()
            .list(
                calendarId=calendar_id,
                timeMin=now,
                timeMax=time_max,
                singleEvents=True,
                orderBy="startTime",
                maxResults=50,
            )
            .execute()
        )
        events = events_result.get("items", [])

        if not events:
            print(f"No events in the next {days} days.")
            return

        print(f"Events for the next {days} days:")
        for event in events:
            print(format_event(event))

    except HttpError as e:
        print(f"Error listing events: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_create_event(args):
    """Create a new event."""
    service = get_calendar_service()
    calendar_id = args.calendar_id or "primary"

    # Get timezone from calendar
    try:
        calendar = service.calendars().get(calendarId=calendar_id).execute()
        timezone = calendar.get("timeZone", "UTC")
    except HttpError:
        timezone = "UTC"

    event = {
        "summary": args.title,
        "start": parse_datetime(args.start, timezone),
        "end": parse_datetime(args.end, timezone),
    }

    if args.description:
        event["description"] = args.description
    if args.location:
        event["location"] = args.location

    try:
        created_event = service.events().insert(calendarId=calendar_id, body=event).execute()
        print(f"Event created successfully!")
        print(f"  Title: {created_event['summary']}")
        print(f"  Link: {created_event.get('htmlLink', 'N/A')}")
        print(f"  ID: {created_event['id']}")

    except HttpError as e:
        print(f"Error creating event: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_update_event(args):
    """Update an existing event."""
    service = get_calendar_service()
    calendar_id = args.calendar_id or "primary"

    try:
        # Get existing event
        event = service.events().get(calendarId=calendar_id, eventId=args.event_id).execute()

        # Get timezone
        calendar = service.calendars().get(calendarId=calendar_id).execute()
        timezone = calendar.get("timeZone", "UTC")

        # Update fields if provided
        if args.title:
            event["summary"] = args.title
        if args.description:
            event["description"] = args.description
        if args.location:
            event["location"] = args.location
        if args.start:
            event["start"] = parse_datetime(args.start, timezone)
        if args.end:
            event["end"] = parse_datetime(args.end, timezone)

        updated_event = service.events().update(calendarId=calendar_id, eventId=args.event_id, body=event).execute()
        print(f"Event updated successfully!")
        print(f"  Title: {updated_event['summary']}")
        print(f"  ID: {updated_event['id']}")

    except HttpError as e:
        print(f"Error updating event: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_delete_event(args):
    """Delete an event."""
    service = get_calendar_service()
    calendar_id = args.calendar_id or "primary"

    try:
        service.events().delete(calendarId=calendar_id, eventId=args.event_id).execute()
        print(f"Event deleted successfully!")

    except HttpError as e:
        print(f"Error deleting event: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Google Calendar CLI for NanoClaw")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # list-calendars
    subparsers.add_parser("list-calendars", help="List all calendars")

    # list-events
    list_events = subparsers.add_parser("list-events", help="List upcoming events")
    list_events.add_argument("calendar_id", nargs="?", default="primary", help="Calendar ID (default: primary)")
    list_events.add_argument("--days", type=int, default=7, help="Number of days to look ahead (default: 7)")

    # create-event
    create_event = subparsers.add_parser("create-event", help="Create a new event")
    create_event.add_argument("title", help="Event title")
    create_event.add_argument("start", help="Start time (e.g., 2024-01-15T10:00:00 or 'tomorrow')")
    create_event.add_argument("end", help="End time")
    create_event.add_argument("--calendar_id", default="primary", help="Calendar ID")
    create_event.add_argument("--description", help="Event description")
    create_event.add_argument("--location", help="Event location")

    # update-event
    update_event = subparsers.add_parser("update-event", help="Update an existing event")
    update_event.add_argument("event_id", help="Event ID to update")
    update_event.add_argument("--calendar_id", default="primary", help="Calendar ID")
    update_event.add_argument("--title", help="New title")
    update_event.add_argument("--description", help="New description")
    update_event.add_argument("--location", help="New location")
    update_event.add_argument("--start", help="New start time")
    update_event.add_argument("--end", help="New end time")

    # delete-event
    delete_event = subparsers.add_parser("delete-event", help="Delete an event")
    delete_event.add_argument("event_id", help="Event ID to delete")
    delete_event.add_argument("--calendar_id", default="primary", help="Calendar ID")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "list-calendars": cmd_list_calendars,
        "list-events": cmd_list_events,
        "create-event": cmd_create_event,
        "update-event": cmd_update_event,
        "delete-event": cmd_delete_event,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
