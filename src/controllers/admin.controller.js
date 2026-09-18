const { getAdminStats } = require("../services/helpers/admin.helpers");
const { getCompetitionById, getTopCompetitions, getCompetitions, createCompetitionDB, updateCompetitionDB, updateCompetitionStatusDB, deleteCompetitionDB } = require("../services/db/competitions.crud");
const { getGroupsByCompetition, getGroupsRoundCount, addGroupDB, deleteGroupDB, getGroupById } = require("../services/db/groups.crud");
const { getPanels, getAssignedCount, addAssignment, getAssignmentById, checkAlreadyAssigned } = require("../services/db/panels.crud");
const { getJudgesForCompetition, resolveAssignmentGroup, removeJudgeFromRole } = require("../services/panels.service");
const { getSportsmenByCompetition, addSportsmanDB, getSportsmenById, updateSportsmanDB, deleteSportsmanDB, getAvailableSportsmen } = require("../services/db/sportsmen.crud");
const { deleteUserDB, getUsers, getUserById } = require("../services/db/users.crud");
const { createUsersXlsx, isXlsxBuffer, parseUsersXlsx, createSportsmenXlsx, parseSportsmenXlsx } = require("../services/files.service");
const { createUser, updateUser } = require("../services/users.service");
const { orderAvailableByPreviousRound, randomizeEntryOrder } = require("../services/entries.service");
const { createAttempts } = require("../services/attempts.service");
const { getRoundsByGroup, addRoundDB, deleteRoundDB, getRoundByIdWithCompGroupInfo, getPreviousRoundInfo, getRoundById } = require("../services/db/rounds.crud");
const { getEntriesWithAttemptsInfo, addEntryDB, getEntryMaxOrder, addAllEntriesDB, deleteEntryDB } = require("../services/db/entries.crud");
const { renderNotFound } = require("../services/errors.service");

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
        return renderNotFound(res, req.t('errors:notFound.generic'));
    res.render('admin/user-form', { user, action: `/admin/users/${user.id}` });
};

exports.addUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
        return res.status(400).render('admin/user-form', {
        user: null, action: '/admin/users',
        error: req.t('admin:userForm.errors.required'),
        });
    }
    try {
        await createUser(name, email, password, role);
    } catch {
        return res.status(422).render('admin/user-form', {
        user: null, action: '/admin/users',
        error: req.t('admin:userForm.errors.emailInUse'),
        });
    }
    req.session.flash = { success: req.t('admin:flash.users.created', { name }) };
    res.redirect('/admin/users');
};

exports.updateUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    const action = `/admin/users/${req.params.id}`;
    const user = getUserById(req.params.id);
    if (!user) 
        return renderNotFound(res, req.t('errors:notFound.generic'));
    if (!name || !email) {
        return res.status(400).render('admin/user-form', {
        user, action, error: req.t('admin:userForm.errors.requiredNameEmail'),
        });
    }
    try {
        await updateUser(req.params.id, name, email, password, role);
    } catch {
        return res.status(422).render('admin/user-form', {
        user, action, error: req.t('admin:userForm.errors.emailInUse'),
        });
    }
    req.session.flash = { success: req.t('admin:flash.users.updated') };
    res.redirect('/admin/users');
};

exports.uploadUsers = async (req, res) => {
    if (!req.file) {
        req.session.flash = { error: req.t('admin:users.errors.noFile') };
        return res.redirect('/admin/users');
    }
    if (!(await isXlsxBuffer(req.file.buffer))) {
        req.session.flash = { error: req.t('admin:users.errors.invalidFileType') };
        return res.redirect('/admin/users');
    }
    const { created, skipped } = await parseUsersXlsx(req.file.buffer);
    req.session.flash = { success: req.t('admin:flash.users.importComplete', { created, skipped }) };
    res.redirect('/admin/users');
};

exports.deleteUser = async (req, res) => {
    deleteUserDB(req.params.id);
    req.session.flash = { success: req.t('admin:flash.users.deleted') };
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
        error: req.t('admin:competitionForm.errors.nameRequired'),
        });
    }
    createCompetitionDB(name, date, panel_template_id);
    req.session.flash = { success: req.t('admin:flash.competitions.created', { name }) };
    res.redirect('/admin/competitions');
};

exports.getEditCompetitionForm = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.generic'));
    const panelTemplates = getPanels();
    res.render('admin/competition-form', { competition, action: `/admin/competitions/${competition.id}`, panelTemplates });
};

exports.updateCompetition = async (req, res) => {
    const { name, date, panel_template_id } = req.body;
    if (!name || !name.trim()) {
        const panelTemplates = getPanels();
        return res.status(400).render('admin/competition-form', {
        competition: null, action: '/admin/competitions', panelTemplates,
        error: req.t('admin:competitionForm.errors.nameRequired'),
        });
    }
    updateCompetitionDB(req.params.id, name, date, panel_template_id);
    req.session.flash = { success: req.t('admin:flash.competitions.updated') };
    res.redirect('/admin/competitions');
};

