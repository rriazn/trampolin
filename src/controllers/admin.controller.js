const { getAdminStats } = require("../services/admin-helpers");
const { getCompetitionById, getTopCompetitions, getCompetitions, createCompetitionDB, updateCompetitionDB, updateCompetitionStatusDB, deleteCompetitionDB } = require("../services/db/competitions.crud");
const { getGroupsByCompetition, getGroupsRoundCount, addGroupDB, deleteGroupDB, getGroupById } = require("../services/db/groups.crud");
const { getPanels, getAssignedCount, addAssignment, getAssignmentById, checkAlreadyAssigned } = require("../services/db/panels.crud");
const { getJudgesForCompetition, resolveAssignmentGroup, removeJudgeFromRole } = require("../services/panels");
const { getSportsmenByCompetition, addSportsmanDB, getSportsmenById, updateSportsmanDB, deleteSportsmanDB, getAvailableSportsmen } = require("../services/db/sportsmen.crud");
const { deleteUserDB, getUsers, getUserById } = require("../services/db/users.crud");
const { createUsersXlsx, isXlsxBuffer, parseUsersXlsx, createSportsmenXlsx, parseSportsmenXlsx } = require("../services/files");
const { createUser, updateUser } = require("../services/users");
const { orderAvailableByPreviousRound, randomizeEntryOrder } = require("../services/entries");
const { createAttempts } = require("../services/attempts");
const { getRoundsByGroup, addRoundDB, deleteRoundDB, getRoundByIdWithCompGroupInfo, getPreviousRoundInfo, getRoundById } = require("../services/db/rounds.crud");
const { getEntriesWithAttemptsInfo, addEntryDB, getEntryMaxOrder, addAllEntriesDB, deleteEntryDB } = require("../services/db/entries.crud");
const { renderNotFound } = require("../services/errors");

// Dashboard
exports.getDashboard = async (req, res) => {
    const stats = getAdminStats();
    const competitions = getTopCompetitions(5);
    res.render('admin/dashboard', { stats, competitions });
};

// Users
exports.getUsers = async (req, res) => {
    const users = getUsers();
    res.render('admin/users', { users });
};

exports.exportUsers = async (req, res) => {
    const users = getUsers();
    const buf = createUsersXlsx(users);
    res.setHeader('Content-Disposition', 'attachment; filename="referees.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
};

exports.getNewUserForm = async (req, res) => {
    res.render('admin/user-form', { user: null, action: '/admin/users' });
};

exports.getEditUserForm = async (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) 
        return renderNotFound(res, 'Not found');
    res.render('admin/user-form', { user, action: `/admin/users/${user.id}` });
};

exports.addUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
        return res.status(400).render('admin/user-form', {
        user: null, action: '/admin/users',
        error: 'Name, email and password are required.',
        });
    }
    try {
        await createUser(name, email, password, role);
    } catch {
        return res.status(422).render('admin/user-form', {
        user: null, action: '/admin/users',
        error: 'Email already in use.',
        });
    }
    req.session.flash = { success: `User "${name}" created.` };
    res.redirect('/admin/users');
};

exports.updateUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    const action = `/admin/users/${req.params.id}`;
    const user = getUserById(req.params.id);
    if (!user) 
        return renderNotFound(res, 'Not found');
    if (!name || !email) {
        return res.status(400).render('admin/user-form', {
        user, action, error: 'Name and email are required.',
        });
    }
    try {
        await updateUser(req.params.id, name, email, password, role);
    } catch {
        return res.status(422).render('admin/user-form', {
        user, action, error: 'Email already in use.',
        });
    }
    req.session.flash = { success: 'User updated.' };
    res.redirect('/admin/users');
};

exports.uploadUsers = async (req, res) => {
    if (!req.file) {
        req.session.flash = { error: 'No file uploaded.' };
        return res.redirect('/admin/users');
    }
    if (!(await isXlsxBuffer(req.file.buffer))) {
        req.session.flash = { error: 'Invalid file type. Please upload an Excel file.' };
        return res.redirect('/admin/users');
    }
    const { created, skipped } = await parseUsersXlsx(req.file.buffer);
    req.session.flash = { success: `Import complete: ${created} added, ${skipped} skipped (duplicate/invalid).` };
    res.redirect('/admin/users');
};

exports.deleteUser = async (req, res) => {
    deleteUserDB(req.params.id);
    req.session.flash = { success: 'User deleted.' };
    res.redirect('/admin/users');
};

