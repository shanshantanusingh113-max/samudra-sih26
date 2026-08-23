---
name: Oceanic Instrumentation System
colors:
  surface: '#0f1415'
  surface-dim: '#0f1415'
  surface-bright: '#353a3b'
  surface-container-lowest: '#0a0f10'
  surface-container-low: '#171d1d'
  surface-container: '#1b2121'
  surface-container-high: '#252b2c'
  surface-container-highest: '#303636'
  on-surface: '#dee3e4'
  on-surface-variant: '#bcc9ca'
  inverse-surface: '#dee3e4'
  inverse-on-surface: '#2c3132'
  outline: '#869394'
  outline-variant: '#3d494a'
  surface-tint: '#64d7e3'
  primary: '#64d7e3'
  on-primary: '#00363b'
  primary-container: '#3fb8c4'
  on-primary-container: '#00454a'
  inverse-primary: '#006971'
  secondary: '#fabc45'
  on-secondary: '#422c00'
  secondary-container: '#bd8708'
  on-secondary-container: '#392600'
  tertiary: '#ffb4a6'
  on-tertiary: '#640d02'
  tertiary-container: '#ff866f'
  on-tertiary-container: '#771b0d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#86f3ff'
  primary-fixed-dim: '#64d7e3'
  on-primary-fixed: '#002023'
  on-primary-fixed-variant: '#004f55'
  secondary-fixed: '#ffdea9'
  secondary-fixed-dim: '#fabc45'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5f4100'
  tertiary-fixed: '#ffdad3'
  tertiary-fixed-dim: '#ffb4a6'
  on-tertiary-fixed: '#3f0300'
  on-tertiary-fixed-variant: '#842515'
  background: '#0f1415'
  on-background: '#dee3e4'
  surface-variant: '#303636'
typography:
  display-lg:
    fontFamily: Chivo
    fontSize: 48px
    fontWeight: '900'
    lineHeight: '1.1'
    letterSpacing: -3.5%
  display-md:
    fontFamily: Chivo
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -2%
  body-reg:
    fontFamily: Chivo
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.65'
    letterSpacing: 0%
  data-num:
    fontFamily: Chivo
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -1%
  label-caps:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 12%
  ui-mono:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 2%
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 20px
  margin: 32px
---

## Brand & Style
The design system is engineered for high-density scientific visualization and oceanic data analysis. The aesthetic is "Instrumental Minimalism"—it rejects consumer-grade softness in favor of a technical, mission-critical interface reminiscent of research vessel consoles and deep-sea telemetry hubs.

The system prioritizes legibility in low-light environments, using a dark-mode-first architecture. It utilizes a structured, "flat-depth" model where hierarchy is established through hairline borders and tonal layering rather than shadows. The tone is authoritative, precise, and utilitarian, designed to handle complex 3D spatial data without visual fatigue.

## Colors
The palette is grounded in a deep oceanic abyss (#071420). 

- **Functional Accents:** Cyan (#3FB8C4) is the primary interactive color for active states and navigation. 
- **Semantic Indicators:** Amber is reserved strictly for critical numerical highlights; Coral indicates risk or negative deltas; Green is for confirmed observational data.
- **Atmospheric Layering:** Panels use semi-transparent overlays to maintain a sense of depth and context behind the UI, suggesting glass-mounted displays.

## Typography
This design system employs a dual-font strategy to separate narrative/numerical data from system meta-data.

- **Chivo:** Used for all primary reading and large-scale data points. High-weight display styles must use tight tracking to maintain a "blocked" technical feel.
- **IBM Plex Mono:** Used for all labels, captions, and secondary UI metadata. Mono labels above panels or control groups must always be uppercase with generous tracking.
- **Alignment:** Never center-align body text. All data readouts and descriptions should be left-aligned or grid-aligned to maintain the "ledger" feel of a scientific instrument.

## Layout & Spacing
The layout follows a 12-column rigorous grid. Despite the technical nature, generous whitespace is mandatory to prevent cognitive overload during data analysis.

- **Panel Spacing:** Control panels should be separated by a consistent 20px gutter.
- **Content Padding:** Interior panel padding is set to 24px (md) to allow the hairline borders room to breathe.
- **Responsive Behavior:** On desktop, the UI utilizes a "Fixed Sidebar / Fluid Data Visualization" model. On smaller viewports, panels stack vertically, maintaining their 10px corner radius and hairline borders.

## Elevation & Depth
Elevation is communicated through **Tonal Stacking** and **Hairline Outlines**. Shadows are strictly forbidden.

1.  **Level 0 (Base):** Deep Blue-Black (#071420). The viewport for 3D visualization.
2.  **Level 1 (Panel):** Translucent Surface (#0C1F2E) with a 1px border (`border_low_opacity`).
3.  **Level 2 (Active/Raised):** Slightly lighter Surface (#102737) with a brighter hairline border (`border_high_opacity`).

This creates a "HUD" (Heads-Up Display) effect where the UI feels like a physical glass overlay on top of the data environment.

## Shapes
The design system uses a unified 10px (rounded-lg) radius for all major containers and panels. This softens the aggressive technical nature of the UI just enough to imply modern precision engineering. 

Small UI elements like input fields or checkboxes should use a smaller 4px (soft) radius. Pill-shaped buttons or fully rounded corners are prohibited.

## Components
- **Buttons:** Rectangular with subtle 4px corners. Primary buttons use the Cyan background with dark text. Secondary buttons use a hairline border and Cyan text. No gradients.
- **Control Groups:** Every group of inputs or toggles must be preceded by an uppercase `label-caps` text element in `text_muted_hex`.
- **Data Cards:** Large numerical readouts in `display-md` (Chivo Bold) with a `label-caps` caption positioned directly beneath.
- **Input Fields:** Darker than the panel background with a 1px hairline border that glows Cyan on focus.
- **Lists:** Data-heavy lists use `ui-mono` for all rows, with thin `border_low_opacity` dividers between items.
- **Status Indicators:** Small 8px squares (not circles) using the semantic color palette (Green, Amber, Coral) to denote system or data health.