/* HotelManager PRO — Rezerwacje / Dostępność pokoi
 * Plain JS, no build step. State lives in memory; render() redraws the card. */

const ICON = (name, size) => `<img src="assets/icons/${name}.svg" width="${size}" height="${size}" alt="">`;

/* ---------- Data ---------- */

const ROOMS = [
  { no: '101', floor: 1, type: '1-os.',  cap: 1, capLabel: '1 osoba',   price: 180 },
  { no: '102', floor: 1, type: '2-os.',  cap: 2, capLabel: '2 osoby',   price: 250 },
  { no: '103', floor: 1, type: '2-os.+', cap: 4, capLabel: 'do 4 osób', price: 280 },
  { no: '104', floor: 1, type: '1-os.',  cap: 1, capLabel: '1 osoba',   price: 180 },
  { no: '105', floor: 1, type: 'Studio', cap: 3, capLabel: 'do 3 osób', price: 350,
    oos: { from: '2024-12-20', to: '2024-12-30', reason: 'naprawa', note: 'Wymiana kranu' } },
  { no: '201', floor: 2, type: '2-os.',  cap: 2, capLabel: '2 osoby',   price: 250 },
  { no: '202', floor: 2, type: '1-os.',  cap: 1, capLabel: '1 osoba',   price: 180 },
  { no: '203', floor: 2, type: '2-os.+', cap: 4, capLabel: 'do 4 osób', price: 320 },
];
const roomByNo = Object.fromEntries(ROOMS.map(r => [r.no, r]));

let reservations = [
  { id: 'R-0002', name: 'Jan Kowalski', room: '102', from: '2024-12-28', to: '2025-01-02', price: 250, payment: 'Karta', guests: 2,
    phone: '+48 501 234 567', email: 'j.kowalski@example.com', city: 'Warszawa', age: 45, cleaning: 'daily',
    notes: 'Gość życzy sobie śniadanie o 7:30 do pokoju,\nGość poprosił także o rezerwację miesjca parkingowego A5.' },
  { id: 'R-0003', name: 'Anna Nowak', room: '103', from: '2024-12-26', to: '2024-12-28', price: 280, payment: 'Gotówka', guests: 2,
    phone: '+48 602 118 940', email: 'anna.nowak@example.com', city: 'Kraków', age: 38, cleaning: 'daily', notes: '' },
  { id: 'R-0004', name: 'Maria Wiśniewska', room: '104', from: '2024-12-27', to: '2024-12-30', price: 180, payment: 'Faktura', guests: 1,
    phone: '+48 663 410 225', email: 'm.wisniewska@example.com', city: 'Poznań', age: 52, cleaning: 'daily',
    notes: 'Faktura na firmę: Wiśniewska Consulting, NIP 778-123-45-67.' },
  { id: 'R-0006', name: 'Piotr Zieliński', room: '201', from: '2024-12-25', to: '2025-01-03', price: 250, payment: 'Przelew', guests: 2, vip: true,
    phone: '+48 790 300 812', email: 'piotr.zielinski@example.com', city: 'Gdańsk', age: 61, cleaning: 'none',
    notes: 'Stały gość. Prosi o brak sprzątania – ręczniki wymieniać na życzenie.' },
  { id: 'R-0008', name: 'Rodzina Schmidt', room: '203', from: '2024-12-27', to: '2024-12-29', price: 320, payment: 'Karta', guests: 4,
    phone: '+49 151 2345 6789', email: 'schmidt.family@example.de', city: 'Berlin', age: 44, cleaning: 'daily',
    notes: 'Dostawka dla dziecka (łóżeczko).' },
];
const checkedIn = new Set();
const checkedOut = new Set();

/* ---------- State ---------- */

const HOTEL_TODAY = '2024-12-28'; // the demo's "real" today; state.today is the day being viewed

const state = {
  today: HOTEL_TODAY,
  mode: location.hash === '#dostepnosc' ? 'availability' : 'reservations',
  expanded: new Set(['R-0002']),
  noteDraftFor: null,
  search: '',
  filters: { range: 'all', payment: 'all', floor: 'all', type: 'all' }, // range: 'all' | days from today | { from, to }
  avail: { from: '2024-12-28', to: '2024-12-30', guests: 2 }, // criteria being edited in the form
  availQuery: null, // criteria of the last „Sprawdź dostępność”; results are computed only from this
  statsOpen: false,
};

/* ---------- Date & text helpers ---------- */

