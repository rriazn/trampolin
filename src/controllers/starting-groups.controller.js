const { getCompetitionById } = require('../services/db/competitions.crud');
const { getGroupById, getGroupsByCompetition } = require('../services/db/groups.crud');
const { renderNotFound } = require('../services/errors.service');
const {
    getStartingGroupsByCompetition, getStartingGroupById, addStartingGroupDB, deleteStartingGroupDB,
    addGroupToStartingGroupDB, removeGroupFromStartingGroupDB, moveGroupInStartingGroupDB,
} = require('../services/db/starting-groups.crud');
const { checkCanJoin, isMembershipLocked } = require('../services/starting-groups.service');

const pageUrl = (req) => `/admin/competitions/${req.params.id}/starting-groups`;

const flashAndReturn = (req, res, key, options) => {
    req.session.flash = { error: req.t(key, options) };
    res.redirect(pageUrl(req));
};

const LOCKED_KEY = 'admin:startingGroups.errors.inProgress';

// the competition and starting group of the url, or an error handler that renders the 404
const loadStartingGroup = (req) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition) return { error: res => renderNotFound(res, req.t('errors:notFound.competition')) };
    const startingGroup = getStartingGroupById(req.params.sgid);
    if (!startingGroup || String(startingGroup.competition_id) !== String(competition.id))
        return { error: res => renderNotFound(res, req.t('errors:notFound.startingGroup')) };
    return { competition, startingGroup };
};

exports.getStartingGroups = (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition)
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const startingGroups = getStartingGroupsByCompetition(competition.id)
        .map(sg => ({ ...sg, locked: isMembershipLocked(sg) }));
    const availableGroups = getGroupsByCompetition(competition.id).filter(g => !g.starting_group_id);
    res.render('admin/starting-groups', { competition, startingGroups, availableGroups });
};

exports.addStartingGroup = (req, res) => {
    const competition = getCompetitionById(req.params.id);
    if (!competition)
        return renderNotFound(res, req.t('errors:notFound.competition'));
    const name = String(req.body.name ?? '').trim();
    if (!name) return flashAndReturn(req, res, 'admin:startingGroups.errors.nameRequired');
    try {
        addStartingGroupDB(competition.id, name);
    } catch {
        return flashAndReturn(req, res, 'admin:startingGroups.errors.nameInUse', { name });
    }
    req.session.flash = { success: req.t('admin:startingGroups.flash.created', { name }) };
    res.redirect(pageUrl(req));
};

exports.deleteStartingGroup = (req, res) => {
    const { startingGroup, error } = loadStartingGroup(req);
    if (error) return error(res);
    if (isMembershipLocked(startingGroup)) return flashAndReturn(req, res, LOCKED_KEY);
    deleteStartingGroupDB(startingGroup.id, startingGroup.competition_id);
    req.session.flash = { success: req.t('admin:startingGroups.flash.deleted') };
    res.redirect(pageUrl(req));
};

exports.addGroup = (req, res) => {
    const { startingGroup, error } = loadStartingGroup(req);
    if (error) return error(res);
    const group = getGroupById(req.body.group_id);
    if (!group) return flashAndReturn(req, res, 'admin:startingGroups.errors.groupRequired');

    const errorKey = checkCanJoin(group, startingGroup);
    if (errorKey) return flashAndReturn(req, res, errorKey);

    addGroupToStartingGroupDB(group.id, startingGroup.id);
    req.session.flash = { success: req.t('admin:startingGroups.flash.groupAdded') };
    res.redirect(pageUrl(req));
};

// the group of the url, only when it is a member of the starting group of the url
const loadMember = (req, startingGroup) => {
    const group = getGroupById(req.params.gid);
    return group && group.starting_group_id === startingGroup.id ? group : null;
};

exports.removeGroup = (req, res) => {
    const { startingGroup, error } = loadStartingGroup(req);
    if (error) return error(res);
    const group = loadMember(req, startingGroup);
    if (!group) return renderNotFound(res, req.t('errors:notFound.group'));
    if (isMembershipLocked(startingGroup)) return flashAndReturn(req, res, LOCKED_KEY);

    removeGroupFromStartingGroupDB(group.id);
    req.session.flash = { success: req.t('admin:startingGroups.flash.groupRemoved') };
    res.redirect(pageUrl(req));
};

exports.moveGroup = (req, res) => {
    const { startingGroup, error } = loadStartingGroup(req);
    if (error) return error(res);
    const group = loadMember(req, startingGroup);
    if (!group) return renderNotFound(res, req.t('errors:notFound.group'));
    if (isMembershipLocked(startingGroup)) return flashAndReturn(req, res, LOCKED_KEY);

    const { direction } = req.body;
    if (['up', 'down'].includes(direction) && moveGroupInStartingGroupDB(group.id, direction))
        req.session.flash = { success: req.t('admin:startingGroups.flash.moved') };
    res.redirect(pageUrl(req));
};
