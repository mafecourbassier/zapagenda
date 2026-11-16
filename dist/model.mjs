export const segments = {
  barbearia: {
    title: "Barbearia",
    label: "Barbearia",
    studio: "Clube do Corte",
    panelTitle: "Painel da barbearia",
    icon: "scissors",
    cardHeadline: "Estilo em cada corte.",
    cardDescription: "Cabelo, barba e o ritual completo.",
    image: "barber.webp",
    imageAlt: "Barbeiro acertando o corte de um cliente em uma barbearia de luz âmbar",
    gallery: "galeria-barbearia.webp",
    galleryAlt: "Cadeira de couro e bancada em madeira em uma barbearia de luz âmbar",
    introTitle: "A pausa que faz parte do ritual.",
    intro: "Luz baixa, couro e madeira. Um espaço para chegar com calma, conversar sobre o corte e sair com o acabamento que você gosta.",
    district: "Centro",
    hours: "das 9h às 19h",
    feedback: ["Escolhi corte e barba juntos e já sabia quanto tempo ia levar.", "O encaixe apareceu no fim da tarde, no horário que eu podia ir."],
    eyebrow: "BARBEARIA · AGENDA ONLINE",
    headline: ["Corte certo.", "Hora marcada."],
    description: "Reserve o seu horário para corte, barba ou os dois no mesmo atendimento.",
    services: [
      { id: "corte", name: "Corte clássico", description: "Tesoura, máquina e acabamento.", duration: 45, price: 65, icon: "scissors" },
      { id: "barba", name: "Barba completa", description: "Desenho, toalha quente e finalização.", duration: 30, price: 45, icon: "razor" },
      { id: "combo", name: "Corte + barba", description: "O ritual completo, no mesmo horário.", duration: 75, price: 100, icon: "spark" },
    ],
    sampleNames: ["Rafael", "André", "Lucas", "Marcos"],
  },
  manicure: {
    title: "Manicure",
    label: "Manicure",
    studio: "Studio Rosa",
    panelTitle: "Painel da manicure",
    icon: "spark",
    cardHeadline: "Seu momento de cuidado.",
    cardDescription: "Esmaltação, manutenção e gel.",
    image: "nails.webp",
    imageAlt: "Mãos com unhas amendoadas em esmalte vinho sobre cetim rosado",
    gallery: "galeria-manicure.webp",
    galleryAlt: "Bancada de manicure com flores, esmaltes e cadeiras vinho",
    introTitle: "Detalhes que dão vontade de ficar.",
    intro: "A bancada, as cores e o tempo de escolher um acabamento com calma. Cada serviço tem a sua duração reservada na agenda.",
    district: "Vila Oliveira",
    hours: "das 9h às 19h",
    feedback: ["Reservei a manutenção e já consegui planejar a minha tarde.", "Entrei na fila e apareceu uma vaga para a esmaltação que eu queria."],
    eyebrow: "ESTÚDIO DE UNHAS · AGENDA ONLINE",
    headline: ["Um tempo", "só seu."],
    description: "Escolha seu serviço e reserve um momento para cuidar de você.",
    services: [
      { id: "manutencao", name: "Manutenção em gel", description: "Cuidados e acabamento para o seu gel.", duration: 60, price: 90, icon: "spark" },
      { id: "esmaltacao", name: "Esmaltação", description: "A cor que você quer para o seu momento.", duration: 30, price: 50, icon: "paint" },
      { id: "alongamento", name: "Alongamento em gel", description: "Formato e acabamento personalizados.", duration: 90, price: 155, icon: "flower" },
    ],
    sampleNames: ["Bia", "Lívia", "Nina", "Clara"],
  },
  estetica: {
    title: "Estética",
    label: "Estética",
    studio: "Casa Orla · Estética facial",
    panelTitle: "Painel da estética",
    icon: "flower",
    cardHeadline: "Cuidado começa aqui.",
    cardDescription: "Avaliações e cuidados com a pele.",
    image: "estetica.webp",
    imageAlt: "Mulher de olhos fechados em um estúdio de estética com luz suave",
    gallery: "galeria-estetica.webp",
    galleryAlt: "Poltrona clara e cortina de linho em um estúdio de estética verde-sálvia",
    introTitle: "Um espaço para ouvir a sua pele.",
    intro: "Um estúdio de luz natural e tons minerais. O primeiro encontro é uma avaliação e um momento para conversar sobre o que você busca.",
    district: "Mogilar",
    hours: "das 9h às 19h",
    feedback: ["Consegui reservar uma avaliação para conversar sobre minha pele.", "Vi quanto tempo durava a avaliação e escolhi um horário com calma."],
    eyebrow: "ESTÉTICA FACIAL · AGENDA ONLINE",
    headline: ["Pele em", "primeiro plano."],
    description: "Reserve uma avaliação para conversar sobre sua pele e suas prioridades de cuidado.",
    services: [
      { id: "pele", name: "Avaliação facial", description: "Conversa inicial sobre sua pele e seus objetivos.", duration: 60, price: 120, icon: "flower" },
      { id: "botox", name: "Avaliação para botox", description: "Horário de avaliação para conversar sobre toxina botulínica.", duration: 30, price: 100, icon: "spark" },
      { id: "acne", name: "Avaliação de pele acneica", description: "Avaliação inicial voltada à pele com acne.", duration: 90, price: 150, icon: "paint" },
    ],
    sampleNames: ["Dani", "Carol", "Lara", "Sofia"],
  },
};

