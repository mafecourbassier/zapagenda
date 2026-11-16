import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingMessage, resolveRoute, restoreDemo, sampleData, segments, suggestPlan } from "../dist/model.mjs";

test("cada segmento mantém rotas próprias de página e de painel", () => {
  for (const key of Object.keys(segments)) {
    assert.equal(resolveRoute(`#/${key}`), key);
    assert.equal(resolveRoute(`#/${key}/painel`), `${key}/painel`);
  }
  assert.equal(resolveRoute("#/painel", "manicure"), "manicure/painel");
  assert.equal(resolveRoute("#/estetica/painel/extra"), "");
  assert.equal(resolveRoute("#/cabeleireiro/painel"), "");
});

test("a versão nova preserva as agendas anteriores e cria a de estética isoladamente", () => {
  const { barbearia, manicure } = sampleData();
  manicure.appointments[0].name = "Teste versão anterior";
  const saved = restoreDemo({ barbearia, manicure });
  assert.equal(saved.manicure.appointments[0].name, "Teste versão anterior");
  assert.equal(saved.estetica.appointments.length, 3);
  assert.notEqual(saved.barbearia.appointments, saved.estetica.appointments);
  assert.equal(restoreDemo(null).manicure.appointments.length, 3);
});

test("a estética usa catálogo e fila próprios para sugerir os encaixes", () => {
  const data = sampleData().estetica;
  const canceled = data.appointments.find(item => item.id === "estetica-cancel");
  canceled.status = "canceled";
  const slots = suggestPlan({ ...data, gap: canceled, services: segments.estetica.services });
  assert.deepEqual(slots.map(slot => [slot.service.id, slot.service.duration]), [["pele", 60], ["botox", 30]]);
});

test("as mensagens de estética usam o horário e omitem o nome do procedimento", () => {
  const appointment = { name: "Dani", date: "2032-11-15", start: 14 * 60, serviceId: "acne" };
  const confirmation = bookingMessage("confirmation", appointment, segments.estetica.studio);
  const reminder = bookingMessage("reminder", appointment, segments.estetica.studio);
  assert.match(confirmation, /Dani.*Casa Orla.*15 de novembro.*14:00.*confirmado/);
  assert.match(reminder, /Dani.*14:00.*comparecer/);
  assert.doesNotMatch(reminder, /acne/i);
});
