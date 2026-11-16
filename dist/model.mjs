export const segments = {
  barbearia: {
    title: "Barbearia",
    label: "Barbearia",
    studio: "Clube do Corte",
    category: "Cortes, barba e combos",
    image: "barber.webp",
    imageAlt: "Barbeiro acertando o corte de um cliente em uma barbearia de luz âmbar",
    eyebrow: "BARBEARIA · AGENDA ONLINE",
    headline: ["Corte certo.", "Hora marcada."],
    description: "Reserve o seu horário para corte, barba ou os dois no mesmo atendimento.",
    color: "#d9a969",
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
    category: "Unhas, esmaltação e gel",
    image: "nails.webp",
    imageAlt: "Mãos com unhas amendoadas em esmalte vinho sobre cetim rosado",
    eyebrow: "ESTÚDIO DE UNHAS · AGENDA ONLINE",
    headline: ["Um tempo", "só seu."],
    description: "Escolha seu serviço e reserve um momento para cuidar de você.",
    color: "#e9afc1",
    services: [
      { id: "manutencao", name: "Manutenção em gel", description: "Cuidados e acabamento para o seu gel.", duration: 60, price: 90, icon: "spark" },
      { id: "esmaltacao", name: "Esmaltação", description: "A cor que você quer para o seu momento.", duration: 30, price: 50, icon: "paint" },
      { id: "alongamento", name: "Alongamento em gel", description: "Formato e acabamento personalizados.", duration: 90, price: 155, icon: "flower" },
    ],
    sampleNames: ["Bia", "Lívia", "Nina", "Clara"],
  },
};

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

export function isFree(items, date, start, end) {
  return end > start && !items.some(item =>
    item.date === date && item.status !== "canceled" && overlaps(start, end, item.start, item.end)
  );
}

export function suggestPlan({ gap, requests, appointments, services }) {
  const eligible = requests
    .map(request => ({ request, service: services.find(service => service.id === request.serviceId) }))
    .filter(({ request, service }) => request.status === "waiting" && request.date === gap.date && service);
  const busy = appointments.filter(item => item.date === gap.date && item.status !== "canceled")
    .sort((a, b) => a.start - b.start);

  const place = ({ request, service }, earliest) => {
    const lastStart = Math.min(gap.end, request.end) - service.duration;
    let start = Math.max(earliest, gap.start, request.start);
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
