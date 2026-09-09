import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("migration executes in PostgreSQL; user isolation, immutable imports, deduplication and action ownership are enforced", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;
      create role anon;
      create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609090001_commercial_analytics.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`,
    );
    const data = {
      version: 1,
      year: 2026,
      rows: [{ central: "1002" }],
      sources: [],
      config: {},
    };
    const inserted = await db.query(
      `insert into public.commercial_imports(owner_id,title,year,fingerprint,dataset) values (auth.uid(),'Test',2026,$1,$2) returning id`,
      ["a".repeat(64), JSON.stringify(data)],
    );
    const id = inserted.rows[0].id;
    await assert.rejects(
      () =>
        db.query(
          `insert into public.commercial_imports(owner_id,title,year,fingerprint,dataset) values (auth.uid(),'duplicate',2026,$1,$2)`,
          ["a".repeat(64), JSON.stringify(data)],
        ),
      /duplicate key/,
    );
    await assert.rejects(
      () =>
        db.query(
          `insert into public.commercial_imports(owner_id,title,year,fingerprint,dataset) values ('00000000-0000-0000-0000-000000000002','forged',2026,$1,$2)`,
          ["b".repeat(64), JSON.stringify(data)],
        ),
      /row-level security/,
    );
    await assert.rejects(
      () =>
        db.query(
          `insert into public.commercial_imports(owner_id,title,year,fingerprint,dataset) values (auth.uid(),'invalid',2026,$1,$2)`,
          ["c".repeat(64), JSON.stringify({ version: 1 })],
        ),
      /check constraint/,
    );
    await assert.rejects(
      () =>
        db.query(
          `update public.commercial_imports set title='rewritten' where id=$1`,
          [id],
        ),
      /permission denied/,
    );
    await db.query(
      `insert into public.commercial_actions(owner_id,import_id,entity_key,notes) values (auth.uid(),$1,'base:VN:1002:9999','Private')`,
      [id],
    );
    await db.query(
      `update public.commercial_actions set status='Em andamento' where import_id=$1`,
      [id],
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);`,
    );
    assert.equal(
      (await db.query("select * from public.commercial_imports")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.commercial_actions")).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query(
          `insert into public.commercial_actions(owner_id,import_id,entity_key) values (auth.uid(),$1,'intrusion')`,
          [id],
        ),
      /foreign key/,
    );
    await db.exec(`reset role; set role anon;`);
    await assert.rejects(
      () => db.query("select * from public.commercial_imports"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select * from public.commercial_actions"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
