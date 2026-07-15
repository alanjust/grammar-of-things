import principlesData from '../data/hg-principles.json';
import artifactPrinciplesData from '../data/artifact-principles.json';
import { VECTOR_KEY } from '../db/types';

// All Tier A — used in Pass 2 reference list
export const PRINCIPLE_NAMES: string[] = (principlesData.principles as any[])
  .filter((p: any) => p.tier === 'A')
  .map((p: any) => p.name as string)
  .sort((a, b) => b.length - a.length);

// Tier A principles applicable to artifact observation (excludes fine-art-specific:
// Linear Perspective, Atmospheric Perspective, Light Source Logic, Common Fate,
// Elevation in Picture Plane, Binocular vs. Monocular Depth Cues)
export const APPLICABLE_TIER_A_IDS = new Set([1, 2, 4, 5, 13, 15, 20, 28, 47, 48, 49, 51, 55, 56]);

export const APPLICABLE_TIER_A_NAMES: string[] = (principlesData.principles as any[])
  .filter((p: any) => APPLICABLE_TIER_A_IDS.has(p.id))
  .map((p: any) => p.name as string)
  .sort((a, b) => b.length - a.length);

// Artifact-domain perceptual principles
export const ARTIFACT_PRINCIPLE_NAMES: string[] = (artifactPrinciplesData.principles as any[])
  .map((p: any) => p.name as string)
  .sort((a, b) => b.length - a.length);

// Principle reference strings for the extraction prompt
export const ARTIFACT_PRINCIPLE_REF = (artifactPrinciplesData.principles as any[])
  .map((p: any) => `${p.name} (id:${p.id})`)
  .join(', ');

export const TIER_A_PRINCIPLE_REF = (principlesData.principles as any[])
  .filter((p: any) => APPLICABLE_TIER_A_IDS.has(p.id))
  .map((p: any) => `${p.name} (id:${p.id})`)
  .join(', ');

// principleId (VECTOR_KEY format, e.g. "ap_4"/"ta_13") -> display name.
// Derived from the same two JSON sources as everything above, so it can't drift
// from VECTOR_KEY's ap_1..ap_15 / ta_* order in db/types.ts.
export const VECTOR_KEY_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    (artifactPrinciplesData.principles as any[]).map((p: any) => [`ap_${p.id}`, p.name as string])
  ),
  ...Object.fromEntries(
    (principlesData.principles as any[])
      .filter((p: any) => APPLICABLE_TIER_A_IDS.has(p.id))
      .map((p: any) => [`ta_${p.id}`, p.name as string])
  ),
};

// Compact labels for space-constrained rendering (radar chart spokes, table
// columns, markdown exports) — shortened from VECTOR_KEY_NAMES on purpose, e.g.
// "Gaze Direction" not "Gaze Direction / Social Attention". Single source of
// truth for what was previously copy-pasted identically across 7 page/API files.
export const VECTOR_KEY_DISPLAY_NAMES: Record<string, string> = {
  ap_1: 'Production Trace Reading', ap_2: 'Sequence Inference', ap_3: 'Material Boundary Attention',
  ap_4: 'Wear Differential', ap_5: 'Absence as Evidence', ap_6: 'Composite Detection',
  ap_7: 'Anatomical Correspondence', ap_8: 'Symmetry as Evidence', ap_9: 'Proportion as Encoding',
  ap_10: 'Color Zone Logic', ap_11: 'Investment Gradient', ap_12: 'Attachment Point Reading',
  ap_13: 'Orientation Dependency', ap_14: 'Completion State', ap_15: 'Reduction vs. Construction',
  ta_1: 'Edge Detection', ta_2: 'Color Opponent Channels', ta_4: 'Figure-Ground Relationships',
  ta_5: 'Grouping', ta_13: 'Overlap / Occlusion', ta_15: 'Closure / Negative Space',
  ta_20: 'Simultaneous Contrast', ta_28: 'Specularity / Reflection',
  ta_47: 'Face Detection', ta_48: 'Biological Motion', ta_49: 'Gaze Direction', ta_51: 'Visual Pop-out',
  ta_55: 'Agency Attribution', ta_56: 'Postural Affect',
};

// principleId (ap_N only — hg-principles.json's ta_* Tier A principles have no
// grounding tag; that's a separate, not-yet-assessed question) -> VLM grounding
// assessment for that principle: observationTier/inferenceTier/note. See
// artifact-principles.json's "grounding" field on each principle object.
export const ARTIFACT_GROUNDING: Record<string, { observationTier: string; inferenceTier: string; note: string }> =
  Object.fromEntries(
    (artifactPrinciplesData.principles as any[])
      .filter((p: any) => p.grounding)
      .map((p: any) => [`ap_${p.id}`, p.grounding])
  );

// ---------------------------------------------------------------------------
// Pass 1 prompt builders
// ---------------------------------------------------------------------------

