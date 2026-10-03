// default certificates template, reads certificates.json (data contract version 1) and does no maths
#let d = json("certificates.json")
#let l = d.labels

#set document(title: d.competition.name + " " + d.group.name)
#set page(
  paper: "a4",
  margin: (x: 28mm, y: 24mm),
  // simple double frame
  background: {
    place(center + horizon, rect(width: 100% - 20mm, height: 100% - 20mm, stroke: 1.5pt))
    place(center + horizon, rect(width: 100% - 26mm, height: 100% - 26mm, stroke: 0.4pt))
  },
)
#set text(font: "Lato", size: 14pt, lang: "en")
#set par(spacing: 0pt)

#let certificate(c, last) = {
  align(center + horizon)[
    #text(size: 44pt, weight: "bold")[#l.title]
    #v(12mm)
    #l.participation
    #v(5mm)
    #text(size: 22pt, weight: "bold")[#d.competition.name]
    #if d.competition.date != none [
      #v(3mm)
      #d.competition.date
    ]
    #v(18mm)
    #text(size: 32pt, weight: "bold")[#c.name]
    #if c.club != none [
      #v(3mm)
      #text(size: 14pt)[#c.club]
    ]
    #if c.partner != none [
      #v(6mm)
      #l.with
      #v(3mm)
      #text(size: 20pt, weight: "bold")[#c.partner.name]
      #if c.partner.club != none [
        #v(2mm)
        #text(size: 12pt)[#c.partner.club]
      ]
    ]
    #v(12mm)
    #l.group: #strong[#d.group.name]
    #if c.placeText != none [
      #v(10mm)
      #text(size: 26pt, weight: "bold")[#c.placeText]
      #v(3mm)
      #l.score: #strong[#c.score] (#c.round)
    ]
  ]
  if not last { pagebreak() }
}

#for (i, c) in d.certificates.enumerate() {
  certificate(c, i == d.certificates.len() - 1)
}
