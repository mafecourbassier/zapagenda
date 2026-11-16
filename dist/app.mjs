import { icon } from "./assets/icons.mjs";
import {
  segments, money, dayKey, formatDay, timeLabel, timeValue, isFree,
  suggestPlan, sampleData, restoreDemo, resolveRoute, bookingMessage, businessHours, availableSlots,
} from "./model.mjs";

const header = document.querySelector("#header");
const main = document.querySelector("#main");
const footer = document.querySelector("#footer");
const dialog = document.querySelector("#dialog");
const dialogContent = document.querySelector("#dialog-content");
const transition = document.querySelector("#transition");
const notice = document.querySelector("#notice");
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const storageKey = "zapagenda:prototype:v1";
let state = readState();
let route = "";
let panelSegment = resolveRoute(location.hash).split("/")[0] || "barbearia";
let routeSequence = 0;
let slideTimer;
let noticeTimer;
let activeDialog;
let previousFocus;

function readState() {
  try {
    return restoreDemo(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    // Private browsing and invalid demo data fall back to the examples.
  }
  return sampleData();
}


const isPanel = path => path.endsWith("/painel");
const isClient = path => path.endsWith("/cliente");
let browserClientId;

function customerId() {
  try {
    browserClientId = localStorage.getItem("zapagenda:demo-customer") || browserClientId || crypto.randomUUID();
    localStorage.setItem("zapagenda:demo-customer", browserClientId);
  } catch {
    browserClientId ||= crypto.randomUUID();
  }
  return browserClientId;
}

function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // The current tab can still run the demo in memory.
  }
}

const safe = value => String(value).replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
);

function brand() {
  return `<a href="#/" class="brand" aria-label="ZapAgenda, por Contrabarra — início">
    <span class="brand-mark">${icon("bolt", 19)}</span><span class="brand-wordmark">Zap<span class="brand-accent">Agenda</span><small>POR CONTRABARRA</small></span>
  </a>`;
}

function navLink(path, label) {
  return `<a href="#/${path}" ${route === path || (path && route === `${path}/painel`) ? 'aria-current="page"' : ""}>${label}</a>`;
}

function renderFrame() {
  const key = route.split("/")[0];
  const segment = segments[key];
  const panelLink = segment && !isPanel(route) && !isClient(route)
    ? `<a class="button nav-action" href="#/${key}/painel" aria-label="Sou profissional">${icon("calendar", 16)} <span>Sou profissional</span></a>`
    : "";
  header.innerHTML = `<div class="frame nav-shell">
    ${brand()}
    <nav aria-label="Navegação principal">
      ${navLink("", "Início")}
      ${Object.entries(segments).map(([segmentKey, item]) => navLink(segmentKey, item.label)).join("")}
    </nav>
    ${panelLink}
  </div>`;
  footer.innerHTML = `<div class="frame footer-shell">${brand()}<p>Startup Challenge UMC · Mogi das Cruzes</p></div>`;
}

function homeCard(key, segment) {
  return `<a class="segment-card segment-card--${key}" href="#/${key}" aria-label="Entrar em ${segment.label}">
    <img src="./assets/${segment.image}" alt="" width="1200" height="800" fetchpriority="high">
    <div class="card-shade"></div>
    <div class="segment-card-copy">
      <span class="segment-label">${icon(segment.icon, 15)} ${segment.label}</span>
      <h2>${segment.cardHeadline}</h2><p>${segment.cardDescription}</p>
    </div>
    <span class="card-arrow">${icon("diagonal", 24)}</span>
  </a>`;
}

function renderHome() {
  main.innerHTML = `<section class="home-hero frame">
    <div class="hero-copy reveal">
      <p class="intro-tag"><span></span> CONTRABARRA · STARTUP CHALLENGE UMC</p>
      <h1>Sua agenda,<br><em>seu estilo.</em></h1>
      <p class="hero-lede">Reserve seu horário ou encontre um encaixe no seu lugar favorito.</p>
    </div>
    <div class="segment-grid reveal">${Object.entries(segments).map(([key, segment]) => homeCard(key, segment)).join("")}</div>
  </section>`;
}


const agendaSelected = new Map();

const agendaWeeks = 8;

const agendaWeekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

function agendaKey(key, staff) {
  return (staff ? "painel:" : "cliente:") + key;
}

function agendaDay(key, staff) {
  return agendaSelected.get(agendaKey(key, staff)) || dayKey(staff ? 0 : 1);
}

function renderAgendaWeek(key, staff) {
  const selected = agendaDay(key, staff);
  const days = Array.from({ length: agendaWeeks * 7 + (staff ? 7 : 0) }, (_, index) => dayKey(index + (staff ? -7 : 1)));
  const first = Math.floor(Math.max(0, days.indexOf(selected)) / 7) * 7;
  const data = state[key];
  const client = staff ? null : customerId();
  const bookings = data.appointments.filter(item =>
    item.status === "booked" && (staff || item.clientId === client)
  );
  const requests = data.requests.filter(item =>
    item.status === "waiting" && item.clientId && (staff || item.clientId === client)
  );
  const cells = days.slice(first, first + 7).map(date => {
    const label = agendaWeekday.format(new Date(date + "T12:00:00Z")).replace(".", "");
    const booked = bookings.filter(item => item.date === date).length;
    const waiting = requests.filter(item => item.date === date).length;
    return `<button type="button" data-agenda-day="${date}" aria-pressed="${date === selected}"
      aria-label="${safe(formatDay(date))}, ${booked} na agenda, ${waiting} na fila">
      <span>${label}</span><strong>${Number(date.slice(-2))}</strong>
      <small>${booked} ag. · ${waiting} fila</small></button>`;
  }).join("");
  const count = requests.filter(item =>
    item.date === selected && item.offer?.expires > Date.now()
  ).length;
  const offers = count ? ` · ${count} ${staff ? "em oferta" : "para responder"}` : "";
  return `<section class="panel agenda-week" aria-label="Calendário">
    <div class="agenda-week-head"><div><h2>${staff ? "Calendário de atendimentos" : "Meu calendário"}</h2>
    <p>${safe(formatDay(selected))}${offers}</p></div>
    <div class="agenda-week-nav">
      <button type="button" data-agenda-day="${days[first - 7] ?? ""}" aria-label="Semana anterior" ${first ? "" : "disabled"}>‹</button>
      <button type="button" data-agenda-day="${days[first + 7] ?? ""}" aria-label="Próxima semana" ${days[first + 7] ? "" : "disabled"}>›</button>
    </div></div>
    <div class="agenda-week-grid">${cells}</div>
  </section>`;
}

