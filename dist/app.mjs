import { icon } from "./assets/icons.mjs";
import { segments, money, dayKey, formatDay, timeLabel, timeValue, isFree, suggestPlan, sampleData } from "./model.mjs";

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
let panelSegment = Object.hasOwn(segments, location.hash.slice(2)) ? location.hash.slice(2) : "barbearia";
let routeSequence = 0;
let slideTimer;
let noticeTimer;
let activeDialog;
let previousFocus;

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.barbearia?.appointments && saved?.manicure?.appointments) return saved;
  } catch {
    // Private browsing and invalid demo data fall back to the examples.
  }
  return sampleData();
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
  return `<a href="#/" class="brand" aria-label="ZapAgenda — início">
    <span class="brand-mark">${icon("bolt", 19)}</span><span>Zap<span class="brand-accent">Agenda</span></span>
  </a>`;
}

function navLink(path, label) {
  return `<a href="#/${path}" ${route === path ? 'aria-current="page"' : ""}>${label}</a>`;
}

function renderFrame() {
  header.innerHTML = `<div class="frame nav-shell">
    ${brand()}
    <nav aria-label="Navegação principal">
      ${navLink("", "Início")}
      ${navLink("barbearia", "Barbearia")}
      ${navLink("manicure", "Manicure")}
    </nav>
    <a class="button nav-action ${route === "painel" ? "active" : ""}" href="#/painel">${icon("calendar", 16)} <span>Painel<span class="nav-extra"> do negócio</span></span></a>
  </div>`;
  footer.innerHTML = `<div class="frame footer-shell">${brand()}<p>Projeto Contrabarra · Startup Challenge UMC</p>
    <a href="#/painel">Painel do negócio ${icon("diagonal", 15)}</a></div>`;
}

function homeCard(key, segment) {
  const headline = key === "barbearia" ? "Estilo em cada corte." : "Seu momento de cuidado.";
  const description = key === "barbearia" ? "Reserve cortes, barba e combos." : "Agende esmaltação, manutenção ou alongamento.";
  return `<a class="segment-card segment-card--${key}" href="#/${key}" aria-label="Entrar em ${segment.label}">
    <img src="./assets/${segment.image}" alt="" width="1200" height="800" fetchpriority="high">
    <div class="card-shade"></div>
    <div class="segment-card-copy">
      <span class="segment-label">${icon(key === "barbearia" ? "scissors" : "spark", 15)} ${segment.label}</span>
      <h2>${headline}</h2><p>${description}</p>
    </div>
    <span class="card-arrow">${icon("diagonal", 24)}</span>
  </a>`;
}

function renderHome() {
  main.innerHTML = `<section class="home-hero frame">
    <div class="hero-copy reveal">
      <p class="intro-tag"><span></span> AGENDAMENTOS E ENCAIXES</p>
      <h1>Sua agenda,<br><em>seu estilo.</em></h1>
      <p class="hero-lede">Reserve seu horário ou encontre um encaixe no seu lugar favorito.</p>
    </div>
    <div class="segment-grid reveal">${Object.entries(segments).map(([key, segment]) => homeCard(key, segment)).join("")}</div>
  </section>
  <section class="business-strip frame">
    <div><h2>Abriu um horário?</h2><p>Veja quem pode encaixar e acompanhe os atendimentos que voltaram para a agenda.</p></div>
    <a class="button button-outline" href="#/painel">Experimentar o painel ${icon("arrow", 18)}</a>
  </section>`;
}

