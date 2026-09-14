---
name: Midnight Ledger
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#d2bbff'
  on-tertiary: '#3f008e'
  tertiary-container: '#a476ff'
  on-tertiary-container: '#36007d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#eaddff'
  tertiary-fixed-dim: '#d2bbff'
  on-tertiary-fixed: '#25005a'
  on-tertiary-fixed-variant: '#5a00c6'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: '700'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0.01em
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-mono-xs:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '400'
    lineHeight: 0.875rem
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-precision, tactile-digital experience for receipt tracking, financial aggregation, and enterprise expense compliance. It combines the utilitarian clarity of European commercial trade documents with a sleek, glowing dark-mode workspace. 

The aesthetic is anchored in **Technical Modernism with Subtle Luminescence**:
- **Utilitarian Rigor:** Data-first, high-density layouts reminiscent of terminal consoles and German point-of-sale systems (Kassensysteme).
- **Subtle Glow & Dimensional Depth:** Deep, cool-toned midnight backdrops layered with fine hairline borders, tonal card surfaces, and soft indigo/violet radiant glows on key focal points and active states.
- **Physical-Digital Juxtaposition:** Clean digital dashboards juxtaposed with specialized, receipt-inspired tactile cards that borrow micro-elements from thermal paper slips (perforations, mono-spaced line items, tabular currency alignments) rendered cleanly in modern dark-mode canvas.
- **Emotional Tone:** Trustworthy, automated, effortless, and financially compliant (GoBD-ready feel).

## Colors

The palette operates under a high-contrast dark-mode system engineered to avoid eye strain while providing crisp visual separation for tabular financial data.

### Foundation & Surfaces
- **Canvas Base (`#090D16`):** The primary root background of the entire viewport.
- **Surface Elevation 1 (`#0F172A`):** Canvas containers, navigation sidebars, and structural wells.
- **Surface Elevation 2 (`#111827` / `#161F30`):** Elevated transaction cards, receipt inspector panels, modal views, and split-screen ledger panes.
- **Hairline Borders (`#1F293D` / `rgba(255, 255, 255, 0.08)`): Deliberate 1px boundary lines defining functional cards, table headers, and structural partitions.

### Accent & Glow Dynamics
- **Primary Indigo (`#6366F1`):** Primary interactions, active tabs, and primary action buttons.
- **Secondary Violet (`#8B5CF6`):** Secondary interactive triggers, multi-select highlights, and subtle gradient fills.
- **Tertiary Deep Purple (`#7C3AED`):** Subtle ambient backdrop glow sources and intense focal point accents.

### Text & Hierarchical Contrast
- **Text High-Contrast (`#F8FAFC`):** Primary monetary totals, merchant headers, dialog titles, and critical figures.
- **Text Subdued (`#94A3B8`):** Body context, metadata, transaction categories, and timestamps.
- **Text Muted (`#64748B`):** Structural column labels, field placeholders, tax code identifiers, and disabled states.

### Retailer Badges & Identifiers
- **REWE Accent (`#EF4444` / `#DC2626`):** Merchant identification and alerts.
- **PENNY Accent (`#D946EF` / `#C026D3`):** Merchant identification.
- **LIDL Accent (`#3B82F6`):** Merchant identification.
- **ROSSMANN Accent (`#F97316`):** Merchant identification.
- **ALDI Accent (`#06B6D4`):** Merchant identification.

### Status Indicators
- **Verified / Synced (`#10B981`):** GoBD compliant, receipt OCR matched, zero discrepancies.
- **Pending / Review Needed (`#F59E0B`):** Missing tax category, OCR confidence below threshold, split required.
- **Error / Rejected (`#F43F5E`):** Sync failure, duplicate entry, unreadable receipt.

## Typography

The typographic hierarchy utilizes a dual-engine architecture:
1. **Inter** serves as the structural UI typeface for navigation, headlines, descriptive copy, dialogues, and form field labels, ensuring clarity and clean anti-aliasing against dark backdrops.
2. **JetBrains Mono** serves as the fiscal and financial typeface. It is strictly applied to currency amounts, line-item pricing, quantities, VAT (MwSt.) percentages, receipt timestamps, OCR confidence metrics, and barcode telemetry.

### Tabular Alignment Rules
All numerical tabular values in transaction tables, receipt slips, and tax summaries must enforce CSS tabular figures (`font-variant-numeric: tabular-nums`) to maintain strict vertical column alignment across varying currency amounts.

## Layout & Spacing

The system enforces a flexible 12-column grid layout paired with a standard 8px base rhythm (with 4px half-steps for compact data rows).

### Structural Breakpoints
- **Mobile (`< 768px`):** Single column stream. The navigation sidebar collapses into a floating bottom sheet or persistent bottom bar. The receipt inspector opens as a full-screen drawer.
- **Tablet (`768px – 1199px`):** Collapsed icon-only vertical sidebar (64px wide). Two-column view: transaction ledger list (60%) and pinned inspection preview (40%).
- **Desktop (`>= 1200px`):** Expanded hierarchical three-pane workspace:
  - Navigation Sidebar: 240px fixed width.
  - Expense Ledger Stream: Fluid 12-column sub-grid handling filtering, aggregates, and multi-row data.
  - Ticket Inspection Drawer / Split Panel: 420px to 480px fixed-width column showcasing receipt visuals, itemized tax computations, and export action sets.

### Content Density Modes
Financial tables allow a toggle between **Compact** (28px row height, `space-xs` padding) for auditing large batches and **Comfortable** (44px row height, `space-sm` padding) for standard daily entry.

