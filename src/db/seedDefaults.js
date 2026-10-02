const JUDGE_ROLES = [
  // execution/difficulty are scored per trick (see element_scores); the others are one value per attempt
  { key: 'execution',               name: 'Execution',                granularity: 'element', is_deduction: 1, max_value: 10,   score_min: 0, score_max: 0.5, has_landing: 1 },
  { key: 'difficulty',              name: 'Difficulty',                granularity: 'element', is_deduction: 0, max_value: null, score_min: 0, score_max: null },
  { key: 'time_of_flight',          name: 'Time of Flight',            granularity: 'attempt', is_deduction: 0, max_value: null, score_min: 0, score_max: 10 },
  { key: 'horizontal_displacement', name: 'Horizontal Displacement',   granularity: 'attempt', is_deduction: 0, max_value: null, score_min: 0, score_max: 10 },
  { key: 'head_judge',              name: 'Head Judge (Penalties)',    granularity: 'attempt', is_deduction: 0, max_value: null, score_min: 0, score_max: 10 },
  // synchro: one execution role per trampoline, S is either the device mark or per-skill deductions
  { key: 'execution_t1',            name: 'Execution Trampoline 1',    granularity: 'element', is_deduction: 1, max_value: 10,   score_min: 0, score_max: 0.5, has_landing: 1 },
  { key: 'execution_t2',            name: 'Execution Trampoline 2',    granularity: 'element', is_deduction: 1, max_value: 10,   score_min: 0, score_max: 0.5, has_landing: 1 },
  { key: 'synchronisation',         name: 'Synchronisation',           granularity: 'attempt', is_deduction: 0, max_value: null, score_min: 0, score_max: 10 },
  { key: 'synchronisation_skill',   name: 'Synchronisation per Skill', granularity: 'element', is_deduction: 1, max_value: 10,   score_min: 0, score_max: 0.5 },
];

