// example certificate design for admins, it is exported as a PDF and its {{markers}} are replaced by the app
#let d = json("certificates.json")
#let l = d.labels

#set page(
  paper: "a4",
  margin: (x: 28mm, y: 24mm),
  background: {
    place(center + horizon, rect(width: 100% - 20mm, height: 100% - 20mm, stroke: 1.5pt))
    place(center + horizon, rect(width: 100% - 26mm, height: 100% - 26mm, stroke: 0.4pt))
  },
)
#set text(font: "Lato", size: 14pt)
#set par(spacing: 0pt)

#align(center + horizon)[
  #text(size: 44pt, weight: "bold")[#l.title]
  #v(12mm)
  #l.participation
  #v(5mm)
  #text(size: 22pt, weight: "bold")[{{competition}}]
  #v(3mm)
  {{date}}
  #v(18mm)
  #text(size: 32pt, weight: "bold")[{{name}}]
  #v(3mm)
  {{club}}
  #v(6mm)
  #text(size: 18pt)[{{partner}}]
  #v(2mm)
  #text(size: 12pt)[{{partnerClub}}]
  #v(3mm)
  {{partnerLine}}
  #v(12mm)
  #l.group: {{group}}
  #v(10mm)
  #text(size: 26pt, weight: "bold")[{{place}}]
  #v(3mm)
  {{score}}
  #v(1mm)
  {{round}}
]