function firstFutureMinute(date) {
  const today = dayKey(0);
  if (date < today) return 1440;
  if (date > today) return 0;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() + 1;
}

function offerReleasedAppointment(key, data, appointment) {
  const now = Date.now();
  const services = segments[key].services;
  const durationFor = request =>
    services.find(service => service.id === request.serviceId)?.duration ?? 0;
  const queue = data.requests.filter(item =>
    item.status === "waiting" && item.clientId && item.date === appointment.date
  );
  const pending = queue.filter(item => item.offer?.expires > now);

  for (const request of queue) {
    const duration = durationFor(request);
    if (!duration || request.offer?.expires > now) continue;

    const earliest = Math.max(appointment.start, request.start, firstFutureMinute(appointment.date));
    const latest = Math.min(appointment.end, request.end);
    for (let start = earliest; start + duration <= latest; start++) {
      const end = start + duration;
      const overlapsOffer = pending.some(item =>
        start < item.offer.start + durationFor(item) && item.offer.start < end
      );
      if (overlapsOffer || !isFree(data.appointments, appointment.date, start, end, businessHours[key])) {
        continue;
      }
      request.offer = { gapId: crypto.randomUUID(), start, expires: now + 5 * 60_000 };
      return;
    }
  }
}

function renderAgendaGap(data, segment) {
  const key = panelSegment;
  const date = agendaDay(key, true);
  const freeMinutes = new Set();

  for (const item of data.appointments) {
    if (item.date !== date || !["canceled", "cancelled"].includes(item.status)) continue;
    for (let minute = Math.max(item.start, firstFutureMinute(date)); minute < item.end; minute++) {
      if (isFree(data.appointments, date, minute, minute + 1, businessHours[key])) {
        freeMinutes.add(minute);
      }
    }
  }

  const ranges = [];
  for (const minute of [...freeMinutes].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last?.end === minute) last.end++;
    else ranges.push({ start: minute, end: minute + 1 });
  }

  const reopens = ranges.length
    ? `<div class="agenda-gap-empty"><strong>Horários reabertos</strong><p>${
        ranges.map(item => `${timeLabel(item.start)}–${timeLabel(item.end)}`).join(" · ")
      }</p></div>`
    : "";
  if (data.gap?.date === date) {
    const requests = data.requests.filter(item =>
      item.clientId && !(item.status === "waiting" && item.offer?.expires > Date.now())
    );
    return reopens + renderGap({ ...data, requests }, segment);
  }
  return reopens + `<div class="agenda-gap-empty">
    ${ranges.length ? "" : "<p>Nenhum horário reaberto por cancelamento neste dia.</p>"}
    <button type="button" class="button button-secondary" data-agenda-gap>Informar horário</button>
  </div>`;
}

function onAgendaClick(event) {
  const target = event.target;
  if (target.closest?.("[data-agenda-gap]") && isPanel(route)) {
    showGapForm();
    return;
  }
  const date = target.closest?.("[data-agenda-day]")?.dataset.agendaDay;
  const staff = isPanel(route);
  if (!date || (!staff && !isClient(route))) return;
  agendaSelected.set(agendaKey(panelSegment, staff), date);
  if (staff) renderDashboard();
  else renderClient(panelSegment);
  document.querySelector('.agenda-week [aria-pressed="true"]')?.focus();
}

document.addEventListener("click", onAgendaClick);

function canFinishVisit(item) {
  const now = new Date();
  const today = dayKey(0);
  const minute = now.getHours() * 60 + now.getMinutes();
  return item?.status === "booked" &&
    (item.date < today || (item.date === today && item.start <= minute));
}

function renderFinishVisit(id) {
  const item = state[panelSegment].appointments.find(visit => visit.id === id);
  if (!item || item.status !== "booked") return "";
  const disabled = canFinishVisit(item)
    ? ""
    : 'disabled title="Disponível a partir do horário marcado"';
  return ` <button type="button" class="button button-secondary" data-visit-finish="${safe(id)}" ${disabled}>Marcar realizado</button>`;
}

function serviceTitle(service) {
  return safe(service?.name ?? service?.label ?? "Atendimento");
}

