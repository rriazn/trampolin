import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginAdmin, db } from '../helpers/createApp.js';

const app = createApp();
let agent;
let seq = 0;

beforeAll(async () => {
  agent = await loginAdmin(app);
});

// a competition with the given groups, each with one round per attempt count and two athletes
function seedCompetition(groupSpecs) {
  seq += 1;
  const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run(`SG Admin Cup ${seq}`, 'active').lastInsertRowid;
  const groups = groupSpecs.map((attemptCounts, gi) => {
    const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run(`Grp ${seq}-${gi}`, comp, `A${seq}${gi}`).lastInsertRowid;
    const sportsmen = [1, 2].map((k) => db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run(`Ath ${seq}-${gi}-${k}`, comp, group).lastInsertRowid);
    const rounds = attemptCounts.map((count, ri) => {
      const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group, `R${ri + 1}`, ri + 1).lastInsertRowid;
      sportsmen.forEach((sp, k) => {
        const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(round, sp, k + 1).lastInsertRowid;
        for (let n = 1; n <= count; n++) db.prepare('INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)').run(entry, n);
      });
      return round;
    });
    return { id: group, rounds };
  });
  return { comp, groups };
}

const base = (comp) => `/admin/competitions/${comp}/starting-groups`;
const groupRow = (id) => db.prepare('SELECT starting_group_id, starting_group_position FROM groups WHERE id=?').get(id);
const create = async (comp, name) => {
  await agent.post(base(comp)).type('form').send({ name });
  return db.prepare('SELECT * FROM starting_groups WHERE competition_id=? AND name=?').get(comp, name);
};
const follow = async (res) => (await agent.get(res.headers.location)).text;

describe('GET /admin/competitions/:id/starting-groups', () => {
  it('returns 403 when unauthenticated', async () => {
    const { comp } = seedCompetition([[1]]);
    expect((await request(app).get(base(comp))).status).toBe(403);
  });

  it('returns 404 for a non-existent competition', async () => {
    const res = await agent.get(base(99999));
    expect(res.status).toBe(404);
    expect(res.text).toContain('Competition not found');
  });

  it('lists the starting groups with their groups', async () => {
    const { comp, groups } = seedCompetition([[1], [1]]);
    const sg = await create(comp, 'Block 1');
    await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[0].id });

    const res = await agent.get(base(comp));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Block 1');
    expect(res.text).toContain(`Grp ${seq}-0`);
  });
});

describe('POST /admin/competitions/:id/starting-groups', () => {
  it('returns 403 when unauthenticated', async () => {
    const { comp } = seedCompetition([[1]]);
    expect((await request(app).post(base(comp)).type('form').send({ name: 'X' })).status).toBe(403);
  });

  it('creates a starting group', async () => {
    const { comp } = seedCompetition([[1]]);

    const res = await agent.post(base(comp)).type('form').send({ name: '  Block 1 ' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(base(comp));
    expect(db.prepare('SELECT name FROM starting_groups WHERE competition_id=?').all(comp).map(r => r.name)).toEqual(['Block 1']);
  });

  it('refuses an empty name', async () => {
    const { comp } = seedCompetition([[1]]);
    const res = await agent.post(base(comp)).type('form').send({ name: '  ' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM starting_groups WHERE competition_id=?').get(comp).n).toBe(0);
    expect(await follow(res)).toContain('name is required');
  });

  it('refuses a name that is already used in the competition', async () => {
    const { comp } = seedCompetition([[1]]);
    await create(comp, 'Block 1');
    const res = await agent.post(base(comp)).type('form').send({ name: 'Block 1' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM starting_groups WHERE competition_id=?').get(comp).n).toBe(1);
    expect(await follow(res)).toContain('already exists');
  });

  it('returns 404 for a non-existent competition', async () => {
    expect((await agent.post(base(99999)).type('form').send({ name: 'X' })).status).toBe(404);
  });
});

describe('POST .../starting-groups/:sgid/groups', () => {
  it('adds groups at the end in the order they were added', async () => {
    const { comp, groups } = seedCompetition([[1], [1]]);
    const sg = await create(comp, 'S');

    const res = await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[1].id });
    await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[0].id });

    expect(res.status).toBe(302);
    expect(groupRow(groups[1].id)).toEqual({ starting_group_id: sg.id, starting_group_position: 1 });
    expect(groupRow(groups[0].id)).toEqual({ starting_group_id: sg.id, starting_group_position: 2 });
  });

  it('refuses a group without rounds', async () => {
    const { comp, groups } = seedCompetition([[1], []]);
    const sg = await create(comp, 'S');
    const res = await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[1].id });
    expect(groupRow(groups[1].id).starting_group_id).toBeNull();
    expect(await follow(res)).toContain('has no rounds');
  });

  it('refuses a group whose round has no attempts', async () => {
    const { comp, groups } = seedCompetition([[1], [0]]);
    const sg = await create(comp, 'S');
    const res = await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[1].id });
    expect(groupRow(groups[1].id).starting_group_id).toBeNull();
    expect(await follow(res)).toContain('no attempts yet');
  });

  it('refuses a group whose rounds do not match the members', async () => {
    const { comp, groups } = seedCompetition([[2], [3]]);
    const sg = await create(comp, 'S');
    await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[0].id });
    const res = await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[1].id });
    expect(groupRow(groups[1].id).starting_group_id).toBeNull();
    expect(await follow(res)).toContain('same number of rounds');
  });

  it('refuses while a member round is in progress', async () => {
    const { comp, groups } = seedCompetition([[1], [1]]);
    const sg = await create(comp, 'S');
    await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[0].id });
    db.prepare("UPDATE rounds SET status='in_progress' WHERE id=?").run(groups[0].rounds[0]);

    const res = await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[1].id });

    expect(groupRow(groups[1].id).starting_group_id).toBeNull();
    expect(await follow(res)).toContain('in progress');
  });

  it('refuses a group of another competition', async () => {
    const { comp } = seedCompetition([[1]]);
    const other = seedCompetition([[1]]);
    const sg = await create(comp, 'S');
    await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: other.groups[0].id });
    expect(groupRow(other.groups[0].id).starting_group_id).toBeNull();
  });

  it('returns 404 for a starting group of another competition', async () => {
    const { comp } = seedCompetition([[1]]);
    const other = seedCompetition([[1]]);
    const sg = await create(other.comp, 'S');
    const res = await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: 1 });
    expect(res.status).toBe(404);
  });
});

