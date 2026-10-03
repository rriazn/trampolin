// prints the data of every certificate onto the page of an uploaded PDF design, at the positions of its markers
#let d = json("certificates.json")
#let layout = json("layout.json")

#set document(title: d.competition.name + " " + d.group.name)
#set page(
  width: layout.page.width * 1pt,
  height: layout.page.height * 1pt,
  margin: 0pt,
  background: image("background.pdf", width: 100%, height: 100%),
)
#set text(font: "Lato")
#set par(spacing: 0pt)

// the text of a marker for one certificate, none when there is nothing to print
#let value(c, key) = {
  if key == "name" { c.name }
  else if key == "club" { c.club }
  else if key == "partner" { if c.partner != none { c.partner.name } }
  else if key == "partnerClub" { if c.partner != none { c.partner.club } }
  else if key == "partnerLine" { if c.partner != none { d.labels.with + " " + c.partner.name } }
  else if key == "place" { c.placeText }
  else if key == "score" { c.score }
  else if key == "round" { c.round }
  else if key == "group" { d.group.name }
  else if key == "competition" { d.competition.name }
  else if key == "date" { d.competition.date }
}

// text wider than the page minus the margin on each side is made smaller, and text is kept inside the margins
#let margin = 15mm
#let max-width = layout.page.width * 1pt - 2 * margin

#let certificate(c) = {
  // the marker text of the design is covered, so put markers on plain areas
  for m in layout.markers {
    place(top + left, dx: (m.x - 1) * 1pt, dy: (m.y - m.size * 0.85 - 1) * 1pt,
      rect(width: (m.width + 2) * 1pt, height: (m.size * 1.15 + 2) * 1pt, fill: white, stroke: none))
  }
  for m in layout.markers {
    let v = value(c, m.key)
    if v != none and v != "" {
      context {
        let size = m.size * 1pt
        let edges = (top-edge: "baseline", bottom-edge: "baseline")
        let width = measure(text(size: size, ..edges, v)).width
        let fitted = if width > max-width { size * (max-width / width) } else { size }
        let body = text(size: fitted, ..edges, v)
        let width = measure(body).width
        // centred on the marker, moved inside the margins when it would cross them
        let dx = calc.min(calc.max((m.x + m.width / 2) * 1pt - width / 2, margin), layout.page.width * 1pt - margin - width)
        // the baseline of the text on the baseline of the marker
        place(top + left, dx: dx, dy: m.y * 1pt, body)
      }
    }
  }
}

#for (i, c) in d.certificates.enumerate() {
  certificate(c)
  if i < d.certificates.len() - 1 { pagebreak() }
}