const D = iso => new Date(iso + 'T00:00:00Z');
const toIso = d => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
const diffDays = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const pad = n => String(n).padStart(2, '0');
const dm = iso => { const d = D(iso); return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`; };
const dmy = iso => `${dm(iso)}.${D(iso).getUTCFullYear()}`;

const DAY_FULL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const DAY_SHORT = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];
const MONTH_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const dow = iso => D(iso).getUTCDay();
const longDate = iso => { const d = D(iso); return `${DAY_FULL[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// Polish plural: one / few (2-4, except 12-14) / many
const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const u = n % 10, t = n % 100;
  return u >= 2 && u <= 4 && !(t >= 12 && t <= 14) ? few : many;
};
const nightsLabel = n => `${n} ${plural(n, 'noc', 'noce', 'nocy')}`;
const zl = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' zł';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const shortName = name => name.startsWith('Rodzina ') ? name : name.replace(/^(\S)\S*\s+/, '$1. ');

/* ---------- Domain logic ---------- */

const isOos = (room, night) => !!room.oos && night >= room.oos.from && night < room.oos.to;
const inServiceRooms = night => ROOMS.filter(r => !isOos(r, night));
const occupiesNight = (r, night) => r.from <= night && night < r.to && !checkedOut.has(r.id);

const roomNightBusy = (roomNo, night, exceptId) =>
  isOos(roomByNo[roomNo], night) || reservations.some(r => r.id !== exceptId && r.room === roomNo && occupiesNight(r, night));

function occupancy(night) {
  const rooms = inServiceRooms(night);
  const occ = rooms.filter(room => reservations.some(r => r.room === room.no && occupiesNight(r, night))).length;
  return { occ, total: rooms.length, pct: rooms.length ? Math.round((occ / rooms.length) * 100) : 0 };
}

function stayStatus(r, T) {
  if (checkedOut.has(r.id)) return { label: 'Wymeldowany', tone: 'neutral', dot: 'dot-muted', action: null };
  if (r.to < T) return { label: `Zakończony ${dm(r.to)}`, tone: 'neutral', dot: 'dot-muted', action: null };
  if (r.from === T && !checkedIn.has(r.id)) return { label: 'Przyjazd dziś', tone: 'sea', dot: 'dot-arrival', action: 'checkin' };
  if (r.from > T) return { label: `Przyjazd ${dm(r.from)}`, tone: 'sea', dot: 'dot-arrival', action: null };
  if (r.to === T) return { label: 'Wyjazd dziś do 14:00', tone: 'amber', dot: 'dot-departure', action: 'checkout' };
  return { label: 'W hotelu', tone: 'olive', dot: 'dot-inhouse', action: null };
}

function roomStatus(r, T) {
  if (r.to < T) return { label: 'Pobyt zakończony', kind: 'muted', dot: 'dot-muted' };
  if (checkedOut.has(r.id) || r.to === T) return { label: 'Sprzątanie po pobycie 16:00', kind: 'cleaning', dot: 'dot-cleaning' };
  if (r.from > T) return { label: 'Oczekuje na przyjazd', kind: 'muted', dot: 'dot-muted' };
  if (r.from === T && !checkedIn.has(r.id)) {
    const turnover = reservations.some(o => o !== r && o.room === r.room && o.to === T && !checkedOut.has(o.id));
    return turnover
      ? { label: 'Gotowy ok. 16:00', kind: 'cleaning', dot: 'dot-cleaning' }
      : { label: 'Pokój gotowy', kind: 'ready', dot: 'dot-ready' };
  }
  return r.cleaning === 'none'
    ? { label: 'Brak sprzątania na życzenie gościa', kind: 'muted', dot: 'dot-muted' }
    : { label: 'Sprzątanie dzienne 15:00', kind: 'cleaning', dot: 'dot-cleaning' };
}

// Selected date filter as inclusive [start, end] days, or null when showing all reservations
function dateRange() {
  const v = state.filters.range;
  if (v === 'all') return null;
  if (typeof v === 'number') return { start: state.today, end: addDays(state.today, v - 1) };
  return { start: v.from, end: v.to };
}

function visibleReservations() {
  const span = dateRange();
  const q = state.search.trim().toLowerCase();
  const f = state.filters;
  return reservations
    .filter(r => !span || (r.to >= span.start && r.from <= span.end))
    .filter(r => f.payment === 'all' || r.payment === f.payment)
    .filter(r => f.floor === 'all' || roomByNo[r.room].floor === Number(f.floor))
    .filter(r => f.type === 'all' || roomByNo[r.room].type === f.type)
    .filter(r => !q || [r.name, r.id, '#' + r.id, r.room].some(v => v.toLowerCase().includes(q)))
    .sort((a, b) => a.room.localeCompare(b.room) || a.from.localeCompare(b.from));
}

// Group a sorted list of nights into "28.12" / "28.12–30.12" spans
function spans(nights) {
  const out = [];
  for (const n of nights) {
    const last = out[out.length - 1];
    if (last && addDays(last.end, 1) === n) last.end = n; else out.push({ start: n, end: n });
  }
  return out;
}
const spanText = list => spans(list).map(s => s.start === s.end ? dm(s.start) : `${dm(s.start)}–${dm(s.end)}`).join(', ');

function evaluateAvailability() {
  const { from: A, to: Dp, guests: g } = state.availQuery;
  const nights = [];
  for (let n = A; n < Dp; n = addDays(n, 1)) nights.push(n);
  const q = state.search.trim().toLowerCase();

  const rows = ROOMS.filter(room => !q || room.no.includes(q) || room.type.toLowerCase().includes(q)).map(room => {
    const occRes = reservations.filter(r => r.room === room.no && !checkedOut.has(r.id) && r.from < Dp && r.to > A);
    const oos = room.oos && room.oos.from < Dp && room.oos.to > A;
    const tooSmall = room.cap < g;
    const busy = nights.filter(n => isOos(room, n) || occRes.some(r => occupiesNight(r, n)));
    const free = nights.filter(n => !busy.includes(n));
    const base = { room, nights: nights.length };

    if (!occRes.length && !oos && !tooSmall) {
      const leaving = reservations.find(r => r.room === room.no && r.to === A && A === state.today && !checkedOut.has(r.id));
      return {
        ...base, cat: 'match',
        chips: [{ label: 'Pasuje', tone: 'olive', dot: 'dot-match' },
          ...(leaving ? [{ label: 'Gotowy ok. 16:00', tone: 'amber' }] : [])],
        note: leaving ? `Wyjazd ${shortName(leaving.name)} do 14:00, sprzątanie, gotowy ok. 16:00` : 'Wolny w całym terminie',
      };
    }
    if (oos) {
      return { ...base, cat: 'oos', rank: 2,
        chips: [{ label: `Wyłączony: ${room.oos.reason} do ${dm(room.oos.to)}`, tone: 'neutral' }], note: room.oos.note };
    }
    if (occRes.length && free.length && !tooSmall) {
      const first = spans(free)[0];
      const notes = occRes.map(r => r.to > A && r.to < Dp ? `${shortName(r.name)} wyjeżdża ${dm(r.to)}` : `${shortName(r.name)} przyjeżdża ${dm(r.from)}`);
      return { ...base, cat: 'partial', rank: 0,
        chips: [{ label: `Zajęty ${spanText(busy)}`, tone: 'red' },
          { label: `Wolny tylko ${spanText(free)} (${nightsLabel(free.length)})`, tone: 'amber' }],
        note: notes.join('; '),
        propose: { from: first.start, to: addDays(first.end, 1), n: diffDays(first.start, addDays(first.end, 1)) } };
    }
    if (occRes.length) {
      const r = occRes[0];
      const label = r.from === state.today ? 'Zajęty od dziś' : r.from <= A ? `Zajęty do ${dm(r.to)}` : `Zajęty od ${dm(r.from)}`;
      let note = shortName(r.name) + (r.vip ? ' (VIP)' : '');
      if (r.from >= A) note += `, ${dm(r.from)} → ${dm(r.to)}`;
      if (tooSmall) note += '; też za mały';
      return { ...base, cat: 'busy', rank: 1, chips: [{ label, tone: 'red' }], note };
    }
    return { ...base, cat: 'small', rank: 3,
      chips: [{ label: `Za mały: ${room.cap} os.`, tone: 'neutral' }],
      note: `Wolny cały termin, ale nie pomieści ${g} ${plural(g, 'osoby', 'osób', 'osób')}` };
  });

  const matches = rows.filter(r => r.cat === 'match');
  const others = rows.filter(r => r.cat !== 'match').sort((a, b) =>
    a.rank - b.rank || (a.cat === 'small' ? b.room.no.localeCompare(a.room.no) : a.room.no.localeCompare(b.room.no)));
  return { matches, others, nights: nights.length };
}

/* ---------- Rendering: header ---------- */

function renderHeader() {
  document.getElementById('dayTitle').textContent = longDate(state.today);

  const btn = document.getElementById('moreStats');
  const pop = document.getElementById('statsPop');
  btn.setAttribute('aria-expanded', state.statsOpen);
  pop.classList.toggle('is-open', state.statsOpen);
  pop.inert = !state.statsOpen;
  if (state.statsOpen) document.getElementById('statsInner').innerHTML = renderStats();
}

/* ---------- Rendering: statistics panel ---------- */

const DAY_CARD = ['Nd', 'Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
const DONUT = { size: 132, stroke: 14.5, gap: 1.5 };

// Ring segments drawn with stroke-dasharray, starting at 12 o'clock (svg is rotated -90°)
function donutSvg(parts) {
  const { size, stroke, gap } = DONUT;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const visible = parts.filter(p => p.value > 0);
  let offset = 0;
  const arcs = visible.map(p => {
    const len = (p.value / total) * c;
    const dash = visible.length > 1 ? Math.max(len - gap, 0) : len;
    const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}"/>`;
    offset += len;
    return arc;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${arcs}</svg>`;
}

function renderStats() {
  const T = state.today;
  const o = occupancy(T);
  const oos = ROOMS.length - o.total;
  const free = o.total - o.occ;
  const live = reservations.filter(r => !checkedOut.has(r.id));
  const arrivals = live.filter(r => r.from === T).length;
  const departures = live.filter(r => r.to === T).length;
  const css = getComputedStyle(document.documentElement);
  const color = name => css.getPropertyValue(name).trim();

  const legend = [
    ['dot-occupied-lg', o.occ, 'Zajęte', `${o.pct}%`],
    ['dot-free-lg', free, 'Wolne', `${o.total ? 100 - o.pct : 0}%`],
    ['dot-oos-lg', oos, plural(oos, 'Wyłączony', 'Wyłączone', 'Wyłączonych'), 'poza sprzedażą'],
  ].map(([dot, n, label, note]) => `<li class="legend__item">${ICON(dot, 10)}
      <span class="legend__count">${n}</span><span class="legend__label">${label}</span><span class="legend__note">${note}</span></li>`).join('');

  const days = [...Array(7)].map((_, i) => {
    const d = addDays(T, i);
    const x = occupancy(d);
    return `<button class="week-day${i === 0 ? ' is-today' : ''}" data-day="${d}" title="Pokaż ${dmy(d)}">
      <span class="week-day__head"><span class="week-day__date">${DAY_CARD[dow(d)]}, ${dm(d)}</span></span>
      <span class="week-day__pct">${x.pct}%</span>
      <span class="week-day__bar"><span class="week-day__fill" style="width:${x.pct}%"></span></span>
      <span class="week-day__frac">${x.occ}/${x.total} zajęte · ${x.total - x.occ} wolne</span>
    </button>`;
  }).join('');

  return `
    <div class="stats-card stats-card--today">
      <h2 class="stats-card__title">Obłożenie dziś</h2>
      <div class="donut-wrap">
        <div class="donut" role="img" aria-label="Zajęte ${o.occ} z ${o.total} pokoi (${o.pct}%)">
          ${donutSvg([
            { value: o.occ, color: color('--chart-occupied') },
            { value: free, color: color('--chart-free') },
            { value: oos, color: color('--chart-oos') },
          ])}
          <div class="donut__label"><span class="donut__pct">${o.pct}%</span><span class="donut__sub">Zajęte</span></div>
        </div>
        <ul class="legend">${legend}</ul>
      </div>
    </div>
    <div class="stats-card stats-card--week">
      <div class="stats-card__head">
        <h2 class="stats-card__title">Obłożenie · najbliższe 7 dni</h2>
        <div class="chips">
          <span class="chip chip--sea">${ICON('dot-arrival', 6)}${arrivals} ${plural(arrivals, 'przyjazd', 'przyjazdy', 'przyjazdów')} dziś</span>
          <span class="chip chip--amber">${ICON('dot-departure', 6)}${departures} ${plural(departures, 'wyjazd', 'wyjazdy', 'wyjazdów')} dziś</span>
          <span class="chip chip--green">${ICON('dot-free', 6)}${free} ${plural(free, 'pokój wolny', 'pokoje wolne', 'pokoi wolnych')} na noc</span>
        </div>
      </div>
      <div class="week">${days}</div>
    </div>`;
}

/* ---------- Rendering: card ---------- */

function modeSwitch() {
  const tab = (id, label) => `<button class="mode-switch__btn" role="tab" data-mode="${id}" data-label="${label}" aria-selected="${state.mode === id}">${label}</button>`;
  return `<div class="mode-switch" role="tablist" aria-label="Widok">
    ${tab('reservations', 'Rezerwacje')}${tab('availability', 'Dostępność pokoi')}
  </div>`;
}
const searchBox = () => `<label class="search">
    ${ICON('search', 16)}
    <input id="search" type="search" placeholder="Szukaj gościa, nr rezerwacji lub pokoju" value="${esc(state.search)}" autocomplete="off">
  </label>`;

const FILTERS = {
  range: { label: 'Daty', options: [['all', 'Wszystkie'], [1, 'Dziś'], [7, 'Najbliższe 7 dni'], [14, 'Najbliższe 14 dni'], ['custom', 'Wybierz zakres…']] },
  payment: { label: 'Płatność', options: [['all', 'Wszystkie'], ['Karta', 'Karta'], ['Gotówka', 'Gotówka'], ['Faktura', 'Faktura'], ['Przelew', 'Przelew']] },
  floor: { label: 'Piętro', options: [['all', 'Wszystkie'], ['1', 'Piętro 1'], ['2', 'Piętro 2']] },
  type: { label: 'Typ pokoju', options: [['all', 'Wszystkie'], ['1-os.', '1-os.'], ['2-os.', '2-os.'], ['2-os.+', '2-os.+'], ['Studio', 'Studio']] },
};
function filterValueLabel(key) {
  const v = state.filters[key];
  if (key === 'range') {
    const span = dateRange();
    return !span ? 'Wszystkie' : span.start === span.end ? dm(span.start) : `${dm(span.start)} – ${dm(span.end)}`;
  }
  return FILTERS[key].options.find(o => o[0] === v)[1];
}
function filterBtn(key) {
  const set = state.filters[key] !== 'all';
  return `<button class="filter${set ? ' is-set' : ''}" data-filter="${key}" aria-haspopup="menu">
    <span class="filter__label">${FILTERS[key].label}:</span>
    <span class="filter__value">${filterValueLabel(key)}</span>
    ${ICON('chev-filter', 14)}
  </button>`;
}

function renderReservations() {
  const list = visibleReservations();
  const T = state.today;
  const rows = list.map(r => {
    const room = roomByNo[r.room];
    const nights = diffDays(r.from, r.to);
    const st = stayStatus(r, T);
    const rs = roomStatus(r, T);
    const open = state.expanded.has(r.id);
    const mainAction = st.action === 'checkin'
      ? `<button class="btn btn--soft" data-act="checkin" data-id="${r.id}">${ICON('login', 16)}Zamelduj</button>`
      : st.action === 'checkout'
        ? `<button class="btn btn--soft" data-act="checkout" data-id="${r.id}">${ICON('logout', 16)}Wymelduj</button>`
        : '';
    return `<div class="res${open ? ' is-open' : ''}" data-res="${r.id}">
      <div class="trow res-grid">
        <div class="cell cell--row cell--guest">
          <button class="expand" data-act="toggle" data-id="${r.id}" aria-expanded="${open}" aria-label="${open ? 'Zwiń' : 'Rozwiń'} szczegóły ${esc(r.name)}">
            ${open ? ICON('chev-up', 16) : ICON('chev-down', 16)}
          </button>
          <div class="cell" style="padding:0">
            <div class="guest-name"><span class="primary">${esc(r.name)}</span>${r.vip ? '<span class="chip chip--plum">VIP</span>' : ''}</div>
            <span class="secondary">#${r.id}${r.guests >= 3 ? ` · ${r.guests} os.` : ''}</span>
          </div>
        </div>
        <div class="cell"><span class="primary">${room.no}</span><span class="secondary">P${room.floor} · ${room.type}</span></div>
        <div class="cell"><span class="chip chip--${st.tone}">${ICON(st.dot, 6)}${st.label}</span></div>
        <div class="cell"><div class="room-status room-status--${rs.kind}">${ICON(rs.dot, 6)}<span>${rs.label}</span></div></div>
        <div class="cell"><span class="primary primary--md">${dm(r.from)} → ${dm(r.to)}</span>
          <span class="secondary">${nightsLabel(nights)} · ${DAY_SHORT[dow(r.from)]}.–${DAY_SHORT[dow(r.to)]}.</span></div>
        <div class="cell"><span class="primary">${zl(nights * r.price)}</span><span class="secondary">${zl(r.price)} / noc</span></div>
        <div class="cell"><span class="primary primary--reg">${r.payment}</span></div>
        <div class="cell actions col-actions">
          <a class="icon-btn" href="tel:${r.phone.replace(/\s/g, '')}" aria-label="Zadzwoń do ${esc(r.name)}">${ICON('phone', 18)}</a>
          <button class="icon-btn" data-act="edit" data-id="${r.id}" aria-label="Edytuj rezerwację ${r.id}">${ICON('pencil', 18)}</button>
          <button class="icon-btn" data-act="delete" data-id="${r.id}" aria-label="Usuń rezerwację ${r.id}">${ICON('trash', 18)}</button>
          ${mainAction}
        </div>
      </div>
      ${open ? renderDetails(r, room, nights) : ''}
    </div>`;
  }).join('');

  return `
    <div class="toolbar toolbar--res">
      <div class="toolbar__row">
        <div class="toolbar__group">${searchBox()}${modeSwitch()}</div>
        <button class="btn btn--outline" id="exportBtn" aria-haspopup="menu">
          ${ICON('download', 16)}Eksport${ICON('chev-export', 16)}
        </button>
      </div>
      <div class="filters">
        ${filterBtn('range')}${filterBtn('payment')}${filterBtn('floor')}${filterBtn('type')}
        <button class="link-btn link-btn--plain" id="clearFilters">Wyczyść filtry</button>
      </div>
    </div>
    <div class="table" role="table" aria-label="Rezerwacje">
      <div class="thead res-grid" role="row">
        <div class="cell col-guest">Gość</div><div class="cell">Pokój</div><div class="cell">Status zakwaterowania</div>
        <div class="cell">Status pokoju</div><div class="cell">Pobyt</div><div class="cell">Kwota</div>
        <div class="cell">Płatność</div><div class="cell col-actions">Akcje</div>
      </div>
      ${rows || '<div class="empty">Brak rezerwacji dla wybranych filtrów.</div>'}
    </div>`;
}

function renderDetails(r, room, nights) {
  const notes = r.notes
    ? `<div class="notes-box">${esc(r.notes)}</div>`
    : `<div class="notes-box notes-box--empty">Brak uwag.</div>`;
  const form = state.noteDraftFor === r.id
    ? `<form class="note-form" data-note-form="${r.id}">
         <input name="note" placeholder="Treść uwagi…" aria-label="Nowa uwaga" required>
         <button class="btn btn--primary" type="submit">Zapisz</button>
         <button class="btn btn--outline" type="button" data-act="cancel-note">Anuluj</button>
       </form>`
    : `<button class="add-note" data-act="add-note" data-id="${r.id}">${ICON('plus-green', 14)}Dodaj uwagę</button>`;
  return `<div class="details">
    <div class="details__section details__section--contact">
      <span class="eyebrow">Kontakt</span>
      <div class="contact-line">${ICON('phone-sm', 16)}<span class="val">${esc(r.phone)}</span>
        <a class="act" href="tel:${r.phone.replace(/\s/g, '')}">Zadzwoń</a></div>
      <div class="contact-line">${ICON('mail', 16)}<span class="val">${esc(r.email)}</span>
        <a class="act" href="mailto:${esc(r.email)}">Napisz</a></div>
      ${r.city ? `<div class="contact-line">${ICON('pin', 16)}<span class="val">${esc(r.city)}</span>
        ${r.age ? `<span class="secondary">${r.age} lat</span>` : ''}</div>` : ''}
    </div>
    <dl class="details__section details__section--booking" style="margin:0">
      <span class="eyebrow">Rezerwacja</span>
      <div class="kv"><dt>Numer</dt><dd>${r.id}</dd></div>
      <div class="kv"><dt>Pokój</dt><dd>${room.no} · Piętro ${room.floor} · ${room.type}</dd></div>
      <div class="kv"><dt>Termin</dt><dd>${DAY_SHORT[dow(r.from)]}. ${dm(r.from)} → ${DAY_SHORT[dow(r.to)]}. ${dm(r.to)} · ${nightsLabel(nights)}</dd></div>
      <div class="kv"><dt>Płatność</dt><dd>${r.payment} · ${zl(nights * r.price)} (${nights} × ${zl(r.price)})</dd></div>
    </dl>
    <div class="details__section details__section--notes">
      <span class="eyebrow">Uwagi</span>
      ${notes}
      ${form}
    </div>
  </div>`;
}

function renderAvailability() {
  const { from, to, guests } = state.avail;
  const nights = diffDays(from, to);
  const valid = nights > 0;
  const query = state.availQuery;
  const res = query ? evaluateAvailability() : null;
  const count = res ? res.matches.length : 0;
  const dirty = query && (query.from !== from || query.to !== to || query.guests !== guests);
  const summary = !res
    ? `<span class="chip chip--neutral">Ustaw termin i liczbę gości, a potem kliknij „Sprawdź dostępność”</span>`
    : (count
      ? `<span class="chip chip--olive">${ICON('dot-match', 6)}${count} ${plural(count, 'pokój pasuje', 'pokoje pasują', 'pokoi pasuje')}</span>`
      : `<span class="chip chip--red">Brak wolnych pokoi w tym terminie</span>`)
      + (dirty ? ` <span class="chip chip--amber">Kryteria zmienione – wyniki dotyczą ${dm(query.from)} → ${dm(query.to)}, ${query.guests} os.</span>` : '');
  const range = query ? `${dm(query.from)} → ${dm(query.to)}` : '';

  const chipHtml = c => `<span class="chip chip--${c.tone}">${c.dot ? ICON(c.dot, 6) : ''}${c.label}</span>`;
  const matchRow = m => `<div class="trow avail-grid avail-row avail-row--match">
      <div class="cell"><span class="primary primary--lg">${m.room.no}</span><span class="secondary">Piętro ${m.room.floor}</span></div>
      <div class="cell"><span class="primary primary--md">${m.room.type}</span><span class="secondary">${m.room.capLabel}</span></div>
      <div class="cell" style="gap:6px"><div class="chips">${m.chips.map(chipHtml).join('')}</div><span class="note">${esc(m.note)}</span></div>
      <div class="cell"><span class="primary primary--reg">${zl(m.room.price)}</span></div>
      <div class="cell"><span class="primary primary--lg">${zl(m.room.price * m.nights)}</span>
        <span class="secondary">${nightsLabel(m.nights)} × ${zl(m.room.price)}</span></div>
      <div class="cell cell--end">
        <button class="btn btn--primary" data-act="book" data-room="${m.room.no}">Zarezerwuj pokój ${m.room.no}${ICON('arrow-right', 16)}</button>
      </div>
    </div>`;
  const offRow = o => `<div class="trow avail-grid avail-row avail-row--off">
      <div class="cell"><span class="room-no">${o.room.no}</span></div>
      <div class="cell"><span class="primary">${o.room.type}</span><span class="secondary">${o.room.capLabel}</span></div>
      <div class="cell" style="gap:6px"><div class="chips" style="gap:6px">${o.chips.map(chipHtml).join('')}</div><span class="note">${esc(o.note)}</span></div>
      <div class="cell"><span class="primary">${zl(o.room.price)}</span></div>
      <div class="cell"><span class="primary">—</span></div>
      <div class="cell cell--end">${o.propose
        ? `<button class="link-btn link-btn--plain" data-act="propose" data-from="${o.propose.from}" data-to="${o.propose.to}">Zaproponuj ${nightsLabel(o.propose.n)}</button>`
        : ''}</div>
    </div>`;

  return `
    <div class="toolbar toolbar--avail">
      <div class="toolbar__row">
        <div class="toolbar__group">${searchBox()}${modeSwitch()}</div>
      </div>
      <form class="criteria" id="availForm">
        <div class="field">
          <label class="field__label" for="availFrom">Przyjazd</label>
          <button type="button" class="field__box" id="availFrom" data-cal="start" aria-haspopup="dialog" aria-expanded="false">
            ${ICON('cal', 16)}<span class="val">${DAY_SHORT[dow(from)]}. ${dmy(from)}</span>
          </button>
        </div>
        <div class="field">
          <label class="field__label" for="availTo">Wyjazd</label>
          <button type="button" class="field__box" id="availTo" data-cal="end" aria-haspopup="dialog" aria-expanded="false">
            ${ICON('cal', 16)}<span class="val">${DAY_SHORT[dow(to)]}. ${dmy(to)}</span>
            ${valid ? `<span class="hint">· ${nightsLabel(nights)}</span>` : ''}
          </button>
        </div>
        <div class="field">
          <span class="field__label" id="guestsLabel">Goście</span>
          <div class="field__box stepper" role="group" aria-labelledby="guestsLabel">
            <button type="button" class="icon-btn icon-btn--sm" data-act="guests" data-step="-1" aria-label="Mniej gości" ${guests <= 1 ? 'disabled' : ''}>${ICON('minus', 16)}</button>
            <span class="val" aria-live="polite">${guests} os.</span>
            <button type="button" class="icon-btn icon-btn--sm" data-act="guests" data-step="1" aria-label="Więcej gości" ${guests >= 6 ? 'disabled' : ''}>${ICON('plus', 16)}</button>
          </div>
        </div>
        <button type="submit" class="btn btn--primary btn--lg">${ICON('search-white', 16)}Sprawdź dostępność</button>
      </form>
      <div class="chips">${summary}</div>
    </div>
    <div class="table" role="table" aria-label="Dostępność pokoi" id="availResults">
      <div class="thead avail-grid" role="row">
        <div class="cell">Pokój</div><div class="cell">Typ i pojemność</div><div class="cell">Dostępność ${range}</div>
        <div class="cell">Cena / noc</div><div class="cell">Suma za pobyt</div><div class="cell"></div>
      </div>
      ${res ? res.matches.map(matchRow).join('') : '<div class="empty">Wyniki pojawią się po kliknięciu „Sprawdź dostępność”.</div>'}
      ${res && res.others.length ? `<div class="divider-row">Niedostępne w terminie ${range}</div>${res.others.map(offRow).join('')}` : ''}
    </div>`;
}

let renderedMode = state.mode;
let cardHeightTimer;
function render() {
  renderHeader();
  const card = document.getElementById('card');
  const switched = renderedMode !== state.mode;
  renderedMode = state.mode;
  const searchFocused = document.activeElement && document.activeElement.id === 'search';
  const caret = searchFocused ? document.activeElement.selectionStart : null;
  // lock the old height, swap content, then animate to the new height
  const prevH = switched ? card.offsetHeight : 0;
  card.innerHTML = state.mode === 'reservations' ? renderReservations() : renderAvailability();
  if (switched) {
    card.classList.remove('view-enter');
    void card.offsetWidth;
    card.classList.add('view-enter');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const nextH = card.offsetHeight;
      card.style.height = prevH + 'px';
      requestAnimationFrame(() => { card.style.height = nextH + 'px'; });
      clearTimeout(cardHeightTimer);
      cardHeightTimer = setTimeout(() => { card.style.height = ''; }, 220);
    }
  }
  if (searchFocused) {
    const s = document.getElementById('search');
    s.focus();
    s.setSelectionRange(caret, caret);
  }
  const noteInput = card.querySelector('.note-form input');
  if (noteInput) noteInput.focus();
}

/* ---------- Calendar (single date / stay range) ----------
 * openCalendar(anchor, { mode: 'single', value, onPick(iso) })
 * openCalendar(anchor, { mode: 'range', from, to, phase: 'start'|'end', min, isBusy(night), onPick({ from, to }) })
 * In range mode `isBusy` marks nights that can't be sold; a stay may end on a busy night (check-out day). */

const MONTH_NOM = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const calEl = document.getElementById('calendar');
let cal = null;

const monthStart = iso => iso.slice(0, 8) + '01';
const addMonths = (iso, n) => { const d = D(monthStart(iso)); d.setUTCMonth(d.getUTCMonth() + n); return toIso(d); };

function openCalendar(anchor, opts) {
  if (cal && cal.anchor === anchor) return closeCalendar();
  closeCalendar();
  closeMenu();
  cal = { mode: 'single', phase: 'start', min: null, isBusy: () => false, hover: null, ...opts, anchor };
  cal.focus = (cal.mode === 'single' ? cal.value : cal.phase === 'end' ? cal.to : cal.from) || HOTEL_TODAY;
  cal.view = monthStart(cal.focus);
  anchor.setAttribute('aria-expanded', 'true');
  calEl.hidden = false;
  drawCalendar();
  placeCalendar();
}

function closeCalendar(restoreFocus) {
  if (!cal) return;
  const { anchor } = cal;
  cal = null;
  calEl.hidden = true;
  calEl.innerHTML = '';
  if (anchor.isConnected) {
    anchor.setAttribute('aria-expanded', 'false');
    if (restoreFocus) anchor.focus();
  }
}

// First unsellable night on/after the chosen arrival; a stay can end on that day at the latest
function rangeLimit() {
  if (cal.mode !== 'range' || cal.phase !== 'end' || !cal.from) return null;
  for (let n = cal.from, i = 0; i < 366; n = addDays(n, 1), i++) if (cal.isBusy(n)) return n;
  return null;
}

function dayState(d, limit) {
  const beforeMin = cal.min && d < cal.min;
  if (cal.mode === 'single') return { disabled: beforeMin, busy: false };
  const busy = cal.isBusy(d);
  if (cal.phase === 'end' && d > cal.from) return { disabled: !!limit && d > limit, busy: false };
  return { disabled: beforeMin || busy, busy };
}

function drawCalendar() {
  const view = D(cal.view);
  const lead = (view.getUTCDay() + 6) % 7; // Monday-first grid
  const first = addDays(cal.view, -lead);
  const limit = rangeLimit();
  const days = [...Array(42)].map((_, i) => {
    const d = addDays(first, i);
    const st = dayState(d, limit);
    const cls = ['cal-day',
      d.slice(0, 7) !== cal.view.slice(0, 7) && 'is-outside',
      d === HOTEL_TODAY && 'is-today',
      st.disabled && 'is-disabled',
      st.busy && 'is-busy'].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-date="${d}" tabindex="${d === cal.focus ? 0 : -1}"
      aria-label="${longDate(d)}${st.busy ? ' – zajęty' : ''}"${st.disabled ? ' aria-disabled="true"' : ''}>${D(d).getUTCDate()}</button>`;
  }).join('');
  const prevOff = cal.min && addMonths(cal.view, -1) < monthStart(cal.min);
  calEl.innerHTML = `
    <div class="calendar__head">
      <button type="button" class="icon-btn icon-btn--sm" data-nav="-1" aria-label="Poprzedni miesiąc"${prevOff ? ' disabled' : ''}>${ICON('chev-left', 16)}</button>
      <span class="calendar__title" aria-live="polite">${MONTH_NOM[view.getUTCMonth()]} ${view.getUTCFullYear()}</span>
      <button type="button" class="icon-btn icon-btn--sm" data-nav="1" aria-label="Następny miesiąc">${ICON('chev-right', 16)}</button>
    </div>
    <div class="calendar__grid">
      ${WEEKDAYS.map(w => `<span class="calendar__wd" aria-hidden="true">${w}</span>`).join('')}
      ${days}
    </div>
    <div class="calendar__foot">${calendarFoot()}</div>`;
  paintSelection();
}

function calendarFoot() {
  if (cal.mode === 'single') {
    return `<span>${longDate(cal.value)}</span>
      <button type="button" class="link-btn" data-date="${HOTEL_TODAY}">Dziś</button>`;
  }
  const end = cal.phase === 'end' ? (cal.hover && cal.hover > cal.from ? cal.hover : null) : cal.to;
  const text = cal.phase === 'end'
    ? end ? `${dm(cal.from)} → ${dm(end)} · <strong>${nightsLabel(diffDays(cal.from, end))}</strong>` : 'Wybierz datę wyjazdu'
    : 'Wybierz datę przyjazdu';
  return `<span>${text}</span>${cal.hasBusy ? '<span class="calendar__legend"><s>12</s> zajęte</span>' : ''}`;
}

// Selection classes are updated in place so hovering doesn't rebuild the grid under the pointer
function paintSelection() {
  const from = cal.mode === 'range' ? cal.from : cal.value;
  let to = cal.mode === 'range' ? cal.to : null;
  if (cal.mode === 'range' && cal.phase === 'end') {
    to = cal.hover && cal.hover > cal.from && !calEl.querySelector(`[data-date="${cal.hover}"]`)?.matches('.is-disabled') ? cal.hover : null;
  }
  const hasRange = !!(to && to > from);
  calEl.querySelectorAll('.cal-day').forEach(b => {
    const d = b.dataset.date;
    const single = cal.mode === 'single' && d === from;
    b.classList.toggle('is-selected', single);
    b.classList.toggle('is-start', cal.mode === 'range' && d === from);
    b.classList.toggle('is-end', hasRange && d === to);
    b.classList.toggle('has-range', hasRange);
    b.classList.toggle('is-in-range', hasRange && d > from && d < to);
    b.setAttribute('aria-pressed', single || (cal.mode === 'range' && (d === from || (hasRange && d === to))));
  });
  if (cal.mode === 'range') calEl.querySelector('.calendar__foot').innerHTML = calendarFoot();
}

function placeCalendar() {
  if (!cal) return;
  const r = cal.anchor.getBoundingClientRect();
  const w = calEl.offsetWidth, h = calEl.offsetHeight;
  const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
  calEl.style.left = `${left}px`;
  calEl.style.top = `${top}px`;
}

function focusDay(iso) {
  cal.focus = iso;
  if (monthStart(iso) !== cal.view) { cal.view = monthStart(iso); drawCalendar(); }
  calEl.querySelectorAll('.cal-day').forEach(b => { b.tabIndex = b.dataset.date === iso ? 0 : -1; });
  calEl.querySelector(`[data-date="${iso}"].cal-day`).focus();
}

function pickDay(d) {
  if (cal.mode === 'single') {
    const { onPick } = cal;
    closeCalendar(true);
    return onPick(d);
  }
  if (cal.phase === 'start' || d <= cal.from) {
    cal.from = d; cal.to = null; cal.phase = 'end'; cal.hover = null; cal.focus = d;
    return drawCalendar();
  }
  const { onPick, from } = cal;
  closeCalendar(true);
  onPick({ from, to: d });
}

calEl.addEventListener('click', e => {
  e.stopPropagation(); // the grid may be redrawn, detaching e.target before the document handler sees it
  const nav = e.target.closest('[data-nav]');
  if (nav) { cal.view = addMonths(cal.view, Number(nav.dataset.nav)); drawCalendar(); return; }
  const day = e.target.closest('[data-date]');
  if (day && !day.matches('.is-disabled')) pickDay(day.dataset.date);
});
calEl.addEventListener('mouseover', e => {
  if (!cal || cal.mode !== 'range' || cal.phase !== 'end') return;
  const day = e.target.closest('.cal-day');
  const hover = day ? day.dataset.date : null;
  if (hover !== cal.hover) { cal.hover = hover; paintSelection(); }
});
calEl.addEventListener('keydown', e => {
  const day = e.target.closest('.cal-day');
  if (e.key === 'Escape') { e.stopPropagation(); return closeCalendar(true); }
  if (!day) return;
  const d = day.dataset.date;
  const wd = (D(d).getUTCDay() + 6) % 7;
  const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -wd, End: 6 - wd }[e.key];
  if (move !== undefined) { e.preventDefault(); return focusDay(addDays(d, move)); }
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault();
    const t = D(d); t.setUTCMonth(t.getUTCMonth() + (e.key === 'PageUp' ? -1 : 1));
    return focusDay(toIso(t));
  }
});
calEl.addEventListener('focusin', e => {
  const day = e.target.closest('.cal-day');
  if (day && cal && cal.mode === 'range' && cal.phase === 'end') { cal.hover = day.dataset.date; paintSelection(); }
});
addEventListener('resize', placeCalendar);
addEventListener('scroll', placeCalendar, true);

