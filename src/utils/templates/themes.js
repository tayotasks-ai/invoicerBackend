// 12 selectable invoice designs: 6 free (no logo placement) and 6 premium
// (logo placement, gated behind a paid plan - see src/config/plans.js).
// Each theme is a set of parameters consumed by htmlTemplate.js's single
// renderer, rather than 12 hand-duplicated HTML files - `layout` picks the
// structural shape, everything else (color, font, logo treatment) varies the
// look within it. This keeps 12 genuinely distinct designs maintainable.
//
// layout: 'bordered' | 'minimal' | 'split' | 'receipt' | 'banded' | 'sidebar'
// font:   'serif' | 'sans' | 'mono'

const FONT_STACKS = {
  serif: `Georgia, 'Times New Roman', Times, serif`,
  sans: `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
  mono: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace`,
};

const THEMES = [
  // ---------- Free tier (no logo) ----------
  {
    id: 'classic-ledger',
    name: 'Classic Ledger',
    description: 'Traditional bordered layout with serif headings - the timeless printed-invoice look.',
    tier: 'free',
    showLogo: false,
    layout: 'bordered',
    font: 'serif',
    accent: '#2F4F4F',
    accentSoft: '#EEF3F2',
    paper: '#FFFFFF',
    ink: '#1F2937',
    muted: '#6B7280',
    border: '#D9DEDD',
  },
  {
    id: 'minimal-mono',
    name: 'Minimal Mono',
    description: 'Typewriter-inspired, monospaced, and stripped to essentials.',
    tier: 'free',
    showLogo: false,
    layout: 'minimal',
    font: 'mono',
    accent: '#111111',
    accentSoft: '#F5F5F5',
    paper: '#FFFFFF',
    ink: '#111111',
    muted: '#8A8A8A',
    border: '#E5E5E5',
  },
  {
    id: 'slate-professional',
    name: 'Slate Professional',
    description: 'Neutral, formal, and understated - built for corporate clients.',
    tier: 'free',
    showLogo: false,
    layout: 'split',
    font: 'sans',
    accent: '#334155',
    accentSoft: '#F1F5F9',
    paper: '#FFFFFF',
    ink: '#0F172A',
    muted: '#64748B',
    border: '#E2E8F0',
  },
  {
    id: 'paper-receipt',
    name: 'Paper Receipt',
    description: 'Narrow, centered, dashed-rule layout styled like a printed receipt.',
    tier: 'free',
    showLogo: false,
    layout: 'receipt',
    font: 'mono',
    accent: '#111111',
    accentSoft: '#FAFAFA',
    paper: '#FFFFFF',
    ink: '#111111',
    muted: '#777777',
    border: '#CCCCCC',
  },
  {
    id: 'corporate-blue',
    name: 'Corporate Blue',
    description: 'A confident solid blue header band - classic B2B invoice styling.',
    tier: 'free',
    showLogo: false,
    layout: 'banded',
    font: 'sans',
    accent: '#1D4ED8',
    accentSoft: '#EFF4FF',
    paper: '#FFFFFF',
    ink: '#111827',
    muted: '#6B7280',
    border: '#DCE4F5',
  },
  {
    id: 'simple-green',
    name: 'Simple Green',
    description: 'Clean two-column header with a fresh green accent rule.',
    tier: 'free',
    showLogo: false,
    layout: 'split',
    font: 'sans',
    accent: '#15803D',
    accentSoft: '#EEF8F0',
    paper: '#FFFFFF',
    ink: '#14261B',
    muted: '#5F7A69',
    border: '#DCEFE1',
  },

  // ---------- Premium tier (logo placement) ----------
  {
    id: 'modern-lilac',
    name: 'Modern Lilac',
    description: 'Matches Invoecr’s own product design - a bold lilac header with your logo front and center.',
    tier: 'premium',
    showLogo: true,
    layout: 'banded',
    font: 'sans',
    accent: '#6535B3',
    accentSoft: '#F3EBFF',
    paper: '#FFFFFF',
    ink: '#161020',
    muted: '#6B6478',
    border: '#E4D3FF',
    logoStyle: 'badge',
  },
  {
    id: 'bold-gradient',
    name: 'Bold Gradient',
    description: 'A vivid purple-to-pink gradient header for brands that like to stand out.',
    tier: 'premium',
    showLogo: true,
    layout: 'banded',
    font: 'sans',
    accent: '#7A46D6',
    accentSoft: '#FBEEFB',
    paper: '#FFFFFF',
    ink: '#1A1123',
    muted: '#6B6478',
    border: '#F2D9F5',
    gradient: ['#7A46D6', '#EC4899'],
    logoStyle: 'badge',
  },
  {
    id: 'elegant-serif',
    name: 'Elegant Serif',
    description: 'Luxury boutique feel: serif type, bronze accents, and a faint watermark logo.',
    tier: 'premium',
    showLogo: true,
    layout: 'sidebar',
    font: 'serif',
    accent: '#8A5A20',
    accentSoft: '#FBF3E7',
    paper: '#FFFFFF',
    ink: '#221A10',
    muted: '#8A7A63',
    border: '#EFE1C8',
    logoStyle: 'watermark',
  },
  {
    id: 'two-tone-sidebar',
    name: 'Two-Tone Sidebar',
    description: 'A full-height teal sidebar carries your logo and business details.',
    tier: 'premium',
    showLogo: true,
    layout: 'sidebar',
    font: 'sans',
    accent: '#0F766E',
    accentSoft: '#E9F7F5',
    paper: '#FFFFFF',
    ink: '#0B1F1D',
    muted: '#54706C',
    border: '#D3ECE8',
    logoStyle: 'plain',
  },
  {
    id: 'dark-executive',
    name: 'Dark Executive',
    description: 'A premium near-black invoice with gold accents, for brands that want gravitas.',
    tier: 'premium',
    showLogo: true,
    layout: 'banded',
    font: 'sans',
    accent: '#D4AF37',
    accentSoft: '#242018',
    paper: '#111113',
    ink: '#F5F5F7',
    muted: '#A9A9AE',
    border: '#33333A',
    dark: true,
    logoStyle: 'plain',
  },
  {
    id: 'photo-banner',
    name: 'Photo Banner',
    description: 'A tall sky-blue banner with a large centered logo and a big total callout.',
    tier: 'premium',
    showLogo: true,
    layout: 'banded',
    font: 'sans',
    accent: '#0EA5E9',
    accentSoft: '#E9F7FF',
    paper: '#FFFFFF',
    ink: '#0B1B24',
    muted: '#5B7480',
    border: '#CDEBFA',
    bandHeight: 'tall',
    logoStyle: 'large-center',
    totalStyle: 'card',
  },
];

const THEMES_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
const DEFAULT_THEME_ID = 'classic-ledger';

function getTheme(id) {
  return THEMES_BY_ID[id] || THEMES_BY_ID[DEFAULT_THEME_ID];
}

// What the frontend template gallery renders. Includes enough visual
// metadata (accent color, layout, font, dark background) to draw a
// meaningful swatch per card without exposing the full PDF-rendering config
// (accentSoft/paper/ink/muted/border/gradient/logoStyle/etc).
function listThemes() {
  return THEMES.map(({ id, name, description, tier, showLogo, accent, layout, font, dark }) => ({
    id,
    name,
    description,
    tier,
    showLogo,
    accent,
    layout,
    font,
    dark: !!dark,
  }));
}

module.exports = { THEMES, getTheme, listThemes, FONT_STACKS, DEFAULT_THEME_ID };