// Competitions
exports.getCompetitions = async (req, res) => {
    const competitions = getCompetitions();
    res.render('admin/competitions', { competitions });
};

exports.getNewCompetitionForm = async (req, res) => {
    const panelTemplates = getPanels();
    res.render('admin/competition-form', { competition: null, action: '/admin/competitions', panelTemplates });
};

exports.addCompetition = async (req, res) => {
    const { name, date, panel_template_id } = req.body;
    if (!name || !name.trim()) {
        const panelTemplates = getPanels();
        return res.status(400).render('admin/competition-form', {
        competition: null, action: '/admin/competitions', panelTemplates,
        error: 'Competition name is required.',
        });
    }
    createCompetitionDB(name, date, panel_template_id);
    req.session.flash = { success: `Competition "${name}" created.` };
    res.redirect('/admin/competitions');
};

exports.getEditCompetitionForm = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Not found');
    const panelTemplates = getPanels();
    res.render('admin/competition-form', { competition, action: `/admin/competitions/${competition.id}`, panelTemplates });
};

exports.updateCompetition = async (req, res) => {
    const { name, date, panel_template_id } = req.body;
    if (!name || !name.trim()) {
        const panelTemplates = getPanels();
        return res.status(400).render('admin/competition-form', {
        competition: null, action: '/admin/competitions', panelTemplates,
        error: 'Competition name is required.',
        });
    }
    updateCompetitionDB(req.params.id, name, date, panel_template_id);
    req.session.flash = { success: 'Competition updated.' };
    res.redirect('/admin/competitions');
};

exports.updateCompetitionStatus = async (req, res) => {
    const { status } = req.body;
    if (!['planned', 'active', 'closed'].includes(status)) 
        return res.status(400).send('Bad status');
    updateCompetitionStatusDB(req.params.id, status);
    req.session.flash = { success: `Status set to "${status}".` };
    res.redirect('/admin/competitions');
};

exports.deleteCompetition = async (req, res) => {
    deleteCompetitionDB(req.params.id);
    req.session.flash = { success: 'Competition and all associated data deleted.' };
    res.redirect('/admin/competitions');
};


// Judges
exports.getJudges = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');

    if (!competition.panel_template_id)
        return res.render('admin/judges', { competition, panelTemplate: null, roles: [] });

    const { panelTemplate, groups: roles } = getJudgesForCompetition(competition);
    res.render('admin/judges', { competition, panelTemplate, roles });
};

exports.addJudge = async (req, res) => {
    const { judge_role_id, user_id } = req.body;
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');

    const group = resolveAssignmentGroup(competition.panel_template_id, Number(judge_role_id));
    if (!group) 
        return res.status(400).send('Unknown role for this competition\'s panel.');
    const anchor = `#role-${group.groupKey}`;

    // A user may only hold one role per competition
    const alreadyAssignedElsewhere = checkAlreadyAssigned(competition.id, user_id, group.judgeRoleIds)
    if (alreadyAssignedElsewhere) {
        req.session.flash = { error: 'This user is already assigned to another judge role in this competition.' };
        return res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
    }
    const fullyAssignedCount = getAssignedCount(competition.id, group.judgeRoleIds);
    if (fullyAssignedCount >= group.required) {
        req.session.flash = { error: `${group.names.join(' & ')} is already fully staffed.` };
        return res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
    }
    try {
        addAssignment(competition.id, user_id, group.judgeRoleIds);
        req.session.flash = { success: 'Judge assigned.' };
    } catch {
        req.session.flash = { error: 'This judge is already assigned to that role.' };
    }
    res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
};

exports.removeJudge = async (req, res) => {
    const competition = getCompetitionById(req.params.id)
    if (!competition) 
        return renderNotFound(res, 'Competition not found');

    const assignment = getAssignmentById(req.params.assignmentId, competition.id);
    if (!assignment) 
        return renderNotFound(res, 'Assignment not found');

    const group = resolveAssignmentGroup(competition.panel_template_id, assignment.judge_role_id);
    const anchor = group ? `#role-${group.groupKey}` : '';
    removeJudgeFromRole(group, assignment.id, competition.id, assignment.user_id);
    req.session.flash = { success: 'Judge unassigned.' };
    res.redirect(`/admin/competitions/${req.params.id}/judges${anchor}`);
};


// Sportsmen
exports.getSportsmen = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');
    const sportsmen = getSportsmenByCompetition(req.params.id);
    res.render('admin/sportsmen', { competition, sportsmen });
};