// Field showing a stay range; opens the range calendar
const stayText = (from, to) => `${DAY_SHORT[dow(from)]}. ${dmy(from)} → ${DAY_SHORT[dow(to)]}. ${dmy(to)}`;

/* ---------- Menu (dropdowns) ---------- */

const menuEl = document.getElementById('menu');
let menuAnchor = null;
function openMenu(anchor, items, onPick) {
  if (menuAnchor === anchor) return closeMenu();
  menuAnchor = anchor;
  menuEl.innerHTML = items.map((it, i) =>
    `<button class="menu__item" role="menuitemradio" aria-checked="${!!it.checked}" data-i="${i}">${it.label}</button>`).join('');
  const r = anchor.getBoundingClientRect();
  menuEl.style.left = `${r.left + scrollX}px`;
  menuEl.style.top = `${r.bottom + scrollY + 4}px`;
  menuEl.hidden = false;
  menuEl.onclick = e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    closeMenu();
    onPick(items[Number(b.dataset.i)]);
  };
  menuEl.querySelector('.menu__item').focus();
}
function closeMenu() { menuEl.hidden = true; menuAnchor = null; }

/* ---------- Toast ---------- */

const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg, action) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${action.label}</button>` : ''}`;
  toastEl.hidden = false;
  if (action) toastEl.querySelector('button').onclick = () => { action.run(); toastEl.hidden = true; };
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
}

