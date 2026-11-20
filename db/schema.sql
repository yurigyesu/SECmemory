PRAGMA foreign_keys = ON;

CREATE TABLE families (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_key TEXT UNIQUE NOT NULL,
  prefix TEXT NOT NULL,
  root_char TEXT NOT NULL,
  second_char TEXT NOT NULL,
  third_char TEXT NOT NULL,
  category TEXT NOT NULL,
  name_ko TEXT NOT NULL,
  name_en TEXT NOT NULL,
  launch_year INTEGER NOT NULL,
  default_code TEXT NOT NULL,
  voltage_default TEXT,
  package_default TEXT,
  description_ko TEXT NOT NULL
);

CREATE TABLE code_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  slot_order INTEGER NOT NULL,
  slot_key TEXT NOT NULL,
  label_ko TEXT NOT NULL,
  label_en TEXT NOT NULL,
  char_start INTEGER NOT NULL,
  char_length INTEGER NOT NULL,
  is_separator INTEGER NOT NULL DEFAULT 0,
  color_group TEXT NOT NULL,
  help_ko TEXT NOT NULL,
  UNIQUE(family_id, slot_order)
);

CREATE TABLE code_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id INTEGER NOT NULL REFERENCES code_slots(id) ON DELETE CASCADE,
  code_value TEXT NOT NULL,
  short_label TEXT NOT NULL,
  title_ko TEXT NOT NULL,
  detail_ko TEXT NOT NULL,
  meta_json TEXT,
  sort_order INTEGER NOT NULL,
  UNIQUE(slot_id, code_value)
);

CREATE TABLE known_chips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number TEXT UNIQUE NOT NULL,
  family_key TEXT NOT NULL REFERENCES families(family_key) ON DELETE CASCADE,
  marketing_name TEXT NOT NULL,
  density_label TEXT NOT NULL,
  density_gb REAL,
  org_label TEXT NOT NULL,
  bit_width INTEGER,
  speed_label TEXT NOT NULL,
  speed_mts REAL,
  timing_label TEXT,
  voltage_label TEXT NOT NULL,
  die_rev TEXT,
  package_spec TEXT NOT NULL,
  temp_range TEXT,
  top_marking_sample TEXT,
  notes_ko TEXT NOT NULL
);

CREATE TABLE user_custom_chips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number TEXT UNIQUE NOT NULL,
  family_hint TEXT,
  label_ko TEXT NOT NULL,
  notes_ko TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE lookup_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_input TEXT NOT NULL,
  normalized_code TEXT NOT NULL,
  family_key TEXT,
  looked_up_at TEXT NOT NULL
);

CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_families_prefix ON families(prefix);
CREATE INDEX idx_code_slots_family_order ON code_slots(family_id, slot_order);
CREATE INDEX idx_code_options_slot_sort ON code_options(slot_id, sort_order);
CREATE INDEX idx_known_chips_family ON known_chips(family_key);
CREATE INDEX idx_lookup_history_time ON lookup_history(looked_up_at DESC);
