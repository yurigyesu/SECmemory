import type {
  CodeOptionRow,
  CodeSlotRow,
  CustomChipRow,
  DbStats,
  FamilyRow,
  HistoryRow,
  KnownChipRow,
  SlotWithOptions,
  SqlExecutor,
} from './types';

export function getAllFamilies(db: SqlExecutor): FamilyRow[] {
  return db.queryAll<FamilyRow>('SELECT * FROM families ORDER BY id ASC');
}

export function getFamilyByKey(db: SqlExecutor, familyKey: string): FamilyRow | null {
  return db.queryOne<FamilyRow>('SELECT * FROM families WHERE family_key = ?', [familyKey]);
}

export function findFamilyByCode(db: SqlExecutor, code: string): FamilyRow | null {
  const upper = code.trim().toUpperCase();
  if (!upper) return null;

  if (upper.startsWith('M')) {
    return getFamilyByKey(db, 'M_DIMM');
  }
  if (upper.startsWith('KLU')) {
    return getFamilyByKey(db, 'KLU');
  }
  if (upper.startsWith('KLM') || upper.startsWith('KL')) {
    return getFamilyByKey(db, 'KLM');
  }
  if (upper.startsWith('K9')) {
    return getFamilyByKey(db, 'K9');
  }
  if (upper.startsWith('K3')) {
    return getFamilyByKey(db, 'K3L');
  }

  if (upper.startsWith('K4')) {
    const three = upper.slice(0, 3);
    const exact = db.queryOne<FamilyRow>('SELECT * FROM families WHERE prefix = ?', [three]);
    if (exact) return exact;
    return getFamilyByKey(db, 'K4A');
  }

  return null;
}

export function findFamilyByTopSlots(
  db: SqlExecutor,
  rootChar: string,
  secondChar: string,
  thirdChar?: string,
): FamilyRow | null {
  const root = rootChar.toUpperCase();
  const second = secondChar.toUpperCase();
  const third = (thirdChar ?? '').toUpperCase();

  if (root === 'M') {
    return getFamilyByKey(db, 'M_DIMM');
  }
  if (root === 'K') {
    if (second === '9') return getFamilyByKey(db, 'K9');
    if (second === '3') return getFamilyByKey(db, 'K3L');
    if (second === 'L') {
      return third === 'U' ? getFamilyByKey(db, 'KLU') : getFamilyByKey(db, 'KLM');
    }
    if (second === '4') {
      const match = db.queryOne<FamilyRow>(
        'SELECT * FROM families WHERE root_char = ? AND second_char = ? AND third_char = ?',
        ['K', '4', third || 'A'],
      );
      return match ?? getFamilyByKey(db, 'K4A');
    }
  }
  return null;
}

export function getSlotsWithOptions(db: SqlExecutor, familyId: number): SlotWithOptions[] {
  const slots = db.queryAll<CodeSlotRow>(
    'SELECT * FROM code_slots WHERE family_id = ? ORDER BY slot_order ASC',
    [familyId],
  );
  if (slots.length === 0) return [];

  const options = db.queryAll<CodeOptionRow>(
    `SELECT o.* FROM code_options o
     JOIN code_slots s ON o.slot_id = s.id
     WHERE s.family_id = ?
     ORDER BY s.slot_order ASC, o.sort_order ASC`,
    [familyId],
  );

  const grouped = new Map<number, CodeOptionRow[]>();
  for (const opt of options) {
    const arr = grouped.get(opt.slot_id);
    if (arr) arr.push(opt);
    else grouped.set(opt.slot_id, [opt]);
  }

  return slots.map((slot) => ({
    ...slot,
    options: grouped.get(slot.id) ?? [],
  }));
}