export function resolveRoute(hash, lastSegment = "barbearia") {
  const path = hash.startsWith("#/") ? hash.slice(2) : "";
  if (path === "painel") return `${Object.hasOwn(segments, lastSegment) ? lastSegment : "barbearia"}/painel`;
  const [segment, screen, extra] = path.split("/");
  if (!Object.hasOwn(segments, segment) || extra !== undefined) return "";
  return screen === undefined || screen === "painel" || screen === "cliente" ? path : "";
}

export const money = value => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL", maximumFractionDigits: 0,
}).format(value);

export function dayKey(offset = 0) {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export function formatDay(date, options = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("pt-BR", options).format(new Date(`${date}T12:00:00`));
}

export const timeLabel = minutes => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const timeValue = time => time.split(":").map(Number).reduce((hours, minutes) => hours * 60 + minutes);
export const overlaps = (start, end, itemStart, itemEnd) => start < itemEnd && itemStart < end;


const standardHours = { start: 480, end: 1080, breaks: [{ start: 720, end: 780 }] };
export const businessHours = Object.fromEntries(
  Object.keys(segments).map(key => [key, structuredClone(standardHours)])
);

export function isFree(items, date, start, end, hours = standardHours) {
  return Number.isInteger(start) && Number.isInteger(end) &&
    end > start && start >= hours.start && end <= hours.end &&
    !hours.breaks.some(block => overlaps(start, end, block.start, block.end)) &&
    !items.some(item => item.date === date && item.status !== "canceled" &&
      overlaps(start, end, item.start, item.end));
}

export function availableSlots(items, date, duration, hours = standardHours) {
  if (!Number.isInteger(duration) || duration <= 0) return [];
  const slots = [];
  for (let start = hours.start; start + duration <= hours.end; start += 30) {
    if (isFree(items, date, start, start + duration, hours)) slots.push(start);
  }
  return slots;
}

export function suggestPlan({ gap, requests, appointments, services, hours = standardHours }) {
  const eligible = requests
    .map(request => ({ request, service: services.find(service => service.id === request.serviceId) }))
    .filter(({ request, service }) => request.status === "waiting" && request.date === gap.date && service);
  const busy = [...appointments.filter(item => item.date === gap.date && item.status !== "canceled"), ...hours.breaks]
    .sort((a, b) => a.start - b.start);

  const place = ({ request, service }, earliest) => {
    const lastStart = Math.min(gap.end, request.end, hours.end) - service.duration;
    let start = Math.max(earliest, gap.start, request.start, hours.start);
    for (const appointment of busy) {
      if (appointment.end <= start) continue;
      if (start + service.duration <= appointment.start) break;
      start = appointment.end;
    }
    return start <= lastStart ? { request, service, start, end: start + service.duration } : null;
  };

  const plans = [];
  for (const candidate of eligible) {
    const first = place(candidate, gap.start);
    if (!first) continue;
    plans.push([first]);
    for (const next of eligible) {
      if (next.request.id === first.request.id) continue;
      const second = place(next, first.end);
      if (second) plans.push([first, second]);
    }
  }

  const minutes = plan => plan.reduce((sum, entry) => sum + entry.service.duration, 0);
  const priority = plan => Math.min(...plan.map(entry => eligible.findIndex(item => item.request.id === entry.request.id)));
  plans.sort((a, b) => minutes(b) - minutes(a) || priority(a) - priority(b) || a.length - b.length || a[0].start - b[0].start);
  return plans[0] ?? [];
}

export function sampleData() {
  return Object.fromEntries(Object.entries(segments).map(([key, segment]) => {
    const [first, second, third] = segment.services;
    const date = dayKey(1);
    const [one, two, three, four] = segment.sampleNames;
    const originalStart = 14 * 60;
    return [key, {
      appointments: [
        { id: `${key}-morning`, name: three, serviceId: first.id, date, start: 9 * 60, end: 9 * 60 + first.duration, status: "booked", price: first.price },
        { id: `${key}-cancel`, name: four, serviceId: third.id, date, start: originalStart, end: originalStart + third.duration, status: "booked", price: third.price },
        { id: `${key}-evening`, name: key === "barbearia" ? "Pedro" : "Ana", serviceId: second.id, date, start: 17 * 60, end: 17 * 60 + second.duration, status: "booked", price: second.price },
      ],
      requests: [
        { id: `${key}-wait-1`, name: one, serviceId: first.id, date, start: 13 * 60, end: 17 * 60, status: "waiting" },
        { id: `${key}-wait-2`, name: two, serviceId: second.id, date, start: 14 * 60, end: 17 * 60, status: "waiting" },
      ],
      gap: null,
    }];
  }));
}

export function restoreDemo(saved) {
  const defaults = sampleData();
  return Object.fromEntries(Object.entries(defaults).map(([key, sample]) => {
    const existing = saved?.[key];
    const valid = Array.isArray(existing?.appointments) && Array.isArray(existing?.requests);
    return [key, valid ? existing : sample];
  }));
}

export function bookingMessage(kind, appointment, studio) {
  const greeting = `Oi, ${appointment.name}! Aqui é ${studio}.`;
  const date = formatDay(appointment.date, { day: "numeric", month: "long" });
  const time = timeLabel(appointment.start);
  if (kind === "confirmation") return `${greeting} Seu horário de ${date}, às ${time}, está confirmado. Se precisar remarcar, pode responder por aqui.`;
  return `${greeting} Lembrando do seu horário de ${date}, às ${time}. Você consegue comparecer? Se precisar remarcar, avise por aqui.`;
}
