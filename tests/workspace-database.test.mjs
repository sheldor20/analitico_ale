import { installAuthFixture } from './auth-db-fixture.mjs';
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createEmptyDataset, deleteEntity, mergeProduction, upsertEntity, upsertPlanRow } from "../lib/registry.mjs";

const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const emptyDataset = () => ({
  version: 2,
  year: 2026,
  importedAt: "2026-09-09T12:00:00.000Z",
  config: { year: 2026 },
  rows: [],
  sources: [],
  issues: [],
  registry: {
    version: 1,
    updatedAt: "2026-09-09T12:00:00.000Z",
    entities: [
      { id: "central:1002", kind: "central", central: "1002", name: "Bahia" },
    ],
  },
});
const row = () => ({
  key: "base:1002:3017::VN",
  central: "1002",
  cooperative: "3017",
  metric: "VN",
  targets: Array(12).fill(100),
  actuals: [...Array(8).fill(0), -50, null, null, null],
  annualTarget: 1200,
});

async function database() {
  const db = new PGlite();
  await db.exec(`create schema auth;
    create role anon;
    create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${USER_A}'),('${USER_B}');`);
  await installAuthFixture(db);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${USER_A}',false);`);
  return db;
}

test("annual workspace persists empty registry, accepts corrections, prevents lost updates and preserves original imports", async () => {
  const db = await database();
  try {
    const original = { version: 1, year: 2026, rows: [{ central: "1002" }], sources: [{ type: "base" }], config: {} };
    await db.query(`insert into public.commercial_imports(owner_id,title,year,fingerprint,dataset) values (auth.uid(),'Original',2026,$1,$2)`, ["f".repeat(64), JSON.stringify(original)]);
    const inserted = await db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),2026,$1) returning id,revision,updated_at`, [JSON.stringify(emptyDataset())]);
    assert.equal(inserted.rows[0].revision, 1);
    const id = inserted.rows[0].id;
    const updated = { ...emptyDataset(), rows: [row()] };
    const saved = await db.query(`update public.commercial_workspaces set dataset=$1,revision=2 where owner_id=auth.uid() and year=2026 and revision=1 returning revision,dataset,updated_at`, [JSON.stringify(updated)]);
    assert.equal(saved.rows[0].revision, 2);
    assert.deepEqual(saved.rows[0].dataset.rows[0].actuals, updated.rows[0].actuals);
    assert.ok(new Date(saved.rows[0].updated_at) >= new Date(inserted.rows[0].updated_at));
    const stale = await db.query(`update public.commercial_workspaces set dataset=$1,revision=2 where owner_id=auth.uid() and year=2026 and revision=1 returning id`, [JSON.stringify(emptyDataset())]);
    assert.equal(stale.rows.length, 0, "a stale session cannot overwrite a newer revision");
    await assert.rejects(() => db.query(`update public.commercial_workspaces set dataset=$1,revision=2 where id=$2`, [JSON.stringify(emptyDataset()), id]), /revision conflict/);
    await assert.rejects(() => db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),2026,$1)`, [JSON.stringify(emptyDataset())]), /duplicate key/);
    await assert.rejects(() => db.query(`update public.commercial_workspaces set id=gen_random_uuid(),revision=3 where id=$1`, [id]), /identity and year/);
    await assert.rejects(() => db.query(`update public.commercial_workspaces set year=2027,revision=3 where id=$1`, [id]), /identity and year/);
    await assert.rejects(() => db.query(`update public.commercial_workspaces set owner_id=$1,revision=3 where id=$2`, [USER_B, id]), /identity and year|row-level security/);
    const current = (await db.query(`select dataset,revision from public.commercial_workspaces where id=$1`, [id])).rows[0];
    assert.deepEqual(current.dataset, updated);
    assert.equal(current.revision, 2);
    assert.deepEqual((await db.query("select dataset from public.commercial_imports")).rows[0].dataset, original);
    await assert.rejects(() => db.query("update public.commercial_imports set title='changed'"), /permission denied/);
    await db.query(`delete from public.commercial_workspaces where id=$1`, [id]);
    assert.equal((await db.query("select * from public.commercial_workspaces")).rows.length, 0);
    assert.deepEqual((await db.query("select dataset from public.commercial_imports")).rows[0].dataset, original);
  } finally { await db.close(); }
});

