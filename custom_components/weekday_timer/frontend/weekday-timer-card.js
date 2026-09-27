// Weekday Timer Card – wird von der Integration automatisch geladen.
const DOMAIN = "weekday_timer";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// 1.1.2024 war ein Montag → lokalisierte Kurzformen ohne Übersetzungstabelle
const dayLabel = (lang, i) =>
  new Date(2024, 0, 1 + i)
    .toLocaleDateString(lang || "de", { weekday: "short" })
    .replace(".", "");

class WeekdayTimerCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("weekday-timer-card-editor");
  }

  static getStubConfig(hass) {
    const id = Object.keys(hass.states).find(
      (e) => e.startsWith("switch.") && Array.isArray(hass.states[e].attributes.weekdays)
    );
    return { entity: id || "" };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Bitte eine Weekday-Timer-Entität wählen");
    this._config = config;
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._els) this._build();
    this._update();
  }

  getCardSize() {
    return 3;
  }

  _call(service, data, domain = DOMAIN) {
    this._hass.callService(domain, service, { entity_id: this._config.entity, ...data });
  }

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        ha-card { padding: 16px; }
        .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .title { display: flex; align-items: center; gap: 12px; min-width: 0; cursor: pointer;
                 font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
        .title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .title ha-icon { color: var(--state-icon-color); flex: none; }
        ha-card.on .title ha-icon { color: var(--state-active-color, var(--primary-color)); }
        .time { display: block; width: 100%; box-sizing: border-box; margin: 12px 0 14px;
                padding: 4px 0; border: none; background: none; outline: none;
                font: inherit; font-size: 52px; font-weight: 300; letter-spacing: -0.02em;
                font-variant-numeric: tabular-nums; text-align: center;
                color: var(--primary-text-color); color-scheme: light dark; cursor: pointer; }
        .time:focus-visible { border-radius: 12px; box-shadow: 0 0 0 2px var(--primary-color); }
        .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .day { height: 40px; border-radius: 20px; border: 1px solid var(--divider-color);
               background: none; color: var(--primary-text-color); font: inherit;
               font-size: 13px; font-weight: 500; cursor: pointer;
               transition: background-color .15s, color .15s, border-color .15s; }
        .day.active { background: var(--primary-color); border-color: var(--primary-color);
                      color: var(--text-primary-color, #fff); }
        .day:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
        .next { margin-top: 12px; text-align: center; font-size: 13px;
                color: var(--secondary-text-color); }
        ha-card:not(.on) .time, ha-card:not(.on) .days { opacity: .4; }
        @media (prefers-reduced-motion: reduce) { .day { transition: none; } }
      </style>
      <ha-card>
        <div class="head">
          <div class="title" role="button" tabindex="0">
            <ha-icon icon="mdi:calendar-clock"></ha-icon><span></span>
          </div>
          <ha-switch></ha-switch>
        </div>
        <input class="time" type="time" aria-label="Uhrzeit">
        <div class="days"></div>
        <div class="next"></div>
      </ha-card>`;

    const $ = (s) => root.querySelector(s);
    this._els = {
      card: $("ha-card"), title: $(".title"), name: $(".title span"),
      toggle: $("ha-switch"), time: $(".time"), days: $(".days"), next: $(".next"),
    };

    this._els.dayButtons = DAYS.map((d, i) => {
      const b = document.createElement("button");
      b.className = "day";
      b.textContent = dayLabel(this._hass?.language, i);
      b.addEventListener("click", () => {
        const cur = this._state()?.attributes.weekdays || [];
        const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
        this._call("set_weekdays", { weekdays: next });
      });
      this._els.days.appendChild(b);
      return b;
    });

    this._els.toggle.addEventListener("change", (ev) =>
      this._call(ev.target.checked ? "turn_on" : "turn_off", {}, "switch")
    );
    this._els.time.addEventListener("change", (ev) => {
      if (ev.target.value) this._call("set_time", { time: ev.target.value });
    });
    const moreInfo = () =>
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: this._config.entity }, bubbles: true, composed: true,
      }));
    this._els.title.addEventListener("click", moreInfo);
    this._els.title.addEventListener("keydown", (e) => e.key === "Enter" && moreInfo());
  }

  _state() {
    return this._hass?.states[this._config?.entity];
  }

  _update() {
    if (!this._els || !this._config) return;
    const st = this._state();
    const e = this._els;
    if (!st) {
      e.name.textContent = `Entität nicht gefunden: ${this._config.entity}`;
      return;
    }
    const a = st.attributes;
    const on = st.state === "on";
    const days = a.weekdays || [];

    e.name.textContent = this._config.name || a.friendly_name || st.entity_id;
    e.card.classList.toggle("on", on);
    e.toggle.checked = on;
    if (this.shadowRoot.activeElement !== e.time) e.time.value = a.time || "";

    e.dayButtons.forEach((b, i) => {
      const active = days.includes(DAYS[i]);
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });

    if (!on) e.next.textContent = "Deaktiviert";
    else if (!days.length) e.next.textContent = "Wähle mindestens einen Tag";
    else if (a.next_trigger) {
      const d = new Date(a.next_trigger);
      e.next.textContent = "Nächste Auslösung " + d.toLocaleString(this._hass.language || "de", {
        weekday: "long", hour: "2-digit", minute: "2-digit",
      });
    } else e.next.textContent = "";
  }
}

class WeekdayTimerCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    this._render();
  }
  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = [
        { name: "entity", required: true,
          selector: { entity: { integration: DOMAIN, domain: "switch" } } },
        { name: "name", selector: { text: {} } },
      ];
      this._form.computeLabel = (s) => ({ entity: "Timer", name: "Name (optional)" })[s.name];
      this._form.addEventListener("value-changed", (ev) => {
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: this._config }, bubbles: true, composed: true,
        }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
  }
}

if (!customElements.get("weekday-timer-card")) {
  customElements.define("weekday-timer-card", WeekdayTimerCard);
  customElements.define("weekday-timer-card-editor", WeekdayTimerCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "weekday-timer-card",
    name: "Weekday Timer",
    description: "Uhrzeit und Wochentage für Automationen einstellen",
    preview: true,
  });
}
