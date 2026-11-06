const optionalText = (value) => String(value ?? '').trim() || null;

const optionalInt = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
};

// short gender labels per language, keyed by the stored value (m or f)
const GENDER_ABBREVIATIONS = {
    en: require('../locales/en/admin.json').sportsmen.genderAbbr,
    de: require('../locales/de/admin.json').sportsmen.genderAbbr,
};
exports.genderAbbreviation = (gender, lng) => (GENDER_ABBREVIATIONS[lng] || GENDER_ABBREVIATIONS.en)[gender] || '';

// stored value for every abbreviation of every language, the stored values m and f always work
const GENDER_BY_ABBREVIATION = { m: 'm', f: 'f' };
for (const abbreviations of Object.values(GENDER_ABBREVIATIONS)) {
    for (const [gender, abbreviation] of Object.entries(abbreviations)) GENDER_BY_ABBREVIATION[abbreviation.toLowerCase()] = gender;
}

// the gender column only accepts m or f, so anything else is stored as unset
exports.normalizeGender = (value) => {
    const gender = String(value ?? '').trim().toLowerCase();
    return Object.hasOwn(GENDER_BY_ABBREVIATION, gender) ? GENDER_BY_ABBREVIATION[gender] : null;
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
