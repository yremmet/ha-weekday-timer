"""Timer-Entität: Schalter = aktiv, Attribute = Uhrzeit + Wochentage."""
from __future__ import annotations

from datetime import datetime, time as dt_time, timedelta
from typing import Any

import voluptuous as vol

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_ON
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv, entity_platform
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from .const import ATTR_NEXT, ATTR_TIME, ATTR_WEEKDAYS, DOMAIN, EVENT_FIRED, WEEKDAYS


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([WeekdayTimerSwitch(entry)])

    platform = entity_platform.async_get_current_platform()
    platform.async_register_entity_service(
        "set_time", {vol.Required("time"): cv.time}, "async_set_time"
    )
    platform.async_register_entity_service(
        "set_weekdays",
        {vol.Required("weekdays"): vol.All(cv.ensure_list, [vol.In(WEEKDAYS)])},
        "async_set_weekdays",
    )


class WeekdayTimerSwitch(SwitchEntity, RestoreEntity):
    _attr_has_entity_name = True
    _attr_name = None
    _attr_icon = "mdi:calendar-clock"
    _attr_should_poll = False

    def __init__(self, entry: ConfigEntry) -> None:
        self._attr_unique_id = entry.entry_id
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)}, name=entry.title
        )
        self._attr_is_on = True
        self._time = dt_time(7, 0)
        self._weekdays: list[str] = WEEKDAYS[:5]
        self._unsub = None

    async def async_added_to_hass(self) -> None:
        if (last := await self.async_get_last_state()) is not None:
            self._attr_is_on = last.state == STATE_ON
            if (t := last.attributes.get(ATTR_TIME)) and (p := dt_util.parse_time(t)):
                self._time = p
            if (wd := last.attributes.get(ATTR_WEEKDAYS)) is not None:
                self._weekdays = [d for d in WEEKDAYS if d in wd]
        self._schedule()
        self.async_on_remove(self._cancel)

    # --- Scheduling -------------------------------------------------------
    @callback
    def _cancel(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    @callback
    def _schedule(self) -> None:
        self._cancel()
        self._unsub = async_track_time_change(
            self.hass, self._fire,
            hour=self._time.hour, minute=self._time.minute, second=0,
        )

    @callback
    def _fire(self, now: datetime) -> None:
        if self.is_on and WEEKDAYS[now.weekday()] in self._weekdays:
            self.hass.bus.async_fire(
                EVENT_FIRED,
                {"entity_id": self.entity_id, ATTR_TIME: self._time.strftime("%H:%M")},
            )
        self.async_write_ha_state()  # next_trigger aktualisieren

    def _next_trigger(self) -> datetime | None:
        if not self.is_on or not self._weekdays:
            return None
        now = dt_util.now()
        for offset in range(8):
            day = (now + timedelta(days=offset)).date()
            cand = datetime.combine(day, self._time, tzinfo=now.tzinfo)
            if cand > now and WEEKDAYS[cand.weekday()] in self._weekdays:
                return cand
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        nxt = self._next_trigger()
        return {
            ATTR_TIME: self._time.strftime("%H:%M"),
            ATTR_WEEKDAYS: self._weekdays,
            ATTR_NEXT: nxt.isoformat() if nxt else None,
        }

    # --- Actions ----------------------------------------------------------
    async def async_turn_on(self, **kwargs: Any) -> None:
        self._attr_is_on = True
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._attr_is_on = False
        self.async_write_ha_state()

    async def async_set_time(self, time: dt_time) -> None:
        self._time = time.replace(second=0, microsecond=0)
        self._schedule()
        self.async_write_ha_state()

    async def async_set_weekdays(self, weekdays: list[str]) -> None:
        self._weekdays = [d for d in WEEKDAYS if d in weekdays]
        self.async_write_ha_state()
