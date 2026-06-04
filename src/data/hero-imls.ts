// Hero section content — IMLS National Leadership Grants for Museums framing.
// Swap this file (or add hero-arpa.ts, hero-dh.ts, etc.) to re-target per funder.
// The Hero component reads from this interface; no page rebuild required.

export interface HeroContent {
  eyebrow:    string;
  headline:   string;
  subhead:    string;
  note:       string;   // audience-specific framing note
  ctaText:    string;
  ctaHref:    string;
  imageAlt:   string;
  imageCaption: string;
}

export const hero: HeroContent = {
  eyebrow:  'Collections stewardship · Attribution integrity · NAGPRA',
  headline: 'A cataloging instrument for archaeological objects',
  subhead:
    'The Grammar of Things builds an evidence-based visual record for collections '
    + 'where attribution claims outrun documentation. It reads what the object itself '
    + 'shows — separate from what the paperwork says.',
  note:
    'Developed for IMLS National Leadership Grants for Museums. '
    + 'Designed to be built and transferred to a museum or consortium for long-term '
    + 'institutional stewardship.',
  ctaText:  'See the proof',
  ctaHref:  '#proof',
  imageAlt: 'Epistemic analysis of a Mimbres bowl — showing observation, interpretation, and the 27-principle fingerprint',
  imageCaption:
    'Mimbres Black-on-white bowl, NMNH A326247 / 070367. '
    + 'Analysis output with epistemic labels and perceptual fingerprint.',
};
