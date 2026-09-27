# Weekday Timer for Home Assistant

A helper that combines a time and a set of weekdays into one entity, plus a matching dashboard card. Use it for alarms, heating schedules or anything else that should run "at 07:30 on weekdays".

## Installation (HACS)

1. HACS → ⋮ → **Custom repositories** → add `https://github.com/yremmet/ha-weekday-timer`, category **Integration**.
2. Install **Weekday Timer** and restart Home Assistant.
3. **Settings → Devices & services → Helpers → Create helper → Weekday Timer**.

The card is loaded automatically, no Lovelace resource needed.

## Card

```yaml
type: custom:weekday-timer-card
entity: switch.alarm
name: Alarm   # optional
```

Tap the time to change it, tap a day to toggle it, use the switch to pause the timer.

## Entity

Each timer is a `switch` entity. On/off means active/paused. Attributes: `time` (HH:MM), `weekdays` (`mon`…`sun`), `next_trigger` (ISO timestamp).

## Automations

```yaml
triggers:
  - trigger: event
    event_type: weekday_timer_fired
    event_data:
      entity_id: switch.alarm
```

Actions: `weekday_timer.set_time` (`time: "06:45"`) and `weekday_timer.set_weekdays` (`weekdays: [mon, fri]`).

Requires Home Assistant 2024.10 or newer.
