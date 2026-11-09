// default starting lists template, reads starting-lists.json (data contract version 1) and does no maths
#let d = json("starting-lists.json")
#let l = d.labels

#set document(title: d.competition.name + " " + l.title)
#set page(
  paper: "a4",
  margin: (x: 16mm, y: 18mm),
  footer: context [
    #set text(size: 8pt)
    #d.competition.name #h(1fr) #d.generatedAt #h(1fr) #counter(page).display()
  ],
)
#set text(font: "Lato", size: 10pt, lang: "en")

// a missing value prints as an empty cell
#let value(v) = if v == none [] else [#v]

// a synchro partner goes on a second line in the same cell
#let stacked(c, key) = if c.partner == none { value(c.at(key)) } else [#value(c.at(key)) \ #value(c.partner.at(key))]

#let round-page(r) = {
  text(size: 9pt)[#d.competition.name#if d.competition.date != none [ · #d.competition.date]]
  v(2pt)
  text(size: 18pt, weight: "bold")[#l.title]
  v(4pt)
  text(size: 13pt, weight: "bold")[#r.group.name – #r.round.name]
  if r.startingGroup != none {
    v(2pt)
    text(size: 10pt)[#l.startingGroup: #r.startingGroup]
  }
  v(10pt)
  table(
    columns: (auto, 1fr, 1fr, auto, auto),
    stroke: (x, y) => if y == 0 { (bottom: 0.8pt) } else { (bottom: 0.3pt + luma(180)) },
    inset: (x: 5pt, y: 6pt),
    align: (x, y) => if x == 0 { right + top } else { left + top },
    table.header(..(l.position, l.name, l.club, l.birthYear, l.routine).map(h => strong(h))),
    ..r.competitors.map(c => (
      [#c.position],
      strong(stacked(c, "name")),
      stacked(c, "club"),
      stacked(c, "birthYear"),
      value(c.routine),
    )).flatten(),
  )
}

#for (i, r) in d.rounds.enumerate() {
  if i > 0 { pagebreak() }
  round-page(r)
}
