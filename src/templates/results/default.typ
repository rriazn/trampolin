// default results template, reads results.json (data contract version 1) and does no maths
#let d = json("results.json")
#let l = d.labels

// widest attempt decides how many skill columns every table gets, at least ten
#let skill-columns = {
  let counts = (10,)
  for g in d.groups { for c in g.competitors { for r in c.rounds { for a in r.attempts { counts.push(a.elementCount) } } } }
  calc.max(..counts)
}
#let total-columns = skill-columns + 5

#set document(title: d.competition.name)
#set page(
  paper: "a4",
  margin: (x: 16mm, y: 18mm),
  footer: context if counter(page).get().first() > 1 [
    #set text(size: 8pt)
    #d.competition.name #h(1fr) #counter(page).display()
  ],
)
#set text(font: "Lato", size: 9pt, lang: "en")

#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  set text(size: 16pt)
  block(below: 14pt, it.body)
}
#show heading.where(level: 2): it => block(above: 0pt, below: 8pt, sticky: true, text(size: 11pt, it.body))

// title page
#align(center + horizon)[
  #text(size: 26pt, weight: "bold")[#l.title]
  #v(8pt)
  #text(size: 18pt)[#d.competition.name]
  #if d.competition.date != none [
    #v(2pt)
    #text(size: 12pt)[#d.competition.date]
  ]
]
#v(1fr)
#text(size: 11pt, weight: "bold")[#l.groups]
#outline(title: none, depth: 1)
#v(8pt)
#text(size: 8pt)[#l.generated: #d.generatedAt]

// the values of one judges row, dropped values in parentheses
#let judge-values(judges) = judges.map(j => if j.dropped [(#j.label #j.value)] else [#j.label #j.value]).join(h(8pt))

#let attempt-rows(a) = {
  let span = skill-columns + 3
  // small header: attempt label, skill numbers, landing, bonus, missing skill, sum
  let header = (
    table.hline(stroke: 0.5pt),
    table.cell[#text(size: 7pt, weight: "bold")[#l.attempt #a.number]],
    ..range(1, skill-columns + 1).map(n => text(size: 7pt)[#n]),
    text(size: 7pt)[L],
    text(size: 7pt)[+],
    text(size: 7pt)[−],
    text(size: 7pt)[Σ],
  )
  if a.status != "scored" {
    return (
      ..header,
      table.cell(colspan: total-columns)[#text(style: "italic")[#if a.status == "skipped" [#l.skipped] else [#l.pending]]],
    )
  }
  let rows = ()
  for r in a.rows {
    if r.kind == "tricks" {
      let cells = range(skill-columns).map(i => if i < r.tricks.len() and r.tricks.at(i) != none { r.tricks.at(i) } else { [] })
      rows += (
        table.cell(strong[#r.label]),
        ..cells,
        if r.landing != none [#r.landing],
        if r.bonus != none [#r.bonus],
        if r.missingSkill != none [#r.missingSkill],
        text(weight: "bold")[#r.total],
      )
    } else {
      rows += (
        table.cell(strong[#r.label]),
        table.cell(colspan: span, align: left + horizon)[#judge-values(r.judges)],
        text(weight: "bold")[#r.total],
      )
    }
  }
  // last line: one cell per judge type, skills performed, attempt total in a box
  let available = skill-columns + 3
  let item-span = calc.max(1, calc.floor((available - 2) / calc.max(1, a.summary.len())))
  rows += (
    table.hline(stroke: 0.3pt),
    table.cell[#text(size: 7pt, weight: "bold")[#l.total]],
    ..a.summary.map(s => table.cell(colspan: item-span)[#text(size: 7pt)[#s.label] #h(3pt) #s.value]),
    table.cell(colspan: available - item-span * a.summary.len())[#text(size: 7pt)[#l.skills: #a.elementCount]],
    table.cell(stroke: 0.9pt)[#text(weight: "bold")[#a.final]],
  )
  (..header, ..rows)
}

// one open table per round, horizontal rules only
#let round-table(r) = {
  let rank = if type(r.rank) == int { [ (#l.rank #r.rank)] } else []
  table(
    columns: (13mm, ..range(skill-columns).map(_ => 1fr), 1fr, 1fr, 1fr, 14mm),
    inset: (x: 2pt, y: 3.5pt),
    align: (col, _) => if col == 0 { left + horizon } else { center + horizon },
    stroke: none,
    table.hline(stroke: 1.2pt),
    table.cell(colspan: total-columns)[
      #set text(weight: "bold", size: 9.5pt)
      #r.name #h(1fr) #l.roundTotal: #r.total#rank
    ],
    ..r.attempts.map(attempt-rows).flatten(),
    table.hline(stroke: 1.2pt),
  )
}

#let competitor-block(c) = block(breakable: false, width: 100%, below: 32pt)[
  #heading(level: 2, outlined: false)[#c.place. #c.name#if c.club != none [, #c.club]]
  #for (i, r) in c.rounds.enumerate() [
    #if i > 0 { v(12pt) }
    #round-table(r)
  ]
]

#for g in d.groups [
  = #g.name
  #for c in g.competitors [#competitor-block(c)]
]

// judges page: role, abbreviation and name in separate columns, open like the other tables
#let judge-rows = {
  let rows = ()
  for (i, j) in d.judges.enumerate() {
    if i > 0 { rows.push(table.hline(stroke: 0.3pt)) }
    if j.members.len() == 0 {
      rows += (strong[#j.label], [], [])
    }
    for (k, m) in j.members.enumerate() {
      if k == 0 { rows.push(table.cell(rowspan: j.members.len(), strong[#j.label])) }
      rows += ([#m.label], [#m.name])
    }
  }
  rows
}

#heading(level: 1, outlined: false)[#l.judges]
#table(
  columns: (auto, 18mm, 1fr),
  inset: (x: 7pt, y: 4pt),
  stroke: none,
  table.hline(stroke: 1.2pt),
  ..judge-rows,
  table.hline(stroke: 1.2pt),
)
