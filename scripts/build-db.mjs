import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const schemaPath = resolve(rootDir, 'db/schema.sql');
const seedPath = resolve(rootDir, 'db/seed.sql');
const outDir = resolve(rootDir, 'public/db');
const outPath = resolve(outDir, 'secmemory.sqlite');

mkdirSync(outDir, { recursive: true });
if (existsSync(outPath)) {
  rmSync(outPath);
}

const schemaSql = readFileSync(schemaPath, 'utf8');
const seedSql = readFileSync(seedPath, 'utf8');

const db = new DatabaseSync(outPath);

try {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schemaSql);
  db.exec('BEGIN TRANSACTION;');
  db.exec(seedSql);
  db.exec('COMMIT;');

  const fkIssues = db.prepare('PRAGMA foreign_key_check;').all();
  if (fkIssues.length > 0) {
    throw new Error(`Foreign key check failed: ${JSON.stringify(fkIssues)}`);
  }

  const integrityRow = db.prepare('PRAGMA integrity_check;').get();
  const integrityValue = integrityRow ? Object.values(integrityRow)[0] : null;
  if (integrityValue !== 'ok') {
    throw new Error(`Integrity check failed: ${String(integrityValue)}`);
  }

  const familyCount = db.prepare('SELECT COUNT(*) AS count FROM families').get().count;
  const slotCount = db.prepare('SELECT COUNT(*) AS count FROM code_slots').get().count;
  const optionCount = db.prepare('SELECT COUNT(*) AS count FROM code_options').get().count;
  const chipCount = db.prepare('SELECT COUNT(*) AS count FROM known_chips').get().count;

  const upsertMeta = db.prepare(
    'INSERT INTO db_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  upsertMeta.run('schema_version', '1.1.0');
  upsertMeta.run('built_at', new Date().toISOString());
  upsertMeta.run('family_count', String(familyCount));
  upsertMeta.run('slot_count', String(slotCount));
  upsertMeta.run('option_count', String(optionCount));
  upsertMeta.run('chip_count', String(chipCount));

  db.exec('VACUUM;');

  console.log(
    `[build-db] Built ${outPath} | families=${familyCount}, slots=${slotCount}, options=${optionCount}, known_chips=${chipCount}`,
  );
} finally {
  db.close();
}