exports.exportSportsmen = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');
    const clean_comp_name = competition.name
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // eslint-disable-line no-control-regex
        .replace(/\s+/g, '-')
        .replace(/\.+$/, '')
        .trim();
    const buf = createSportsmenXlsx(competition.id);
    res.setHeader('Content-Disposition', `attachment; filename="sportsmen-${clean_comp_name}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
};

exports.getNewSportsmanForm = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');
    const groups = getGroupsByCompetition(req.params.id);
    res.render('admin/sportsman-form', {
        sportsman: null,
        competition,
        groups,
        action: `/admin/competitions/${req.params.id}/sportsmen`,
    });
};

exports.addSportsman = async (req, res) => {
    const { name, club, gender, birth_year, routine, group_id } = req.body;
    if (!name || !name.trim()) {
        const competition = getCompetitionById(req.params.id);
        const groups = getGroupsByCompetition(req.params.id);
        return res.status(400).render('admin/sportsman-form', {
            sportsman: null, competition, groups,
            action: `/admin/competitions/${req.params.id}/sportsmen`,
            error: 'Name is required.',
        });
    }
    addSportsmanDB(name, club, gender, birth_year, routine, req.params.id, group_id);
    req.session.flash = { success: `Athlete "${name}" added.` };
    res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
};

exports.getEditSportsmanForm = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');
    const sportsman = getSportsmenById(req.params.sid);
    if (!sportsman) 
        return renderNotFound(res, 'Sportsman not found');
    const groups = getGroupsByCompetition(req.params.id);
    res.render('admin/sportsman-form', {
        sportsman,
        competition,
        groups,
        action: `/admin/competitions/${req.params.id}/sportsmen/${sportsman.id}`,
    });
};

exports.updateSportsman = async (req, res) => {
    const { name, club, gender, birth_year, routine, group_id } = req.body;
    if (!name || !name.trim()) {
        const competition = getCompetitionById(req.params.id);
        const groups = getGroupsByCompetition(req.params.id);
        const sportsman = getSportsmenById(req.params.sid);
        return res.status(400).render('admin/sportsman-form', {
            sportsman, competition, groups,
            action: `/admin/competitions/${req.params.id}/sportsmen/${req.params.sid}`,
            error: 'Name is required.',
        });
    }
    updateSportsmanDB(req.params.sid, name, club, gender, birth_year, routine, group_id);
    req.session.flash = { success: 'Athlete updated.' };
    res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
};

exports.deleteSportsman = async (req, res) => {
    deleteSportsmanDB(req.params.sid);
    req.session.flash = { success: 'Athlete deleted.' };
    res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
};

exports.uploadSportsmen = async (req, res) => {
    if (!req.file) {
        req.session.flash = { error: 'No file uploaded.' };
        return res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
    }
    if (!(await isXlsxBuffer(req.file.buffer))) {
        req.session.flash = { error: 'Invalid file type. Please upload an Excel file.' };
        return res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
    }
    
    const { created, skipped, unknownGroup } = parseSportsmenXlsx(req.params.id, req.file.buffer);
    const parts = [`${created} added`, `${skipped} skipped (missing name)`];
    if (unknownGroup > 0) parts.push(`${unknownGroup} without group (unknown abbreviation)`);
    req.session.flash = { success: `Import complete: ${parts.join(', ')}.` };
    res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
};


// Groups
exports.getGroups = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');
    const groups = getGroupsRoundCount(req.params.id);
    res.render('admin/groups', { competition, groups });
};

exports.addGroup = async (req, res) => {
    const { name, abbreviation } = req.body;
    const competition = getCompetitionById(req.params.id);
    const groups = getGroupsRoundCount(req.params.id);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');
    if (!name || !name.trim()) {
        return res.status(400).render('admin/groups', { competition, groups, error: 'Group name is required.' });
    }
    if (!abbreviation || !abbreviation.trim()) {
        return res.status(400).render('admin/groups', { competition, groups, error: 'Group abbreviation is required.' });
    }
    try {
        addGroupDB(name, abbreviation, req.params.id);
    } catch {
        return res.status(422).render('admin/groups', { competition, groups, error: `Abbreviation "${abbreviation.trim()}" is already used by another group in this competition.` });
    }
    req.session.flash = { success: `Group "${name}" created.` };
    res.redirect(`/admin/competitions/${req.params.id}/groups`);
};

exports.deleteGroup = async (req, res) => {
    deleteGroupDB(req.params.gid, req.params.id);
    req.session.flash = { success: 'Group deleted.' };
    res.redirect(`/admin/competitions/${req.params.id}/groups`);
};


// Rounds
exports.getRounds = async (req, res) => {
    const competition = getCompetitionById(req.params.cid);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');
    const group = getGroupById(req.params.gid);
    if (!group) 
        return renderNotFound(res, 'Group not found');
    const rounds = getRoundsByGroup(req.params.gid);
    res.render('admin/rounds', { competition, group, rounds });
};

exports.addRound = async (req, res) => {
    const { name, round_order, scoring_mode } = req.body;
    const competition = getCompetitionById(req.params.cid);
    if (!competition) 
        return renderNotFound(res, 'Not found');
    const group = getGroupById(req.params.gid);
    if (!group) 
        return renderNotFound(res, 'Not found');

    const renderWithError = (error) => {
        const rounds = getRoundsByGroup(req.params.gid);
        return res.status(400).render('admin/rounds', { competition, group, rounds, error });
    };
    if (!name || !name.trim()) 
        return renderWithError('Round name is required.');
    if (round_order !== undefined && round_order !== '' && (isNaN(round_order) || Number(round_order) < 0))
        return renderWithError('Round order must be a non-negative number.');
    const validScoringMode = ['sum', 'best_attempt'].includes(scoring_mode) ? scoring_mode : 'sum';
    addRoundDB(req.params.gid, name, round_order, validScoringMode);
    req.session.flash = { success: `Round "${name}" added.` };
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds`);
};

