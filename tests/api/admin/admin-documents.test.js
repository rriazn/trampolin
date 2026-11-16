import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';
import { createApp, loginAdmin, loginReferee, db } from '../helpers/createApp.js';

const require = createRequire(import.meta.url);
const { buildExampleTemplate } = require('../../../src/services/pdf-template.service.js');
const { compilePdf } = require('../../../src/services/pdf.service.js');
const stubT = (key) => {
  const [ns, keyPath] = key.split(':');
  return keyPath.split('.').reduce((node, part) => node?.[part], require(`../../../src/locales/en/${ns}.json`));
};
// a PDF design with the given text, markers are written as {{name}}
const design = (text) => compilePdf(`#set page(width: 200pt, height: 100pt, margin: 10pt)\n${text}`, {}, stubT);

const app = createApp();
let admin;
let referee;
let closedId;
let activeId;

// collects a binary response body as a Buffer
const binary = (res, callback) => {
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

function seedCompetition(name, status) {
  const panel = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run(name, status, panel.id);
  const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('Group A', comp.lastInsertRowid, 'GA');
  const round = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Final', 1);
  const sportsman = db.prepare('INSERT INTO sportsmen (name, club, competition_id, group_id) VALUES (?, ?, ?, ?)')
    .run('Alice', 'Club A', comp.lastInsertRowid, group.lastInsertRowid);
  const entry = db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)')
    .run(round.lastInsertRowid, sportsman.lastInsertRowid, 1);
  db.prepare('INSERT INTO attempts (entry_id, attempt_number) VALUES (?, ?)').run(entry.lastInsertRowid, 1);
  return Number(comp.lastInsertRowid);
}

beforeAll(async () => {
  admin = await loginAdmin(app);
  referee = await loginReferee(app);
  closedId = seedCompetition('Closed Cup Österreich', 'closed');
  activeId = seedCompetition('Running Cup', 'active');
});

describe('POST /admin/competitions/:id/documents/results', () => {
  it('returns 403 when unauthenticated and for a referee', async () => {
    expect((await request(app).post(`/admin/competitions/${closedId}/documents/results`)).status).toBe(403);
    expect((await referee.post(`/admin/competitions/${closedId}/documents/results`)).status).toBe(403);
  });

  it('returns 404 for an unknown competition', async () => {
    const res = await admin.post('/admin/competitions/999999/documents/results');
    expect(res.status).toBe(404);
  });

  it('redirects with an error when the competition is not closed', async () => {
    const res = await admin.post(`/admin/competitions/${activeId}/documents/results`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/admin/competitions/${activeId}/documents`);
    expect((await admin.get(`/admin/competitions/${activeId}/documents`)).text).toContain('only available for closed competitions');
  });

  it('sends the PDF as an attachment named after the competition', async () => {
    const res = await admin.post(`/admin/competitions/${closedId}/documents/results`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="results-closed-cup-osterreich.pdf"');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('uses an uploaded template for that download', async () => {
    const source = '#let d = json("results.json")\n= #d.competition.name';
    const res = await admin.post(`/admin/competitions/${closedId}/documents/results`)
      .attach('template', Buffer.from(source), 'mine.typ').buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('redirects with the Typst error, line and column when the template is broken', async () => {
    const res = await admin.post(`/admin/competitions/${closedId}/documents/results`).attach('template', Buffer.from('= Title\n#let x = '), 'broken.typ');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/admin/competitions/${closedId}/documents`);
    const page = (await admin.get(`/admin/competitions/${closedId}/documents`)).text;
    expect(page).toContain('Template error at line 2, column 8: expected expression');
  });

  it('redirects with an error for a file that is not a .typ file', async () => {
    const res = await admin.post(`/admin/competitions/${closedId}/documents/results`).attach('template', Buffer.from('hello'), 'notes.txt');
    expect(res.status).toBe(302);
    expect((await admin.get(`/admin/competitions/${closedId}/documents`)).text).toContain('must be a .typ file');
  });

  it('redirects with an error for a template over 256 KB', async () => {
    const res = await admin.post(`/admin/competitions/${closedId}/documents/results`).attach('template', Buffer.alloc(256 * 1024 + 10, 'a'), 'big.typ');
    expect(res.status).toBe(302);
    expect((await admin.get(`/admin/competitions/${closedId}/documents`)).text).toContain('larger than 256 KB');
  });
});