exports.updateCompetitionStatus = async (req, res) => {
    const { status } = req.body;
    if (!['planned', 'active', 'closed'].includes(status))
        return res.status(400).send(req.t('admin:errors.badStatus'));
    updateCompetitionStatusDB(req.params.id, status);
    req.session.flash = { success: req.t('admin:flash.competitions.statusSet', { status: req.t(`common:status.${status}`) }) };
    res.redirect('/admin/competitions');
};

exports.deleteCompetition = async (req, res) => {
    deleteCompetitionDB(req.params.id);
    req.session.flash = { success: req.t('admin:flash.competitions.deleted') };
    res.redirect('/admin/competitions');
};


// Judges
exports.getJudges = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));

    if (!competition.panel_template_id)
        return res.render('admin/judges', { competition, panelTemplate: null, roles: [] });

    const { panelTemplate, groups: roles } = getJudgesForCompetition(competition);
    res.render('admin/judges', { competition, panelTemplate, roles });
};

exports.addJudge = async (req, res) => {
    const { judge_role_id, user_id } = req.body;
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));

    const group = resolveAssignmentGroup(competition.panel_template_id, Number(judge_role_id));
    if (!group)
        return res.status(400).send(req.t('admin:judges.errors.unknownRole'));
    const anchor = `#role-${group.groupKey}`;

    // A user may only hold one role per competition
    const alreadyAssignedElsewhere = checkAlreadyAssigned(competition.id, user_id, group.judgeRoleIds)
    if (alreadyAssignedElsewhere) {
        req.session.flash = { error: req.t('admin:judges.errors.alreadyAssignedElsewhere') };
        return res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
    }
    const fullyAssignedCount = getAssignedCount(competition.id, group.judgeRoleIds);
    if (fullyAssignedCount >= group.required) {
        req.session.flash = { error: req.t('admin:judges.errors.roleFullyStaffed', { roleNames: group.roleKeys.map(k => req.t('common:judgeRoles.' + k)).join(' & ') }) };
        return res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
    }
    try {
        addAssignment(competition.id, user_id, group.judgeRoleIds);
        req.session.flash = { success: req.t('admin:flash.judges.assigned') };
    } catch {
        req.session.flash = { error: req.t('admin:judges.errors.alreadyAssignedToRole') };
    }
    res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
};

exports.removeJudge = async (req, res) => {
    const competition = getCompetitionById(req.params.id)
    if (!competition)
        return renderNotFound(res, req.t('errors:notFound.competition'));

    const assignment = getAssignmentById(req.params.assignmentId, competition.id);
    if (!assignment)
        return renderNotFound(res, req.t('errors:notFound.assignment'));

    const group = resolveAssignmentGroup(competition.panel_template_id, assignment.judge_role_id);
    const anchor = group ? `#role-${group.groupKey}` : '';
    removeJudgeFromRole(group, assignment.id, competition.id, assignment.user_id);
    req.session.flash = { success: req.t('admin:flash.judges.unassigned') };
    res.redirect(`/admin/competitions/${req.params.id}/judges${anchor}`);
};


// Sportsmen
exports.getSportsmen = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const sportsmen = getSportsmenByCompetition(req.params.id);
    res.render('admin/sportsmen', { competition, sportsmen });
};

exports.exportSportsmen = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));
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
        return renderNotFound(res, req.t('errors:notFound.competition'));
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
            error: req.t('admin:sportsmanForm.errors.nameRequired'),
        });
    }
    addSportsmanDB(name, club, gender, birth_year, routine, req.params.id, group_id);
    req.session.flash = { success: req.t('admin:flash.sportsmen.added', { name }) };
    res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
};

exports.getEditSportsmanForm = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const sportsman = getSportsmenById(req.params.sid);
    if (!sportsman) 
        return renderNotFound(res, req.t('errors:notFound.sportsman'));
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
            error: req.t('admin:sportsmanForm.errors.nameRequired'),
        });
    }
    updateSportsmanDB(req.params.sid, name, club, gender, birth_year, routine, group_id);
    req.session.flash = { success: req.t('admin:flash.sportsmen.updated') };
    res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
};

exports.deleteSportsman = async (req, res) => {
    deleteSportsmanDB(req.params.sid);
    req.session.flash = { success: req.t('admin:flash.sportsmen.deleted') };
    res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
};

exports.uploadSportsmen = async (req, res) => {
    if (!req.file) {
        req.session.flash = { error: req.t('admin:users.errors.noFile') };
        return res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
    }
    if (!(await isXlsxBuffer(req.file.buffer))) {
        req.session.flash = { error: req.t('admin:users.errors.invalidFileType') };
        return res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
    }

    const { created, skipped, unknownGroup } = parseSportsmenXlsx(req.params.id, req.file.buffer);
    const parts = [
        req.t('admin:flash.sportsmen.importAdded', { count: created }),
        req.t('admin:flash.sportsmen.importSkipped', { count: skipped }),
    ];
    if (unknownGroup > 0) parts.push(req.t('admin:flash.sportsmen.importUnknownGroup', { count: unknownGroup }));
    req.session.flash = { success: req.t('admin:flash.sportsmen.importComplete', { parts: parts.join(', ') }) };
    res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
};


