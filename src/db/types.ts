export type SqlParam = string | number | null;

export interface SqlExecutor {
  queryAll<T extends Record<string, unknown>>(sql: string, params?: SqlParam[]): T[];
  queryOne<T extends Record<string, unknown>>(sql: string, params?: SqlParam[]): T | null;
  execute(sql: string, params?: SqlParam[]): void;
}

export type SlotColorGroup = 'family' | 'density' | 'die' | 'speed' | 'package' | 'neutral';

export interface FamilyRow extends Record<string, unknown> {
  id: number;
  family_key: string;
  prefix: string;
  root_char: string;
  second_char: string;
  third_char: string;
  category: string;
  name_ko: string;
  name_en: string;
  launch_year: number;
  default_code: string;
  voltage_default: string | null;
  package_default: string | null;
  description_ko: string;
}

export interface CodeSlotRow extends Record<string, unknown> {
  id: number;
  family_id: number;
  slot_order: number;
  slot_key: string;
  label_ko: string;
  label_en: string;
  char_start: number;
  char_length: number;
  is_separator: number;
  color_group: SlotColorGroup;
  help_ko: string;
}

export interface OptionMeta {
  densityGb?: number;
  densityGB?: number;
  bitWidth?: number;
  speedMts?: number;
  speedGbps?: number;
  clockMhz?: number;
  timing?: string;
  voltage?: string;
  dieRev?: string;
  package?: string;
  temp?: string;
}

export interface CodeOptionRow extends Record<string, unknown> {
  id: number;
  slot_id: number;
  code_value: string;
  short_label: string;
  title_ko: string;
  detail_ko: string;
  meta_json: string | null;
  sort_order: number;
}

export interface SlotWithOptions extends CodeSlotRow {
  options: CodeOptionRow[];
}

export interface KnownChipRow extends Record<string, unknown> {
  id: number;
  part_number: string;
  family_key: string;
  marketing_name: string;
  density_label: string;
  density_gb: number | null;
  org_label: string;
  bit_width: number | null;
  speed_label: string;
  speed_mts: number | null;
  timing_label: string | null;
  voltage_label: string;
  die_rev: string | null;
  package_spec: string;
  temp_range: string | null;
  top_marking_sample: string | null;
  notes_ko: string;
}

export interface CustomChipRow extends Record<string, unknown> {
  id: number;
  part_number: string;
  family_hint: string | null;
  label_ko: string;
  notes_ko: string | null;
  created_at: string;
}

export interface HistoryRow extends Record<string, unknown> {
  id: number;
  raw_input: string;
  normalized_code: string;
  family_key: string | null;
  looked_up_at: string;
}

export interface DbStats {
  schemaVersion: string;
  builtAt: string;
  familyCount: number;
  slotCount: number;
  optionCount: number;
  knownChipCount: number;
  customChipCount: number;
  historyCount: number;
}
