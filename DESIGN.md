# Design System — API Impact Summary Widget

## Visual World: Terminal Native

Dark, monospace-first interface inspired by IDEs and terminal output. Syntax-colored status indicators. Dense, compact layout. No cards, no chrome — information density over decoration.

## Color Tokens

### Backgrounds
- `--bg: #0c0e14`
- `--bg-surface: #12151e`
- `--bg-surface-hover: #181c28`

### Borders
- `--border: #1e2333`
- `--border-bright: #2a3050`

### Text
- `--text: #c8cdd8`
- `--text-dim: #6b7280`
- `--text-bright: #e8ecf4`

### Status (Syntax-colored)
- `--green: #34d399` (LOW, compatible, approve)
- `--green-dim: #065f46` (green backgrounds)
- `--amber: #fbbf24` (MEDIUM, warnings)
- `--amber-dim: #78350f` (amber backgrounds)
- `--red: #f87171` (HIGH, breaking, block)
- `--red-dim: #7f1d1d` (red backgrounds)
- `--cyan: #22d3ee` (repo names, links)
- `--purple: #a78bfa` (reserved)

## Typography

- **Family:** ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
- **Scale:** Fixed rem
  - xs: 10px (section headers, paths)
  - sm: 11px (body, evidence, changes)
  - md: 12px (widget default, code)
  - lg: 14px (header title)

## Layout

- Terminal window chrome (title bar with dots)
- Prompt-style section headers (`> impact-assessment`)
- Section dividers with horizontal rules
- Compact rows with left-border accents
- No card nesting, no padding-over-padding

## Component Patterns

### Top Bar
- Three colored dots (red/amber/green) like terminal window
- Product name in dim text
- Severity badge with colored background

### Section Headers
- Uppercase, small caps, with horizontal rule
- Inline counts (e.g., "3 breaking 1 compatible")

### Change Rows
- Left border: red for breaking, green for compatible
- Icon: `!` for breaking, `~` for compatible
- Monospace code, compact rationale

### Evidence Rows
- Dark surface with subtle border
- Cyan repo name, colored classification badge
- Monospace path with commit hash

### Action Buttons
- Bracketed labels: `[ approve ]` `[ block ]`
- Colored backgrounds matching intent
- Terminal-style disabled state

## Anti-patterns Avoided

- No white backgrounds
- No card-on-card nesting
- No decorative shadows
- No rounded pill badges (except severity)
- No gradient text
- No glass/blur
- No section numbers
- No uppercase eyebrows everywhere
