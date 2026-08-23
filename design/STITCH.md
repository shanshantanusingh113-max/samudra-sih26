# Stitch prompts for Samudra 3D

Prompts for Google Stitch, one per screen. Paste one at a time. The shared design system in
part 0 goes at the top of every prompt, because Stitch does not carry style between generations.

Everything described here already exists and works at
**https://rak2315.github.io/samudra-sih26/** - these prompts are for exploring alternative
layouts and polish, not for inventing features. Do not let Stitch add capabilities the product
does not have.

---

## 0. The design system - paste this before every prompt

```
Design system for a scientific ocean visualisation tool called Samudra 3D.
Dark, technical, instrument-like. Think mission control console, not consumer app.

Colours:
  Background        #071420   deep blue-black, never pure black
  Panel             #0C1F2E   cards and control panels
  Panel raised      #102737
  Border            rgba(120,170,195,0.16)   1px hairlines
  Border bright     rgba(120,190,210,0.40)
  Primary text      #E4EEF6
  Body text         #B3C8D8
  Muted text        #8299AD
  Faint text        #5D7488
  Accent cyan       #3FB8C4   the accent. Links, labels, active states, arrows
  Amber             #F5B841   key numbers only, maximum two per screen
  Coral             #F2765F   problems, risk, negative residual
  Green             #5FD68A   confirmed, resolved, observed-data line

Type:
  Display   Chivo, weights 700 and 900, tight letter-spacing (-2% to -3.5%)
  Body      Chivo regular, 15-16px, line-height 1.65
  Data/UI   IBM Plex Mono, 10-12px, uppercase labels with +12% letter-spacing

Rules:
  Panels are translucent #0C1F2E with a 1px hairline border and 10px radius.
  Uppercase mono labels above every control group and every panel.
  Numbers are large, in Chivo bold, with a small mono caption beneath.
  Generous whitespace. No drop shadows, no gradients on text, no clip art,
  no emoji, no rounded pill buttons, no purple-to-blue gradients.
  Never centre body text.
```

---

## 1. Landing page

```
[paste the design system first]

Design a landing page for Samudra 3D, a browser-based 3D ocean visualisation
platform built for the Indian National Centre for Ocean Information Services.

Sections, in order:

1. Sticky top nav, 62px tall, translucent with a hairline bottom border.
   Left: wordmark "SAMUDRA.3D" in mono, with ".3D" in accent cyan.
   Right: text links (The gap, How it works, Evidence, How it is built) and a
   primary button "Launch the platform".

2. Hero, two columns. Left column: a small uppercase mono eyebrow reading
   "SMART INDIA HACKATHON 2026 . PS 26067 . MOES / INCOIS" followed by a very
   large two-line headline "Fly into the Indian Ocean." in Chivo Black at about
   68px with tight negative letter-spacing. Below it a 19px lede, then a smaller
   muted sub-line, then two buttons side by side (primary "Launch the platform",
   secondary outline "See how it works"). Below the buttons a single row of
   mono metadata: DATA / ANALYSIS TO / FLOATS / DEPTH with values.
   Right column: a wide screenshot of a 3D block of ocean water in a bordered
   frame with a mono caption bar beneath it.
   Add a very subtle radial cyan glow behind the left column, barely visible.

3. "The gap" section: a heading and a paragraph, then three equal cards in a
   row. Each card has a small coral uppercase tag reading "Today", a bold
   heading, and two lines of body text.

4. "How it works" section: three numbered steps stacked vertically, separated
   by full-width hairline rules. Each step is a two-column row: a narrow left
   column with a mono label like "01 . SURFACE" in amber, and a wide right
   column with a bold heading and a paragraph. Beneath the steps, two
   screenshots side by side in bordered frames with mono captions.

5. "Evidence" section: heading, paragraph, one wide screenshot, then a row of
   four statistic tiles sharing a single bordered container divided by
   hairlines. Each tile has a large number and a small mono caption. One number
   is coral, one amber, one cyan. Beneath, a pull-quote with a 2px amber left
   rule and a faint amber-to-transparent horizontal gradient behind it.

6. "How it is built" section: three cards with cyan uppercase tags, then a
   four-column list of technologies in mono under mono column headings.

7. A centred final call to action with a large heading, one line of text, and
   two buttons.

8. Footer: small mono text, data attribution, muted.

Maximum width 1140px, centred, 28px side padding. Sections separated by
full-width hairline rules with 76px vertical padding.
```

---

## 2. The globe view (application, first screen)