function renderClientVisits(key) {
  const date = agendaDay(key, false);
  const client = customerId();
  const visits = state[key].appointments.filter(item => item.clientId === client);
  const booked = visits.filter(item => item.date === date && item.status === "booked")
    .sort((a, b) => a.start - b.start);
  const history = visits.filter(item => ["completed", "canceled", "cancelled"].includes(item.status))
    .sort((a, b) => b.date.localeCompare(a.date) || b.start - a.start);

  const row = item => {
    const service = segments[key].services.find(entry => entry.id === item.serviceId);
    const duration = service?.duration ?? item.end - item.start;
    const label = item.status === "booked" ? "Confirmado"
      : item.status === "completed" ? "Realizado" : "Cancelado";

    return `<li class="za-visit">
      <time datetime="${item.date}T${timeLabel(item.start)}">${timeLabel(item.start)}</time>
      <div><strong>${serviceTitle(service)}</strong>
      <small>${safe(formatDay(item.date))}${duration > 0 ? ` · ${duration} min` : ""}</small></div>
      <span class="za-chip">${label}</span></li>`;
  };

  return `<section class="panel za-client" data-space="${safe(key)}">
    <div class="panel-head"><h2>Meus agendamentos</h2></div>
    <div class="za-content">
      ${booked.length ? `<ul class="za-list">${booked.map(row).join("")}</ul>` :
        `<p class="za-empty">Sem reservas confirmadas em ${safe(formatDay(date))}.</p>`}
      ${history.length ? `<details class="za-history"><summary>Histórico <span>${history.length}</span></summary>
        <ul class="za-list">${history.map(row).join("")}</ul></details>` : ""}
    </div>
  </section>`;
}

function renderClientQueue(key) {
  const client = customerId();
  const now = Date.now();
  const pending = state[key].requests.filter(item =>
    item.clientId === client && item.status === "waiting"
  ).sort((a, b) => Number(b.offer?.expires > now) - Number(a.offer?.expires > now));

  const cards = pending.map(item => {
    const service = segments[key].services.find(entry => entry.id === item.serviceId);
    const live = item.offer?.expires > now;
    const label = live ? "Horário oferecido" : item.offer ? "Oferta expirada · na fila" : "Na fila";
    const range = live ? timeLabel(item.offer.start) : `${timeLabel(item.start)}–${timeLabel(item.end)}`;
    const expires = live ? new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(new Date(item.offer.expires)) : "";

    return `<article class="za-request ${live ? "za-request-live" : ""}">
      <span class="za-chip">${label}</span><strong>${serviceTitle(service)}</strong>
      <small>${safe(formatDay(item.date))} · ${range}</small>
      ${live ? `<small>Disponível até ${expires}</small>
        <button type="button" class="button button-primary" data-action="client-offer"
          data-id="${safe(item.id)}">Aceitar horário</button>` : ""}
    </article>`;
  }).join("");

  return `<section class="panel za-client" data-space="${safe(key)}">
    <div class="panel-head"><h2>Meus encaixes</h2></div>
    <div class="za-content">${cards || '<p class="za-empty">Nenhum pedido na fila.<br>Quando você pedir um encaixe, acompanhe a resposta aqui.</p>'}</div>
  </section>`;
}

function renderPublicGap(key) {
  const data = state[key];
  const gap = data.gap;
  if (!gap || gap.date < dayKey(1) || gap.date > dayKey(agendaWeeks * 7)) return "";

  const services = segments[key].services.filter(item => item.duration > 0);
  const minimum = Math.min(...services.map(item => item.duration));
  const ranges = [];
  let start = gap.start;
  for (let minute = gap.start; minute <= gap.end; minute++) {
    if (minute < gap.end && isFree(data.appointments, gap.date, minute, minute + 1, businessHours[key])) continue;
    if (minute - start >= minimum) ranges.push([start, minute]);
    start = minute + 1;
  }
  if (!ranges.length) return "";

  const choices = services.filter(service => ranges.some(([start, end]) => end - start >= service.duration));
  return `<section class="panel za-client za-spot" data-space="${safe(key)}" aria-label="Encaixe disponível">
    <div>
      <h2>Encaixe disponível</h2>
      <p>${safe(formatDay(gap.date))}</p>
      <div class="za-ranges">${ranges.map(([start, end]) =>
        `<strong>${timeLabel(start)}–${timeLabel(end)}</strong>`).join("")}</div>
    </div>
    <div class="za-choices">
      <h3>Serviços que cabem nessa janela</h3>
      ${choices.map(service => `<button type="button" class="za-choice"
        data-public-gap="${gap.date}" data-gap-service="${safe(service.id)}">
        <span><strong>${serviceTitle(service)}</strong><small>${service.duration} min</small></span>
        <span aria-hidden="true">→</span></button>`).join("")}
    </div>
  </section>`;
}

function onVisitAction(event) {
  const target = event.target;
  const id = target.closest?.("[data-visit-finish]")?.dataset.visitFinish;
  if (id && isPanel(route)) {
    const item = state[panelSegment].appointments.find(visit => visit.id === id);
    if (canFinishVisit(item)) {
      item.status = "completed";
      redraw("Atendimento marcado como realizado.");
    }
    return;
  }
  const date = target.closest?.("[data-public-gap]")?.dataset.publicGap;
  if (date && isClient(route)) {
    agendaSelected.set(agendaKey(panelSegment, false), date);
    renderClient(panelSegment);
    showBooking(panelSegment, target.closest("[data-public-gap]").dataset.gapService || undefined, date);
  }
}

document.addEventListener("click", onVisitAction);

