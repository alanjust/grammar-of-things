import principlesData from '../data/hg-principles.json';
import artifactPrinciplesData from '../data/artifact-principles.json';

// All Tier A — used in Pass 2 reference list
export const PRINCIPLE_NAMES: string[] = (principlesData.principles as any[])
  .filter((p: any) => p.tier === 'A')
  .map((p: any) => p.name as string)
  .sort((a, b) => b.length - a.length);

// Tier A principles applicable to artifact observation (excludes fine-art-specific:
// Linear Perspective, Atmospheric Perspective, Light Source Logic, Common Fate,
// Elevation in Picture Plane, Binocular vs. Monocular Depth Cues)
export const APPLICABLE_TIER_A_IDS = new Set([1, 2, 4, 5, 13, 15, 20, 28, 47, 48, 49, 51]);

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

// ---------------------------------------------------------------------------
// Pass 1 prompt builders
// ---------------------------------------------------------------------------

export const PASS1_PROMPT_SINGLE = (artifactPrincipleNames: string[], applicableTierANames: string[]) =>
  `Describe only what you can directly observe in this artifact image. Pure observation — no interpretation, no cultural attribution, no quality judgments.

Cover systematically:
- Overall form: what the object is, its general shape, orientation, and scale
- Surface features: every mark, line, texture, and irregularity — read these as production evidence, not just surface description
- Material boundaries: where one material or surface treatment ends and another begins
- Color zones: what colors are present and how they are distributed across the object
- Wear and condition: where surfaces appear more abraded, worn, polished, or eroded than others, and where they do not
- Evidence of attachment or joining: holes, channels, residue, binding marks, inset cavities, grooves
- Proportions: thickness, depth, wall relationships, scale relative to other features
- Anything incomplete, interrupted, or where a gap in the surface suggests something is absent

Be specific and granular. Work systematically across the object from one end to the other.

ARTIFACT PERCEPTUAL PRINCIPLES: When your observation corresponds to one of the following, use the exact name and follow it immediately with what you specifically observe:

${artifactPrincipleNames.join(', ')}

UNIVERSAL VISUAL PRINCIPLES: These apply to all artifact observation regardless of object type or domain. When your observation engages any of the following, use the exact name and follow it immediately with what you specifically observe:

${applicableTierANames.join(', ')}

ARTIFACT-DOMAIN APPLICATION OF TIER A PRINCIPLES: When applying Tier A principles alongside the 15 Artifact Perceptual Principles, do not use studioTool framing — do not ask what an artist did to a viewer. Ask what the mechanism reveals about the object. Edge Detection reads line quality as production evidence; Figure-Ground reads positive-negative design strategy; Color Opponent Channels reads zone organization logic; Closure reads whether negative space is designed or residual; and so on for each active principle.`;

export const PASS1_PROMPT_MULTI = (count: number, artifactPrincipleNames: string[], applicableTierANames: string[]) =>
  `You are looking at ${count} images of the same artifact. Each image is labeled with its view. Work through each view in sequence, using the label as a header.

For each view, describe only what you can directly observe — pure observation, no interpretation, no cultural attribution, no quality judgments.

For each view cover: surface features visible from this angle (marks, lines, textures, irregularities read as production evidence), material boundaries, color zones and their distribution, wear and condition differential, evidence of attachment or joining, proportions and scale cues specific to this view.

After covering all views, note any features that are only visible — or that read differently — from specific views.

ARTIFACT PERCEPTUAL PRINCIPLES: When your observation corresponds to one of the following, use the exact name and follow it immediately with what you specifically observe:

${artifactPrincipleNames.join(', ')}

UNIVERSAL VISUAL PRINCIPLES: These apply to all artifact observation regardless of object type or domain. When your observation engages any of the following, use the exact name and follow it immediately with what you specifically observe:

${applicableTierANames.join(', ')}

ARTIFACT-DOMAIN APPLICATION OF TIER A PRINCIPLES: When applying Tier A principles alongside the 15 Artifact Perceptual Principles, do not use studioTool framing — do not ask what an artist did to a viewer. Ask what the mechanism reveals about the object. Edge Detection reads line quality as production evidence; Figure-Ground reads positive-negative design strategy; Color Opponent Channels reads zone organization logic; Closure reads whether negative space is designed or residual; and so on for each active principle.`;

// ---------------------------------------------------------------------------
// Vector scoring prompt
// ---------------------------------------------------------------------------

export const VECTOR_SCORING_PROMPT = (pass1: string): string =>
  `Score each of the 27 perceptual principles below using ONLY the Pass 1 observation text provided. Output ONLY a flat JSON object with exactly 27 integer keys. No markdown, no commentary, no extra text.

Scale:
0 = not present — the principle has no physical basis in this artifact
1 = peripheral — present but minor
2 = operative — clearly active, shapes how the object reads
3 = dominant — central to what makes this artifact what it is

Most scores will be 0. Use 0 freely for anything not physically observable.

PASS 1 OBSERVATION:
${pass1}

ARTIFACT PRINCIPLES (score from pass1 only):
ap_1: Production Trace Reading
ap_2: Sequence Inference
ap_3: Material Boundary Attention
ap_4: Wear Differential
ap_5: Absence as Evidence
ap_6: Composite Detection
ap_7: Anatomical Correspondence
ap_8: Symmetry as Evidence
ap_9: Proportion as Encoding
ap_10: Color Zone Logic
ap_11: Investment Gradient
ap_12: Attachment Point Reading
ap_13: Orientation Dependency
ap_14: Completion State
ap_15: Reduction vs. Construction

TIER A UNIVERSAL PRINCIPLES (score from pass1 only):
ta_1: Edge Detection
ta_2: Color Opponent Channels
ta_4: Figure-Ground Relationships
ta_5: Grouping
ta_13: Overlap/Occlusion
ta_15: Closure/Negative Space
ta_20: Simultaneous Contrast
ta_28: Specularity/Surface Reflection
ta_47: Face Detection
ta_48: Biological Motion Detection
ta_49: Gaze Direction/Social Attention
ta_51: Visual Pop-out/Pre-attentive Features`;