## Elevation & Depth

Visual hierarchy uses tonal surface stacking combined with subtle ambient luminescence rather than heavy dropped drop shadows.

### Surface Tiers
- **Tier 0 (Base Canvas):** `#090D16` with zero elevation.
- **Tier 1 (Panels & Sidebar):** `#0F172A` resting directly on Tier 0, segregated via `1px solid rgba(255, 255, 255, 0.05)`.
- **Tier 2 (Cards & Active Ledger Rows):** `#111827` or `#161F30`, framed by a `1px solid rgba(255, 255, 255, 0.08)` border.
- **Tier 3 (Floating Toolbars & Modals):** `#161F30` layered over a backdrop blur (`backdrop-filter: blur(12px)` at 85% opacity) with a border of `rgba(99, 102, 241, 0.2)`.

### Ambient Glow & Shadows
- **Card Ambient Hover:** `0px 4px 20px -2px rgba(99, 102, 241, 0.12)`.
- **Primary Interactive Glow:** `0 0 16px -2px rgba(99, 102, 241, 0.45)`.
- **Status Luminescence:** Micro-glow on status pills using a 6px spread of the status color at 20% opacity (e.g., `0 0 8px rgba(16, 185, 129, 0.3)` for verified).

## Shapes

The design system maintains a balanced geometry (Level 2: `0.5rem` / 8px standard radius) to communicate software reliability while softening data-heavy screens.

### Radius Scale Implementation
- **Micro Radius (`0.25rem` / 4px):** Badges, VAT tags, data table cell tags, barcode containers.
- **Standard Radius (`0.5rem` / 8px):** Form inputs, action buttons, table rows, dropdown menus, and utility toolbars.
- **Container Radius (`1rem` / 16px):** Receipt cards, modal dialogs, ledger containers, and merchant summary blocks.
- **Receipt Ticket Notch:** Receipt preview cards use a decorative mask or pseudo-element zigzag/perforation pattern along top or bottom cut lines to invoke physical receipt paper while retaining the 16px container corner radius.

## Components

### Buttons
- **Primary Action:** Solid `#6366F1` background, `#F8FAFC` text, 8px radius, height 38px. Features a subtle radial glow on hover (`box-shadow: 0 0 14px rgba(99, 102, 241, 0.4)`) and a transition to `#4F46E5` on press.
- **Secondary / Ghost:** Transparent surface, `1px solid rgba(255, 255, 255, 0.1)`, `#94A3B8` text. Hover shifts background to `rgba(255, 255, 255, 0.04)` with `#F8FAFC` text.
- **Destructive:** Bordered in `rgba(239, 68, 68, 0.3)`, text `#EF4444`, transitioning to filled red with 10% opacity on hover.

### Receipt Preview Ticket Card
- **Structure:** Vertical ticket-styled surface in `#111827` enclosed by `1px solid rgba(255, 255, 255, 0.08)`.
- **Perforated Divider:** A horizontal divider featuring an alternating dotted or dashed line with semicircular notch cutouts on the left and right borders (`mask-image` or radial gradients).
- **Header:** Merchant identity with merchant brand accent stripe (e.g., 3px left border indicator in REWE Red or ALDI Cyan), store address, and terminal ID in `label-mono-xs`.
- **Footer:** Rendered SVG barcode / QR visual code representing digital TSE signature data with associated hash sequence.

### Itemized VAT Table
- **Columns:** Description (left-aligned, `Inter`), Qty (right-aligned, `JetBrains Mono`), Tax Code (center-aligned, `JetBrains Mono`), Total (right-aligned, `JetBrains Mono`).
- **Tax Breakdown Box:** Dedicated sub-card isolating German VAT rates:
  - `7% (Ermäßigter Satz)`: Netto, MwSt. Betrag, Brutto.
  - `19% (Regelsatz)`: Netto, MwSt. Betrag, Brutto.
- **Total Row:** Prominent font sizing (`headline-sm` with `JetBrains Mono`) with double bottom underline or bordered accent block.

### Category Tags & Retailer Badges
- **Category Chips:** Background `rgba(255, 255, 255, 0.05)`, border `1px solid rgba(255, 255, 255, 0.08)`, text `#94A3B8`. Radius: 4px.
- **Merchant Badges:** High-contrast micro-chips sporting specific brand accents as subtle background tints (12% opacity) alongside matching colored borders and logos (e.g., Lidl blue tint `#3B82F61F` with `#3B82F6` text).

### Form Inputs & Filters
- **Text Inputs:** Height 38px, background `#090D16`, border `1px solid #1F293D`, text `#F8FAFC`. Focus ring: `0 0 0 2px rgba(99, 102, 241, 0.35)` with border `#6366F1`.
- **Checkboxes & Radios:** 18px square/circle with `1px solid #334155`. Checked state fills with `#6366F1` and a white check icon.

### Export & Action Toolbar
- **Docked Action Bar:** Sticky bottom or top shelf floating over data views.
- **Actions Included:** 
  - `PDF Export` (Icon + Label)
  - `CSV / DATEV Export` (Icon + Label)
  - `Steuern / Spesen zuweisen` (Indigo button)
  - `Beleg bearbeiten` (Ghost button with edit pencil)
- Surface: Glassmorphic `#161F30` with `backdrop-filter: blur(12px)`.

### Navigation Sidebar
- **Width:** 240px fixed.
- **Items:** Icon + Label with counts. Active state provides an indigo glow strip on the left border (3px width) with an active background gradient `linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, transparent 100%)`.