function renderClient(key) {
  const segment = segments[key];
  const data = state[key];
  const own = item => item.clientId === customerId();
  const reservations = data.appointments.filter(item => item.date === agendaDay(key, false)).filter(own).map(item =>
    '<li class="appointment">' + formatDay(item.date) + ' · ' + timeLabel(item.start) +
    ' · ' + statuses[item.status] + '</li>').join("");
  const requests = data.requests.filter(item => own(item) && item.status === "waiting").map(item => {
    const offer = item.offer;
    const live = offer?.expires > Date.now();
    const service = segment.services.find(entry => entry.id === item.serviceId);
    const description = safe(service?.name ?? "Serviço") + ' · ' + formatDay(item.date) +
      ' · ' + timeLabel(item.start) + '–' + timeLabel(item.end);
    const offerButton = live
      ? '<button class="button tiny-button" data-action="client-offer" data-id="' +
        safe(item.id) + '">Ver oferta de encaixe</button>'
      : '<span>Em espera</span>';
    return '<li class="appointment"><div class="appointment-info">' +
      description + '</div>' + offerButton + '</li>';
  }).join("");
  main.innerHTML = `<section class="frame dashboard">
    <div class="dashboard-intro"><div>
      <p class="segment-eyebrow">${segment.studio}</p>
      <h1>Área do cliente<span>.</span></h1>
      <p>Agende um horário e acompanhe seus pedidos de encaixe.</p>
    </div><button class="button button-primary" data-action="book" data-segment="${key}">Agendar horário</button></div>
    ${renderPublicGap(key)}
${renderAgendaWeek(key, false)}
<div class="dashboard-grid">
      ${renderClientVisits(key)}
${renderClientQueue(key)}
    </div>
  </section>`;
}

function renderSegment(key) {
  const segment = segments[key];
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${segment.district}, Mogi das Cruzes, SP`)}`;
  main.innerHTML = `<section class="segment-hero ${key}-hero">
    <img class="segment-hero-image" src="./assets/${segment.image}" alt="${segment.imageAlt}" width="1200" height="800" fetchpriority="high">
    <div class="hero-veil"></div>
    <div class="frame segment-hero-shell">
      <div class="segment-hero-copy reveal">
        <p class="segment-eyebrow">${segment.eyebrow}</p>
        <h1>${segment.headline[0]}<br><em>${segment.headline[1]}</em></h1>
        <p>${segment.description}</p>
        <div class="hero-actions">
          <a class="button button-primary" href="#/${key}/cliente">Sou cliente ${icon("arrow", 20)}</a>
        </div>
      </div>
      <div class="studio-caption"><span></span><strong>${segment.studio}</strong> <small>Estabelecimento fictício</small></div>
    </div>
  </section>
  <section class="frame service-section" aria-labelledby="services-title">
    <div class="section-head"><h2 id="services-title">Escolha seu serviço.</h2><span>Valores de demonstração</span></div>
    <div class="services-grid">${segment.services.map(service => `<article class="service-card">
      <div class="service-symbol">${icon(service.icon, 23)}</div><h3>${service.name}</h3><p>${service.description}</p>
      <div class="service-meta"><span>${icon("clock", 15)} ${service.duration} min</span><strong>${money(service.price)}</strong></div>
      <a class="button service-button" href="#/${key}/cliente">Ver horários ${icon("arrow", 16)}</a>
    </article>`).join("")}</div>
  </section>
  <section class="space-section" aria-labelledby="space-title">
    <div class="frame space-layout">
      <div class="space-copy">
        <p class="segment-eyebrow">O ESPAÇO</p>
        <h2 id="space-title">${segment.introTitle}</h2>
        <p>${segment.intro}</p>
        <p class="image-caption">Imagens conceituais do espaço.</p>
      </div>
      <div class="space-gallery">
        <img class="gallery-room" src="./assets/${segment.gallery}" alt="${segment.galleryAlt}" width="1200" height="800" loading="lazy">
        <img class="gallery-detail" src="./assets/${segment.image}" alt="${segment.imageAlt}" width="1200" height="800" loading="lazy">
      </div>
    </div>
  </section>
  <section class="frame feedback-section" aria-labelledby="feedback-title">
    <div class="section-head">
      <h2 id="feedback-title">Como seria a experiência.</h2><span>Depoimentos fictícios</span>
    </div>
    <div class="feedback-grid">${segment.feedback.map(quote => `<figure class="feedback-card"><span aria-hidden="true">“</span><blockquote>${quote}</blockquote></figure>`).join("")}</div>
  </section>
  <section class="frame visit-section" aria-labelledby="visit-title">
    <div>
      <p class="segment-eyebrow">LOCALIZAÇÃO DE DEMONSTRAÇÃO</p>
      <h2 id="visit-title">${segment.district}, Mogi das Cruzes.</h2>
      <p>Unidade fictícia · Janela da agenda ${segment.hours}</p>
    </div>
    <div class="visit-actions">
      <a class="button button-outline" href="${mapUrl}" target="_blank" rel="noopener noreferrer">Ver bairro no mapa ${icon("diagonal", 17)}</a>
      <a class="button button-primary" href="#/${key}/cliente">Área do cliente ${icon("arrow", 19)}</a>
    </div>
  </section>`;
}

const statuses = { booked: "Confirmado", canceled: "Cancelado", completed: "Realizado" };

function renderAppointment(appointment, segment) {
  const service = segment.services.find(item => item.id === appointment.serviceId);
  const cancel = appointment.status === "booked" && !appointment.recovered;
  const complete = appointment.status === "booked" && appointment.recovered;
  return `<li class="appointment">
    <time>${timeLabel(appointment.start)}<small>${formatDay(appointment.date)}</small></time>
    <div class="appointment-info"><strong>${safe(appointment.name)}</strong><span>${service.name} · ${service.duration} min</span></div>
    <span class="status status-${appointment.status}">${statuses[appointment.status]}</span>
    ${cancel ? `<button class="button tiny-button" data-action="cancel" data-id="${appointment.id}" aria-label="Cancelar atendimento de ${safe(appointment.name)}">Cancelar</button>${renderFinishVisit(appointment.id)}` : ""}
    ${complete ? `${renderFinishVisit(appointment.id)}` : ""}
  </li>`;
}

