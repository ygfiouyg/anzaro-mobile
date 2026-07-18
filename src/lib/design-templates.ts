/**
 * Design Template System — FULLY DYNAMIC, Zero Fixed Templates
 *
 * ALL static/fixed templates have been removed.
 * The AI-driven Design Reasoning system (design-reasoning.ts) is the
 * ONLY design path. Every document gets a unique, AI-generated visual
 * identity based on content analysis.
 *
 * This module only exports the DesignTemplate interface for type
 * compatibility. No CSS generation or template selection happens here.
 */

// ─── Design Template Interface (type-only, for backward compatibility) ─────

export interface DesignTemplate {
  id: string;
  name: string;
  nameEn: string;
  description: string;

  // Cover page configuration
  cover: {
    style: 'gradient-full' | 'split-horizontal' | 'split-vertical' | 'centered-minimal' | 'bordered-frame' | 'geometric-pattern' | 'dark-sleek' | 'gradient-asymmetric';
    showLogo: boolean;
    showDotsPattern: boolean;
    showDecorativeCircles: boolean;
    showDecorativeLines: boolean;
    showFrame: boolean;
    showIslamicPattern: boolean;
    showCircuitPattern: boolean;
    titlePosition: 'center' | 'bottom' | 'top';
    logoStyle: 'large-delta' | 'small-badge' | 'hidden' | 'symbol-only';
  };

  // Section header configuration
  sectionHeader: {
    style: 'full-width-bar' | 'left-accent' | 'underlined' | 'card-style' | 'numbered-circle' | 'gradient-bar' | 'minimal-left' | 'sidebar-number';
    showSectionNumbers: boolean;
    numberStyle: 'circle' | 'square' | 'pill' | 'none';
    backgroundStyle: 'primary' | 'surface' | 'transparent' | 'gradient';
  };

  // Subsection style
  subsection: {
    style: 'left-border' | 'underlined' | 'card' | 'minimal' | 'numbered';
  };

  // Component styles
  components: {
    bulletStyle: 'diamond' | 'dash' | 'dot' | 'arrow' | 'check';
    calloutStyle: 'left-border' | 'card' | 'banner' | 'minimal' | 'icon-only';
    tableStyle: 'zebra' | 'bordered' | 'clean-header' | 'minimal' | 'shadow-cards';
    codeBlockStyle: 'terminal' | 'card' | 'inline' | 'minimal';
    definitionStyle: 'grid' | 'list' | 'cards' | 'table';
  };

  // Typography
  typography: {
    baseFontSize: number;
    headingScale: number;
    lineHeight: number;
    paragraphSpacing: number;
    fontVariant: 'default' | 'condensed' | 'expanded';
  };

  // Mode preference
  preferredMode: 'light' | 'dark' | 'auto';

  // Content type affinity
  contentAffinity: string[];
}
