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
  ctaText:  'See the complete analysis',
  ctaHref:  '/corpus/2',
  imageAlt: 'Interior view of Mimbres Black-on-white bowl A326247, National Museum of Natural History, Smithsonian Institution. Collected by J.W. Fewkes, Mimbres Valley, New Mexico, 1923.',
  imageCaption:
    'Bowl A326247 · Interior. Mimbres Valley, Luna County, NM. '
    + 'Collected J.W. Fewkes, 1923. NMNH Accession 070367. '
    + 'Courtesy Smithsonian Institution.',
};