function renderGap(data, segment) {
  if (!data.gap) return `<div class="empty-slot">
    <span class="service-symbol">${icon("spark", 25)}</span>
    <h3>Abriu uma vaga?</h3>
    <p>Cancele um atendimento de exemplo ou informe um horário livre para buscar encaixes.</p>
    <button class="button button-primary" data-action="gap">${icon("plus", 17)} Informar horário livre</button>
  </div>`;
  const { gap } = data;
  const plan = suggestPlan({ gap, requests: data.requests, appointments: data.appointments, services: segment.services, hours: businessHours[panelSegment] });
  const accepted = data.appointments.filter(appointment => appointment.recovered && appointment.gapId === gap.id);
  const total = plan.reduce((sum, entry) => sum + entry.service.duration, 0);
  const filled = accepted.reduce((sum, entry) => sum + entry.end - entry.start, 0) === gap.end - gap.start;
  return `<div class="gap-content">
    <div class="gap-time"><span>${formatDay(gap.date)} · Janela de encaixe</span><strong>${timeLabel(gap.start)} – ${timeLabel(gap.end)}</strong></div>
    ${plan.length ? `<p class="gap-note">${total} min podem ser preenchidos</p>
      <ul class="plan-list">${plan.map(entry => `<li>
        <span class="slot-bar"></span><div><strong>${safe(entry.request.name)}</strong><small>${timeLabel(entry.start)} · ${entry.service.name} · ${entry.service.duration} min</small></div>
        <button class="button tiny-button" data-action="offer" data-id="${entry.request.id}" data-start="${entry.start}">Gerar oferta</button>
      </li>`).join("")}</ul>` : `<p class="gap-note">${filled ? "Horário preenchido." : "Nenhum encaixe disponível nesta faixa."}</p>`}
    ${accepted.length ? `<p class="accepted-summary">${icon("check", 17)} ${accepted.length} ${accepted.length === 1 ? "oferta aceita" : "ofertas aceitas"}</p>` : ""}
    <button class="button button-outline" data-action="gap">Informar outro horário ${icon("arrow", 16)}</button>
  </div>`;
}


function renderWaitingList(data, segment) {
  const waiting = data.requests.filter(item => item.status === "waiting");
  const rows = waiting.map(item => {
    const service = segment.services.find(entry => entry.id === item.serviceId);
    return '<li><strong>' + safe(item.name) + '</strong> · ' + safe(service?.name ?? "Serviço") +
      ' · ' + formatDay(item.date) + ' · ' + timeLabel(item.start) + '–' + timeLabel(item.end) + '</li>';
  }).join("");
  return '<details class="waiting-agenda"><summary>Lista de espera (' + waiting.length +
    ')</summary><ul>' + (rows || '<li>Nenhum pedido em espera.</li>') + '</ul></details>';
}

