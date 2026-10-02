const clean = (value) => (value || '').trim();

exports.competitorName = (name, partnerName) => {
    const partner = clean(partnerName);
    return partner ? `${clean(name)} / ${partner}` : clean(name);
};

exports.competitorClub = (club, partnerClub) => {
    const first = clean(club);
    const second = clean(partnerClub);
    if (first && second && first !== second) return `${first} / ${second}`;
    return first || second || null;
};