```
[paste the design system first]

Design the first screen of a 3D ocean visualisation web app.

The whole viewport is a dark 3D canvas showing a globe centred on the Indian
Ocean. The globe is nearly black with thin cyan coastline outlines, and one
region - India's exclusive economic zone - is filled with a warm yellow-orange
temperature field. Small white dots with dark outlines mark 88 floating
instruments scattered across that region.

Overlaid on the canvas:

- Top bar, no background panel, just a soft dark gradient fading downward.
  Left: wordmark "SAMUDRA.3D" in mono with a small grey subtitle beneath.
  Right: two stacked readouts, each a tiny uppercase mono label above a value
  ("ANALYSIS / 2026-07-30" and "FIELD / Sea Water Temperature"), then a primary
  button reading "Dive into the water".

- Left control panel, 288px wide, floating with a hairline border and blurred
  translucent background, starting below the top bar. Control groups separated
  by hairline rules, each with a tiny uppercase mono label:
    VARIABLE      two segmented buttons, Temperature and Salinity
    COLOURBAR     a dropdown, a horizontal gradient bar, min and max values in
                  mono at either end, two range sliders, a checkbox
    SEA SURFACE LEVEL   one range slider with a mono value readout
    INSTRUMENTS   two checkboxes with counts

- A centred information card near the top of the canvas, translucent with a
  hairline border, containing a small uppercase heading and three lines of
  explanatory text.

- Bottom centre: a timeline bar, translucent with a hairline border, containing
  a circular play button, a horizontal slider with small mono date ticks
  beneath it, and a date readout on the right.

- Bottom left: tiny muted mono attribution text.

Sliders are 3px tracks with small cyan circular thumbs. Every numeric value is
mono. No shadows.
```

---

## 3. The volume view with the guide panel

```
[paste the design system first]

Design the main working screen of a 3D ocean visualisation app.

Centre: a large three-dimensional rectangular block of ocean water seen from a
low angle, so its front face dominates. The block is coloured in a vertical
gradient - bright yellow at the top, through orange and pink, into violet and
deep blue at the bottom - representing temperature falling with depth. A thin
wireframe outlines the box. Small white dots and faint red curved lines sit on
its top surface.

Down the left flank of the block, outside it, a depth ruler: small mono labels
(0 m, 50 m, 100 m, 200 m, 300 m, 500 m, 750 m, 1000 m, 1500 m, 2000 m) each
with a short tick line. The spacing between labels is deliberately uneven,
compressed toward the bottom. A tiny muted mono note near the base reads
"depth axis stretched - see the uneven spacing".

Left panel, 288px, same style as before, with control groups:
    VARIABLE, COLOURBAR, DEPTH SLICE, RENDERING, ISOSURFACE
Each group has a tiny uppercase mono label, and RENDERING contains four
labelled sliders each showing its current value in mono on the right.

Right panel, 336px, is an explanation panel. At the top a small rounded badge
with a coloured border reading "CHANGES ONLY HOW IT IS DRAWN" in tiny mono
uppercase, and a close button. Below it a 17px bold heading naming a control.
Below that, three short blocks, each a tiny uppercase mono label above a
paragraph of body text: "WHAT IT CHANGES", "WHAT THAT MEANS", "WHAT TO LOOK
FOR". At the bottom, a suggestion box with a 2px amber left rule and a faint
amber tint.

Bottom centre: the same timeline bar. Top right: a secondary outline button
reading "Return to globe".
```

---

## 4. The comparison panel

```
[paste the design system first]

Design a right-hand data panel, 358px wide, for comparing an ocean instrument's
measurements against a computer model. Translucent dark background, hairline
border, 10px radius.

Top: a heading "Argo 2902306" in mono, coloured green, with a close button on
the right. Beneath it two lines of small mono metadata giving coordinates, a
date, a profile count and a maximum depth.

Middle: a chart, taller than it is wide. The vertical axis is depth increasing
downward, labelled 0, 50, 100, 200, 500, 1000, 2000 in tiny mono, with faint
horizontal gridlines. Spacing between the depth labels is uneven, compressed
toward the bottom. Two lines run down the chart: a solid green line and a
dashed cyan line, close together but diverging in places. The area between them
is filled with a translucent coral tint. Beneath the chart a small legend with
two short colour dashes labelled "Argo observed" and "INCOIS analysis".

Below the chart, a row of three statistics separated by space, each a large
number above a tiny mono caption:
    119 "levels matched"      -2.16 "mean residual °C"      2.34 "RMS °C"
The middle number is cyan, the others primary text.

Beneath, one line of small amber mono text noting which analysis step was used.

Bottom: a full-width outline button reading "Centre the view on this float".
```

---

## 5. Loading and error states

```
[paste the design system first]

Design two full-screen states for a dark scientific web application.

1. Loading: centred on a #071420 background, a 44px circular spinner ring with
   a thin cyan arc, and beneath it one line of muted text reading
   "Reading INCOIS analysis and Argo profiles...".

2. Error: centred, a 17px heading in primary text reading "Samudra 3D could not
   start", a paragraph of muted body text at most 460px wide, and beneath it a
   fainter hint line containing an inline code snippet styled in cyan mono.

Also design a small dismissible notice that floats near the top centre of the
screen: translucent dark red background, coral hairline border, 10px radius,
one line of light text, and a small close button on the right.
```

---

## What to reject in Stitch's output

Stitch will drift toward generic SaaS. Regenerate if you see: light backgrounds, purple or
indigo gradients, rounded pill buttons, drop shadows, emoji, stock photography, centred body
text, Inter as the display face, or invented features such as user accounts, dashboards with
fake charts, pricing tiers or chat widgets. None of those exist in this product.