describe('GET /admin/competitions/:id/documents', () => {
  it('returns 403 for a referee and 404 for an unknown competition', async () => {
    expect((await referee.get(`/admin/competitions/${closedId}/documents`)).status).toBe(403);
    expect((await admin.get('/admin/competitions/999999/documents')).status).toBe(404);
  });

  it('is available for competitions that are not closed', async () => {
    expect((await admin.get(`/admin/competitions/${activeId}/documents`)).status).toBe(200);
    expect((await admin.get(`/admin/competitions/${closedId}/documents`)).status).toBe(200);
  });
});

describe('POST /admin/competitions/:id/documents/results/preview', () => {
  const url = () => `/admin/competitions/${closedId}/documents/results/preview`;

  it('returns 403 for a referee and 404 for an unknown competition', async () => {
    expect((await referee.post(url())).status).toBe(403);
    expect((await admin.post('/admin/competitions/999999/documents/results/preview')).status).toBe(404);
  });

  it('renders the uploaded template with the sample data inline', async () => {
    const res = await admin.post(url()).attach('template', Buffer.from('#let d = json("results.json")\n#d.competition.name'), 'mine.typ')
      .buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('works for a competition that is not closed', async () => {
    const res = await admin.post(`/admin/competitions/${activeId}/documents/results/preview`)
      .attach('template', Buffer.from('= Hello'), 'mine.typ').buffer(true).parse(binary);
    expect(res.status).toBe(200);
  });

  it('redirects with an error when no file is chosen', async () => {
    const res = await admin.post(url());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/admin/competitions/${closedId}/documents`);
    expect((await admin.get(`/admin/competitions/${closedId}/documents`)).text).toContain('Choose a .typ template file first');
  });

  it('redirects with the Typst error when the template is broken', async () => {
    const res = await admin.post(url()).attach('template', Buffer.from('#let x = '), 'broken.typ');
    expect(res.status).toBe(302);
    expect((await admin.get(`/admin/competitions/${closedId}/documents`)).text).toContain('expected expression');
  });
});

describe('GET /admin/competitions/:id/documents/results/template', () => {
  it('downloads the default template', async () => {
    const res = await admin.get(`/admin/competitions/${closedId}/documents/results/template`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment; filename="default-template.typ"');
    expect(res.text).toContain('json("results.json")');
  });

  it('returns 403 for a referee and 404 for an unknown competition', async () => {
    expect((await referee.get(`/admin/competitions/${closedId}/documents/results/template`)).status).toBe(403);
    expect((await admin.get('/admin/competitions/999999/documents/results/template')).status).toBe(404);
  });
});

describe('removed routes', () => {
  it('no longer serves the old results routes or the sample data', async () => {
    expect((await admin.get('/admin/results/sample-data')).status).toBe(404);
    expect((await admin.get('/admin/results/default-template')).status).toBe(404);
    expect((await admin.post('/admin/results/preview')).status).toBe(404);
    expect((await admin.post(`/admin/competitions/${closedId}/results`)).status).toBe(404);
  });
});

// entry names from the central directory of a zip
function zipEntryNames(zip) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    const nameLength = zip.readUInt16LE(offset + 28);
    names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return names;
}

// one group per case: Done (all rounds completed), Running (a round in progress), Empty (completed round, no athletes)
function seedCertificateCompetition(name, status = 'active') {
  const panel = db.prepare("SELECT id FROM panel_templates WHERE key='fig'").get();
  const comp = Number(db.prepare('INSERT INTO competitions (name, status, panel_template_id) VALUES (?, ?, ?)').run(name, status, panel.id).lastInsertRowid);
  const groups = {};
  for (const [key, roundStatus, athlete] of [['Done', 'completed', 'Alice'], ['Running', 'in_progress', 'Bob'], ['Empty', 'completed', null]]) {
    const group = Number(db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run(key, comp, key.slice(0, 2).toUpperCase()).lastInsertRowid);
    db.prepare('INSERT INTO rounds (group_id, name, round_order, status) VALUES (?, ?, 1, ?)').run(group, 'Final', roundStatus);
    if (athlete) db.prepare('INSERT INTO sportsmen (name, club, competition_id, group_id) VALUES (?, ?, ?, ?)').run(athlete, 'Club', comp, group);
    groups[key] = group;
  }
  return { comp, groups };
}

describe('certificates routes', () => {
  let cup;
  let otherCup;
  const groupUrl = (compId, groupId) => `/admin/competitions/${compId}/groups/${groupId}/documents/certificates`;
  const allUrl = (compId) => `/admin/competitions/${compId}/documents/certificates`;
  const flash = async (compId) => (await admin.get(`/admin/competitions/${compId}/documents`)).text;

  beforeAll(() => {
    cup = seedCertificateCompetition('Certificate Cup');
    otherCup = seedCertificateCompetition('Other Cup');
  });

  describe('POST /admin/competitions/:id/groups/:gid/documents/certificates', () => {
    it('returns 403 when unauthenticated and for a referee', async () => {
      expect((await request(app).post(groupUrl(cup.comp, cup.groups.Done))).status).toBe(403);
      expect((await referee.post(groupUrl(cup.comp, cup.groups.Done))).status).toBe(403);
    });

    it('returns 404 for an unknown competition, an unknown group and a group of another competition', async () => {
      expect((await admin.post(groupUrl(999999, cup.groups.Done))).status).toBe(404);
      expect((await admin.post(groupUrl(cup.comp, 999999))).status).toBe(404);
      expect((await admin.post(groupUrl(cup.comp, otherCup.groups.Done))).status).toBe(404);
    });

    it('sends the PDF of a ready group named after the competition and the group', async () => {
      const res = await admin.post(groupUrl(cup.comp, cup.groups.Done)).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toBe('attachment; filename="certificates-certificate-cup-done.pdf"');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('redirects with an error while the rounds of the group are still running', async () => {
      const res = await admin.post(groupUrl(cup.comp, cup.groups.Running));
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`/admin/competitions/${cup.comp}/documents`);
      expect(await flash(cup.comp)).toContain('rounds of this group are not finished');
    });

    it('redirects with an error for a ready group without participants', async () => {
      const res = await admin.post(groupUrl(cup.comp, cup.groups.Empty));
      expect(res.status).toBe(302);
      expect(await flash(cup.comp)).toContain('This group has no participants');
    });

    it('accepts any group of a closed competition', async () => {
      const closed = seedCertificateCompetition('Closed Certificate Cup', 'closed');
      const res = await admin.post(groupUrl(closed.comp, closed.groups.Running)).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('prints the data on an uploaded PDF template for that download', async () => {
      const res = await admin.post(groupUrl(cup.comp, cup.groups.Done))
        .attach('template', await buildExampleTemplate(stubT), 'mine.pdf').buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('redirects with an error for a template that is not a PDF, such as a .typ file', async () => {
      const res = await admin.post(groupUrl(cup.comp, cup.groups.Done)).attach('template', Buffer.from('= Title'), 'mine.typ');
      expect(res.status).toBe(302);
      expect(await flash(cup.comp)).toContain('The template must be a PDF file');
    });

    it('redirects with an error for a PDF template with an unknown marker', async () => {
      const res = await admin.post(groupUrl(cup.comp, cup.groups.Done)).attach('template', await design('{{name}} {{colour}}'), 'mine.pdf');
      expect(res.status).toBe(302);
      expect(await flash(cup.comp)).toContain('Unknown marker in the PDF template: colour');
    });

    it('redirects with an error for a PDF template without a name marker', async () => {
      const res = await admin.post(groupUrl(cup.comp, cup.groups.Done)).attach('template', await design('Hello'), 'mine.pdf');
      expect(res.status).toBe(302);
      expect(await flash(cup.comp)).toContain('needs a {{name}} marker');
    });

  });

  describe('POST /admin/competitions/:id/documents/certificates', () => {
    it('returns 403 when unauthenticated and for a referee, 404 for an unknown competition', async () => {
      expect((await request(app).post(allUrl(cup.comp))).status).toBe(403);
      expect((await referee.post(allUrl(cup.comp))).status).toBe(403);
      expect((await admin.post(allUrl(999999))).status).toBe(404);
    });

    it('sends a ZIP with one PDF for every ready group that has participants', async () => {
      const res = await admin.post(allUrl(cup.comp)).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/zip');
      expect(res.headers['content-disposition']).toBe('attachment; filename="certificates-certificate-cup.zip"');
      expect(zipEntryNames(res.body)).toEqual(['certificates-certificate-cup-done.pdf']);
    });

    it('puts every group of a closed competition into the ZIP', async () => {
      const closed = seedCertificateCompetition('Closed ZIP Cup', 'closed');
      const res = await admin.post(allUrl(closed.comp)).buffer(true).parse(binary);
      expect(zipEntryNames(res.body)).toEqual(['certificates-closed-zip-cup-done.pdf', 'certificates-closed-zip-cup-running.pdf']);
    });

    it('keeps the entries apart when two groups have the same file name', async () => {
      const twins = seedCertificateCompetition('Twin Cup');
      db.prepare("UPDATE groups SET name='Group A' WHERE id=?").run(twins.groups.Done);
      db.prepare("UPDATE groups SET name='Group-A' WHERE id=?").run(twins.groups.Running);
      db.prepare("UPDATE rounds SET status='completed' WHERE group_id=?").run(twins.groups.Running);
      const res = await admin.post(allUrl(twins.comp)).buffer(true).parse(binary);
      expect(zipEntryNames(res.body).sort()).toEqual(['certificates-twin-cup-group-a-2.pdf', 'certificates-twin-cup-group-a.pdf']);
    });

    it('uses an uploaded PDF template for every PDF in the ZIP', async () => {
      const res = await admin.post(allUrl(cup.comp)).attach('template', await buildExampleTemplate(stubT), 'mine.pdf').buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(zipEntryNames(res.body)).toEqual(['certificates-certificate-cup-done.pdf']);
    });

    it('redirects with an error when no group is ready', async () => {
      const onlyRunning = seedCertificateCompetition('Running Only Cup');
      db.prepare("UPDATE rounds SET status='in_progress' WHERE group_id IN (SELECT id FROM groups WHERE competition_id=?)").run(onlyRunning.comp);
      const res = await admin.post(allUrl(onlyRunning.comp));
      expect(res.status).toBe(302);
      expect(await flash(onlyRunning.comp)).toContain('No group is ready for certificates yet');
    });

  });

  describe('POST /admin/competitions/:id/documents/certificates/preview', () => {
    const url = (compId = cup.comp) => `${allUrl(compId)}/preview`;

    it('returns 403 for a referee and 404 for an unknown competition', async () => {
      expect((await referee.post(url())).status).toBe(403);
      expect((await admin.post(url(999999))).status).toBe(404);
    });

    it('renders an uploaded PDF template with the sample data, also for a competition without ready groups', async () => {
      const res = await admin.post(url()).attach('template', await buildExampleTemplate(stubT), 'mine.pdf').buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('inline');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('redirects with an error when no template is chosen', async () => {
      const res = await admin.post(url());
      expect(res.status).toBe(302);
      expect(await flash(cup.comp)).toContain('Choose a PDF template first');
    });

    it('redirects with an error when the template is not a PDF', async () => {
      const res = await admin.post(url()).attach('template', Buffer.from('#let x = '), 'broken.typ');
      expect(res.status).toBe(302);
      expect(await flash(cup.comp)).toContain('The template must be a PDF file');
    });
  });

  describe('GET /admin/competitions/:id/documents/certificates/template', () => {
    it('downloads an example PDF template that works as an upload', async () => {
      const res = await admin.get(`${allUrl(cup.comp)}/template`).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename="certificates-example-template.pdf"');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
      const used = await admin.post(groupUrl(cup.comp, cup.groups.Done)).attach('template', res.body, 'example.pdf').buffer(true).parse(binary);
      expect(used.status).toBe(200);
    });

    it('returns 403 for a referee and 404 for an unknown competition', async () => {
      expect((await referee.get(`${allUrl(cup.comp)}/template`)).status).toBe(403);
      expect((await admin.get(`${allUrl(999999)}/template`)).status).toBe(404);
    });
  });
});

describe('starting lists routes', () => {
  let cup;
  let otherCup;
  let emptyCup;
  const roundUrl = (compId, groupId, roundId) => `/admin/competitions/${compId}/groups/${groupId}/rounds/${roundId}/documents/starting-list`;
  const allUrl = (compId) => `/admin/competitions/${compId}/documents/starting-lists`;
  const flash = async (compId) => (await admin.get(`/admin/competitions/${compId}/documents`)).text;

  // one group with a round that has an athlete and a round without entries
  function seedStartingListCompetition(name) {
    const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run(name, 'active');
    const group = db.prepare('INSERT INTO groups (name, competition_id, abbreviation) VALUES (?, ?, ?)').run('Open', comp.lastInsertRowid, 'OP');
    const full = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Final', 1);
    const empty = db.prepare('INSERT INTO rounds (group_id, name, round_order) VALUES (?, ?, ?)').run(group.lastInsertRowid, 'Extra', 2);
    const sp = db.prepare('INSERT INTO sportsmen (name, competition_id, group_id) VALUES (?, ?, ?)').run('Alice', comp.lastInsertRowid, group.lastInsertRowid);
    db.prepare('INSERT INTO entries (round_id, sportsman_id, start_order) VALUES (?, ?, ?)').run(full.lastInsertRowid, sp.lastInsertRowid, 1);
    return { comp: Number(comp.lastInsertRowid), group: Number(group.lastInsertRowid), full: Number(full.lastInsertRowid), empty: Number(empty.lastInsertRowid) };
  }

  beforeAll(() => {
    cup = seedStartingListCompetition('Start Cup');
    otherCup = seedStartingListCompetition('Other Start Cup');
    const comp = db.prepare('INSERT INTO competitions (name, status) VALUES (?, ?)').run('Empty Start Cup', 'active');
    emptyCup = Number(comp.lastInsertRowid);
  });

  describe('GET /admin/competitions/:id/groups/:gid/rounds/:rid/documents/starting-list', () => {
    const entriesUrl = (c) => `/admin/competitions/${c.comp}/groups/${c.group}/rounds/${c.empty}/entries`;

    it('returns 403 when unauthenticated and for a referee', async () => {
      expect((await request(app).get(roundUrl(cup.comp, cup.group, cup.full))).status).toBe(403);
      expect((await referee.get(roundUrl(cup.comp, cup.group, cup.full))).status).toBe(403);
    });

    it('returns 404 for an unknown competition, a group or a round of another competition', async () => {
      expect((await admin.get(roundUrl(999999, cup.group, cup.full))).status).toBe(404);
      expect((await admin.get(roundUrl(cup.comp, otherCup.group, otherCup.full))).status).toBe(404);
      expect((await admin.get(roundUrl(cup.comp, cup.group, otherCup.full))).status).toBe(404);
      expect((await admin.get(roundUrl(cup.comp, cup.group, 999999))).status).toBe(404);
    });

    it('sends the PDF named after the competition, the group and the round', async () => {
      const res = await admin.get(roundUrl(cup.comp, cup.group, cup.full)).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toBe('attachment; filename="starting-list-start-cup-open-final.pdf"');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('redirects back to the entries page with an error for a round without entries', async () => {
      const res = await admin.get(roundUrl(cup.comp, cup.group, cup.empty));
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(entriesUrl(cup));
      expect((await admin.get(entriesUrl(cup))).text).toContain('This round has no competitors yet');
    });

    it('no longer accepts a POST', async () => {
      expect((await admin.post(roundUrl(cup.comp, cup.group, cup.full))).status).toBe(404);
    });
  });

  describe('POST /admin/competitions/:id/documents/starting-lists', () => {
    it('returns 403 for a referee and 404 for an unknown competition', async () => {
      expect((await referee.post(allUrl(cup.comp))).status).toBe(403);
      expect((await admin.post(allUrl(999999))).status).toBe(404);
    });

    it('sends one PDF with every round that has entries', async () => {
      const res = await admin.post(allUrl(cup.comp)).buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe('attachment; filename="starting-lists-start-cup.pdf"');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('redirects with an error when no round has entries', async () => {
      const res = await admin.post(allUrl(emptyCup));
      expect(res.status).toBe(302);
      expect(await flash(emptyCup)).toContain('No round has competitors yet');
    });
  });

  describe('POST /admin/competitions/:id/documents/starting-lists/preview', () => {
    const url = () => `${allUrl(cup.comp)}/preview`;

    it('returns 403 for a referee and 404 for an unknown competition', async () => {
      expect((await referee.post(url())).status).toBe(403);
      expect((await admin.post(`${allUrl(999999)}/preview`)).status).toBe(404);
    });

    it('renders the uploaded template with the sample data inline', async () => {
      const res = await admin.post(url()).attach('template', Buffer.from('#let d = json("starting-lists.json")\n#d.labels.title'), 'mine.typ')
        .buffer(true).parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('inline');
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('redirects with an error when no file is chosen', async () => {
      const res = await admin.post(url());
      expect(res.status).toBe(302);
      expect(await flash(cup.comp)).toContain('Choose a .typ template file first');
    });

    it('redirects with the Typst error when the template is broken', async () => {
      await admin.post(url()).attach('template', Buffer.from('#let x = '), 'broken.typ');
      expect(await flash(cup.comp)).toContain('expected expression');
    });
  });

  describe('GET /admin/competitions/:id/documents/starting-lists/template', () => {
    it('downloads the default template', async () => {
      const res = await admin.get(`${allUrl(cup.comp)}/template`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment; filename="starting-lists-template.typ"');
      expect(res.text).toContain('json("starting-lists.json")');
    });

    it('returns 403 for a referee and 404 for an unknown competition', async () => {
      expect((await referee.get(`${allUrl(cup.comp)}/template`)).status).toBe(403);
      expect((await admin.get(`${allUrl(999999)}/template`)).status).toBe(404);
    });
  });
});