function renderSegment(key) {
  const segment = segments[key];
  const other = key === "barbearia" ? "manicure" : "barbearia";
  main.innerHTML = `<section class="segment-hero ${key}-hero">
    <img class="segment-hero-image" src="./assets/${segment.image}" alt="${segment.imageAlt}" width="1200" height="800" fetchpriority="high">
    <div class="hero-veil"></div>
    <div class="frame segment-hero-shell">
      <a href="#/" class="return-link">${icon("back", 17)} Explorar espaços</a>
      <div class="segment-hero-copy reveal">
        <p class="segment-eyebrow">${segment.eyebrow}</p>
        <h1>${segment.headline[0]}<br><em>${segment.headline[1]}</em></h1>
        <p>${segment.description}</p>
        <div class="hero-actions">
          <button class="button button-primary" data-action="book" data-segment="${key}">Reservar horário ${icon("arrow", 20)}</button>
          <button class="button button-ghost" data-action="wait" data-segment="${key}">Quero um encaixe</button>
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
      <button class="button service-button" data-action="book" data-segment="${key}" data-service="${service.id}">Ver horários ${icon("arrow", 16)}</button>
    </article>`).join("")}</div>
    <div class="switch-section"><a href="#/${other}" class="button button-outline">Conhecer ${segments[other].label} ${icon("diagonal", 18)}</a></div>
  </section>`;
}

const statuses = { booked: "Marcado", canceled: "Cancelado", completed: "Realizado" };

function renderAppointment(appointment, segment) {
  const service = segment.services.find(item => item.id === appointment.serviceId);
  const cancel = appointment.status === "booked" && !appointment.recovered;
  const complete = appointment.status === "booked" && appointment.recovered;
  return `<li class="appointment">
    <time>${timeLabel(appointment.start)}<small>${formatDay(appointment.date)}</small></time>
    <div class="appointment-info"><strong>${safe(appointment.name)}</strong><span>${service.name} · ${service.duration} min</span></div>
    <span class="status status-${appointment.status}">${statuses[appointment.status]}</span>
    ${cancel ? `<button class="button tiny-button" data-action="cancel" data-id="${appointment.id}" aria-label="Cancelar atendimento de ${safe(appointment.name)}">Cancelar</button>` : ""}
    ${complete ? `<button class="button tiny-button confirm-button" data-action="complete" data-id="${appointment.id}">Concluir</button>` : ""}
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
  const plan = suggestPlan({ gap, requests: data.requests, appointments: data.appointments, services: segment.services });
  const accepted = data.appointments.filter(appointment => appointment.recovered && appointment.gapId === gap.id);
  const total = plan.reduce((sum, entry) => sum + entry.service.duration, 0);
  const filled = accepted.reduce((sum, entry) => sum + entry.end - entry.start, 0) === gap.end - gap.start;
  return `<div class="gap-content">
    <div class="gap-time"><span>${formatDay(gap.date)} · Janela de encaixe</span><strong>${timeLabel(gap.start)} – ${timeLabel(gap.end)}</strong></div>
    ${plan.length ? `<p class="gap-note">${total} min podem ser preenchidos</p>
      <ul class="plan-list">${plan.map(entry => `<li>
        <span class="slot-bar"></span><div><strong>${safe(entry.request.name)}</strong><small>${timeLabel(entry.start)} · ${entry.service.name} · ${entry.service.duration} min</small></div>
        <button class="button tiny-button" data-action="offer" data-id="${entry.request.id}" data-start="${entry.start}">Ver oferta</button>
      </li>`).join("")}</ul>` : `<p class="gap-note">${filled ? "Horário preenchido." : "Nenhum encaixe disponível nesta faixa."}</p>`}
    ${accepted.length ? `<p class="accepted-summary">${icon("check", 17)} ${accepted.length} ${accepted.length === 1 ? "oferta aceita" : "ofertas aceitas"}</p>` : ""}
    <button class="button button-outline" data-action="gap">Informar outro horário ${icon("arrow", 16)}</button>
  </div>`;
}

function renderDashboard() {
  const segment = segments[panelSegment];
  const data = state[panelSegment];
  const booked = data.appointments.filter(item => item.status === "booked").length;
  const completed = data.appointments.filter(item => item.recovered && item.status === "completed");
  const recovered = completed.reduce((sum, item) => sum + item.price, 0);
  const waiting = data.requests.filter(item => item.status === "waiting").length;
  const appointments = [...data.appointments].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  main.innerHTML = `<section class="frame dashboard">
    <div class="dashboard-intro">
      <div><p class="intro-tag"><span></span> AMBIENTE DE DEMONSTRAÇÃO</p><h1>Painel do negócio<span>.</span></h1>
      <p>Experimente abrir uma vaga, preencher o horário e concluir o atendimento.</p></div>
      <a href="#/${panelSegment}" class="button button-outline">Ver página de reserva ${icon("diagonal", 18)}</a>
    </div>
    <div class="dashboard-switch" aria-label="Filtrar por segmento">
      ${Object.entries(segments).map(([key, item]) => `<button class="button" type="button" data-action="panel-segment" data-segment="${key}" aria-pressed="${panelSegment === key}">${icon(key === "barbearia" ? "scissors" : "spark", 17)} ${item.label}</button>`).join("")}
    </div>
    <div class="metrics">
      <article>${icon("calendar", 21)}<div><p>Horários marcados</p><strong>${booked}</strong></div></article>
      <article>${icon("users", 21)}<div><p>Na lista de espera</p><strong>${waiting}</strong></div></article>
      <article>${icon("chart", 21)}<div><p>Valor dos encaixes realizados</p><strong>${money(recovered)}</strong></div></article>
    </div>
    <div class="dashboard-grid">
      <section class="panel" aria-labelledby="agenda-titulo">
        <div class="panel-head"><h2 id="agenda-titulo">Agenda</h2><button class="button button-outline tiny-button" data-action="book" data-segment="${panelSegment}">${icon("plus", 15)} Nova reserva</button></div>
        <ul class="appointment-list">${appointments.map(appointment => renderAppointment(appointment, segment)).join("")}</ul>
      </section>
      <section class="panel" aria-labelledby="encaixe-titulo">
        <div class="panel-head"><h2 id="encaixe-titulo">Preencher vaga</h2>${icon("bolt", 23)}</div>
        ${renderGap(data, segment)}
      </section>
    </div>
    <div class="dashboard-foot"><p>Dados fictícios e ações salvas neste navegador.</p><button class="text-button" data-action="reset">Reiniciar simulação</button></div>
  </section>`;
}

