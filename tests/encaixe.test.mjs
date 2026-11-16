import { test } from "node:test";
import assert from "node:assert/strict";
import { isFree, sampleData, segments, suggestPlan } from "../dist/model.mjs";

const buildDemo = () => {
  const data = sampleData().manicure;
  const original = data.appointments.find(item => item.id === "manicure-cancel");
  original.status = "canceled";
  const gap = { date: original.date, start: original.start, end: original.end };
  const services = segments.manicure.services;
  return { ...data, gap, services };
};

test("uma vaga de 90 minutos recebe dois atendimentos em sequência", () => {
  const data = buildDemo();
  const plan = suggestPlan(data);
  assert.deepEqual(plan.map(item => [item.service.id, item.start, item.end]),
    [["manutencao", 840, 900], ["esmaltacao", 900, 930]]);
});

test("o motor respeita data, disponibilidade e pedidos já aceitos", () => {
  const data = buildDemo();
  const [first, second] = data.requests;
  first.status = "accepted";
  second.date = "2000-01-01";
  assert.deepEqual(suggestPlan(data), []);
  second.date = data.gap.date;
  second.start = 912;
  assert.deepEqual(suggestPlan(data), []);
  second.start = 900;
  assert.equal(suggestPlan(data)[0].start, 900);
});

test("uma reserva ativa bloqueia a faixa mas a anterior cancelada não", () => {
  const data = buildDemo();
  const { date, start, end } = data.gap;
  assert.equal(isFree(data.appointments, date, start, end), true);
  data.appointments.push({ date, start: 840, end: 885, status: "booked" });
  assert.equal(isFree(data.appointments, date, 860, 890), false);
  assert.equal(isFree(data.appointments, date, 885, 915), true);
  assert.deepEqual(suggestPlan(data).map(item => [item.service.id, item.start, item.end]),
    [["esmaltacao", 885, 915]]);
});

test("o motor pode iniciar um serviço no minuto exato depois de uma reserva", () => {
  const data = buildDemo();
  data.requests = [{ ...data.requests[1], end: 881 }];
  data.appointments.push({ date: data.gap.date, start: 840, end: 851, status: "booked" });
  assert.equal(suggestPlan(data)[0].start, 851);
});

test("a fila permite a mesma pessoa aparecer uma vez por solicitação no par", () => {
  const data = buildDemo();
  data.requests = [data.requests[1]];
  assert.equal(suggestPlan(data).length, 1);
});