function renderDashboard() {
  const segment = segments[panelSegment];
  const data = state[panelSegment];
  const booked = data.appointments.filter(item => item.status === "booked").length;
  const completed = data.appointments.filter(item => item.recovered && item.status === "completed");
  const recovered = completed.reduce((sum, item) => sum + item.price, 0);
  const waiting = data.requests.filter(item => item.status === "waiting" && item.clientId).length;
  const appointments = data.appointments.filter(item => item.date === agendaDay(panelSegment, true)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  main.innerHTML = `<section class="frame dashboard">
    <div class="dashboard-intro">
      <div><p class="intro-tag"><span></span> AMBIENTE DE DEMONSTRAÇÃO</p><h1>${segment.panelTitle}<span>.</span></h1>
      <p>${segment.studio} · Agenda, lista de espera e encaixes.</p></div>
      <a href="#/${panelSegment}" class="button button-outline">Ver página do espaço ${icon("diagonal", 18)}</a>
    </div>
    <div class="metrics">
      <article>${icon("calendar", 21)}<div><p>Horários marcados</p><strong>${booked}</strong></div></article>
      <article>${icon("users", 21)}<div><p>Na lista de espera</p><strong>${waiting}</strong></div></article>
      <article>${icon("chart", 21)}<div><p>Valor dos encaixes realizados</p><strong>${money(recovered)}</strong></div></article>
    </div>
    ${renderAgendaWeek(panelSegment, true)}
<div class="dashboard-grid">
      <section class="panel" aria-labelledby="agenda-titulo">
        <div class="panel-head"><h2 id="agenda-titulo">Agenda</h2></div>
        <ul class="appointment-list">${appointments.map(appointment => renderAppointment(appointment, segment)).join("")}</ul>
        ${renderWaitingList({ ...data, requests: data.requests.filter(item => item.clientId && item.date === agendaDay(panelSegment, true)) }, segment)}
      </section>
      <section class="panel" aria-labelledby="encaixe-titulo">
        <div class="panel-head"><h2 id="encaixe-titulo">Preencher vaga</h2>${icon("bolt", 23)}</div>
        ${renderAgendaGap(data, segment)}
      </section>
    </div>
    <section class="messages-panel" aria-labelledby="mensagens-titulo">
      <div class="service-symbol">${icon("phone", 24)}</div>
      <div><h2 id="mensagens-titulo">WhatsApp assistido</h2><p>Monte a confirmação ou o lembrete. Você copia e envia para o cliente.</p></div>
      <button class="button button-outline" data-action="messages" ${booked ? "" : "disabled"}>Preparar mensagem ${icon("arrow", 17)}</button>
    </section>
    <div class="dashboard-foot"><p>Dados fictícios deste segmento, salvos neste navegador.</p></div>
  </section>`;
}

function paint(next) {
  route = next;
  const key = next.split("/")[0];
  if (key) panelSegment = key;
  document.body.dataset.theme = key || "home";
  document.title = key
    ? `${isPanel(next) ? segments[key].panelTitle : segments[key].title} — ZapAgenda`
    : "ZapAgenda — Sua agenda, seu estilo.";
  renderFrame();
  if (isPanel(next)) renderDashboard();
  else if (isClient(next)) renderClient(key);
  else if (next) renderSegment(next);
  else renderHome();
}

function refreshRoute(animate) {
  const target = resolveRoute(location.hash, panelSegment);
  if (location.hash === "#/painel") history.replaceState(null, "", `#/${target}`);
  if (animate && target === route) return;
  const sequence = ++routeSequence;
  clearTimeout(slideTimer);
  if (dialog.open) dialog.close();
  const show = () => {
    if (sequence !== routeSequence) return;
    paint(target);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (animate) main.focus({ preventScroll: true });
  };
  if (!animate || motion.matches) {
    transition.className = "screen-transition";
    show();
    return;
  }
  transition.className = "screen-transition";
  transition.dataset.next = target.split("/")[0] || "home";
  void transition.offsetWidth;
  transition.classList.add("playing");
  slideTimer = setTimeout(show, 370);
}

function showNotice(message) {
  clearTimeout(noticeTimer);
  notice.innerHTML = `${icon("check", 19)} <span>${safe(message)}</span>`;
  notice.classList.add("show");
  noticeTimer = setTimeout(() => notice.classList.remove("show"), 3300);
}

function modal(title, intro, contents) {
  if (!dialog.open) previousFocus = document.activeElement;
  dialogContent.innerHTML = `<div class="modal-heading"><h2 id="dialog-title">${title}</h2>
    <button class="icon-button" type="button" data-action="close" aria-label="Fechar janela">${icon("close", 21)}</button>
  </div><p class="modal-intro">${intro}</p>${contents}`;
  if (!dialog.open) dialog.showModal();
  dialog.setAttribute("aria-labelledby", "dialog-title");
}

function serviceOptions(segment, serviceId) {
  return segment.services.map(service => `<option value="${service.id}" ${service.id === serviceId ? "selected" : ""}>${service.name} · ${service.duration} min · ${money(service.price)}</option>`).join("");
}

function dateOptions(selected = dayKey(1)) {
  return Array.from({ length: agendaWeeks * 7 }, (_, index) => dayKey(index + 1))
    .map(date => `<option value="${date}" ${date === selected ? "selected" : ""}>${formatDay(date, { weekday: "long", day: "numeric", month: "long" })}</option>`).join("");
}


function slotOptions(key, date, serviceId) {
  const service = segments[key].services.find(item => item.id === serviceId);
  return availableSlots(state[key].appointments, date, service.duration, businessHours[key])
    .map(start => '<option value="' + start + '">' + timeLabel(start) + "</option>").join("");
}

function refreshBookingOptions(form, key) {
  const { date, service, start } = form.elements;
  const previous = start.value;
  start.innerHTML = slotOptions(key, date.value, service.value);
  const waiting = start.options.length === 0;
  if (waiting) start.add(new Option("Sem horários disponíveis", ""));
  else if ([...start.options].some(option => option.value === previous)) start.value = previous;

  const button = form.querySelector('button[type="submit"], [data-action="join-wait"]');
  start.disabled = waiting;
  const waitLink = form.querySelector("[data-wait-link]");
  if (waitLink) waitLink.hidden = waiting;
  button.type = waiting ? "button" : "submit";
  if (waiting) button.dataset.action = "join-wait";
  else delete button.dataset.action;
  button.innerHTML = waiting ? "Continuar para lista de espera" : 'Confirmar reserva ' + icon("arrow", 19);
}

function showBooking(key, serviceId = segments[key].services[0].id, date = dayKey(1), name = "") {
  if (isPanel(route)) return;
  activeDialog = { kind: "book", key };
  const segment = segments[key];
  const slots = slotOptions(key, date, serviceId);
  modal("Reserve seu horário", `Demonstração do ${segment.studio}. Use um nome fictício.`, `<form id="booking-form">
    <label>Serviço<select name="service" required>${serviceOptions(segment, serviceId)}</select></label>
    <div class="fields-two"><label>Dia<select name="date" required>${dateOptions(date)}</select></label>
    <label>Horário<select name="start" required>${slots || '<option value="">Sem horários</option>'}</select></label></div>
    <label>Seu nome<input name="name" value="${safe(name)}" placeholder="Ex.: Alex" maxlength="45" required autocomplete="off"></label>
    <p class="form-error" role="alert"></p>
    <button class="button button-primary full" type="submit">Confirmar reserva ${icon("arrow", 19)}</button>
    ${isClient(route) ? '<button class="text-button" type="button" data-action="join-wait" data-wait-link>Nenhum desses horários serve</button>' : ""}
  </form>`);
  refreshBookingOptions(dialogContent.querySelector("#booking-form"), key);
}

function showWaiting(key, serviceId, date, name) {
  activeDialog = { kind: "wait", key };
  modal("Quero um encaixe", "Escolha um serviço e indique quando você pode ir. Use um nome fictício.", `<form id="wait-form">
    <label>Serviço<select name="service" required>${serviceOptions(segments[key], serviceId)}</select></label>
    <label>Dia<select name="date" required>${dateOptions(date)}</select></label>
    <div class="fields-two"><label>Disponível a partir de<input name="start" type="time" value="14:00" required></label>
    <label>Disponível até<input name="end" type="time" value="17:00" required></label></div>
    <label>Seu nome<input name="name" value="${safe(name)}" placeholder="Ex.: Alex" maxlength="45" required autocomplete="off"></label>
    <p class="form-error" role="alert"></p>
    <button class="button button-primary full" type="submit">Entrar na lista ${icon("arrow", 19)}</button>
  </form>`);
}

function showGapForm() {
  activeDialog = { kind: "gap", key: panelSegment };
  modal("Informe uma vaga", "A lista de espera será consultada para esse intervalo.", `<form id="gap-form">
    <label>Dia<select name="date" required>${dateOptions(agendaDay(panelSegment, true))}</select></label>
    <div class="fields-two"><label>Início<input name="start" type="time" value="14:00" required></label>
    <label>Fim<input name="end" type="time" value="15:30" required></label></div>
    <p class="form-error" role="alert"></p>
    <button class="button button-primary full" type="submit">Buscar encaixes ${icon("arrow", 19)}</button>
  </form>`);
}


function showOffer(id, start) {
  const key = panelSegment;
  const data = state[key];
  const request = data.requests.find(item => item.id === id && item.status === "waiting");
  const service = segments[key].services.find(item => item.id === request?.serviceId);
  if (!request || !service || !data.gap) return;
  const end = start + service.duration;
  const { gap } = data;
  if (request.date !== gap.date || start < Math.max(gap.start, request.start) ||
      end > Math.min(gap.end, request.end) ||
      !isFree(data.appointments, request.date, start, end, businessHours[key])) {
    return showNotice("O horário mudou. Confira os encaixes sugeridos.");
  }
  request.offer = { gapId: gap.id, start, expires: Date.now() + 5 * 60_000 };
  redraw(request.clientId ? "Oferta disponível na área do cliente." : "Oferta gerada para um pedido de exemplo.");
}

function showClientOffer(id) {
  if (!isClient(route)) return;
  const key = panelSegment;
  const data = state[key];
  const request = data.requests.find(item => item.id === id &&
    item.status === "waiting" && item.clientId === customerId());
  const offer = request?.offer;
  if (!offer || offer.expires <= Date.now()) {
    renderClient(key);
    return showNotice("Esta oferta já venceu ou foi substituída.");
  }
  activeDialog = { kind: "offer", key, id, ...offer };
  modal("Aceitar encaixe", formatDay(request.date) + " às " + timeLabel(offer.start),
    '<p class="form-error" role="alert"></p>' +
    '<button class="button button-primary full" data-action="accept">Aceitar horário</button>');
}

function showMessages() {
  const key = panelSegment;
  const appointments = state[key].appointments
    .filter(item => item.status === "booked")
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  if (!appointments.length) return;
  activeDialog = { kind: "messages", key };
  modal("Preparar mensagem", "Escolha um horário. Copie o texto e envie pelo WhatsApp do estabelecimento.", `<div class="message-form" id="message-form">
    <label>Agendamento<select name="appointment">
      ${appointments.map(item => `<option value="${safe(item.id)}">${safe(item.name)} · ${formatDay(item.date)} · ${timeLabel(item.start)}</option>`).join("")}
    </select></label>
    <label>Tipo de mensagem<select name="kind"><option value="reminder">Lembrete</option><option value="confirmation">Confirmação</option></select></label>
    <label>Mensagem <textarea name="text" rows="5" readonly></textarea></label>
    <button class="button button-primary full" data-action="copy-message">Copiar mensagem ${icon("link", 18)}</button>
    <p class="message-feedback" role="status"></p>
  </div>`);
  updateMessage(dialogContent.querySelector("#message-form"));
}

function updateMessage(form) {
  const appointment = state[activeDialog.key].appointments.find(item => item.id === form.querySelector('[name="appointment"]').value && item.status === "booked");
  const kind = form.querySelector('[name="kind"]').value;
  form.querySelector("textarea").value = appointment ? bookingMessage(kind, appointment, segments[activeDialog.key].studio) : "";
  form.querySelector(".message-feedback").textContent = appointment ? "" : "Esse agendamento já não está disponível.";
  form.querySelector('[data-action="copy-message"]').disabled = !appointment;
}

async function copyMessage() {
  const message = dialogContent.querySelector("#message-form textarea");
  const feedback = dialogContent.querySelector(".message-feedback");
  if (!message?.value || !feedback) return;
  try {
    await navigator.clipboard.writeText(message.value);
    feedback.textContent = "Mensagem copiada. Cole na conversa com o cliente.";
  } catch {
    message.focus();
    message.select();
    feedback.textContent = "O texto está selecionado. Use Ctrl+C ou a opção Copiar.";
  }
}

function redraw(message) {
  saveState();
  if (dialog.open) dialog.close();
  if (isPanel(route)) renderDashboard();
  if (isClient(route)) renderClient(panelSegment);
  showNotice(message);
}

function acceptOffer() {
  if (activeDialog?.kind !== "offer") return;
  const { key, id, start, gapId, expires } = activeDialog;
  const data = state[key];
  const request = data.requests.find(item => item.id === id);
  const service = segments[key].services.find(item => item.id === request?.serviceId);
  const end = start + (service?.duration ?? 0);
  if (Date.now() > expires || request?.status !== "waiting" || request?.offer?.gapId !== gapId || request?.offer?.start !== start || request.offer?.expires !== expires ||
      start < request.start || end > request.end ||
      !isFree(data.appointments, request.date, start, end, businessHours[key])) {
    dialogContent.querySelector(".form-error").textContent = "Esta oferta expirou ou o horário foi ocupado.";
    return;
  }
  request.status = "accepted";
  data.appointments.push({ id: crypto.randomUUID(), name: request.name, serviceId: service.id,
    date: request.date, start, end, price: service.price, status: "booked", recovered: true, gapId, clientId: request.clientId });
  redraw("Encaixe reservado.");
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, segment, service, id, start } = button.dataset;
  
  if (action === "book") {
    const date = isPanel(route) || isClient(route)
      ? agendaDay(segment || panelSegment, isPanel(route))
      : undefined;
    showBooking(segment, service, date);
  }

  if (action === "join-wait") {
    const { key } = activeDialog;
    const { service, date, name } = dialogContent.querySelector("#booking-form").elements;
    showWaiting(key, service.value, date.value, name.value);
  }
  if (action === "close") dialog.close();
  if (action === "gap") showGapForm();
  if (action === "offer") showOffer(id, Number(start));
  if (action === "client-offer") showClientOffer(id);
  if (action === "accept" && isClient(route)) acceptOffer();
  if (action === "messages") showMessages();
  if (action === "copy-message") void copyMessage();
  if (action === "cancel" || action === "complete") {
    const data = state[panelSegment];
    const appointment = data.appointments.find(item => item.id === id);
    if (appointment?.status !== "booked") return;
    if (action === "cancel") {
      appointment.status = "canceled";
  offerReleasedAppointment(panelSegment, state[panelSegment], appointment);
      data.gap = { id: crypto.randomUUID(), date: appointment.date, start: appointment.start, end: appointment.end };
      redraw("Horário liberado para encaixes.");
    } else {
      appointment.status = "completed";
      redraw("Atendimento concluído.");
    }
  }

});

