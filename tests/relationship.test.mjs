import test from "node:test";
import assert from "node:assert/strict";
import { calendarDays, relationshipHierarchy, validateAppointment, validateProfile, zonedDateTimeInput, zonedDateTimeISO } from "../lib/relationship.mjs";

const profile = () => ({ capitalModality: "Vinculado", capitalNotes: "Saldo devedor", rateTables: [{ id: "table-1", name: "PJ", rate: "0,035", unit: "percent", period: "monthly", validFrom: "2026-09-01", validUntil: "2026-12-31", notes: "Taxa contratada" }], collectionNotes: "Revisar cancelamentos", newSalesNotes: "Treinar equipe", generalNotes: "" });
const appointment = () => ({ title: "Treinamento", kind: "training", startsAt: "2026-09-17T12:00:00Z", endsAt: "2026-09-17T13:00:00Z", timezone: "America/Sao_Paulo", location: "Teams", notes: "", status: "scheduled" });

test("prestamista rates preserve unit/period and normalize decimal comma without guessing scale", () => {
  const input = profile(); const output = validateProfile(input);
  assert.equal(output.rateTables[0].rate, .035);
  assert.equal(output.rateTables[0].unit, "percent");
  assert.equal(output.rateTables[0].period, "monthly");
  assert.equal(input.rateTables[0].rate, "0,035");
  input.rateTables[0].unit = "permille";
  assert.equal(validateProfile(input).rateTables[0].rate, .035);
});

test("incomplete or invalid rates cannot silently become zero or lose validity boundaries", () => {
  for (const value of ["", "-0,5", "abc", "1.200,25", "0.0000001", "Infinity", "101"]) {
    const input = profile(); input.rateTables[0].rate = value;
    assert.throws(() => validateProfile(input), /taxa|limite/i, value);
  }
  const zero = profile(); zero.rateTables[0].rate = "0";
  assert.equal(validateProfile(zero).rateTables[0].rate, 0);
  const invalidDate = profile(); invalidDate.rateTables[0].validUntil = "2026-02-31";
  assert.throws(() => validateProfile(invalidDate), /data válida/);
  const reversed = profile(); reversed.rateTables[0].validUntil = "2026-08-01";
  assert.throws(() => validateProfile(reversed), /fim da vigência/);
  const noUnit = profile(); noUnit.rateTables[0].unit = "";
  assert.throws(() => validateProfile(noUnit), /Unidade/);
  const duplicate = profile(); duplicate.rateTables.push({ ...duplicate.rateTables[0] });
  assert.throws(() => validateProfile(duplicate), /repetido/);
});

test("appointments convert explicit Brazilian timezone regardless of device timezone", () => {
  assert.equal(zonedDateTimeISO("2026-09-17T09:00", "America/Sao_Paulo"), "2026-09-17T12:00:00.000Z");
  assert.equal(zonedDateTimeISO("2026-09-17T09:00", "America/Manaus"), "2026-09-17T13:00:00.000Z");
  for (const timezone of ["America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Noronha"]) {
    const value = "2026-12-31T23:30";
    assert.equal(zonedDateTimeInput(zonedDateTimeISO(value, timezone), timezone), value);
  }
  assert.throws(() => zonedDateTimeISO("2026-02-31T09:00"), /data válida/);
  assert.throws(() => zonedDateTimeISO("2026-09-17T24:00"), /Horário/);
  assert.throws(() => zonedDateTimeISO("2026-09-17T09:00", "Etc/Unknown"), /Fuso horário/);
});

test("appointment duration and workspace year use local calendar year", () => {
  const input = appointment();
  assert.equal(validateAppointment(input, 2026).kind, "training");
  assert.throws(() => validateAppointment({ ...input, endsAt: input.startsAt }, 2026), /posterior/);
  assert.throws(() => validateAppointment({ ...input, endsAt: "2026-09-25T12:00:00Z" }, 2026), /7 dias/);
  assert.throws(() => validateAppointment({ ...input, startsAt: "2027-01-02T12:00:00Z", endsAt: "2027-01-02T13:00:00Z" }, 2026), /ano 2026/);
  const newYearsEve = { ...input, startsAt: "2027-01-01T01:00:00Z", endsAt: "2027-01-01T02:00:00Z" };
  assert.equal(validateAppointment(newYearsEve, 2026).startsAt, "2027-01-01T01:00:00.000Z");
  assert.throws(() => validateAppointment({ ...input, status: "unknown" }, 2026), /Situação/);
});

test("appointments require no minimum notice and accept past, immediate and one-minute appointments", () => {
  const now = Date.now();
  for (const timezone of ["America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Noronha"]) {
    for (const offset of [-30 * 24 * 60 * 60 * 1000, 0, 60 * 1000]) {
      const startsAt = new Date(now + offset).toISOString();
      const endsAt = new Date(now + offset + 60 * 1000).toISOString();
      const year = Number(zonedDateTimeInput(startsAt, timezone).slice(0, 4));
      const saved = validateAppointment({ ...appointment(), startsAt, endsAt, timezone }, year);
      assert.equal(saved.startsAt, startsAt);
      assert.equal(saved.endsAt, endsAt);
      assert.equal(Date.parse(saved.endsAt) - Date.parse(saved.startsAt), 60 * 1000);
    }
  }
  const past = { ...appointment(), startsAt: "2020-01-02T12:00:00Z", endsAt: "2020-01-02T12:01:00Z" };
  assert.equal(validateAppointment(past, 2020).startsAt, "2020-01-02T12:00:00.000Z");
  // Removing advance notice must not allow reversed dates or bypass the annual registry.
  assert.throws(() => validateAppointment({ ...past, endsAt: "2020-01-02T11:59:00Z" }, 2020), /posterior/);
  assert.throws(() => validateAppointment(past, 2026), /ano 2026/);
});

test("hierarchy scopes cooperative and PA codes by central, including PA zero", () => {
  const entities = [
    { id: "central:1", kind: "central", central: "1", name: "Bahia" },
    { id: "central:2", kind: "central", central: "2", name: "Nordeste" },
    { id: "cooperative:1:3", kind: "cooperative", central: "1", cooperative: "3", name: "Alfa" },
    { id: "cooperative:2:3", kind: "cooperative", central: "2", cooperative: "3", name: "Outra Alfa" },
    { id: "pa:1:3:0", kind: "pa", central: "1", cooperative: "3", pa: "0", name: "PA 0" },
    { id: "pa:2:3:0", kind: "pa", central: "2", cooperative: "3", pa: "0", name: "Outro PA 0" },
  ];
  assert.deepEqual(relationshipHierarchy(entities, entities[0]).children.map((row) => row.id), ["cooperative:1:3"]);
  assert.deepEqual(relationshipHierarchy(entities, entities[2]).children.map((row) => row.id), ["pa:1:3:0"]);
  assert.deepEqual(relationshipHierarchy(entities, entities[4]).parents.map((row) => row.id), ["central:1", "cooperative:1:3"]);
  assert.equal(relationshipHierarchy(entities, entities[4]).children.length, 0);
});

test("calendar is Monday-first and keeps leap days and month boundaries", () => {
  const september = calendarDays("2026-09");
  assert.equal(september.length, 42);
  assert.equal(september[0].date, "2026-08-31");
  assert.equal(september[0].inMonth, false);
  assert.equal(september.filter((day) => day.inMonth).length, 30);
  assert.equal(calendarDays("2028-02").filter((day) => day.inMonth).length, 29);
  assert.throws(() => calendarDays("2026-13"), /inválido/);
});
