export interface ProvenanceFlag {
  flag: string;
  severity: 'high' | 'medium' | 'low';
  detail: string;
}

export interface ContradictionFlag {
  claim: string;
  observation: string;
  contradiction: string;
  severity: 'high' | 'medium' | 'low';
}

export const PROVENANCE_INTEGRITY_PROMPT = (
  attributionCulture: string | null,
  docCanonical: string | null,
  docStructured: string | null,
): string => {
  const canon = docCanonical ?? 'Not available';
  const structured = docStructured ?? 'Not available';

  return `You are a provenance analyst reviewing documentation for a Southwest archaeological object. Identify provenance integrity flags — structural gaps, suspicious patterns, or tradition-specific inconsistencies that warrant closer examination by a human reviewer.

ATTRIBUTED CULTURE: ${attributionCulture ?? 'Unknown'}

CANONICAL DOCUMENTATION:
${canon}

STRUCTURED DOCUMENTATION:
${structured}

FLAG CODES — emit only flags clearly evidenced by the documentation above:

no_institutional_anchor — No museum, university, or public institution named as current or past custodian; private collectors only.
no_site_context — No excavation site, field location, or geographic origin documented.
no_excavation_record — No stratigraphic context, field notes, or excavation record referenced.
no_catalog_identifier — No catalog number, accession number, or institutional identifier present.
private_collection_terminus — Documented ownership chain ends in or passes entirely through private hands without a public institution anchor.
deaccession_language_on_private — "Deaccessioned" or equivalent institutional language applied to a private collection. Deaccessioning is an institutional process; applying it to private ownership is a semantic red flag.
provenance_gap — Documented ownership chain has an unexplained gap of 10 or more years.
unverifiable_comparables — Comparable works cited are in private collections or are otherwise unverifiable.
acquisition_chain_red_flag — Ownership chain pattern (private → private, "acquired circa", no field documentation) consistent with the antiquities market rather than documented excavation.
kill_hole_absent_mortuary — Object attributed to a tradition where mortuary context is standard for this vessel type (e.g. Mimbres burial bowls), but no kill hole is documented or explicitly noted as absent. Apply only to vessel forms where kill holes are expected.
condition_inconsistent_age — Object described as intact or in implausibly pristine condition for its claimed age (600–1000+ years) and claimed depositional context (burial, excavation). Some objects are genuinely well-preserved; only flag when the condition description is strikingly inconsistent with expected burial wear.

Output ONLY a valid JSON array — no markdown, no commentary, no extra text. Begin with [ and end with ].
Empty array [] if nothing is clearly flagged.

[
  { "flag": "<code>", "severity": "high|medium|low", "detail": "<1-2 sentences citing specific evidence from the documentation>" }
]

Severity guide:
- high: clearly evidenced and materially affects authenticity assessment
- medium: notable gap or anomaly, warrants a note
- low: minor or ambiguous gap, context-dependent

Be conservative. Only flag when the documentation clearly supports it. Do not flag on the mere absence of information unless that absence is meaningful given the claimed type and context.`;
};

export const CONTRADICTION_DETECTION_PROMPT = (
  attributionCulture: string | null,
  docCanonical: string | null,
  pass1Text: string,
): string => {
  const canon = docCanonical ?? 'Not available';

  return `You are a research analyst cross-referencing documentation claims against blind visual observations of a Southwest archaeological object. The visual observations were made without access to any documentation.

ATTRIBUTED CULTURE: ${attributionCulture ?? 'Unknown'}

DOCUMENTED CLAIMS (from institutional or seller documentation):
${canon}

BLIND VISUAL OBSERVATIONS (made without access to the documentation above):
${pass1Text}

Identify contradictions where what the documentation claims or implies is in direct tension with what the blind observation found. Focus on material, factual contradictions — not interpretive differences or gaps.

Categories to check:
- Claimed burial or mortuary context vs. absence of kill hole in observations
- Claimed age (centuries old) vs. condition evidence (e.g. no wear differential, no soil staining, slip described as unusually stable or pristine)
- Claimed production method vs. production traces observed (e.g. hand-coiled claim vs. no coil evidence, coil lap inconsistencies; claimed mineral paint vs. paint behavior inconsistent with mineral pigment)
- Claimed iconographic type, tradition, or vessel form vs. visual markers that don't fit the claimed tradition
- Claimed dimensions, material, or object type vs. what was actually observed
- Claimed use context vs. absence of expected use wear patterns

Output ONLY a valid JSON array — no markdown, no commentary, no extra text. Begin with [ and end with ].
Empty array [] if nothing directly contradicts.

[
  { "claim": "<what the documentation states or implies>", "observation": "<what the blind observation found>", "contradiction": "<why these are in tension — 1-2 sentences>", "severity": "high|medium|low" }
]

Severity guide:
- high: direct factual conflict that materially affects authenticity or attribution assessment
- medium: notable tension that warrants closer examination
- low: minor inconsistency that could have an innocent explanation

Be precise and conservative. Only flag genuine contradictions, not speculative ones. Do not flag something as a contradiction simply because documentation is incomplete — flag only when observation and claim are in active tension.`;
};