exports.deleteRound = async (req, res) => {
    deleteRoundDB(req.params.rid, req.params.gid);
    req.session.flash = { success: 'Round deleted.' };
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds`);
};


// Entries
exports.getEntries = async (req, res) => {
    const { cid, gid, rid } = req.params;

    const competition = getCompetitionById(cid);
    if (!competition) 
        return renderNotFound(res, 'Competition not found');
    const group = getGroupById(gid);
    if (!group) 
        return renderNotFound(res, 'Group not found');

    const round = getRoundByIdWithCompGroupInfo(rid, gid);
    if (!round) 
        return renderNotFound(res, 'Round not found');

    const entries = getEntriesWithAttemptsInfo(rid);

    // Get all sportsmen in this round's group that are not already in this round
    let available = getAvailableSportsmen(round.competition_id, round.group_id, rid);

    // If a previous round exists in this group, rank available athletes by their placement there
    const prevRound = getPreviousRoundInfo(round.group_id, round.round_order);

    if (prevRound) {
        available = orderAvailableByPreviousRound(competition, prevRound, available)
    }

    res.render('admin/entries', { round, entries, available, prevRound: prevRound || null });
};

exports.addEntry = async (req, res) => {
    const { sportsman_id, start_order } = req.body;
    try {
        addEntryDB(req.params.rid, sportsman_id, start_order);
        req.session.flash = { success: 'Athlete added to round.' };
    } catch {
        req.session.flash = { error: 'Athlete already in this round.' };
    }
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
};

exports.addAllEntries = async (req, res) => {
    const { cid, gid, rid } = req.params;
    const round = getRoundById(rid);
    if (!round) 
        return renderNotFound(res, 'Round not found');

    const available = getAvailableSportsmen(round.competition_id, round.group_id, rid);

    const maxOrder = getEntryMaxOrder(rid);

    addAllEntriesDB(available, rid, maxOrder);
    req.session.flash = { success: `${available.length} athlete(s) added to the round.` };
    res.redirect(`/admin/competitions/${cid}/groups/${gid}/rounds/${rid}/entries`);
};

exports.randomizeEntries = async (req, res) => {
    const { cid, gid, rid } = req.params;
    const round = getRoundById(rid);
    if (!round) 
        return renderNotFound(res, 'Round not found');

    randomizeEntryOrder(rid);

    req.session.flash = { success: `Start order randomized.` };
    res.redirect(`/admin/competitions/${cid}/groups/${gid}/rounds/${rid}/entries`);
};

exports.removeEntry = async (req, res) => {
    deleteEntryDB(req.params.eid, req.params.rid);
    req.session.flash = { success: 'Entry removed.' };
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
};

exports.addAttempts = async (req, res) => {
    const count = createAttempts(req.params.rid, req.body.attempt_count);
    req.session.flash = { success: `${count} attempt(s) created for all entries.` };
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
};