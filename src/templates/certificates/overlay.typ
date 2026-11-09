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

// text is kept inside the margins and next to the design text on its line, and made smaller when it does not fit between them
#let margin = 15mm
#let page-width = layout.page.width * 1pt
#let min-scale = 0.5

#let certificate(c) = {
  // the marker text of the design is covered, so put markers on plain areas
  for m in layout.markers {
    // the box is a little wider than the marker, the tip of a brace can stick out of the measured width
    let pad = calc.max(1, m.size * 0.12)
    place(top + left, dx: (m.x - pad) * 1pt, dy: (m.y - m.size * 0.85 - 1) * 1pt,
      rect(width: (m.width + 2 * pad) * 1pt, height: (m.size * 1.15 + 2) * 1pt, fill: white, stroke: none))
  }
  for m in layout.markers {
    let v = value(c, m.key)
    if v != none and v != "" {
      context {
        let size = m.size * 1pt
        let edges = (top-edge: "baseline", bottom-edge: "baseline")
        // text before the marker keeps the value at the marker start, text after it ends the value a space before it
        let lower = if m.left != none { m.x * 1pt } else { margin }
        let upper = if m.right != none { m.right * 1pt - size * 0.3 } else { page-width - margin }
        let width = measure(text(size: size, ..edges, v)).width
        let scale = calc.max(min-scale, calc.min(1, (upper - lower) / width))
        let body = text(size: size * scale, ..edges, v)
        let width = measure(body).width
        // centred on the marker, moved between the limits when it would cross them
        let dx = calc.max(lower, calc.min((m.x + m.width / 2) * 1pt - width / 2, upper - width))
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