export function getKnownChips(
  db: SqlExecutor,
  search?: string,
  familyKey?: string,
): KnownChipRow[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (familyKey && familyKey !== 'ALL') {
    conditions.push('family_key = ?');
    params.push(familyKey);
  }
  if (search && search.trim()) {
    const like = `%${search.trim().toUpperCase()}%`;
    conditions.push(
      '(UPPER(part_number) LIKE ? OR UPPER(marketing_name) LIKE ? OR UPPER(notes_ko) LIKE ? OR UPPER(die_rev) LIKE ?)',
    );
    params.push(like, like, like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.queryAll<KnownChipRow>(`SELECT * FROM known_chips ${where} ORDER BY id ASC`, params);
}

export function getKnownChipByPartNumber(
  db: SqlExecutor,
  partNumber: string,
): KnownChipRow | null {
  const normalized = partNumber.trim().toUpperCase();
  if (!normalized) return null;
  const exact = db.queryOne<KnownChipRow>(
    'SELECT * FROM known_chips WHERE UPPER(part_number) = ?',
    [normalized],
  );
  if (exact) return exact;

  // Also check without hyphen match
  const compact = normalized.replace(/-/g, '');
  return db.queryOne<KnownChipRow>(
    "SELECT * FROM known_chips WHERE REPLACE(UPPER(part_number), '-', '') = ?",
    [compact],
  );
}

export function getCustomChips(db: SqlExecutor): CustomChipRow[] {
  return db.queryAll<CustomChipRow>('SELECT * FROM user_custom_chips ORDER BY id DESC');
}

export function getCustomChipByPartNumber(
  db: SqlExecutor,
  partNumber: string,
): CustomChipRow | null {
  const normalized = partNumber.trim().toUpperCase();
  if (!normalized) return null;
  return db.queryOne<CustomChipRow>(
    'SELECT * FROM user_custom_chips WHERE UPPER(part_number) = ?',
    [normalized],
  );
}

export function upsertCustomChip(
  db: SqlExecutor,
  input: { partNumber: string; familyHint?: string | null; labelKo: string; notesKo?: string | null },
): void {
  const partNumber = input.partNumber.trim().toUpperCase();
  const labelKo = input.labelKo.trim();
  const notesKo = input.notesKo?.trim() || null;
  const familyHint = input.familyHint?.trim() || null;
  const now = new Date().toISOString();

  db.execute(
    `INSERT INTO user_custom_chips (part_number, family_hint, label_ko, notes_ko, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(part_number) DO UPDATE SET
       family_hint = excluded.family_hint,
       label_ko = excluded.label_ko,
       notes_ko = excluded.notes_ko`,
    [partNumber, familyHint, labelKo, notesKo, now],
  );
}

export function deleteCustomChip(db: SqlExecutor, id: number): void {
  db.execute('DELETE FROM user_custom_chips WHERE id = ?', [id]);
}

export function getLookupHistory(db: SqlExecutor, limit = 15): HistoryRow[] {
  return db.queryAll<HistoryRow>(
    'SELECT * FROM lookup_history ORDER BY id DESC LIMIT ?',
    [limit],
  );
}

export function recordLookupHistory(
  db: SqlExecutor,
  rawInput: string,
  normalizedCode: string,
  familyKey: string | null,
): void {
  const cleanNormalized = normalizedCode.trim().toUpperCase();
  if (!cleanNormalized) return;

  const latest = db.queryOne<HistoryRow>(
    'SELECT * FROM lookup_history ORDER BY id DESC LIMIT 1',
  );
  if (latest && latest.normalized_code === cleanNormalized) {
    return;
  }

  db.execute(
    'INSERT INTO lookup_history (raw_input, normalized_code, family_key, looked_up_at) VALUES (?, ?, ?, ?)',
    [rawInput.trim(), cleanNormalized, familyKey, new Date().toISOString()],
  );
}

export function clearLookupHistory(db: SqlExecutor): void {
  db.execute('DELETE FROM lookup_history');
}

export function getDbStats(db: SqlExecutor): DbStats {
  const metaRows = db.queryAll<{ key: string; value: string }>('SELECT key, value FROM db_metadata');
  const meta = new Map(metaRows.map((r) => [r.key, r.value]));

  const count = (table: string): number =>
    db.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count ?? 0;

  return {
    schemaVersion: meta.get('schema_version') ?? '1.0.0',
    builtAt: meta.get('built_at') ?? '',
    familyCount: count('families'),
    slotCount: count('code_slots'),
    optionCount: count('code_options'),
    knownChipCount: count('known_chips'),
    customChipCount: count('user_custom_chips'),
    historyCount: count('lookup_history'),
  };
}