function paint(next) {
  route = next;
  if (Object.hasOwn(segments, next)) panelSegment = next;
  document.body.dataset.theme = next === "" ? "home" : next;
  document.title = next === "" ? "ZapAgenda — Sua agenda, seu estilo." : `${segments[next]?.title ?? "Painel do negócio"} — ZapAgenda`;
  renderFrame();
  if (next === "painel") renderDashboard();
  else if (next) renderSegment(next);
  else renderHome();
}

function refreshRoute(animate) {
  const next = location.hash.slice(2);
  const target = Object.hasOwn(segments, next) || next === "painel" ? next : "";
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
  transition.dataset.next = target || "home";
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
  return Array.from({ length: 7 }, (_, index) => dayKey(index + 1))
    .map(date => `<option value="${date}" ${date === selected ? "selected" : ""}>${formatDay(date, { weekday: "long", day: "numeric", month: "long" })}</option>`).join("");
}

function slotOptions(key, date, serviceId) {
  const service = segments[key].services.find(item => item.id === serviceId);
  return Array.from({ length: 19 }, (_, index) => 9 * 60 + index * 30)
    .filter(start => start + service.duration <= 19 * 60 && isFree(state[key].appointments, date, start, start + service.duration))
    .map(start => `<option value="${start}">${timeLabel(start)}</option>`).join("");
}

function showBooking(key, serviceId = segments[key].services[0].id) {
  activeDialog = { kind: "book", key };
  const segment = segments[key];
  const slots = slotOptions(key, dayKey(1), serviceId);
  modal("Reserve seu horário", `Demonstração do ${segment.studio}. Use um nome fictício.`, `<form id="booking-form">
    <label>Serviço<select name="service" required>${serviceOptions(segment, serviceId)}</select></label>
    <div class="fields-two"><label>Dia<select name="date" required>${dateOptions()}</select></label>
    <label>Horário<select name="start" required>${slots || '<option value="">Sem horários</option>'}</select></label></div>
    <label>Seu nome<input name="name" placeholder="Ex.: Alex" maxlength="45" required autocomplete="off"></label>
    <p class="form-error" role="alert"></p>
    <button class="button button-primary full" type="submit">Confirmar reserva ${icon("arrow", 19)}</button>
  </form>`);
}

function showWaiting(key) {
  activeDialog = { kind: "wait", key };
  modal("Quero um encaixe", "Escolha um serviço e indique quando você pode ir. Use um nome fictício.", `<form id="wait-form">
    <label>Serviço<select name="service" required>${serviceOptions(segments[key])}</select></label>
    <label>Dia<select name="date" required>${dateOptions()}</select></label>
    <div class="fields-two"><label>Disponível a partir de<input name="start" type="time" value="14:00" required></label>
    <label>Disponível até<input name="end" type="time" value="17:00" required></label></div>
    <label>Seu nome<input name="name" placeholder="Ex.: Alex" maxlength="45" required autocomplete="off"></label>
    <p class="form-error" role="alert"></p>
    <button class="button button-primary full" type="submit">Entrar na lista ${icon("arrow", 19)}</button>
  </form>`);
}

function showGapForm() {
  activeDialog = { kind: "gap", key: panelSegment };
  modal("Informe uma vaga", "A lista de espera será consultada para esse intervalo.", `<form id="gap-form">
    <label>Dia<select name="date" required>${dateOptions()}</select></label>
    <div class="fields-two"><label>Início<input name="start" type="time" value="14:00" required></label>
    <label>Fim<input name="end" type="time" value="15:30" required></label></div>
    <p class="form-error" role="alert"></p>
    <button class="button button-primary full" type="submit">Buscar encaixes ${icon("arrow", 19)}</button>
  </form>`);
}