describe('POST .../starting-groups/:sgid/groups/:gid/delete and move', () => {
  async function setupThree() {
    const s = seedCompetition([[1], [1], [1]]);
    const sg = await create(s.comp, 'S');
    for (const g of s.groups) await agent.post(`${base(s.comp)}/${sg.id}/groups`).type('form').send({ group_id: g.id });
    return { ...s, sg };
  }

  it('removes a group and closes the gap', async () => {
    const { comp, groups, sg } = await setupThree();

    const res = await agent.post(`${base(comp)}/${sg.id}/groups/${groups[0].id}/delete`);

    expect(res.status).toBe(302);
    expect(groupRow(groups[0].id)).toEqual({ starting_group_id: null, starting_group_position: null });
    expect(groupRow(groups[1].id).starting_group_position).toBe(1);
    expect(groupRow(groups[2].id).starting_group_position).toBe(2);
  });

  it('moves a group up and down', async () => {
    const { comp, groups, sg } = await setupThree();

    await agent.post(`${base(comp)}/${sg.id}/groups/${groups[2].id}/move`).type('form').send({ direction: 'up' });
    expect(groups.map(g => groupRow(g.id).starting_group_position)).toEqual([1, 3, 2]);

    await agent.post(`${base(comp)}/${sg.id}/groups/${groups[2].id}/move`).type('form').send({ direction: 'down' });
    expect(groups.map(g => groupRow(g.id).starting_group_position)).toEqual([1, 2, 3]);
  });

  it('ignores an unknown direction', async () => {
    const { comp, groups, sg } = await setupThree();
    await agent.post(`${base(comp)}/${sg.id}/groups/${groups[1].id}/move`).type('form').send({ direction: 'sideways' });
    expect(groups.map(g => groupRow(g.id).starting_group_position)).toEqual([1, 2, 3]);
  });

  it('refuses to remove or move while a member round is in progress', async () => {
    const { comp, groups, sg } = await setupThree();
    db.prepare("UPDATE rounds SET status='in_progress' WHERE id=?").run(groups[0].rounds[0]);

    const removed = await agent.post(`${base(comp)}/${sg.id}/groups/${groups[1].id}/delete`);
    await agent.post(`${base(comp)}/${sg.id}/groups/${groups[1].id}/move`).type('form').send({ direction: 'up' });

    expect(groups.map(g => groupRow(g.id).starting_group_position)).toEqual([1, 2, 3]);
    expect(groupRow(groups[1].id).starting_group_id).toBe(sg.id);
    expect(await follow(removed)).toContain('in progress');
  });

  it('returns 404 for a group that is not in the starting group', async () => {
    const { comp, sg } = await setupThree();
    const outsider = seedCompetition([[1]]);
    expect((await agent.post(`${base(comp)}/${sg.id}/groups/${outsider.groups[0].id}/delete`)).status).toBe(404);
  });
});

