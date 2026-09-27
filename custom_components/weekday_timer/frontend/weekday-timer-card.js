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
    return 2;
  }

  _call(service, data, domain = DOMAIN) {
    this._hass.callService(domain, service, { entity_id: this._config.entity, ...data });
  }

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        ha-card { padding: 12px 16px; }
        .row { display: flex; align-items: center; gap: 12px; }
        .icon { flex: none; color: var(--state-icon-color); }
        ha-card.on .icon { color: var(--state-active-color, var(--primary-color)); }
        .info { flex: 1; min-width: 0; cursor: pointer; }
        .name, .next { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .name { font-size: 16px; color: var(--primary-text-color); }
        .next { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px; }

        /* Zeitfeld im Stil des HA-Uhrzeit-Eingabefelds */
        .tf { flex: none; display: flex; align-items: flex-end; gap: 6px;
              padding: 6px 12px 5px; border-radius: 4px 4px 0 0;
              background: var(--mdc-text-field-fill-color, var(--secondary-background-color));
              border-bottom: 1px solid var(--mdc-text-field-idle-line-color, var(--secondary-text-color));
              transition: border-color .15s; }
        .tf:focus-within { border-bottom: 2px solid var(--primary-color); padding-bottom: 4px; }
        .seg { display: flex; flex-direction: column; }
        .seg span { font-size: 11px; line-height: 14px; color: var(--secondary-text-color); }
        .tf:focus-within .seg:focus-within span { color: var(--primary-color); }
        .seg input { width: 2.4ch; padding: 0; border: none; outline: none; background: none;
                     font: inherit; font-size: 16px; line-height: 22px; text-align: right;
                     font-variant-numeric: tabular-nums; color: var(--primary-text-color); }
        .colon { color: var(--secondary-text-color); line-height: 22px; }

        .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 12px; }
        .day { height: 32px; border-radius: 16px; border: 1px solid var(--divider-color);
               background: none; color: var(--primary-text-color); font: inherit;
               font-size: 12px; font-weight: 500; cursor: pointer; padding: 0;
               transition: background-color .15s, color .15s, border-color .15s; }
        .day.active { background: var(--primary-color); border-color: var(--primary-color);
                      color: var(--text-primary-color, #fff); }
        .day:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
        ha-card:not(.on) .tf, ha-card:not(.on) .days { opacity: .45; }
        @media (prefers-reduced-motion: reduce) { .day, .tf { transition: none; } }
      </style>
      <ha-card>
        <div class="row">
          <ha-icon class="icon" icon="mdi:calendar-clock"></ha-icon>
          <div class="info" role="button" tabindex="0">
            <div class="name"></div>
            <div class="next"></div>
          </div>
          <div class="tf">
            <label class="seg"><span>hh</span>
              <input class="hh" inputmode="numeric" maxlength="2" aria-label="Stunden"></label>
            <span class="colon">:</span>
            <label class="seg"><span>mm</span>
              <input class="mm" inputmode="numeric" maxlength="2" aria-label="Minuten"></label>
          </div>
          <ha-switch></ha-switch>
        </div>
        <div class="days"></div>
      </ha-card>`;

    const $ = (s) => root.querySelector(s);
    this._els = {
      card: $("ha-card"), info: $(".info"), name: $(".name"), next: $(".next"),
      toggle: $("ha-switch"), hh: $(".hh"), mm: $(".mm"), days: $(".days"),
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

    const { hh, mm } = this._els;
    [[hh, 23], [mm, 59]].forEach(([inp, max]) => {
      inp.addEventListener("focus", () => inp.select());
      inp.addEventListener("input", () => {
        inp.value = inp.value.replace(/\D/g, "").slice(0, 2);
        if (inp === hh && inp.value.length === 2) mm.focus();
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") inp.blur();
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const v = (parseInt(inp.value, 10) || 0) + (e.key === "ArrowUp" ? 1 : -1);
          inp.value = String((v + max + 1) % (max + 1)).padStart(2, "0");
          this._commitTime();
          inp.select();
        }
      });
      inp.addEventListener("change", () => this._commitTime());
    });

    const moreInfo = () =>
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: this._config.entity }, bubbles: true, composed: true,
      }));
    this._els.info.addEventListener("click", moreInfo);
    this._els.info.addEventListener("keydown", (e) => e.key === "Enter" && moreInfo());
  }

  _commitTime() {
    const clamp = (v, max) => Math.min(max, Math.max(0, parseInt(v, 10) || 0));
    const h = String(clamp(this._els.hh.value, 23)).padStart(2, "0");
    const m = String(clamp(this._els.mm.value, 59)).padStart(2, "0");
    this._els.hh.value = h;
    this._els.mm.value = m;
    const time = `${h}:${m}`;
    if (time !== this._state()?.attributes.time) this._call("set_time", { time });
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

    const active = this.shadowRoot.activeElement;
    if (active !== e.hh && active !== e.mm && a.time) {
      const [h, m] = a.time.split(":");
      e.hh.value = h;
      e.mm.value = m;
    }

    e.dayButtons.forEach((b, i) => {
      const isOn = days.includes(DAYS[i]);
      b.classList.toggle("active", isOn);
      b.setAttribute("aria-pressed", String(isOn));
    });

    if (!on) e.next.textContent = "Deaktiviert";
    else if (!days.length) e.next.textContent = "Kein Tag ausgewählt";
    else if (a.next_trigger) {
      e.next.textContent = "Nächste: " + new Date(a.next_trigger).toLocaleString(
        this._hass.language || "de", { weekday: "short", hour: "2-digit", minute: "2-digit" });
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