// Groups
exports.getGroups = async (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const groups = getGroupsRoundCount(req.params.id);
    res.render('admin/groups', { competition, groups });
};

exports.addGroup = async (req, res) => {
    const { name, abbreviation } = req.body;
    const competition = getCompetitionById(req.params.id);
    const groups = getGroupsRoundCount(req.params.id);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));
    if (!name || !name.trim()) {
        return res.status(400).render('admin/groups', { competition, groups, error: req.t('admin:groups.errors.nameRequired') });
    }
    if (!abbreviation || !abbreviation.trim()) {
        return res.status(400).render('admin/groups', { competition, groups, error: req.t('admin:groups.errors.abbreviationRequired') });
    }
    try {
        addGroupDB(name, abbreviation, req.params.id);
    } catch {
        return res.status(422).render('admin/groups', { competition, groups, error: req.t('admin:groups.errors.abbreviationInUse', { abbreviation: abbreviation.trim() }) });
    }
    req.session.flash = { success: req.t('admin:flash.groups.created', { name }) };
    res.redirect(`/admin/competitions/${req.params.id}/groups`);
};

exports.deleteGroup = async (req, res) => {
    deleteGroupDB(req.params.gid, req.params.id);
    req.session.flash = { success: req.t('admin:flash.groups.deleted') };
    res.redirect(`/admin/competitions/${req.params.id}/groups`);
};


// Rounds
exports.getRounds = async (req, res) => {
    const competition = getCompetitionById(req.params.cid);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const group = getGroupById(req.params.gid);
    if (!group) 
        return renderNotFound(res, req.t('errors:notFound.group'));
    const rounds = getRoundsByGroup(req.params.gid);
    res.render('admin/rounds', { competition, group, rounds });
};

exports.addRound = async (req, res) => {
    const { name, round_order, scoring_mode } = req.body;
    const competition = getCompetitionById(req.params.cid);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.generic'));
    const group = getGroupById(req.params.gid);
    if (!group) 
        return renderNotFound(res, req.t('errors:notFound.generic'));

    const renderWithError = (error) => {
        const rounds = getRoundsByGroup(req.params.gid);
        return res.status(400).render('admin/rounds', { competition, group, rounds, error });
    };
    if (!name || !name.trim())
        return renderWithError(req.t('admin:rounds.errors.nameRequired'));
    if (round_order !== undefined && round_order !== '' && (isNaN(round_order) || Number(round_order) < 0))
        return renderWithError(req.t('admin:rounds.errors.orderInvalid'));
    const validScoringMode = ['sum', 'best_attempt'].includes(scoring_mode) ? scoring_mode : 'sum';
    addRoundDB(req.params.gid, name, round_order, validScoringMode);
    req.session.flash = { success: req.t('admin:flash.rounds.added', { name }) };
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds`);
};

exports.deleteRound = async (req, res) => {
    deleteRoundDB(req.params.rid, req.params.gid);
    req.session.flash = { success: req.t('admin:flash.rounds.deleted') };
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds`);
};


// Entries
exports.getEntries = async (req, res) => {
    const { cid, gid, rid } = req.params;

    const competition = getCompetitionById(cid);
    if (!competition) 
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const group = getGroupById(gid);
    if (!group) 
        return renderNotFound(res, req.t('errors:notFound.group'));

    const round = getRoundByIdWithCompGroupInfo(rid, gid);
    if (!round) 
        return renderNotFound(res, req.t('errors:notFound.round'));

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
        req.session.flash = { success: req.t('admin:flash.entries.added') };
    } catch {
        req.session.flash = { error: req.t('admin:entries.errors.alreadyInRound') };
    }
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
};

exports.addAllEntries = async (req, res) => {
    const { cid, gid, rid } = req.params;
    const round = getRoundById(rid);
    if (!round)
        return renderNotFound(res, req.t('errors:notFound.round'));

    const available = getAvailableSportsmen(round.competition_id, round.group_id, rid);

    const maxOrder = getEntryMaxOrder(rid);

    addAllEntriesDB(available, rid, maxOrder);
    req.session.flash = { success: req.t('admin:flash.entries.addedAll', { count: available.length }) };
    res.redirect(`/admin/competitions/${cid}/groups/${gid}/rounds/${rid}/entries`);
};

exports.randomizeEntries = async (req, res) => {
    const { cid, gid, rid } = req.params;
    const round = getRoundById(rid);
    if (!round)
        return renderNotFound(res, req.t('errors:notFound.round'));

    randomizeEntryOrder(rid);

    req.session.flash = { success: req.t('admin:flash.entries.randomized') };
    res.redirect(`/admin/competitions/${cid}/groups/${gid}/rounds/${rid}/entries`);
};

exports.removeEntry = async (req, res) => {
    deleteEntryDB(req.params.eid, req.params.rid);
    req.session.flash = { success: req.t('admin:flash.entries.removed') };
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
};

exports.addAttempts = async (req, res) => {
    const count = createAttempts(req.params.rid, req.body.attempt_count);
    req.session.flash = { success: req.t('admin:flash.entries.attemptsCreated', { count }) };
    res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
};