test("workspace RLS blocks cross-user reads, inserts, updates and deletes; anonymous access is denied", async () => {
  const db = await database();
  try {
    const id = (await db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),2026,$1) returning id`, [JSON.stringify(emptyDataset())])).rows[0].id;
    await assert.rejects(() => db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values ($1,2026,$2)`, [USER_B, JSON.stringify(emptyDataset())]), /row-level security/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [USER_B]);
    assert.equal((await db.query("select * from public.commercial_workspaces")).rows.length, 0);
    assert.equal((await db.query(`update public.commercial_workspaces set revision=2 where id=$1 returning id`, [id])).rows.length, 0);
    assert.equal((await db.query(`delete from public.commercial_workspaces where id=$1 returning id`, [id])).rows.length, 0);
    await db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),2026,$1)`, [JSON.stringify(emptyDataset())]);
    assert.equal((await db.query("select * from public.commercial_workspaces")).rows.length, 1, "each owner has a separate registry for the same year");
    await db.exec("reset role; set role anon;");
    for (const query of ["select * from public.commercial_workspaces", "delete from public.commercial_workspaces", "update public.commercial_workspaces set revision=2"])
      await assert.rejects(() => db.query(query), /permission denied/);
    await assert.rejects(() => db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values ($1,2026,$2)`, [USER_A, JSON.stringify(emptyDataset())]), /permission denied/);
    await assert.rejects(() => db.query(`select public.commercial_workspace_dataset_valid($1,2026)`, [JSON.stringify(emptyDataset())]), /permission denied/);
    await db.exec("reset role;");
    assert.equal((await db.query("select * from public.commercial_workspaces")).rows.length, 2);
  } finally { await db.close(); }
});

test("workspace validates version, year, registry and twelve numeric-or-null monthly values", async () => {
  const db = await database();
  try {
    const invalid = [
      { ...emptyDataset(), version: 1 },
      { ...emptyDataset(), year: 2027 },
      { ...emptyDataset(), rows: {} },
      { ...emptyDataset(), rows: null },
      { ...emptyDataset(), rows: [{ ...row(), targets: [100] }] },
      { ...emptyDataset(), rows: [{ ...row(), actuals: Array(12).fill("100") }] },
      { ...emptyDataset(), rows: [{ ...row(), actuals: null }] },
      { ...emptyDataset(), rows: [{ ...row(), annualTarget: "1200" }] },
      { ...emptyDataset(), rows: [{ ...row(), metric: null }] },
      { ...emptyDataset(), registry: { version: 1, entities: {} } },
      { ...emptyDataset(), registry: { version: 1, entities: [{ id: "bad", kind: null, central: "1002", name: "Bad" }] } },
      { ...emptyDataset(), sources: null },
      { ...emptyDataset(), config: null },
    ];
    for (const dataset of invalid)
      await assert.rejects(() => db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),2026,$1)`, [JSON.stringify(dataset)]), /commercial_workspaces_dataset_check/);
    await assert.rejects(() => db.query(`insert into public.commercial_workspaces(owner_id,year,dataset,revision) values (auth.uid(),2026,$1,2)`, [JSON.stringify(emptyDataset())]), /start at revision 1/);
    await assert.rejects(() => db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),2019,$1)`, [JSON.stringify({ ...emptyDataset(), year: 2019 })]), /check constraint/);
    await db.query(`insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),2026,$1)`, [JSON.stringify({ ...emptyDataset(), rows: [row()] })]);
    assert.equal((await db.query("select revision from public.commercial_workspaces")).rows[0].revision, 1);
  } finally { await db.close(); }
});

