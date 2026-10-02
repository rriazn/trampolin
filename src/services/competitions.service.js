const { getPanelById, getUsersByCompetitionId } = require('./db/panels.crud');
const { getSportsmenByCompetition } = require('./db/sportsmen.crud');

const COMPETITION_TYPES = ['individual', 'synchro'];

// the type decides the athlete fields and panel, so it is frozen once either exists
exports.canChangeCompetitionType = (competitionId) => {
    return getSportsmenByCompetition(competitionId).length === 0
        && getUsersByCompetitionId(competitionId).length === 0;
};

exports.validateCompetitionInput = ({ name, type, panelTemplateId }, existing = null) => {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return { error: 'nameRequired' };

    // a disabled type select is not submitted, so a missing type keeps the current one
    const resolvedType = type === undefined ? (existing ? existing.type : 'individual') : type;
    if (!COMPETITION_TYPES.includes(resolvedType)) return { error: 'typeInvalid' };

    if (existing && resolvedType !== existing.type && !exports.canChangeCompetitionType(existing.id))
        return { error: 'typeLocked' };

    let templateId = null;
    if (panelTemplateId) {
        const template = getPanelById(Number(panelTemplateId));
        if (!template || template.competition_type !== resolvedType) return { error: 'panelTypeMismatch' };
        templateId = template.id;
    }

    return { values: { name: trimmedName, type: resolvedType, panelTemplateId: templateId } };
};
