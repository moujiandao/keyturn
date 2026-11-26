// Shared design tokens for the public marketing + auth surfaces.
// Plain JS (no 'use client') so both server and client components can import it
// without dragging the client monolith (property-management-app.jsx) into their
// bundle. Mirrors the Redfin-inspired landlord theme in app/(app)/(landlord)/landlord.css.
export const palette = {
  text: '#20262a',        // --ld-ink: headings / primary text
  textMuted: '#566168',   // --ld-muted: body / descriptions
  textFaint: '#636d74',   // labels / meta (clears WCAG AA on both #fff and #f6f5f3)
  border: '#dedfdd',      // --ld-border: card & hairline borders
  borderSoft: '#ecece9',  // inner dividers
  accent: '#ad343e',      // --ld-accent: brick-red primary accent
  accentHover: '#8d2932', // --ld-accent-hover: deeper crimson hover & active text
  accentTint: '#f9e9e8',  // --ld-accent-tint: soft rose tint
  bg: '#f6f5f3',          // --ld-canvas: warm stone page canvas
  surface: '#ffffff',     // --ld-surface: white cards & rail
  bgSubtle: '#f3f4f4',    // --ld-subtle: subtle fill
  bgTint: '#f9e9e8',      // rose tint wash
};

export const radius = { sm: 8, md: 12, lg: 12, pill: 999 };

export const tracking = {
  display: '-0.045em',
  heading: '-0.03em',
  brand: '-0.035em',
};

// Centered content column with roomy gutters.
export const container = { width: '100%', maxWidth: 1120, margin: '0 auto', padding: '0 24px' };

// Shared button styles for marketing/auth pages (the in-app Btn lives in the
// monolith; we keep these standalone to avoid importing a client component).
export function btnStyle(variant = 'primary', size = 'md') {
  const sizes = {
    md: { padding: '11px 20px', fontSize: 15 },
    lg: { padding: '14px 26px', fontSize: 16 },
  };
  const variants = {
    primary: { background: palette.accent, color: '#fff', border: `1px solid ${palette.accent}` },
    secondary: { background: palette.surface, color: palette.text, border: `1px solid ${palette.border}` },
    ink: { background: palette.text, color: '#fff', border: `1px solid ${palette.text}` },
  };
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: radius.pill, fontWeight: 650, cursor: 'pointer', textDecoration: 'none',
    fontFamily: 'inherit', lineHeight: 1, whiteSpace: 'nowrap',
    transition: 'background-color .15s ease, border-color .15s ease, color .15s ease, opacity .15s ease',
    ...sizes[size], ...variants[variant],
  };
}