/* ---------- Modal (book / edit) ---------- */

const modalEl = document.getElementById('modal');
const PAYMENTS = ['Karta', 'Gotówka', 'Faktura', 'Przelew'];

// `summary(stay)` returns [label, value] rows; `stay` = { from, to, room, min, exceptId } adds a date-range field
function openModal({ title, sub, summary, stay, values = {}, submitLabel, onSubmit }) {
  modalEl.innerHTML = `<form class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="modal__head"><h2 class="modal__title" id="modalTitle">${title}</h2><p class="modal__sub">${sub}</p></div>
    <div class="modal__body">
      <div class="modal__summary" id="mSummary"></div>
      ${stay ? `<div class="field"><span class="field__label" id="mStayLabel">Termin pobytu</span>
        <button type="button" class="field__box field__box--full" id="mStay" aria-haspopup="dialog" aria-expanded="false"
          aria-labelledby="mStayLabel mStay"></button></div>` : ''}
      <div class="field"><label class="field__label" for="mName">Imię i nazwisko gościa</label>
        <input class="input" id="mName" name="name" required value="${esc(values.name || '')}"></div>
      <div class="row-2">
        <div class="field"><label class="field__label" for="mPhone">Telefon</label>
          <input class="input" id="mPhone" name="phone" type="tel" value="${esc(values.phone || '')}"></div>
        <div class="field"><label class="field__label" for="mPay">Płatność</label>
          <select class="input" id="mPay" name="payment">${PAYMENTS.map(p => `<option${p === values.payment ? ' selected' : ''}>${p}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label class="field__label" for="mMail">E-mail</label>
        <input class="input" id="mMail" name="email" type="email" value="${esc(values.email || '')}"></div>
    </div>
    <div class="modal__foot">
      <button type="button" class="btn btn--outline" data-close>Anuluj</button>
      <button type="submit" class="btn btn--primary">${submitLabel}</button>
    </div>
  </form>`;
  modalEl.hidden = false;
  const form = modalEl.querySelector('form');
  const paint = () => {
    form.querySelector('#mSummary').innerHTML = summary(stay).map(([k, v]) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    if (stay) form.querySelector('#mStay').innerHTML =
      `${ICON('cal', 16)}<span class="val">${stayText(stay.from, stay.to)}</span><span class="hint">· ${nightsLabel(diffDays(stay.from, stay.to))}</span>`;
  };
  paint();
  if (stay) form.querySelector('#mStay').onclick = e => {
    e.stopPropagation();
    openCalendar(e.currentTarget, {
      mode: 'range', from: stay.from, to: stay.to, phase: 'start', min: stay.min, hasBusy: true,
      isBusy: n => roomNightBusy(stay.room, n, stay.exceptId),
      onPick: ({ from, to }) => { stay.from = from; stay.to = to; paint(); },
    });
  };
  form.querySelector('#mName').focus();
  form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    closeModal();
    onSubmit(data, stay);
  };
  modalEl.querySelector('[data-close]').onclick = closeModal;
}
function closeModal() { closeCalendar(); modalEl.hidden = true; modalEl.innerHTML = ''; }
modalEl.addEventListener('mousedown', e => { if (e.target === modalEl) closeModal(); });

function nextId() {
  const max = Math.max(...reservations.map(r => Number(r.id.slice(2))));
  return 'R-' + String(max + 1).padStart(4, '0');
}

function bookRoom(roomNo) {
  const room = roomByNo[roomNo];
  const { guests } = state.availQuery;
  openModal({
    title: `Rezerwacja pokoju ${room.no}`,
    sub: 'Pokój, termin i cena są uzupełnione – termin możesz zmienić w kalendarzu.',
    stay: { from: state.availQuery.from, to: state.availQuery.to, room: room.no, min: HOTEL_TODAY },
    summary: ({ from, to }) => {
      const n = diffDays(from, to);
      return [
        ['Pokój', `${room.no} · Piętro ${room.floor} · ${room.type}`],
        ['Goście', `${guests} os.`],
        ['Cena', `${zl(room.price * n)} (${n} × ${zl(room.price)})`],
      ];
    },
    values: { payment: 'Karta' },
    submitLabel: 'Zarezerwuj',
    onSubmit: (data, { from, to }) => {
      const id = nextId();
      reservations.push({ id, name: data.name.trim(), room: room.no, from, to, price: room.price, payment: data.payment,
        guests, phone: data.phone.trim() || '—', email: data.email.trim() || '—', city: '', age: null, cleaning: 'daily', notes: '' });
      render();
      toast(`Utworzono rezerwację ${id} · pokój ${room.no}`, { label: 'Pokaż', run: () => {
        state.mode = 'reservations'; state.today = from; state.expanded.add(id); syncHash(); render();
      } });
    },
  });
}

function editReservation(id) {
  const r = reservations.find(x => x.id === id);
  const room = roomByNo[r.room];
  openModal({
    title: `Edycja rezerwacji ${r.id}`,
    sub: 'Zmień termin, dane gościa lub formę płatności.',
    stay: { from: r.from, to: r.to, room: r.room, exceptId: r.id },
    summary: ({ from, to }) => {
      const n = diffDays(from, to);
      return [['Pokój', `${room.no} · Piętro ${room.floor} · ${room.type}`], ['Cena', `${zl(r.price * n)} (${n} × ${zl(r.price)})`]];
    },
    values: r,
    submitLabel: 'Zapisz zmiany',
    onSubmit: (data, { from, to }) => {
      Object.assign(r, { name: data.name.trim(), phone: data.phone.trim(), email: data.email.trim(), payment: data.payment, from, to });
      render();
      toast(`Zapisano zmiany w ${r.id}`);
    },
  });
}

/* ---------- Export ---------- */

function exportCsv() {
  const rows = visibleReservations();
  const head = ['Numer', 'Gość', 'Pokój', 'Przyjazd', 'Wyjazd', 'Noce', 'Cena/noc', 'Kwota', 'Płatność', 'Status'];
  const lines = rows.map(r => {
    const n = diffDays(r.from, r.to);
    return [r.id, r.name, r.room, r.from, r.to, n, r.price, n * r.price, r.payment, stayStatus(r, state.today).label];
  });
  const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `rezerwacje-${state.today}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Wyeksportowano ${rows.length} ${plural(rows.length, 'rezerwację', 'rezerwacje', 'rezerwacji')}`);
}

/* ---------- Events ---------- */

const syncHash = () => history.replaceState(null, '', state.mode === 'availability' ? '#dostepnosc' : '#rezerwacje');
function shiftDay(n) { state.today = addDays(state.today, n); render(); }

document.getElementById('prevDay').onclick = () => shiftDay(-1);
document.getElementById('nextDay').onclick = () => shiftDay(1);
document.getElementById('dayPicker').onclick = e => {
  e.stopPropagation();
  openCalendar(e.currentTarget, { mode: 'single', value: state.today, onPick: d => { state.today = d; render(); } });
};
document.getElementById('statsPop').onclick = e => {
  const day = e.target.closest('[data-day]');
  if (day) { state.today = day.dataset.day; render(); }
};
document.getElementById('moreStats').onclick = e => {
  e.stopPropagation();
  state.statsOpen = !state.statsOpen;
  renderHeader();
};

const card = document.getElementById('card');

card.addEventListener('input', e => {
  if (e.target.id === 'search') { state.search = e.target.value; render(); }
});

card.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'availForm') {
    state.availQuery = { ...state.avail };
    render();
    document.getElementById('availResults').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const noteFor = e.target.dataset.noteForm;
  if (noteFor) {
    const r = reservations.find(x => x.id === noteFor);
    const text = new FormData(e.target).get('note').trim();
    if (text) r.notes = r.notes ? `${r.notes}\n${text}` : text;
    state.noteDraftFor = null;
    render();
  }
});

card.addEventListener('click', e => {
  const calBtn = e.target.closest('[data-cal]');
  if (calBtn) {
    e.stopPropagation();
    const { from, to } = state.avail;
    openCalendar(calBtn, { mode: 'range', from, to, phase: calBtn.dataset.cal,
      onPick: range => { Object.assign(state.avail, range); render(); } });
    return;
  }

  const modeBtn = e.target.closest('[data-mode]');
  if (modeBtn) { state.mode = modeBtn.dataset.mode; syncHash(); render(); return; }

  const filter = e.target.closest('[data-filter]');
  if (filter) {
    const key = filter.dataset.filter;
    e.stopPropagation();
    const current = state.filters[key];
    openMenu(filter, FILTERS[key].options.map(([value, label]) => ({
      value, label, checked: value === 'custom' ? typeof current === 'object' : current === value,
    })), it => {
      if (it.value !== 'custom') { state.filters[key] = it.value; render(); return; }
      // wait for this click to finish so the document handler doesn't close the new calendar
      const span = dateRange() || { start: state.today, end: addDays(state.today, 6) };
      setTimeout(() => openCalendar(filter, { mode: 'range', from: span.start, to: span.end, phase: 'start',
        onPick: ({ from, to }) => { state.filters.range = { from, to }; render(); } }));
    });
    return;
  }
  if (e.target.closest('#clearFilters')) {
    state.filters = { range: 'all', payment: 'all', floor: 'all', type: 'all' };
    state.search = '';
    render();
    return;
  }
  const exp = e.target.closest('#exportBtn');
  if (exp) {
    e.stopPropagation();
    openMenu(exp, [{ label: 'Pobierz CSV', run: exportCsv }, { label: 'Drukuj listę', run: () => print() }], it => it.run());
    return;
  }

  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const r = id && reservations.find(x => x.id === id);
  switch (btn.dataset.act) {
    case 'toggle':
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      if (state.noteDraftFor === id) state.noteDraftFor = null;
      render();
      break;
    case 'checkin':
      checkedIn.add(id); render(); toast(`${r.name} zameldowany w pokoju ${r.room}`);
      break;
    case 'checkout':
      checkedOut.add(id); render();
      toast(`${r.name} wymeldowany z pokoju ${r.room}`, { label: 'Cofnij', run: () => { checkedOut.delete(id); render(); } });
      break;
    case 'edit':
      editReservation(id);
      break;
    case 'delete': {
      const idx = reservations.indexOf(r);
      reservations.splice(idx, 1);
      state.expanded.delete(id);
      render();
      toast(`Usunięto rezerwację ${id}`, { label: 'Cofnij', run: () => { reservations.splice(idx, 0, r); render(); } });
      break;
    }
    case 'add-note':
      state.noteDraftFor = id; render();
      break;
    case 'cancel-note':
      state.noteDraftFor = null; render();
      break;
    case 'guests':
      state.avail.guests = Math.min(6, Math.max(1, state.avail.guests + Number(btn.dataset.step)));
      render();
      break;
    case 'propose':
      state.avail.from = btn.dataset.from;
      state.avail.to = btn.dataset.to;
      state.availQuery = { ...state.avail };
      render();
      toast(`Zmieniono termin na ${dm(state.avail.from)} → ${dm(state.avail.to)}`);
      break;
    case 'book':
      bookRoom(btn.dataset.room);
      break;
  }
});

document.addEventListener('click', e => {
  if (!menuEl.hidden && !menuEl.contains(e.target)) closeMenu();
  if (cal && !calEl.contains(e.target)) closeCalendar();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (cal) closeCalendar(true);
  else if (!modalEl.hidden) closeModal();
  else if (!menuEl.hidden) closeMenu();
  else if (state.statsOpen) { state.statsOpen = false; renderHeader(); }
});
window.addEventListener('hashchange', () => {
  state.mode = location.hash === '#dostepnosc' ? 'availability' : 'reservations';
  render();
});

render();
