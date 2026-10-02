const optionalText = (value) => String(value ?? '').trim() || null;

const optionalInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
};

// the gender column only accepts m or f, so anything else is stored as unset
exports.normalizeGender = (value) => {
    const gender = String(value ?? '').trim().toLowerCase();
    return gender === 'm' || gender === 'f' ? gender : null;
};

// returns { error: key } with a key under admin:sportsmanForm.errors, or { values } ready for the crud layer
exports.parseSportsmanInput = (body, competition) => {
    const name = optionalText(body.name);
    if (!name) return { error: 'nameRequired' };

    const isSynchro = competition.type === 'synchro';
    const partnerName = isSynchro ? optionalText(body.partner_name) : null;
    if (isSynchro && !partnerName) return { error: 'partnerNameRequired' };

    return {
        values: {
            name,
            club: optionalText(body.club),
            gender: exports.normalizeGender(body.gender),
            birth_year: optionalInt(body.birth_year),
            routine: optionalText(body.routine),
            group_id: optionalInt(body.group_id),
            partner: {
                name: partnerName,
                club: isSynchro ? optionalText(body.partner_club) : null,
                gender: isSynchro ? exports.normalizeGender(body.partner_gender) : null,
                birth_year: isSynchro ? optionalInt(body.partner_birth_year) : null,
            },
        },
    };
};