const PANEL_TEMPLATES = [
  {
    key: 'fig',
    competition_type: 'individual',
    name: 'FIG Panel',
    description: 'Full FIG-style panel: 6 execution, 1 difficulty, 1 time of flight, 1 horizontal displacement, 1 head judge (penalties).',
    slots: [
      // execution: per trick, drop 2 highest + 2 lowest deductions, sum the remaining 2, sum across tricks, then 10 - total (is_deduction)
      { role: 'execution',               judge_count: 6, drop_high: 2, drop_low: 2, combine: 'sum', multiplier: 1,  sort_order: 1 },
      { role: 'difficulty',              judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 2 },
      { role: 'time_of_flight',          judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 3, shared_assignment_group: 'tof_hd' },
      { role: 'horizontal_displacement', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 4, shared_assignment_group: 'tof_hd' },
      { role: 'head_judge',              judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: -1, sort_order: 5 },
    ],
  },
  {
    key: 'local',
    competition_type: 'individual',
    name: 'Local Panel',
    description: 'Simplified panel for local competitions without electronic timing/displacement equipment: 4 execution, 1 difficulty, 1 head judge (penalties).',
    slots: [
      // per_judge: each judge sums their own deductions first, then drop 1 high/1 low across those totals
      { role: 'execution',  judge_count: 4, drop_high: 1, drop_low: 1, combine: 'sum', multiplier: 1,  sort_order: 1, aggregation: 'per_judge' },
      { role: 'difficulty', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 2 },
      { role: 'head_judge', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: -1, sort_order: 3 },
    ],
  },
  {
    key: 'test',
    competition_type: 'individual',
    name: 'Test Panel',
    description: 'Test panel for development and testing purposes.',
    slots: [
      { role: 'execution',  judge_count: 1, drop_high: 1, drop_low: 1, combine: 'sum', multiplier: 1,  sort_order: 1 },
      { role: 'difficulty', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 2 },
      { role: 'head_judge', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: -1, sort_order: 3 },
    ],
  },
  {
    key: 'test_synchro',
    competition_type: 'synchro',
    name: 'Test Synchro Panel',
    description: 'Synchro test panel for development and testing purposes: one judge per role, synchronisation as device mark.',
    slots: [
      { role: 'execution_t1',    judge_count: 1, drop_high: 0, drop_low: 0, combine: 'mean', multiplier: 0.5, sort_order: 1 },
      { role: 'execution_t2',    judge_count: 1, drop_high: 0, drop_low: 0, combine: 'mean', multiplier: 0.5, sort_order: 2 },
      { role: 'difficulty',      judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',  multiplier: 1,   sort_order: 3 },
      { role: 'synchronisation', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',  multiplier: 2,   sort_order: 4 },
      { role: 'head_judge',      judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',  multiplier: -1,  sort_order: 5 },
    ],
  },
  {
    key: 'fig_synchro',
    competition_type: 'synchro',
    name: 'FIG Synchro Panel',
    description: 'FIG synchronised panel: 3 execution judges per trampoline, 1 difficulty, 1 horizontal displacement and 1 synchronisation (device) operated by the same person, 1 head judge (penalties).',
    slots: [
      // per trampoline the median deduction counts, x0.5 so the two trampolines average to one E mark of at most 10
      { role: 'execution_t1',            judge_count: 3, drop_high: 0, drop_low: 0, combine: 'median', multiplier: 0.5, sort_order: 1 },
      { role: 'execution_t2',            judge_count: 3, drop_high: 0, drop_low: 0, combine: 'median', multiplier: 0.5, sort_order: 2 },
      { role: 'difficulty',              judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',    multiplier: 1,   sort_order: 3 },
      { role: 'horizontal_displacement', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',    multiplier: 1,   sort_order: 4, shared_assignment_group: 'hd_sync' },
      // device mark 0-10, doubled for the S mark of at most 20
      { role: 'synchronisation',         judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',    multiplier: 2,   sort_order: 5, shared_assignment_group: 'hd_sync' },
      { role: 'head_judge',              judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',    multiplier: -1,  sort_order: 6 },
    ],
  },
  {
    key: 'local_synchro',
    competition_type: 'synchro',
    name: 'Local Synchro Panel',
    description: 'Simplified synchronised panel without a synchro device: 2 execution judges per trampoline, 1 difficulty, 1 synchronisation judge scoring per skill, 1 head judge (penalties).',
    slots: [
      { role: 'execution_t1',          judge_count: 2, drop_high: 0, drop_low: 0, combine: 'mean', multiplier: 0.5, sort_order: 1 },
      { role: 'execution_t2',          judge_count: 2, drop_high: 0, drop_low: 0, combine: 'mean', multiplier: 0.5, sort_order: 2 },
      { role: 'difficulty',            judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',  multiplier: 1,   sort_order: 3 },
      // (skills - deductions) x 2 gives the S mark of at most 20
      { role: 'synchronisation_skill', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',  multiplier: 2,   sort_order: 4 },
      { role: 'head_judge',            judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum',  multiplier: -1,  sort_order: 5 },
    ],
  },
];

module.exports = function applySeedDefaults(db) {
  // has_landing is upserted so existing dbs pick up the flag, the other columns stay as they were
  const insertRole = db.prepare(`
    INSERT INTO judge_roles (key,name,granularity,is_deduction,max_value,score_min,score_max,has_landing)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET has_landing=excluded.has_landing
  `);
  for (const r of JUDGE_ROLES) {
    insertRole.run(r.key, r.name, r.granularity, r.is_deduction, r.max_value, r.score_min, r.score_max, r.has_landing || 0);
  }

  const roleIdByKey = new Map(
    db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id])
  );

  const insertTemplate = db.prepare(`
    INSERT INTO panel_templates (key,name,description,competition_type) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET competition_type=excluded.competition_type
  `);
  const insertSlot = db.prepare(`
    INSERT OR IGNORE INTO panel_template_slots
      (panel_template_id,judge_role_id,judge_count,drop_high,drop_low,combine,multiplier,sort_order,shared_assignment_group,aggregation)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  for (const t of PANEL_TEMPLATES) {
    insertTemplate.run(t.key, t.name, t.description, t.competition_type);
    const template = db.prepare('SELECT id FROM panel_templates WHERE key=?').get(t.key);
    for (const s of t.slots) {
      insertSlot.run(
        template.id,
        roleIdByKey.get(s.role),
        s.judge_count,
        s.drop_high,
        s.drop_low,
        s.combine,
        s.multiplier,
        s.sort_order,
        s.shared_assignment_group || null,
        s.aggregation || 'per_trick'
      );
    }
  }
};