document.addEventListener("change", event => {
  const messageForm = event.target.closest("#message-form");
  if (messageForm) {
    updateMessage(messageForm);
    return;
  }
  const form = event.target.closest("#booking-form");
  if (!form || !["date", "service"].includes(event.target.name)) return;
  refreshBookingOptions(form, activeDialog.key);
});

document.addEventListener("submit", event => {
  const form = event.target;
  if (!form.closest("#dialog") || !activeDialog) return;
  event.preventDefault();
  const { key, kind } = activeDialog;
  const fields = new FormData(form);
  const date = fields.get("date");
  const service = segments[key]?.services.find(item => item.id === fields.get("service"));
  const name = (fields.get("name") ?? "").trim();
  const start = kind === "book" ? Number(fields.get("start")) : timeValue(fields.get("start"));
  const end = kind === "book" ? start + service.duration : timeValue(fields.get("end"));
  const fail = message => { form.querySelector(".form-error").textContent = message; };
  const data = state[key];
  if (end <= start) return fail("Escolha um horário final posterior ao inicial.");
  if (kind !== "gap" && !name) return fail("Informe um nome para continuar.");
  if (kind === "book") {
    if (!fields.get("start") || !isFree(data.appointments, date, start, end, businessHours[key])) { refreshBookingOptions(form, key); return fail("A disponibilidade mudou. Confira as opções atualizadas."); }
    data.appointments.push({ id: crypto.randomUUID(), name, serviceId: service.id, price: service.price, date, start, end, status: "booked", clientId: isClient(route) ? customerId() : null });
    redraw("Reserva confirmada na demonstração.");
  }
  if (kind === "wait") {
    if (end - start < service.duration) return fail("Esse período é menor que o tempo do serviço escolhido.");
    
    const hours = businessHours[key];
    const request = { id: crypto.randomUUID(), name, serviceId: service.id, date, start, end, status: "waiting", clientId: isClient(route) ? customerId() : null };
    if (start < hours.start || end > hours.end ||
        !suggestPlan({ gap: { date, start, end }, requests: [request], appointments: [], services: [service], hours }).length) {
      return fail("Informe um período comercial que comporte o serviço fora das pausas.");
    }
    if (availableSlots(data.appointments, date, service.duration, hours)
      .some(slot => slot >= start && slot + service.duration <= end)) {
      return showBooking(key, service.id, date, name);
    }
    data.requests.push(request);
    redraw("Você entrou na lista de espera da demonstração.");
  }
  if (kind === "gap") {
    if (!isFree(data.appointments, date, start, end, businessHours[key])) return fail("Escolha um intervalo livre dentro do expediente e fora das pausas.");
    data.gap = { id: crypto.randomUUID(), date, start, end };
    redraw("Sugestões de encaixe atualizadas.");
  }
});

dialog.addEventListener("click", event => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener("close", () => {
  activeDialog = null;
  if (previousFocus?.isConnected) previousFocus.focus();
  else main.focus({ preventScroll: true });
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#main") return;
  refreshRoute(true);
});
document.querySelector(".skip-link").addEventListener("click", event => {
  event.preventDefault();
  main.focus();
});
window.addEventListener("storage", event => {
  if (event.key !== storageKey) return;
  state = readState();
  if (isPanel(route) && !dialog.open) renderDashboard();
  if (isClient(route) && !dialog.open) renderClient(panelSegment);
  if (activeDialog?.kind === "messages" && dialog.open) updateMessage(dialogContent.querySelector("#message-form"));
});
refreshRoute(false);