export const PASS1_PROMPT_SINGLE = (artifactPrincipleNames: string[], applicableTierANames: string[]) =>
  `You have examined this artifact closely. Report what the examination found — first person, specific, in the order things became clear. Not an inventory of categories; the conclusions of a systematic examination. No interpretation, no cultural attribution, no quality judgments. Only what is directly observable.

Move through: what the overall form is — shape, orientation, scale. What the surface holds: every mark, line, texture, and irregularity read as production evidence. Where material boundaries fall — where one material or surface treatment ends and another begins. What colors are present and how they distribute. Where surfaces show differential wear: more abraded, worn, polished, or eroded than adjacent areas, and where they do not. What the evidence of attachment or joining looks like: holes, channels, residue, binding marks, inset cavities, grooves. How proportions work: thickness, depth, wall relationships, scale relative to other features. What is incomplete, interrupted, or where a gap suggests something absent.

Be specific and granular.

ARTIFACT PERCEPTUAL PRINCIPLES: When what you found corresponds to one of the following named mechanisms, use the exact name and follow it immediately with the specific thing you observed. Use the name only when the mechanism is genuinely active — do not force mentions:

${artifactPrincipleNames.join(', ')}

UNIVERSAL VISUAL PRINCIPLES: These apply to all artifact observation regardless of object type or domain. When what you found engages any of the following, use the exact name and follow it immediately with the specific thing you observed:

${applicableTierANames.join(', ')}

ARTIFACT-DOMAIN APPLICATION OF TIER A PRINCIPLES: When applying Tier A principles alongside the 15 Artifact Perceptual Principles, do not use studioTool framing — do not ask what an artist did to a viewer. Ask what the mechanism reveals about the object. Edge Detection reads line quality as production evidence; Figure-Ground reads positive-negative design strategy; Color Opponent Channels reads zone organization logic; Closure reads whether negative space is designed or residual; Agency Attribution reads whether depicted forms are configured as agents in relation — one oriented toward, blocking, or pursuing another — as designed narrative content rather than repeating pattern; Postural Affect reads emotional or social charge from the configuration of a depicted body — the set of shoulders, spine, or limbs — including when the figure has no legible face; and so on for each active principle.`;

export const PASS1_PROMPT_MULTI = (count: number, artifactPrincipleNames: string[], applicableTierANames: string[]) =>
  `You have examined ${count} views of the same artifact. Report what the examination found, view by view, using the image label as a header.

For each view, report only what was directly observable — first person, specific, no interpretation, no cultural attribution, no quality judgments. Move through: surface features visible from this angle (marks, lines, textures, irregularities read as production evidence), material boundaries, color zones and their distribution, wear and condition differential, evidence of attachment or joining, proportions and scale cues specific to this view.

After covering all views, note any features that are only visible — or that read differently — from specific views.

ARTIFACT PERCEPTUAL PRINCIPLES: When what you found corresponds to one of the following named mechanisms, use the exact name and follow it immediately with the specific thing you observed. Use the name only when the mechanism is genuinely active — do not force mentions:

${artifactPrincipleNames.join(', ')}

UNIVERSAL VISUAL PRINCIPLES: These apply to all artifact observation regardless of object type or domain. When what you found engages any of the following, use the exact name and follow it immediately with the specific thing you observed:

${applicableTierANames.join(', ')}

ARTIFACT-DOMAIN APPLICATION OF TIER A PRINCIPLES: When applying Tier A principles alongside the 15 Artifact Perceptual Principles, do not use studioTool framing — do not ask what an artist did to a viewer. Ask what the mechanism reveals about the object. Edge Detection reads line quality as production evidence; Figure-Ground reads positive-negative design strategy; Color Opponent Channels reads zone organization logic; Closure reads whether negative space is designed or residual; Agency Attribution reads whether depicted forms are configured as agents in relation — one oriented toward, blocking, or pursuing another — as designed narrative content rather than repeating pattern; Postural Affect reads emotional or social charge from the configuration of a depicted body — the set of shoulders, spine, or limbs — including when the figure has no legible face; and so on for each active principle.`;

// ---------------------------------------------------------------------------
// Vector scoring prompt
// ---------------------------------------------------------------------------

const AP_SCORING_LINES = VECTOR_KEY
  .filter(k => k.startsWith('ap_'))
  .map(k => `${k}: ${VECTOR_KEY_NAMES[k]}`)
  .join('\n');

const TA_SCORING_LINES = VECTOR_KEY
  .filter(k => k.startsWith('ta_'))
  .map(k => `${k}: ${VECTOR_KEY_NAMES[k]}`)
  .join('\n');

export const VECTOR_SCORING_PROMPT = (pass1: string): string =>
  `Score each of the ${VECTOR_KEY.length} perceptual principles below using ONLY the Pass 1 observation text provided. Output ONLY a flat JSON object with exactly ${VECTOR_KEY.length} integer keys. No markdown, no commentary, no extra text.

Scale:
0 = not present — the principle has no physical basis in this artifact
1 = peripheral — present but minor
2 = operative — clearly active, shapes how the object reads
3 = dominant — central to what makes this artifact what it is

Most scores will be 0. Use 0 freely for anything not physically observable.

PASS 1 OBSERVATION:
${pass1}

ARTIFACT PRINCIPLES (score from pass1 only):
${AP_SCORING_LINES}

TIER A UNIVERSAL PRINCIPLES (score from pass1 only):
${TA_SCORING_LINES}`;