describe('POST .../starting-groups/:sgid/delete', () => {
  it('deletes the starting group and the groups run alone again', async () => {
    const { comp, groups } = seedCompetition([[1], [1]]);
    const sg = await create(comp, 'S');
    for (const g of groups) await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: g.id });

    const res = await agent.post(`${base(comp)}/${sg.id}/delete`);

    expect(res.status).toBe(302);
    expect(db.prepare('SELECT COUNT(*) AS n FROM starting_groups WHERE id=?').get(sg.id).n).toBe(0);
    expect(groups.map(g => groupRow(g.id))).toEqual([
      { starting_group_id: null, starting_group_position: null }, { starting_group_id: null, starting_group_position: null },
    ]);
  });

  it('refuses while a member round is in progress', async () => {
    const { comp, groups } = seedCompetition([[1]]);
    const sg = await create(comp, 'S');
    await agent.post(`${base(comp)}/${sg.id}/groups`).type('form').send({ group_id: groups[0].id });
    db.prepare("UPDATE rounds SET status='in_progress' WHERE id=?").run(groups[0].rounds[0]);

    const res = await agent.post(`${base(comp)}/${sg.id}/delete`);

    expect(db.prepare('SELECT COUNT(*) AS n FROM starting_groups WHERE id=?').get(sg.id).n).toBe(1);
    expect(await follow(res)).toContain('in progress');
  });

  it('returns 404 for a starting group of another competition', async () => {
    const { comp } = seedCompetition([[1]]);
    const other = seedCompetition([[1]]);
    const sg = await create(other.comp, 'S');
    expect((await agent.post(`${base(comp)}/${sg.id}/delete`)).status).toBe(404);
  });
});

describe('locks on a group in a starting group', () => {
  async function grouped() {
    const s = seedCompetition([[2, 1]]);
    const sg = await create(s.comp, 'S');
    await agent.post(`${base(s.comp)}/${sg.id}/groups`).type('form').send({ group_id: s.groups[0].id });
    const roundsUrl = `/admin/competitions/${s.comp}/groups/${s.groups[0].id}/rounds`;
    return { ...s, roundsUrl, group: s.groups[0] };
  }

  it('refuses to add a round', async () => {
    const { roundsUrl, group } = await grouped();

    const res = await agent.post(roundsUrl).type('form').send({ name: 'Extra' });

    expect(db.prepare('SELECT COUNT(*) AS n FROM rounds WHERE group_id=?').get(group.id).n).toBe(2);
    expect(await follow(res)).toContain('Remove the group from its starting group first');
  });

  it('refuses to delete a round', async () => {
    const { roundsUrl, group } = await grouped();

    const res = await agent.post(`${roundsUrl}/${group.rounds[0]}/delete`);

    expect(db.prepare('SELECT COUNT(*) AS n FROM rounds WHERE group_id=?').get(group.id).n).toBe(2);
    expect(await follow(res)).toContain('Remove the group from its starting group first');
  });

  it('refuses a different attempt count', async () => {
    const { roundsUrl, group } = await grouped();
    const count = () => db.prepare('SELECT MAX(a.attempt_number) AS n FROM attempts a JOIN entries e ON e.id=a.entry_id WHERE e.round_id=?').get(group.rounds[0]).n;

    const res = await agent.post(`${roundsUrl}/${group.rounds[0]}/attempts/bulk`).type('form').send({ attempt_count: 3 });

    expect(count()).toBe(2);
    expect(await follow(res)).toContain('Remove the group from its starting group first');
  });

  it('still gives a newly added athlete attempts when the count stays the same', async () => {
    const { comp, roundsUrl, group } = await grouped();
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Late', comp, group.id).lastInsertRowid;
    const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, 3)').run(group.rounds[0], sp).lastInsertRowid;

    await agent.post(`${roundsUrl}/${group.rounds[0]}/attempts/bulk`).type('form').send({ attempt_count: 2 });

    expect(db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE entry_id=?').get(entry).n).toBe(2);
  });

  it('allows adding and removing entries', async () => {
    const { comp, roundsUrl, group } = await grouped();
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Late', comp, group.id).lastInsertRowid;

    const res = await agent.post(`${roundsUrl}/${group.rounds[0]}/entries`).type('form').send({ sportsman_id: sp, start_order: 3 });

    expect(res.status).toBe(302);
    expect(db.prepare('SELECT COUNT(*) AS n FROM entries WHERE round_id=? AND sportsman_id=?').get(group.rounds[0], sp).n).toBe(1);
  });

  it('allows adding a round again after the group left the starting group', async () => {
    const { comp, roundsUrl, group } = await grouped();
    const sg = db.prepare('SELECT id FROM starting_groups WHERE competition_id=?').get(comp);
    await agent.post(`${base(comp)}/${sg.id}/groups/${group.id}/delete`);

    await agent.post(roundsUrl).type('form').send({ name: 'Extra' });

    expect(db.prepare('SELECT COUNT(*) AS n FROM rounds WHERE group_id=?').get(group.id).n).toBe(3);
  });
});
