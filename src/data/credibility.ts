// Credibility section content — swap per funder audience.
// IMLS framing: collections stewardship, institutional transfer, museum-field needs.

export interface CredibilityContent {
  headline: string;
  subhead: string;
  items: { title: string; body: string }[];
  transfer: string;   // build-and-transfer / sustainability statement
}

export const credibility: CredibilityContent = {
  headline: 'Built for the long run',
  subhead:
    'The tool exists to serve collections stewards, not to capture them. '
    + 'The goal is an open, community-maintained instrument with a clear transfer path.',
  items: [
    {
      title: 'Southwest archaeology expertise',
      body:
        'The analytical frameworks draw on J.J. Brody, Harry Shafer, Michelle Hegmon, '
        + 'and Polly Schaafsma — the primary-source scholarship that defines how '
        + 'Mimbres, Ancestral Puebloan, Hohokam, and Casas Grandes material is evaluated.',
    },
    {
      title: 'Forensic-science partnership',
      body:
        'Methodology is being validated in collaboration with a practicing '
        + 'forensic partner. The epistemic labeling system and RAP Protocol enforce the same '
        + 'evidentiary standards applied in forensic documentation.',
    },
    {
      title: 'Independent from the market',
      body:
        'Analysis is grounded in excavated, documented reference assemblages — '
        + 'not unprovenanced market examples. The fingerprint corpus is built '
        + 'only from objects with known provenience.',
    },
  ],
  transfer:
    'Design intention: build the instrument, validate it against a documented corpus, '
    + 'and transfer stewardship to a museum, tribal organization, or research consortium '
    + 'with long-term care capacity. Funders own the result.',
};
