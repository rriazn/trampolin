const JUDGE_ROLES = [
  // execution/difficulty are scored per trick (see element_scores); the others are one value per attempt.
  { key: 'execution',               name: 'Execution',                granularity: 'element', is_deduction: 1, max_value: 10,   score_min: 0, score_max: 5 },
  { key: 'difficulty',              name: 'Difficulty',                granularity: 'element', is_deduction: 0, max_value: null, score_min: 0, score_max: null },
  { key: 'time_of_flight',          name: 'Time of Flight',            granularity: 'attempt', is_deduction: 0, max_value: null, score_min: 0, score_max: 10 },
  { key: 'horizontal_displacement', name: 'Horizontal Displacement',   granularity: 'attempt', is_deduction: 0, max_value: null, score_min: 0, score_max: 10 },
  { key: 'head_judge',              name: 'Head Judge (Penalties)',    granularity: 'attempt', is_deduction: 0, max_value: null, score_min: 0, score_max: 10 },
];

const PANEL_TEMPLATES = [
  {
    key: 'fig',
    name: 'FIG Panel',
    description: 'Full FIG-style panel: 6 execution, 1 difficulty, 1 time of flight, 1 horizontal displacement, 1 head judge (penalties).',
    slots: [
      // execution: per trick, drop 2 highest + 2 lowest deductions, sum the remaining 2, sum across tricks, then 10 - total (is_deduction).
      { role: 'execution',               judge_count: 6, drop_high: 2, drop_low: 2, combine: 'sum', multiplier: 1,  sort_order: 1 },
      { role: 'difficulty',              judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 2 },
      { role: 'time_of_flight',          judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 3, shared_assignment_group: 'tof_hd' },
      { role: 'horizontal_displacement', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 4, shared_assignment_group: 'tof_hd' },
      { role: 'head_judge',              judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: -1, sort_order: 5 },
    ],
  },
  {
    key: 'local',
    name: 'Local Panel',
    description: 'Simplified panel for local competitions without electronic timing/displacement equipment: 4 execution, 1 difficulty, 1 head judge (penalties).',
    slots: [
      { role: 'execution',  judge_count: 4, drop_high: 1, drop_low: 1, combine: 'sum', multiplier: 1,  sort_order: 1 },
      { role: 'difficulty', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 2 },
      { role: 'head_judge', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: -1, sort_order: 3 },
    ],
  },
  {
    key: 'test',
    name: 'Test Panel',
    description: 'Test panel for development and testing purposes.',
    slots: [
      { role: 'execution',  judge_count: 1, drop_high: 1, drop_low: 1, combine: 'sum', multiplier: 1,  sort_order: 1 },
      { role: 'difficulty', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: 1,  sort_order: 2 },
      { role: 'head_judge', judge_count: 1, drop_high: 0, drop_low: 0, combine: 'sum', multiplier: -1, sort_order: 3 },
    ],
  },
];

module.exports = function applySeedDefaults(db) {
  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO judge_roles (key,name,granularity,is_deduction,max_value,score_min,score_max)
    VALUES (?,?,?,?,?,?,?)
  `);
  for (const r of JUDGE_ROLES) {
    insertRole.run(r.key, r.name, r.granularity, r.is_deduction, r.max_value, r.score_min, r.score_max);
  }

  const roleIdByKey = new Map(
    db.prepare('SELECT id,key FROM judge_roles').all().map(r => [r.key, r.id])
  );

  const insertTemplate = db.prepare(
    'INSERT OR IGNORE INTO panel_templates (key,name,description) VALUES (?,?,?)'
  );
  const insertSlot = db.prepare(`
    INSERT OR IGNORE INTO panel_template_slots
      (panel_template_id,judge_role_id,judge_count,drop_high,drop_low,combine,multiplier,sort_order,shared_assignment_group)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);

  for (const t of PANEL_TEMPLATES) {
    insertTemplate.run(t.key, t.name, t.description);
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
        s.shared_assignment_group || null
      );
    }
  }
};