function showOffer(id, start) {
  const data = state[panelSegment];
  const request = data.requests.find(item => item.id === id);
  const service = segments[panelSegment].services.find(item => item.id === request?.serviceId);
  if (!request || !service || !data.gap) return;
  activeDialog = { kind: "offer", key: panelSegment, id, start, gapId: data.gap.id, expires: Date.now() + 5 * 60_000 };
  modal("Oferta de encaixe", "Demonstração da página que a cliente receberia. O aceite abaixo é simulado.", `<div class="offer-summary">
    <strong>${service.name}</strong><span>${formatDay(request.date)} às ${timeLabel(start)} · ${service.duration} min</span><strong>${money(service.price)}</strong>
    </div><p class="form-error" role="alert"></p>
    <button class="button button-primary full" data-action="accept">${icon("check", 19)} Simular aceite</button>`);
}

function redraw(message) {
  saveState();
  if (dialog.open) dialog.close();
  if (route === "painel") renderDashboard();
  showNotice(message);
}

function acceptOffer() {
  if (activeDialog?.kind !== "offer") return;
  const { key, id, start, gapId, expires } = activeDialog;
  const data = state[key];
  const request = data.requests.find(item => item.id === id);
  const service = segments[key].services.find(item => item.id === request?.serviceId);
  const end = start + (service?.duration ?? 0);
  if (Date.now() > expires || request?.status !== "waiting" || data.gap?.id !== gapId ||
      start < Math.max(request.start, data.gap.start) || end > Math.min(request.end, data.gap.end) ||
      !isFree(data.appointments, request.date, start, end)) {
    dialogContent.querySelector(".form-error").textContent = "Esta oferta expirou ou o horário foi ocupado.";
    return;
  }
  request.status = "accepted";
  data.appointments.push({ id: crypto.randomUUID(), name: request.name, serviceId: service.id,
    date: request.date, start, end, price: service.price, status: "booked", recovered: true, gapId });
  redraw("Encaixe reservado.");
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, segment, service, id, start } = button.dataset;
  if (action === "book") showBooking(segment, service);
  if (action === "wait") showWaiting(segment);
  if (action === "close") dialog.close();
  if (action === "gap") showGapForm();
  if (action === "offer") showOffer(id, Number(start));
  if (action === "accept") acceptOffer();
  if (action === "panel-segment") {
    panelSegment = segment;
    renderDashboard();
    main.querySelector('[aria-pressed="true"]').focus();
  }
  if (action === "cancel" || action === "complete") {
    const data = state[panelSegment];
    const appointment = data.appointments.find(item => item.id === id);
    if (appointment?.status !== "booked") return;
    if (action === "cancel") {
      appointment.status = "canceled";
      data.gap = { id: crypto.randomUUID(), date: appointment.date, start: appointment.start, end: appointment.end };
      redraw("Horário liberado para encaixes.");
    } else {
      appointment.status = "completed";
      redraw("Atendimento concluído.");
    }
  }
  if (action === "reset") {
    activeDialog = { kind: "reset" };
    modal("Reiniciar simulação?", "As reservas e ofertas de demonstração salvas neste navegador voltarão ao estado inicial.",
      '<button class="button button-primary full" data-action="confirm-reset">Reiniciar dados de exemplo</button>');
  }
  if (action === "confirm-reset") {
    state = sampleData();
    redraw("Simulação reiniciada.");
  }
});

document.addEventListener("change", event => {
  const form = event.target.closest("#booking-form");
  if (!form || !["date", "service"].includes(event.target.name)) return;
  form.elements.start.innerHTML = slotOptions(activeDialog.key, form.elements.date.value, form.elements.service.value)
    || '<option value="">Sem horários</option>';
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
    if (!fields.get("start") || !isFree(data.appointments, date, start, end)) return fail("Escolha outro horário disponível.");
    data.appointments.push({ id: crypto.randomUUID(), name, serviceId: service.id, price: service.price, date, start, end, status: "booked" });
    redraw("Reserva confirmada na demonstração.");
  }
  if (kind === "wait") {
    if (end - start < service.duration) return fail("Esse período é menor que o tempo do serviço escolhido.");
    data.requests.push({ id: crypto.randomUUID(), name, serviceId: service.id, date, start, end, status: "waiting" });
    redraw("Você entrou na lista de espera da demonstração.");
  }
  if (kind === "gap") {
    if (!isFree(data.appointments, date, start, end)) return fail("Já existe uma reserva nesse intervalo.");
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
  if (route === "painel" && !dialog.open) renderDashboard();
});
refreshRoute(false);
