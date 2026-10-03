import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, loginAdmin, loginReferee, db } from '../helpers/createApp.js';

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