test("real registry engine persists manual plans, three file updates and empty deletion without changing snapshots", async () => {
  const db = await database();
  try {
    let dataset = createEmptyDataset(2026);
    const inserted = (await db.query(
      `insert into public.commercial_workspaces(owner_id,year,dataset) values (auth.uid(),2026,$1) returning id,dataset,revision`,
      [JSON.stringify(dataset)],
    )).rows[0];
    assert.deepEqual(inserted.dataset, dataset, "a new annual registry with zero entities is valid persisted JSON");
    assert.deepEqual(inserted.dataset.registry.entities, []);
    let revision = inserted.revision;
    async function persist() {
      const saved = (await db.query(
        `update public.commercial_workspaces set dataset=$1,revision=$2 where id=$3 and revision=$4 returning dataset,revision`,
        [JSON.stringify(dataset), revision + 1, inserted.id, revision],
      )).rows[0];
      assert.ok(saved, "the expected revision must match");
      assert.deepEqual(saved.dataset, dataset);
      revision = saved.revision;
    }
    async function snapshot(title, fingerprint) {
      return (await db.query(
        `insert into public.commercial_imports(owner_id,title,year,fingerprint,dataset) values (auth.uid(),$1,2026,$2,$3) returning id,dataset,source_count,has_cooperative_base,has_pa_cadence`,
        [title, fingerprint.repeat(64), JSON.stringify(dataset)],
      )).rows[0];
    }

    dataset = upsertEntity(dataset, { kind: "central", central: "1002", name: "Central Bahia" });
    dataset = upsertPlanRow(dataset, {
      entityId: "central:1002", metric: "VN", annualTarget: 12000,
      actuals: [...Array(8).fill(80), null, null, null, null], cutoff: "2026-08-31",
    });
    await persist();
    const manual = await snapshot("Plano manual original", "a");
    assert.equal(manual.source_count, 1, "manual plans use a valid snapshot source descriptor");
    assert.equal(manual.dataset.rows[0].cooperative, "");

    dataset = upsertEntity(dataset, { kind: "cooperative", central: "1002", cooperative: "3017", name: "Coopere" });
    dataset = upsertEntity(dataset, { kind: "pa", central: "1002", cooperative: "3017", pa: "0", name: "PA sede", group: "P1" });
    dataset = upsertPlanRow(dataset, {
      entityId: "pa:1002:3017:0", metric: "VN", annualTarget: 9000,
      actuals: [...Array(8).fill(25), null, null, null, null], cutoff: "2026-08-31",
    });
    for (const update of [
      { filename: "base-setembro-10.xlsx", source: "base", cutoff: "2026-09-10", actual: 100 },
      { filename: "cadencia-setembro-11.xlsx", source: "cadence", cutoff: "2026-09-11", actual: 50 },
      { filename: "base-setembro-12.xlsx", source: "base", cutoff: "2026-09-12", actual: 125 },
    ]) {
      const incoming = createEmptyDataset(2026);
      const existing = dataset.rows.find((item) => item.source === update.source);
      incoming.rows = [{
        ...structuredClone(existing),
        actuals: [...Array(8).fill(null), update.actual, null, null, null],
        targets: Array(12).fill(9999), annualTarget: 119988,
        sourceFile: update.filename, cutoff: update.cutoff,
      }];
      incoming.sources = [{ filename: update.filename, type: update.source, rows: 1, skipped: 0 }];
      dataset = mergeProduction(dataset, incoming);
      await persist();
    }
    const base = dataset.rows.find((item) => item.source === "base");
    const pa = dataset.rows.find((item) => item.source === "cadence");
    assert.equal(base.annualTarget, 12000, "incoming targets cannot replace the fixed manual plan");
    assert.equal(pa.annualTarget, 9000, "manual PA targets remain above the default group target");
    assert.deepEqual(base.actuals, [...Array(8).fill(80), 125, null, null, null]);
    assert.deepEqual(pa.actuals, [...Array(8).fill(25), 50, null, null, null]);
    assert.equal(dataset.config.vnCutoff, "2026-09-12");
    assert.equal(dataset.config.cadenceCutoff, "2026-09-11");
    assert.equal(base.sourceFile, "base-setembro-12.xlsx");
    const current = await snapshot("Atualizado após três arquivos", "b");
    assert.equal(current.source_count, 2, "three sequential filenames remain compatible with the two source types");
    assert.equal(current.has_cooperative_base, true);
    assert.equal(current.has_pa_cadence, true);
    assert.equal(revision, 5);

    dataset = deleteEntity(dataset, "central:1002");
    await persist();
    const cleared = (await db.query(`select dataset,revision from public.commercial_workspaces where id=$1`, [inserted.id])).rows[0];
    assert.equal(cleared.revision, 6);
    assert.deepEqual(cleared.dataset.registry.entities, []);
    assert.deepEqual(cleared.dataset.rows, []);
    assert.deepEqual(cleared.dataset.sources, []);
    assert.deepEqual(cleared.dataset, dataset, "deleting the final central persists a valid empty annual registry");
    for (const preserved of [manual, current])
      assert.deepEqual((await db.query(`select dataset from public.commercial_imports where id=$1`, [preserved.id])).rows[0].dataset, preserved.dataset);
  } finally { await db.close(); }
});
