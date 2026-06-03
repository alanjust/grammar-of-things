import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import principlesData from '../../data/hg-principles.json';
import artifactPrinciplesData from '../../data/artifact-principles.json';

export const prerender = false;

// --- Model config (A2/A3) ---

interface PassConfig {
  provider: 'anthropic';
  model: string;
}

interface ModelConfig {
  pass1:      PassConfig;
  pass2:      PassConfig;
  pass3:      PassConfig;
  extraction: PassConfig;
  vector:     PassConfig;
}

const DEFAULTS: ModelConfig = {
  pass1:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  pass2:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  pass3:      { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  extraction: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  vector:     { provider: 'anthropic', model: 'claude-haiku-4-5' },
};

function resolveModelConfig(env: Record<string, string | undefined>): ModelConfig {
  const resolve = (pass: keyof ModelConfig): PassConfig => ({
    provider: (env[`${pass.toUpperCase()}_PROVIDER`] as PassConfig['provider']) || DEFAULTS[pass].provider,
    model:    env[`${pass.toUpperCase()}_MODEL`] || DEFAULTS[pass].model,
  });
  return { pass1: resolve('pass1'), pass2: resolve('pass2'), pass3: resolve('pass3'), extraction: resolve('extraction'), vector: resolve('vector') };
}

// Model router — seam for future provider integrations (A3).
// All model calls go through here; add provider branching when wiring additional providers.
function streamModel(cfg: PassConfig, params: Omit<Parameters<Anthropic['messages']['stream']>[0], 'model'>, anthropic: Anthropic) {
  return anthropic.messages.stream({ ...params, model: cfg.model });
}
async function callModel(cfg: PassConfig, params: Omit<Parameters<Anthropic['messages']['create']>[0], 'model'>, anthropic: Anthropic): Promise<Anthropic.Message> {
  return anthropic.messages.create({ ...params, model: cfg.model });
}

// --- All Tier A — used in Pass 2 reference list
const PRINCIPLE_NAMES: string[] = (principlesData.principles as any[])
  .filter((p: any) => p.tier === 'A')
  .map((p: any) => p.name as string)
  .sort((a, b) => b.length - a.length);

// Tier A principles applicable to artifact observation (excludes fine-art-specific:
// Linear Perspective, Atmospheric Perspective, Light Source Logic, Common Fate,
// Elevation in Picture Plane, Binocular vs. Monocular Depth Cues)
const APPLICABLE_TIER_A_IDS = new Set([1, 2, 4, 5, 13, 15, 20, 28, 47, 48, 49, 51]);
const APPLICABLE_TIER_A_NAMES: string[] = (principlesData.principles as any[])
  .filter((p: any) => APPLICABLE_TIER_A_IDS.has(p.id))
  .map((p: any) => p.name as string)
  .sort((a, b) => b.length - a.length);

// Artifact-domain perceptual principles
const ARTIFACT_PRINCIPLE_NAMES: string[] = (artifactPrinciplesData.principles as any[])
  .map((p: any) => p.name as string)
  .sort((a, b) => b.length - a.length);

// Principle reference strings for the extraction prompt
const ARTIFACT_PRINCIPLE_REF = (artifactPrinciplesData.principles as any[])
  .map((p: any) => `${p.name} (id:${p.id})`)
  .join(', ');

const TIER_A_PRINCIPLE_REF = (principlesData.principles as any[])
  .filter((p: any) => APPLICABLE_TIER_A_IDS.has(p.id))
  .map((p: any) => `${p.name} (id:${p.id})`)
  .join(', ');

const EXTRACTION_PROMPT = (
  pass1: string,
  pass2: string,
  fields: Record<string, string>,
  mode: string
): string => {
  const meta = Object.entries(fields)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || 'None provided';

  const sectionsSchema = mode === 'artifact'
    ? `  "sections": [
    { "code": "A|B|C|D|E|F|G", "label": "<section label>", "summary": "<1-2 sentence summary>", "trade_materials": true, "kill_hole": null }
  ]`
    : `  "sections": []`;

  return `Extract structured data from this artifact analysis. Output ONLY valid JSON — no markdown fences, no extra text.

ARTIFACT METADATA:
${meta}

PASS 1 OBSERVATION:
${pass1}

PASS 2 ANALYSIS:
${pass2}

PRINCIPLE REFERENCE — use exact names and ids when populating principles_fired:
Artifact principles (type "artifact"): ${ARTIFACT_PRINCIPLE_REF}
Universal visual principles (type "universal_tier_a"): ${TIER_A_PRINCIPLE_REF}

For each principle in principles_fired, set weight: 1 = peripheral, 2 = clearly operative, 3 = dominant.

Output this exact structure. Use only the enum values shown. Use null where genuinely unknown.

{
  "object_class_identified": "ceramic_vessel|carved_organic|composite|lithic|shell|fiber|other",
  "tradition_identified": "mimbres|hohokam|ancestral_puebloan|casas_grandes|salado|unknown",
  "tradition_confidence": "reading|hypothesis|indeterminate",
  "function_category": "domestic_utilitarian|serving_display|ritual_ceremonial|mortuary|indeterminate",
  "function_confidence": "reading|hypothesis|indeterminate",
  "production_level": "household|part_time_specialist|full_time_specialist|indeterminate",
  "temporal_note": "<string or null>",
  "tradition_routing_basis": "visual_only|metadata_confirmed|metadata_conflict|ambiguous",
  "metadata_completeness": "none|partial|full",
  "principles_fired": [
    { "name": "<exact name from reference>", "id": 0, "type": "artifact|universal_tier_a", "pass": "pass1|pass2|both", "weight": 1, "observation": "<the specific observation phrase>" }
  ],
  "rap_flags": [
    { "claim_type": "tradition_attribution|iconographic_meaning|functional_claim|inter_tradition_relationship", "confidence": "reading|hypothesis", "claim": "<specific claim text>", "anchor_count": 0 }
  ],
${sectionsSchema}
}`;
};

// Dedicated vector scoring prompt — Pass 1 text only, no other context
const VECTOR_SCORING_PROMPT = (pass1: string): string =>
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

const PASS1_PROMPT_SINGLE = (artifactPrincipleNames: string[], applicableTierANames: string[]) =>
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

const PASS1_PROMPT_MULTI = (count: number, artifactPrincipleNames: string[], applicableTierANames: string[]) =>
  `You are looking at ${count} images of the same artifact. Each image is labeled with its view. Work through each view in sequence, using the label as a header.

For each view, describe only what you can directly observe — pure observation, no interpretation, no cultural attribution, no quality judgments.

For each view cover: surface features visible from this angle (marks, lines, textures, irregularities read as production evidence), material boundaries, color zones and their distribution, wear and condition differential, evidence of attachment or joining, proportions and scale cues specific to this view.

After covering all views, note any features that are only visible — or that read differently — from specific views.

ARTIFACT PERCEPTUAL PRINCIPLES: When your observation corresponds to one of the following, use the exact name and follow it immediately with what you specifically observe:

${artifactPrincipleNames.join(', ')}

UNIVERSAL VISUAL PRINCIPLES: These apply to all artifact observation regardless of object type or domain. When your observation engages any of the following, use the exact name and follow it immediately with what you specifically observe:

${applicableTierANames.join(', ')}

ARTIFACT-DOMAIN APPLICATION OF TIER A PRINCIPLES: When applying Tier A principles alongside the 15 Artifact Perceptual Principles, do not use studioTool framing — do not ask what an artist did to a viewer. Ask what the mechanism reveals about the object. Edge Detection reads line quality as production evidence; Figure-Ground reads positive-negative design strategy; Color Opponent Channels reads zone organization logic; Closure reads whether negative space is designed or residual; and so on for each active principle.`;

const ARTIFACT_PROMPT = (pass1: string, principleNames: string[], artifactPrincipleNames: string[], audience: string, views: string[] = []) => {
  const audienceFrame = audience.includes('curator')
    ? `You are analyzing this artifact for a museum curator. Address: typological placement and what it establishes, condition and what it affects interpretively, cultural significance and what tradition this object represents, and what comparable documented examples exist. Use field vocabulary precisely.`
    : audience.includes('educator')
    ? `You are analyzing this artifact for an educator. Prioritize: what this object makes directly visible about production technique, cultural practice, or social organization — things a student can learn to see in other objects by looking carefully at this one.`
    : `You are analyzing this artifact for a researcher. Be precise, systematic, and evidence-grounded. Maintain explicit uncertainty where the image cannot resolve a question.`;

  const viewLine = views.length > 1
    ? `\nAVAILABLE VIEWS: ${views.join(', ')} — draw on all views in your analysis where relevant.\n`
    : '';

  return `${audienceFrame}
${viewLine}
---

### Step 1 — Displacement (always first)

Seven evaluative frameworks will attach to Southwest archaeological material by default. All seven produce category errors. Suppress them before analysis begins.

---

**Framework 1 — Fine art critical vocabulary**

Do not use: tension, productive friction, sustained perceptual reward, painterly, compositional innovation, expressive line, or any vocabulary from Abstract Expressionism, Western formalism, or museum wall text.

*One exception with a strict technical meaning:* Brody uses "positive-negative ambiguity" as a specific technical term for the capacity of a Mimbres geometric composition to be read simultaneously as dark-on-light or light-on-dark — a property deliberately built into the system. This is not fine art ambiguity as a general virtue. Use it only with this technical meaning, only for Mimbres geometric design.

---

**Framework 2 — Innovation as a primary criterion**

Do not reward departure from convention, individual stylistic development, or formal invention. For Mimbres material specifically: "conscious striving for radical innovations or highly individualistic personal styles would have been unthinkable" (Brody). The evaluative achievement is mastery within a constraining system, not departure from it. A correct, well-executed traditional composition is a success by the tradition's own standards.

---

**Framework 3 — Individual artistic genius / lone creator frame**

Do not attribute work to individual artists or read variation as personal expression. Quality in Mimbres production "was always related to group standards or social ideals" (Brody). The production unit was the community and its tradition. Variation within conventions is social signal, not personal statement.

---

**Framework 4 — The "decoration" frame**

Do not categorize painted designs as surface decoration or ornament added to an underlying functional form. They are iconographic programs — visual language with organizational logic and, in many cases, recoverable content.

---

**Framework 5 — Western developmental narrative**

Do not apply a primitive-to-sophisticated developmental scale to the style sequence or across traditions. The Mimbres style sequence (I → II → III) reflects an internal logic — technical elaboration, introduction of new subjects within an existing formal framework — not progress toward a Western fine art endpoint.

---

**Framework 6 — Studio craft / contemporary ceramics frame**

Do not apply studio pottery criticism values: individual voice, deliberate departure from tradition, material experimentation, visible process as virtue. The correct frame: mastery within a constraining tradition is the aesthetic achievement.

---

**Framework 7 — Ethnographic curiosity frame**

Do not analyze primarily through cultural difference or treat the object as a window onto exotic practice. Evaluate against the tradition's own criteria first. Cultural context is secondary framing, not the primary analytical lens.

---

### Step 2 — Object class and tradition identification

**Complete both before proceeding to evaluative criteria. Applying the wrong tradition's criteria produces wrong outputs.**

---

**Object class:**
[ ] Ceramic vessel (bowl, olla, ladle, canteen, effigy vessel)
[ ] Carved organic (wood, bone, or antler effigy, tool, ornament, ritual object)
[ ] Composite object (multiple materials assembled: wood + fiber + stone + pigment)
[ ] Lithic (knapped stone: point, scraper, biface; or ground stone: mano, metate, palette)
[ ] Shell artifact (ornament, trumpet, inlay, pendant)
[ ] Fiber / textile / basketry (woven, plaited, or cordage-based)
[ ] Painted or incised stone
[ ] Other

---

**Source coverage caveat:** Mimbres / Mogollon evaluative criteria are primary-source-supported (Brody, Shafer). AP Chaco/Mesa Verde black-on-white types are primary-source-supported (Wilson 2012, 2014 via NM OAS). All other non-Mimbres sections are paraphrase-supported pending primary source work (Hohokam: Task #7; Casas Grandes: Task #9). Adjust interpretive confidence accordingly.

---

**Tradition identification — ceramic vessels:**

Run CHECK 1 first. CHECK 1 uses slip color and paint program — the most reliably observable distinguishing features in photographs.

**CHECK 1 — Slip × paint program routing matrix:**

| Slip color | Paint program | Route to |
|---|---|---|
| Brilliant white to cream | Single dark pigment (black-brown) | → CHECK 2 (Mimbres vs. AP disambiguation) |
| Buff to gray-buff | Single warm pigment (red-orange) on buff ground | → Hohokam Red-on-Buff |
| White or cream | Two chemically distinct pigments (dark body + warm secondary, clearly different hue) | → Two-pigment block (below) |
| White or cream | Three or more distinct color zones including red, black, and white | → Polychrome traditions (below) |
| Red slip | Various | → Narrow by form and design; multiple candidate traditions |
| Unknown / ambiguous | — | → Flag explicitly; proceed with all candidate traditions |

**Critical note on the two-pigment check:** A two-pigment program is not a tonal variation of one pigment at different densities. It is two chemically and visually distinct materials — a dark brown-black body paint and a separately prepared warm orange, rust, or red-brown secondary paint — used in the same design program on the same object. If the secondary pigment reads as a clearly different hue from the primary (not just lighter or thinner), treat it as a distinct second pigment and run the two-pigment block.

---

**Two-pigment block:**

When CHECK 1 detects two chemically distinct pigments — dark body color plus warm secondary pigment as distinct materials:

**Classic Mimbres Black-on-white attribution is not supported.** Classic Mimbres Black-on-white is a single-pigment tradition. Do not proceed to CHECK 2. Do not attribute to Classic Mimbres.

Candidate traditions for a two-pigment program on a cream/white-slip vessel:

**(a) Ancestral Puebloan bichrome and polychrome types:** AP ceramic traditions include multiple bichrome and polychrome types with secondary pigments. Depending on period and region: Kayenta polychrome types, St. Johns Polychrome, late prehistoric Hopi types (Sikyatki Polychrome). Assess AP-positive design indicators in A-AP.

**(b) Post-Classic Southwest horizon:** After approximately 1150–1200 CE, many regional traditions moved toward multi-pigment programs. A two-pigment program on a vessel with other post-Classic indicators suggests a later date range than Classic Mimbres.

**(c) Documented two-pigment Mimbres figurative variants:** A small number of Mimbres figurative bowls use two pigments for body differentiation (dark body mass, reddish-brown fringe or limb elements). This is documented but not standard. If the design program otherwise matches Mimbres conventions (central medallion, Mimbres figurative codes), Mimbres attribution may still be supported — but the two-pigment program must be flagged as a distinguishing feature, not a confirming one. This candidate requires specific corpus documentation; do not invoke it as a default.

Use AP-positive design indicators and site/cultural metadata to narrow candidates. When candidates cannot be resolved, list them explicitly and state what physical analysis would distinguish them.

---

**CHECK 2 — Mimbres vs. Ancestral Puebloan black-on-white disambiguation:**

Run only when CHECK 1 routes to "brilliant white to cream + single dark pigment." Both traditions use white or cream slip, dark mineral paint, open bowl forms, and geometric or figurative design programs. Check in order:

**2a — Design system organization:**
- Central medallion with open ground field, single large figure or geometric program filling the bowl interior → Mimbres figurative or geometric convention
- Band or register decoration organized around the vessel body or rim zone, with repeated units → AP more typical
- Multiple framing lines, interlocking stepped geometric units, or fine parallel hatching in geometric fields → AP black-on-white more likely

**2b — Figurative design conventions (when figurative content is present):**

Mimbres-specific conventions (Brody corpus):
- Single large animal or scene filling the bowl interior
- Checkerboard, hatching, or step-pattern body fill applied to figurative subjects
- Concentric-circle eye convention across multiple animal types
- Positive-negative ambiguity built into the geometric field
- Profile orientation with single visible wing or limb

**2b-1 — AP-positive design indicators (two or more together make AP attribution well-supported):**
- Band/register design: panel bounded above and below by framing lines, geometric elements filling band interior; multiple framing lines of different weights
- Fine parallel hatching as primary filler of triangular or rectangular geometric fields (Chaco-tradition)
- All-over quadrant layout: bowl interior partitioned into symmetric quadrants, single thick rim line only
- Rim ticking: short painted ticks, dots, or lines on flat bowl rims — strong positive indicator for Mesa Verde-period AP
- Vessel form diversity: mugs, kiva jars, pitchers (handled), dippers alongside bowls — mug form is AP-specific
- Cross/plus marks within geometric fields: present in both traditions; treat as weakly supportive of Mimbres only when combined with two or more other Mimbres-positive indicators

**2b-2 — AP type-specific indicators:**

*Chaco and Cibola White Ware (~900–1150 CE) [CONS — Wilson 2014]:* Thin hard walls; white paste at breaks; mineral paint (sharp black); fine hatching as primary design filler; banded layout with multiple framing lines. Key types: Red Mesa, Gallup, Chaco Black-on-white.

*Northern San Juan / Mesa Verde (~1150–1280 CE) [CONS — Wilson 2012]:* Thick walls; pearly-white polished slip on interior and exterior; organic paint (softer, faded purplish-black); flat rims with ticking; banded and all-over quadrant layouts; stepped triangles, diamonds, interlocking elements; significant vessel form diversity (bowls, mugs, kiva jars, dippers). Key types: Mancos, McElmo, Mesa Verde Black-on-white.

*Kayenta / Tusayan (~900–1300 CE):* Carbon pigment (dull black, brownish tint); curvilinear elements alongside geometric program — interlocking scrolls with solid triangles and parallel lines; NE Arizona / Flagstaff region. Key types: Black Mesa, Sosi, Tusayan Black-on-white.

**2c — Two-pigment program:** Classic Mimbres Black-on-white uses a single dark pigment. A warm secondary pigment as a chemically distinct second color routes to the two-pigment block, not CHECK 2.

**2d — Kill hole:** Present → supports Mimbres burial bowl attribution. Absence is not diagnostic of any tradition.

**2e — When Mimbres vs. AP cannot be resolved:** State the ambiguity explicitly: "The slip, paint, and bowl form are consistent with both Classic Mimbres Black-on-white and Ancestral Puebloan black-on-white traditions. Definitive tradition attribution requires physical examination of paste and temper, and ideally provenience documentation." Do not resolve by defaulting to Mimbres.

---

**Polychrome traditions:**

Three or more distinct color zones including combinations of black, red, white, and sometimes orange or yellow.

*Salado Polychrome horizon (~1275–1450 CE):* Red, white, and black on buff; geometric designs with interlocking scrolls and hatched panels; jars with handles characteristic; broad post-Classic geographic distribution. [CONS — Crown 1994, paraphrase]

*Casas Grandes / Ramos Polychrome (~1200–1450 CE):* Black and red on white slip; macaw and serpent imagery; effigy vessel forms; Paquimé sphere, NW Chihuahua. Visually distinct from Salado. [CONS — paraphrase]

*AP polychrome types:* St. Johns Polychrome (~1175–1300 CE) — two-pigment on white/cream slip. Sikyatki Polychrome (late prehistoric/early historic Hopi) — yellow-orange slip ground with black and red; naturalistic bird imagery. If the vessel has a yellow-orange rather than white slip ground, Sikyatki or Hopi tradition should be considered first.

---

**Metadata routing:**

If researcher has provided cultural tradition, site, or institutional metadata — check it against the visual routing result:

- **Visual routing agrees with metadata** → \`tradition_routing_basis: metadata_confirmed\`. State both the visual evidence and the metadata that confirm the tradition identification.
- **Visual routing conflicts with metadata** → \`tradition_routing_basis: metadata_conflict\`. State the conflict explicitly. Run all candidate traditions. Do not suppress the conflict in the interest of a clean output.
- **No metadata provided** → \`tradition_routing_basis: visual_only\`. Analysis proceeds on visual evidence alone; state this clearly.

---

**Provenience status:**
[ ] Fully documented (site, stratum, burial/feature number, associated assemblage)
[ ] Partially documented (site known, context uncertain)
[ ] Undocumented (purchase or collection history only)
[ ] Unknown

---

### Step 3 — Redirect

Analyze this artifact using the evaluative framework of Southwest archaeology and anthropological artifact analysis. Select the criteria set that matches the identified object class and tradition. Apply all cross-cutting criteria (Section G) regardless of object class.

**Frameworks applying to all object classes:**

These three are analytical frameworks [THEORY] — they define what questions get asked and what counts as evidence. Apply all three; note where they yield conflicting readings.

- **[THEORY] Technological style and chaîne opératoire (Shafer):** Every material has a production sequence from raw material to finished object. Each stage leaves observable evidence [OBS]. Read the production sequence before interpreting meaning. Reveals: production decisions, skill level, tradition encoding. Does not address: iconographic content, social function.
- **[THEORY] Social organization frame (Hegmon):** Objects encode social information at multiple scales. Ask what social work this object was doing — community identity, household production, ritual role — before asking what it depicts. Reveals: scale of production, community vs. household signals, exchange indicators. Does not address: specific iconographic meaning.
- **[THEORY] Iconographic program analysis (Brody/Schaafsma):** Describe before interpreting. What is visually present? [OBS] What is the organizational logic? [OBS→INTERP] What corpus parallels exist? [CONS when available] Where meaning cannot be recovered, state that plainly. Reveals: visual content and compositional structure. Does not address: production sequence, social context of exchange.

---

**SECTION A — Ceramic Vessels**

*Apply when object class is: Ceramic vessel*

---

**A0 — Universal criteria (all traditions)**

**Form and construction:** Describe rim diameter (estimate from proportions if not documented — state clearly when estimating), depth, wall curvature, base form. Wall thickness consistency — even walls indicate skilled construction; variation signals production-stage issues. Evidence of coil-and-scrape: oblique striations, coil junctures at breaks or thin spots. Paddle-and-anvil finishing marks: exterior compression marks rather than oblique striations. Construction technique is tradition-diagnostic — see tradition subsections.

*Scale caveat:* Photographs without scale bars give no reliable size information. Do not estimate dimensions without a known reference object.

**Surface treatment — universal observation:** Slip presence/absence [OBS], coverage [OBS], adhesion quality [OBS].

*Burnishing ceiling:* Photographs can distinguish high-gloss polish from fully matte surfaces at the extremes only. Intermediate burnishing levels are not reliably determinable from image evidence alone. Describe surface reflectivity as directly observed; state the ceiling when reached.

**Paint presence and line quality:** Paint present or absent [OBS]. Line quality: single-stroke control, weight consistency, evidence of hesitation or correction [OBS]. Brush discipline is readable from the line work.

**Kill hole:** Present or absent [OBS]. Location: base (expected for Mimbres), elsewhere (unusual). Method: punched, drilled, or smashed — each leaves a different scar profile [OBS]. Kill hole practice is a Mimbres burial custom — see A-Mimbres for interpretation.

**Firing and condition:** Firing atmosphere: oxidizing (tan/orange exterior) vs. reducing (gray/black) [OBS]. Fire clouds on exterior: note location and extent [OBS]. Post-depositional damage vs. use wear vs. ancient repair vs. modern restoration [OBS].

---

**A-Mimbres — Mimbres / Mogollon ceramics**

*Primary-source-supported (Brody 2004, Shafer 2003). Scope: Classic Mimbres Black-on-white (~850–1150 CE), Mimbres Valley and surrounding Mogollon region, SW New Mexico.*

**Slip:** Brilliant white to cream; high kaolin content [CONS]. Interior-slip-only is standard Mimbres Valley production [CONS — Brody]. Exterior slip is unusual — may indicate outlying area production; thin or absent bottom framing lines may indicate upper Gila or Rio Grande drainage production [INTERP — Brody; regional substyle marker].

**Paint:** Single dark mineral pigment (iron-based) — matte or semi-matte, permanent [CONS]. A warm secondary pigment as a chemically distinct second color is not standard Classic Mimbres Black-on-white — routes to two-pigment block.

**Construction:** Coil-and-scrape universally [CONS — Brody, Shafer]. Mimbres vessels "are often lopsided and rarely symmetrical" — the Mimbreños "were not the best ancient potters in the Southwest" technically (Shafer, NAN Ranch) [INTERP — Shafer]. Assess technical forming quality and aesthetic/painting quality as independent axes. A vessel with irregular forming and exceptional painting is the expected pattern, not a contradiction.

**Paint quality standard:** "Indifferent draftsmanship voided visual success no matter how fertile the imagination. Superb draftsmen who followed the rules could hardly go wrong" (Brody, Form and Structure) [INTERP — Brody]. Line control is the technical prerequisite for visual success in the Mimbres system. Assess: consistent width, even edges, controlled direction changes.

**Design system:** Interior-dominant composition — full bowl interior as field. Framing lines (typically two or more) defining the design zone [CONS — Brody]. Positive-negative ambiguity in geometric work: capacity of composition to be read simultaneously as dark-on-light or light-on-dark — specific technical achievement in the Mimbres geometric system, not a general formal virtue [INTERP — Brody; Mimbres geometric only].

**Design execution:** Symmetry precision, framing line integrity, compositional logic, hatching regularity [OBS]. Does the design fill the field without crowding or misjudged scale? [OBS] Errors in geometric design read as production errors [CONS]. Errors in figurative design may indicate departure from convention — document the specific departure with at least two observable examples before using it as an interpretive claim.

**Figurative conventions (when present):** Single large figure or scene filling the bowl interior (central medallion organization) [CONS — Brody]. Checkerboard, hatching, or step-pattern body fill on figurative subjects. Concentric-circle eye convention across multiple animal types. Profile orientation with single visible wing or limb [CONS — Brody corpus].

*Compositional base rates [CONS — Brody, Table 2; scope: published corpus; use as calibration prior, not a rule]:* Single-figure compositions 64%; two-figure non-narrative 15%; narrative with humans 9%; narrative without humans 7%. Do not over-read narrative into what statistically is most likely a single-figure composition.

**Iconographic program:** [THEORY — Brody/Schaafsma describe-before-interpret protocol] Describe before interpreting. Figure type [OBS], field organization [OBS], figural vs. geometric [OBS], narrative vs. emblematic [INTERP — requires at least two observable narrative elements; single figure + context does not satisfy].

**Species identification and composite figures:** A species claim requires corpus comparison — cannot be made from image evidence alone. Classify to most general identifiable level (bird, fish, quadruped) and label more specific readings as hypotheses. A composite-figure claim requires two independently observable anatomical anomalies anchored in the depicted form. One material observation plus one tradition-level fact does not satisfy the requirement.

*Transformation and composite figures [INTERP — Brody]:* "Interchangeability, transformation, and being and becoming are the core creative principles of Mimbres art." Anchor this interpretation in specific observable anatomical features — document the [OBS] evidence before invoking the framework.

**Production mode typology [INTERP — Brody; Mimbres scope only]:**
1. *Skilled adult production:* controlled line [OBS], correct style conventions [CONS], competent vessel forming [OBS]
2. *Child or novice production:* poor vessel forming AND poor painting on the same vessel — both skills absent together
3. *Iconographically knowledgeable but technically unskilled:* correct narrative content, poor line control, painting on a well-made vessel. Brody's hypothesis that this mode indicates a male contributor is a scholarly interpretation, not a confirmed conclusion — do not state as fact.

**Kill hole interpretation:** Kill hole practice did not begin until the Late Three Circle phase — it is a Classic period marker [CONS — Shafer, NAN Ranch ch. 8]. Confirms burial context [CONS].

**Firing notes:** Fire clouds on exterior are expected and deliberately tolerated — not an error [INTERP — Brody]. Fire clouds on interior: unusual [CONS]. Mixed black-and-red paint may be a deliberate aesthetic choice, not a firing failure [INTERP — Brody].

**Reference collection:** Swarts Ruin collection (Peabody Museum) and NAN Ranch assemblage (Shafer 2003) are the primary comparison baseline for production quality range. Brody's Mimbres Painted Pottery (2004) corpus is the comparison baseline for figurative imagery. Do not use unprovenanced market examples as reference points.

---

**A-Hohokam — Hohokam Red-on-Buff ceramics**

*Paraphrase-supported pending Task #7: Haury, The Hohokam: Desert Farmers and Craftsmen (1976). State confidence as provisional in outputs.*
*Scope: Pioneer through Sedentary periods (~300–1100 CE), S Arizona river valleys.*

**Slip and paint:** Buff to gray-buff slip ground; single warm red-orange pigment on buff ground [CONS — paraphrase]. Do not apply Hohokam criteria to a white-slip vessel — white slip routes to Mimbres/AP disambiguation.

**Construction:** Paddle-and-anvil is the primary Hohokam construction method [CONS — paraphrase, Haury]. Evidence: exterior compression marks rather than oblique striations. Coil-and-scrape striations suggest non-Hohokam production.

**Design vocabulary:** Life-form imagery — birds, lizards, snakes, human figures — with movement and posture conventions that differ from Mimbres figurative codes [CONS — paraphrase]. Geometric interlocking designs; scrolls. Apply describe-before-interpret: document specific figures and motifs before attributing tradition-specific conventions.

**Vessel forms:** Broader range than Mimbres — not just open bowls but jars, effigy vessels, incense burners, trays [CONS — paraphrase]. Vessel form diversity is a secondary check after slip and paint.

**Period indicators:** Red-on-Buff spans ~300–1100 CE (Pioneer through Sedentary). Classic Hohokam after ~1100 CE shifts toward different ceramic types [CONS — paraphrase].

**Reference collection:** Snaketown assemblage, Arizona State Museum (Haury 1976).

---

**A-AP — Ancestral Puebloan ceramics**

*Primary-source-supported for Chaco/Cibola and Mesa Verde black-on-white types (Wilson 2012, 2014 via NM OAS ceramics.nmarchaeology.org). Paraphrase-supported for Kayenta/Tusayan and polychrome types.*
*Scope: Four Corners region and surrounding areas, ~750–1300 CE.*

**Universal AP black-on-white indicators:** White or cream slip; dark mineral or carbon paint [CONS]. Multiple framing lines of different weights; banded or register design organization [CONS — Wilson 2012, 2014]. These features distinguish AP from Mimbres, which uses interior-dominant composition without consistent register subdivision.

*Two or more of the following AP-positive indicators together make AP attribution well-supported:*

**Band/register design organization [CONS — Wilson 2012]:** Design organized as a panel bounded above and below by framing lines; geometric elements filling band interior. Multiple framing lines typically of different thicknesses — Mesa Verde convention: thick line on top, thinner below.

**Fine parallel hatching as primary fill [CONS — Wilson 2014]:** Evenly-spaced fine parallel lines as primary filler of triangular or rectangular geometric fields — characteristic of Chaco-tradition types.

**All-over quadrant layout [CONS — Wilson 2012]:** Bowl interior partitioned into symmetric quadrants; single thick rim line as only framing element. Visually distinct from the Mimbres central medallion.

**Rim ticking [CONS — Wilson 2012]:** Short painted ticks, dots, or lines on flat bowl rims. Classic Mimbres bowls have painted rim lines but not ticking. Strong positive indicator for Mesa Verde-period AP.

**Vessel form diversity [CONS]:** Mugs, kiva jars, pitchers, dippers alongside bowls. Mug form is AP-specific — no Classic Mimbres equivalent.

**Type-specific indicators:**

*Chaco and Cibola White Ware (~900–1150 CE) [CONS — Wilson 2014]:* Thin hard walls; white paste at breaks; mineral paint (sharp black); fine hatching as primary design filler; banded layout with multiple framing lines. Key types: Red Mesa, Gallup, Chaco Black-on-white.

*Northern San Juan / Mesa Verde (~1150–1280 CE) [CONS — Wilson 2012]:* Thick walls; pearly-white polished slip on interior and exterior; organic paint (softer, faded purplish-black); flat rims with ticking; banded and all-over quadrant layouts; stepped triangles, diamonds, interlocking elements; mugs, kiva jars, dippers. Key types: Mancos, McElmo, Mesa Verde Black-on-white.

*Kayenta / Tusayan (~900–1300 CE):* Carbon pigment (dull black, brownish tint); curvilinear elements alongside geometric program — interlocking scrolls with solid triangles and parallel lines; NE Arizona / Flagstaff region. Key types: Black Mesa, Sosi, Tusayan Black-on-white.

**AP polychrome types [paraphrase-supported]:**

*St. Johns Polychrome (~1175–1300 CE):* Two-pigment program on white/cream slip; geometric design vocabulary; AZ/NM border region.

*Sikyatki Polychrome (late prehistoric/early historic Hopi):* Yellow-orange slip ground; black and red design elements; naturalistic bird imagery. Yellow-orange slip distinguishes it from all AP black-on-white types — assess slip color first.

**Reference collections:** Pueblo Bonito material (Chaco Culture NHP, Smithsonian) for Chaco contexts. Mesa Verde NP collections for 13th-century assemblages. Maxwell Museum (UNM) for broad regional comparative material. NM OAS Southwest Ceramic Typology database (ceramics.nmarchaeology.org) for type descriptions.

---

**A-Casas Grandes — Casas Grandes / Paquimé ceramics**

*Paraphrase-supported pending Task #9: Minnis/Whalen, Ancient Paquimé and the Casas Grandes World (2015). State confidence as provisional in outputs.*
*Scope: Paquimé sphere, NW Chihuahua, ~1200–1450 CE.*

**Slip and paint:** White slip ground; geometric designs in black and red — three-color program (black + red + white) [CONS — paraphrase]. Three-color combination distinguishes Ramos Polychrome from AP black-on-white types (lack red secondary pigment) and from Salado (different ground treatment and design vocabulary).

**Design vocabulary:** Geometric designs primary. Macaw and serpent imagery are characteristic iconographic elements [CONS — paraphrase]. Three-color program plus macaw or serpent imagery together make Casas Grandes attribution supportable.

**Vessel forms:** Includes effigy vessels — uncommon in Mimbres and AP production [CONS — paraphrase]. Effigy vessel presence alongside the three-color program is a strong Casas Grandes indicator.

**Reference collection:** Centro INAH Chihuahua collections.

---

**A-Salado — Salado Polychrome**

*Paraphrase-supported (Crown, Ceramics and Ideology, 1994). Scope: ~1275–1450 CE; broad post-Classic geographic distribution. The Salado horizon is a distribution of ceramic types, not a single ethnic group.*

**Slip and paint:** Red, white, and black on buff ground — three distinct color zones [CONS — paraphrase]. Distinguishes Salado from Casas Grandes (white slip, different design vocabulary) and AP polychrome types.

**Design vocabulary:** Geometric designs with interlocking scrolls and hatched panels [CONS — paraphrase]. Not the macaw/serpent imagery of Casas Grandes.

**Vessel forms:** Jars with handles are characteristic [CONS — paraphrase]. Handles are diagnostic — present in Salado, absent in Mimbres, uncommon in AP.

**Temporal placement:** Post-Classic — ~1275–1450 CE [CONS]. Objects in Salado Polychrome types exist in a transformed social landscape following the 12th–13th century reorganization events.

*Salado as ideological distribution [INTERP — Crown 1994]:* The geographic spread of Salado Polychrome represents the spread of a shared ritual/ideological complex through ceramic conventions, not population movement.

---

**A-General — Tradition placement and trade ware identification**

After applying tradition-specific criteria, assign the object to a cultural tradition. [CONS when two or more criteria converge]

**Trade ware identification:** A vessel from outside the local tradition is an exchange event [CONS — requires provenience]. Trade ware identification requires provenience documentation — without context, it is a style attribution, not a trade ware identification.

**Mixed-tradition assemblages** at a single site indicate exchange or migration events [INTERP — requires provenience; state as hypothesis without documented context].

**State source coverage confidence level** (primary-source-supported / paraphrase-supported) for the identified tradition in the output.

---

**SECTION B — Carved Organic Objects (Wood, Bone, Antler)**

*Apply when object class is: Carved organic*
*Tradition note: The best-documented assemblages come from AP dry cave deposits across the Four Corners region and Mogollon Highlands. Mimbres-area carved organic material is less well-represented in published literature. Apply criteria below; note tradition affiliation where evidence supports it.*

**Material identification:** Wood (grain visible, light weight, susceptible to checking and splitting), bone (dense, smooth, cancellous interior at breaks), antler (distinctive external texture, branching structure). Material choice is a production decision — cottonwood root, pine, and willow have different working properties and cultural associations in Southwest traditions. Cottonwood is the conventional ritual medium for Southwest carved wood.

**Construction method:** Subtractive carving (material removed from a blank to produce form) vs. additive construction (separate elements joined). Look for: tool marks, gouge traces, surface irregularities consistent with hand carving, absence of lathe regularity. Join evidence — pegs, adhesive residue, binding marks — indicates additive construction.

**Form analysis:** Overall body form and its referent (animal, human, geometric). Anatomical differentiation: how are body parts (head, limbs, features) indicated — carved reduction, painted, inset? Proportions: schematic (simplified) vs. naturalistic (anatomically accurate)? Single-material or composite construction?

**Surface treatment and pigment:** Is pigment applied as a ground coat (covering the full surface) or as discrete painted elements over a ground? Color zone organization: does the pigment program follow the object's anatomy, orientation, or a conventional scheme? Mineral pigments: ochre/limonite = yellow, hematite = red, malachite = green, charcoal/carbon = black, kaolin/gypsum = white. Note condition of organic surface: checking (drying cracks), splitting, erosion of painted surfaces.

**Attached elements:** Fiber attachments (cord, bundles, wrappers) — note material type, color(s), knot structure, location on object. Are attachments functional (securing structural elements, suspension) or purposive (fiber bundles, offerings, binding as ritual act)? Multi-color fiber bundles are composed, not random — dyeing is a labor investment signaling intentional composition. Inset materials: turquoise, shell, stone — location (eye position, body markings), method of attachment (drilled and set vs. adhered). Insets at eye positions are conventional markers in Southwest effigy traditions.

**Preservation context:** Organic materials survive primarily in dry cave contexts. Preservation state (intact fiber, retained pigment, structural integrity) indicates intentional protected deposition vs. accidental burial vs. discard. Preservation quality itself is evidence.

---

**SECTION C — Composite Objects (Multi-Material)**

*Apply when object class is: Composite object*
*Tradition note: High-investment composite objects are documented across Southwest traditions. Casas Grandes effigy vessels are a distinct sub-category — when an object may be Casas Grandes-affiliated, apply A-Casas Grandes criteria alongside composite criteria here.*

**Material inventory:** List every material category present — substrate material (wood, stone, shell), surface treatment (pigment, slip, incision), attached elements (fiber, feathers, inset stone). The combination of materials is itself an analytical object.

**Production sequence:** What was made first, what was added, what was attached last? Evidence of sequential production (base object + later additions) vs. simultaneous assembly? Each addition represents a separate production decision and often a separate material procurement event.

**Material investment assessment:** Add up the procurement and production requirements: raw material acquisition (local vs. trade), processing (carving, pigment preparation, dyeing), assembly skill. Investment level indicates the object's social position — household production vs. specialist production vs. high-investment ritual object.

**Compositional logic:** Is there an organizing principle behind material choices? Turquoise at eye positions is a Southwest convention. Color-coded pigments following anatomy are a deliberate choice. Multi-color fiber bundles are composed, not random. Look for the logic.

**Conventional vs. novel:** Does this material assemblage follow a recognizable convention (known effigy type, bundle type, ritual object category) or appear novel? Novel assemblages require more interpretive caution.

---

**SECTION D — Lithic Artifacts**

*Apply when object class is: Lithic*
*Tradition note: Mimbres-specific point types are documented below (Shafer, NAN Ranch ch. 11). AP and Hohokam contexts have separate typological sequences — consult regional typological references for non-Mimbres lithic assemblages. Ground stone metate sequence applies broadly across Southwest agricultural traditions.*

**Material type:** Obsidian (source-traceable by INAA or pXRF), chert, basalt, quartzite, sandstone, other. Material type affects both working properties and cultural significance. Non-local or visually distinctive stone may be selected for properties beyond utilitarian function.

*Mimbres obsidian sources [CONS — Shafer, NAN Ranch]:* Mule Creek (eastern Arizona), Ewe Canyon, Antelope Wells — all 120–150 km distant from the Mimbres Valley. Obsidian presence = non-local exchange participation at minimum.

**Reduction technology:** Knapped stone — direct percussion, pressure flaking, biface thinning, notching. Stage of reduction: primary flake (cortex present), secondary flake (cortex absent), formal tool (retouched). Hafting evidence: notches, stems, ground lateral edges. Ground stone — grinding facets, pecking surfaces, polish from use, residue staining.

**Formal type:** Place in regional typological sequence. Projectile points in the Southwest have well-documented temporal sequences; type identification constrains date range.

*Mimbres Classic period arrow point types [CONS — Shafer, NAN Ranch ch. 11]:* Hinton (parallel side notches, concave base), Swarts (parallel side notches, convex base), Cosgrove (parallel side notches, multiple notches on one edge).

*Ground stone metate sequence [CONS]:* Oval basin → trough open one end → trough open both ends; correlates with maize intensification.

**Use wear:** Edge damage patterns consistent with specific uses, polish from contact with specific materials, residue staining, ground stone wear facets indicating motion direction and intensity.

**Ornamental vs. utilitarian:** Stone ornaments (pendants, beads, inlays) are distinct from tools. Ornament criteria: formal shaping beyond functional need, drilled suspension holes, polished surfaces, non-local material selection. Turquoise, jet, argillite, and other non-local colored stones are primarily ornamental/ritual, not utilitarian.

---

**SECTION E — Shell Artifacts**

*Apply when object class is: Shell artifact*
*Tradition note: Shell ornament production is particularly well-documented for Hohokam contexts. The Glycymeris bracelet is a diagnostic Hohokam ornament type. NAN Ranch species counts (Shafer) provide a Mimbres-context baseline for what shell types were present and in what quantities.*

**Species identification:** Gulf of California species (Glycymeris, Conus, Olivella, Laevicardium) — primary Hohokam shell trade material, ~300–500 km distance. Pacific coast species — longer-distance trade. Gulf of Mexico species (Spondylus, Busycon) — very long-distance trade, broad exchange networks. Spondylus presence is always analytically significant regardless of context. Species identification from photographs is approximate; note visible morphological features.

*NAN Ranch species counts for Mimbres-context reference [CONS — Shafer]:* Glycymeris 361, Nassarius 182, Pecten 137, Haliotis 81, Spondylus 74, Olivella 34, Conus 5, coral 2, Strombus 2.

**Manufacture evidence:** Raw shell vs. worked vs. finished ornament. Manufacturing stages: roughing out, shaping, perforation, finishing. Manufacturing debris indicates local production; finished pieces without debris indicate trade in finished objects.

**Ornament type:** Glycymeris bracelet (Hohokam — circular form cut from body whorl, umbo area often carved into frog or snake effigy; diagnostic Hohokam type). Shell pendant (cut and drilled, suspension ornament). Shell bead (cylindrical or disc-shaped, drilled). Shell inlay (cut thin for mosaic or inlay work). Shell trumpet (large gastropod with apex removed — Strombus, Turbinella — ritual/ceremonial use).

**Iconographic content on shell:** Carved figures on shell ornaments (Hohokam umbo effigies: frog, snake, lizard, human). Incised designs on shell. Apply describe-before-interpret protocol.

---

**SECTION F — Fiber, Textile, and Basketry**

*Apply when object class is: Fiber / textile / basketry*
*Tradition note: Absence of fiber evidence at a site is taphonomic, not cultural — organic materials decompose in most depositional contexts. Dry cave preservation is exceptional and biased toward AP assemblages. Do not assume all fiber objects are AP-affiliated.*

**Construction technique:** Basketry — coiled (coil diameter, stitches per coil, foundation material), plaited (plain, twill), twined (plain, diagonal, three-strand). Textiles — plain weave, twill, tapestry, embroidery. Cordage — ply direction (Z or S twist), number of plies, fiber type. Technique is tradition-diagnostic.

**Material:** Plant fiber (yucca, cotton, apocynum, agave), animal fiber (feathers, fur, human hair). Material identification constrains geographic and seasonal context. Cotton in the Southwest requires cultivation or trade — presence indicates agricultural communities or exchange.

**Dye evidence:** Natural color vs. dyed fiber. Blue/green in prehistoric Southwest fiber is rare and significant — likely plant sources (larkspur, indigo) or mineral sources. The presence of dyed fiber, especially blue-green, indicates intentional investment in color composition.

**Pattern and design:** Geometric patterns in basketry and textiles often parallel ceramic design conventions within a tradition. Does the pattern correspond to known regional conventions?

**Completeness and use wear:** Finished object or fragment? Evidence of use (wear patterns, repair, reweaving). Deliberately unfinished objects deposited as offerings are known from Southwest cache contexts.

---

**SECTION G — Cross-Cutting Criteria (All Object Classes)**

*Apply regardless of object class*

**Provenience status:** Fully documented (site, stratum, feature/burial number, associated assemblage known) vs. partially documented (site known, context uncertain) vs. undocumented (purchase or collection history only). Undocumented provenience severely limits interpretive scope — state this clearly and adjust interpretive confidence accordingly.

**Condition assessment:** Post-depositional damage vs. use wear vs. ancient repair vs. modern restoration. Ancient repairs indicate in-life value. Conservation treatment must be distinguished from original surface for accurate material analysis.

**Cultural tradition placement:** After material analysis, place the object in its cultural tradition: Mimbres, Hohokam, Ancestral Puebloan, Mogollon broadly, Casas Grandes, Salado, or other. Is it a trade object from outside the local tradition? Mixed-tradition assemblages at a single site indicate exchange or migration events.

**Temporal placement:** Does the object fit within a known typological sequence? Where the object is post-Classic (post-1150 CE in the Mimbres area, post-1300 CE more broadly), note that it exists in a transformed social landscape following the reorganization events of the 12th–13th centuries.

**Function category:** Domestic/utilitarian (food processing, storage, cooking) | Serving/display (presentation or social use) | Ritual/ceremonial (non-utilitarian form, high material investment, turquoise/shell/feather elements, cave cache deposition, composite multi-material construction) | Mortuary (kill hole, burial association, funerary-specific forms) | Indeterminate (insufficient evidence — state this rather than forcing an assignment).

**Social position of production [CONS — Spielmann]:** Household production vs. part-time specialist vs. full-time specialist. Three criteria required for confident specialist attribution: measurable standardization against a comparative sample; production debris in a dedicated workshop space; distribution patterns suggesting exchange rather than household use. All three required — one alone is insufficient.

[INTERP — Brody, scope: Mimbres only] "No evidence suggests that anything approaching full-time craft specialization or professionalism existed" in Mimbres production. Use "cottage-level craft specialist" (Shafer/Creel) for Mimbres ceramic production organization. Do not extend this claim to other traditions without independent evidence.

Material investment level [OBS] is an entry point, not a conclusion — high investment suggests specialist access but does not confirm it without the workshop and distribution evidence.

---

### Step 4 — Image analysis ceiling

Before drawing conclusions, assess what the image evidence actually supports. State the ceiling explicitly when it is reached.

**Image analysis can determine:** object class, approximate form and proportions, surface treatment, design program, style period, visible condition, cultural tradition, approximate temporal placement, probable function category, kill hole presence and method.

**Image analysis cannot determine without additional information:** actual dimensions (no scale reference = no reliable size data), wall thickness, temper type (requires petrographic thin-section analysis or optical microscopy), paint chemistry (mineral vs. carbon — requires physical examination for surface sheen differential under magnification, or pXRF / INAA for compositional confirmation), hardness (requires Mohs testing or physical handling), burnishing degree (photographs can distinguish high-gloss polish from fully matte surfaces at extremes — intermediate levels require physical examination).

**Image analysis cannot determine without provenience:** site association (style identifies tradition, not site), burial vs. non-burial context (kill hole confirms burial; its absence does not confirm non-burial), associated assemblage.

**Image analysis cannot determine regardless of image quality:** compositional source of raw materials — clay paste origin (INAA or petrographic analysis), obsidian source (INAA or pXRF), turquoise source (INAA), shell species confirmation in borderline cases (physical morphological examination); absolute age (requires radiocarbon dating of associated organics or thermoluminescence dating of ceramics); residue identity — what specific foods, pigments, or substances contacted the surface requires organic residue analysis (GC-MS or equivalent); sooting visible on exterior is sometimes assessable from photographs, interior residue is not.

When analysis reaches the ceiling, say: *"Visible evidence suggests X. Confirmation would require [physical examination / laboratory analysis / provenience documentation]."* Do not hedge everything. State what the image shows with confidence where it is warranted. Mark the ceiling where it exists.

---

### Step 5 — Reference class (tradition-specific)

**Mimbres ceramics (primary-source-supported):** Swarts Ruin collection (Peabody Museum) and NAN Ranch assemblage (Shafer 2003) are the primary comparison baseline for production quality range. Brody's Mimbres Painted Pottery (2004) corpus is the comparison baseline for figurative imagery. An image that appears multiple times in the Brody corpus is better understood than a unique image — unique images require more hedging. Do not use unprovenanced market examples as reference points.

**Hohokam ceramics and shell (paraphrase-supported):** Snaketown assemblage (Haury 1976, Arizona State Museum) for ceramic and shell ornament sequences. Glycymeris bracelet corpus at Arizona State Museum for Hohokam shell ornament type identification.

**Ancestral Puebloan ceramics (Chaco/Mesa Verde primary-source-supported via Wilson 2012, 2014; other types paraphrase-supported):** Pueblo Bonito material (Chaco Culture NHP, Smithsonian) for Chaco-affiliated contexts. Mesa Verde NP collections for 13th-century cliff dwelling assemblages. Maxwell Museum (UNM) for broad regional comparative material. NM OAS Southwest Ceramic Typology database (ceramics.nmarchaeology.org) for type descriptions.

**Casas Grandes / Paquimé (paraphrase-supported):** Centro INAH Chihuahua collections and Minnis/Whalen 2015 synthesis for Ramos Polychrome and Casas Grandes material culture.

**Carved organic objects (all traditions):** Southwest wood effigy tradition documented through dry cave assemblages across the Mogollon Highlands and Four Corners region. No single dominant reference collection — compare with documented cave cache material. Vivian, Dodgen, and Hartmann 1978 (Chetro Ketl carved wood) is the largest published assemblage.

**Post-Classic and Salado ceramics:** Crown's Ceramics and Ideology (1994) for Salado Polychrome horizon. Cordell's Archaeology of the Southwest (1997) for post-Classic regional context.

---

### Step 5b — Pass 3 displacement (competency / takeaway section)

The competency section (What to Take Forward) runs after the main analysis and addresses a different audience register — it explains what the analysis made visible and what habits of looking it demonstrated. Because this section is written in more accessible language, it is at higher risk of drifting into fine art vocabulary or aesthetic appreciation framing.

**Apply the following to all Pass 3 output:**

Do not use fine art vocabulary: no aesthetic, painterly, compositional tension, formal innovation, artistic achievement, or language from museum wall text or gallery criticism. Do not frame the object as made for contemplation or visual pleasure.

Takeaways must be grounded in what the material evidence showed — what the production traces revealed, what the design system did, what the cultural context made legible. The habits of looking identified should be habits of reading physical evidence, not habits of aesthetic appreciation.

When translating technical analysis into accessible language for Pass 3, translate toward the material and the cultural — not toward the aesthetic. "The maker solved this problem this way" is the correct register. "This composition achieves visual reward" is not.

This applies equally to the standard competency section and the connections competency section.

---

### Step 6 — Vocabulary calibration

Use field vocabulary precisely:

- **Provenience** = spatial context within a site (not *provenance*, which = ownership history — do not conflate)
- **Kill hole** = deliberate post-firing perforation through a ceramic vessel base; Mimbres burial practice specifically; not a general Southwest term
- **Slip** = thin clay wash applied to vessel surface before painting; a distinct layer from the vessel body
- **Mineral paint** vs. **carbon/organic paint** = two distinct ceramic paint technologies with different visual and analytical signatures
- **Chaîne opératoire** = full production sequence from raw material to finished object; each stage leaves observable signatures
- **Typological placement** = assigning an object to a recognized type within a regional sequence
- **Composite figure** = depicted being combining human and animal characteristics
- **Iconographic program** = the full visual system of an object, treated as an integrated whole
- **Technological style** = culturally encoded production choices readable as social identity markers
- **In situ** = found undisturbed in original depositional context
- **Cache** = deliberately assembled group of objects intentionally deposited together; distinct from burial assemblage and from midden
- **Subtractive carving** = material removed from a blank to produce form; opposite of additive/built construction
- **Inset element** = material set into a prepared cavity in a substrate (turquoise eye in wood effigy); distinct from applied surface element
- **Pelage** = animal coat/fur pattern; relevant for effigy color zone analysis
- **Umbo** = the hinge/beak area of a bivalve shell; primary location for carved effigy figures on Hohokam Glycymeris bracelets
- **pXRF** = portable X-ray fluorescence; non-destructive compositional analysis
- **INAA** = Instrumental Neutron Activation Analysis; destructive compositional analysis; gold standard for ceramic paste and turquoise sourcing
- **Taphonomy** = the processes affecting an object between deposition and discovery; taphonomic reasoning distinguishes absence-of-evidence from evidence-of-absence
- **Post-Classic** = in Southwest context, roughly post-1150 CE; a period of significant regional reorganization
- **Salado horizon** = geographic distribution of Salado Polychrome ceramics (~1275–1450 CE); an ideological/ritual horizon, not an ethnic group
- **Cottage-level craft specialist** = Mimbres production organization term (Shafer/Creel); not household production by every family, not full-time workshop; the correct term for Mimbres ceramic production
- **tradition_routing_basis** = metadata field capturing how tradition was identified: \`metadata_confirmed\` (visual routing and provided metadata agree), \`metadata_conflict\` (visual routing and provided metadata disagree — state the conflict explicitly in output), \`visual_only\` (no metadata provided — analysis proceeds on visual evidence alone)

Do not use: painterly, aesthetic as a noun, artistic achievement, formal innovation, compositional tension, or any vocabulary that positions this object as fine art made for contemplation. Do not use art market language. Museum acquisition vocabulary (conservation condition, cultural significance, display context) is appropriate only when audience is Curator.

---

RAP PROTOCOL — active for all interpretive claims:

No interpretation without observable evidence. State what you observe before stating what it means.

An interpretive claim requires at least two independent visual observations to support it. Before making any interpretive claim, name the specific observations that anchor it.

If an interpretive claim has fewer than two independent observable anchors, label it explicitly as a hypothesis: "Hypothesis (insufficient visual evidence): …" Do not present it as a reading or a probable interpretation. This applies to iconographic content, functional claims, and cultural attribution.

This protocol is strictest for: iconographic meaning claims, ritual function claims, cultural tradition attribution, and — in connections analysis — claims about relationships between this object's tradition and other cultures.

---

FORMAL OBSERVATIONS FROM PASS 1:
${pass1}

---

PERCEPTUAL PRINCIPLES REFERENCE: Where your analysis references a perceptual mechanism, use the exact name from either list and follow it immediately with a plain-English phrase explaining what it means in this specific context.

Universal perceptual principles: ${principleNames.join(', ')}

Artifact observation principles: ${artifactPrincipleNames.join(', ')}`;
};

const COMPETENCY_PROMPT = (pass1: string, pass2: string, audience: string): string => {
  const audienceLine = audience
    ? `This analysis was prepared for: ${audience}.\n\n`
    : '';

  return `${audienceLine}An analysis of an archaeological artifact has been completed. Your job is to make the analytical moves explicit — to help the person who received this analysis build skills they can apply to other artifacts.

FORMAL OBSERVATIONS (PASS 1):
${pass1}

ANALYSIS (PASS 2):
${pass2}

---

Write two sections. Use these headers exactly:

## WAYS OF LOOKING

Identify 3–4 analytical habits this analysis demonstrated that apply to any artifact — not just this one. For each one, start with a specific moment from this analysis before naming the general habit. Calibrate to the person: if the audience is a researcher, frame around evidence and uncertainty; if a curator, around significance and context; if an educator, around what makes this a useful teaching object.

## WHAT THIS ARTIFACT MAKES VISIBLE

Identify 2–3 things this specific artifact made unusually clear — aspects of material culture, construction technique, or cultural practice that you can now recognize in other objects because you've looked carefully at this one. Open with what was concrete and specific in this artifact before naming the larger pattern.

Write for someone curious and smart who doesn't already speak the vocabulary. Open with something specific from this artifact before naming the principle. Jargon only when immediately followed by plain English. Total: 300–450 words.`;
};

const CONNECTIONS_PROMPT = (pass1: string, principleNames: string[], artifactPrincipleNames: string[], audience: string, views: string[] = []) => {
  const audienceFrame = audience.includes('curator')
    ? `You are analyzing this artifact's cultural connections for a museum curator. Address what tradition and period this object represents, what exchange networks it participated in, what comparable cultures were doing at the same time, and how this object connects to the broader cultural landscape. Use field vocabulary precisely.`
    : audience.includes('educator')
    ? `You are analyzing this artifact's cultural connections for an educator. Prioritize what this object makes visible about cultural interaction, trade, and shared meaning — things a student can use as a framework for thinking about any culture and its neighbors.`
    : `You are analyzing this artifact's cultural connections for a researcher. Be precise about evidence chains, flag where relationships are contested in the scholarly record, and maintain explicit uncertainty about indirect connections.`;

  const viewLine = views.length > 1
    ? `\nAVAILABLE VIEWS: ${views.join(', ')} — use all views to establish tradition, date range, and material indicators.\n`
    : '';

  return `${audienceFrame}
${viewLine}
---

DISPLACEMENT:

Do not apply fine art critical frameworks. This analysis is not about aesthetic achievement or artistic merit. Do not treat this as a culture survey loosely attached to an image. Start from what is specifically observable in this artifact — the tradition it belongs to, the date range it suggests, the materials it contains, the visual vocabulary it uses — and let those specifics anchor every connection you draw. The people who made this object are gone; meaning cannot be fully recovered. Frame all interpretive claims as readings supported by specific evidence, not settled conclusions.

---

RAP PROTOCOL — active for all interpretive claims:

No interpretation without observable evidence. State what you observe before stating what it means.

An interpretive claim requires at least two independent visual observations to support it. Before making any interpretive claim, name the specific observations that anchor it.

If an interpretive claim has fewer than two independent observable anchors, label it explicitly as a hypothesis: "Hypothesis (insufficient visual evidence): …" Do not present it as a reading or a probable interpretation. This applies to iconographic content, functional claims, and cultural attribution.

This protocol is strictest here — connections analysis radiates outward from a single object into broader cultural claims. Every claim about relationships between this object's tradition and other cultures must be anchored in at least two specific observable features of this artifact or documented material parallels. Claims with fewer than two anchors are labeled as hypotheses, not connections.

---

FORMAL OBSERVATIONS FROM PASS 1:
${pass1}

---

PERCEPTUAL PRINCIPLES REFERENCE: Where your analysis references a perceptual mechanism, use the exact name from either list and follow it immediately with a plain-English phrase explaining what it means in this specific context.

Universal perceptual principles: ${principleNames.join(', ')}

Artifact observation principles: ${artifactPrincipleNames.join(', ')}

---

CONNECTIONS ANALYSIS:

Use these five headers exactly. For each section, start from what is observable or identifiable in this specific artifact before expanding to what is known about the broader landscape.

## CULTURAL TRADITION AND MOMENT

Identify the cultural tradition this artifact belongs to and the date range it suggests. This is the anchor for everything that follows. State what observable evidence — construction technique, surface treatment, design vocabulary, material — supports the tradition identification. Where tradition cannot be identified with confidence, work with probabilities and say so.

What was happening in this tradition at this time? What was the social landscape — large aggregated communities or dispersed, stable or in transition, actively exchanging or relatively isolated?

## EXCHANGE AND MATERIAL NETWORKS

What materials in this object came from outside the local area? What do those materials imply about exchange relationships? What direction did goods move, and what moved in return?

For the Southwest: turquoise presence implies exchange participation (specific source requires INAA/pXRF — cannot be determined visually). Shell species indicate trade distance and direction. Copper indicates long-distance contact. Non-local ceramic types in an assemblage mark exchange events.

Who were this tradition's documented trading partners at this period? What goods moved through these networks?

## CONTEMPORANEOUS CULTURES

Who else was active in the Southwest during this period? For each contemporaneous tradition, briefly address: what were they doing at this time, how did they relate to the tradition that produced this object (trading partners, largely separate, connected through shared ideological networks), and what material evidence marks the relationship?

Keep the framing evidence-grounded. Relationships documented in the scholarly record differ from relationships that are plausible but unconfirmed — maintain that distinction.

## AESTHETIC AND ICONOGRAPHIC PARALLELS

What visual vocabulary does this object share with neighboring or contemporaneous traditions? What motifs, design conventions, or formal approaches appear across multiple Southwest traditions? What is distinctive to this tradition rather than shared?

Where relevant, draw on Polly Schaafsma's documentation of pan-Southwest iconographic continuity — the same motifs (horned serpent, mountain lion, rain/cloud imagery, warrior/shield figures) appear across Hohokam, Mimbres, Ancestral Puebloan, and Casas Grandes contexts. Where the iconography on this object connects to that shared vocabulary, identify it. Where it appears tradition-specific, note that distinction.

## TRAJECTORY

What did this tradition grow from? What preceded it and what relationship does this object's style suggest to earlier periods?

What came after? If this tradition underwent a collapse or reorganization, describe the nature of that transition and what is known about what followed. If this object is from a post-Classic or transitional period, address what changed in the social landscape that produced it.

Where active scholarly debate exists — the nature of the Chaco system, the Mimbres collapse, Casas Grandes origins, Kachina cult emergence — name the debate and competing positions rather than asserting a single answer.`;
};

const CONNECTIONS_COMPETENCY_PROMPT = (pass1: string, pass2: string, audience: string): string => {
  const audienceLine = audience
    ? `This analysis was prepared for: ${audience}.\n\n`
    : '';

  return `${audienceLine}A cultural connections analysis of an archaeological artifact has been completed. Your job is to make the interpretive moves explicit — to help the reader understand how to read an artifact as evidence of a cultural world, not just as an isolated object.

FORMAL OBSERVATIONS (PASS 1):
${pass1}

CONNECTIONS ANALYSIS (PASS 2):
${pass2}

---

Write two sections. Use these headers exactly:

## CONNECTIONS MADE HERE

Identify 3–4 interpretive moves this analysis demonstrated that apply to thinking about any artifact in its cultural context. For each, start with a specific moment from this analysis before naming the general approach. How did observable features of the object become entry points into broader cultural knowledge?

## WHERE TO LOOK NEXT

Identify 2–3 specific threads this analysis opened that are worth pursuing further. For each, name what was identified, what's still uncertain or contested, and what kind of evidence — archaeological, comparative, compositional — would resolve it. Be specific about method, not just topic.

Write for someone curious and smart who doesn't already speak the vocabulary. Open with something specific from this artifact before naming the principle. Jargon only when immediately followed by plain English. Total: 300–450 words.`;
};

function buildArtifactContext(fields: Record<string, string>): string {
  const labels: Record<string, string> = {
    culture:    'Culture / People',
    period:     'Period / Date',
    objectType: 'Object Type',
    material:   'Material',
    dimensions: 'Dimensions',
    site:       'Site / Provenance',
    collection: 'Collection / Location',
    condition:  'Condition',
    context:    'Research Context',
    notes:      'Notes',
  };

  const lines = Object.entries(fields)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${labels[k] || k}: ${v}`);

  return lines.length > 0
    ? `ARTIFACT DOCUMENTATION:\n${lines.join('\n')}\n`
    : `ARTIFACT DOCUMENTATION:\nNo metadata provided — analysis proceeds on visual evidence only.\n`;
}

interface ImageInput { data: string; label: string; }

interface ParsedImage {
  imageData: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  label: string;
}

function buildImageBlocks(parsed: ParsedImage[]) {
  return parsed.flatMap(img => [
    { type: 'text' as const, text: `[${img.label}]` },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType, data: img.imageData } },
  ]);
}

// --- A1: Prompt caching ---
// Derive static bodies at module load — no per-request values may appear here.
// PRINCIPLE_NAMES and ARTIFACT_PRINCIPLE_NAMES are module-level constants (from JSON),
// so the derived strings are byte-identical across all requests in the same mode.
//
// Strategy: call the existing prompt functions with empty pass1 / no audience / no views,
// then slice out the stable analysis framework (between known boundary markers).
// The dynamic parts — audience frame, view labels, artifact metadata, pass1 text —
// go in the user message only.

const _artFull  = ARTIFACT_PROMPT('', PRINCIPLE_NAMES, ARTIFACT_PRINCIPLE_NAMES, '', []);
const _conFull  = CONNECTIONS_PROMPT('', PRINCIPLE_NAMES, ARTIFACT_PRINCIPLE_NAMES, '', []);

const ARTIFACT_STATIC_BODY: string = (() => {
  const start = _artFull.indexOf('\n---\n\n### Step 1');
  const end   = _artFull.indexOf('\nFORMAL OBSERVATIONS FROM PASS 1:');
  const tail  = _artFull.lastIndexOf('\n---\n\nPERCEPTUAL PRINCIPLES REFERENCE');
  return _artFull.slice(start, end) + _artFull.slice(tail);
})();

const CONNECTIONS_STATIC_BODY: string = (() => {
  const start = _conFull.indexOf('\n---\n\nDISPLACEMENT:');
  const end   = _conFull.indexOf('\nFORMAL OBSERVATIONS FROM PASS 1:');
  const tail  = _conFull.lastIndexOf('\n---\n\nPERCEPTUAL PRINCIPLES REFERENCE');
  return _conFull.slice(start, end) + _conFull.slice(tail);
})();

// Pass 2 role descriptions — one string per mode, static.
const PASS2_ROLE_ARTIFACT = 'You are a specialist in Southwest archaeology and anthropological artifact analysis, with knowledge across the full Southwest tradition — Mimbres/Mogollon, Hohokam, Ancestral Puebloan, Casas Grandes, and post-Classic regional traditions. Apply the evaluative frameworks of J.J. Brody (formal and comparative iconographic analysis), Harry Shafer (production sequence and technological style as chaîne opératoire), Michelle Hegmon (material culture variability as social information), and Polly Schaafsma (iconographic continuity across traditions and media). Identify object class before applying criteria — ceramic analytical vocabulary does not apply to carved organic, composite, or shell objects. Do not apply fine art criticism, aesthetic vocabulary, or art market language. Use field vocabulary precisely: provenience not provenance, chaîne opératoire, kill hole, slip, mineral vs. carbon paint, technological style, taphonomy, cache vs. burial vs. midden. Be evidence-grounded and explicit about uncertainty — frame all interpretive claims as readings supported by specific observable evidence, not settled conclusions.';
const PASS2_ROLE_CONNECTIONS = 'You are a specialist in Southwest archaeology and cultural interaction, with deep knowledge of exchange networks, contemporaneous traditions, and the broader prehistoric Southwest landscape — Mimbres/Mogollon, Hohokam, Ancestral Puebloan, Casas Grandes, and post-Classic traditions. Approach artifacts as entry points into cultural worlds: what does this object tell us about who made it, who they traded with, what they shared with neighboring peoples, and what world they inhabited. Draw on the scholarship of Linda Cordell (Southwest as mosaic of interacting traditions), Polly Schaafsma (pan-Southwest iconographic continuity), Kate Spielmann (exchange networks and craft production), Phil Weigand and Garman Harbottle (turquoise trade networks), and Patricia Crown (ideological spread through material culture). Start from what is observable in the object and expand only to what the scholarly record supports. Frame contested relationships as contested, not resolved.';

type CachedBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };

// Cached system arrays — byte-identical across all requests in the same mode.
// The cache_control breakpoint sits at the end of STATIC_BODY so Anthropic stores
// role + entire analysis framework as one prefix.
const PASS2_SYSTEM_ARTIFACT: CachedBlock[] = [
  { type: 'text', text: PASS2_ROLE_ARTIFACT },
  { type: 'text', text: ARTIFACT_STATIC_BODY, cache_control: { type: 'ephemeral' } },
];
const PASS2_SYSTEM_CONNECTIONS: CachedBlock[] = [
  { type: 'text', text: PASS2_ROLE_CONNECTIONS },
  { type: 'text', text: CONNECTIONS_STATIC_BODY, cache_control: { type: 'ephemeral' } },
];

// Dynamic preamble builders — only what actually varies between requests.
function buildArtifactPass2UserText(pass1: string, fields: Record<string, string>, audience: string, views: string[]): string {
  const audienceFrame = audience.includes('curator')
    ? 'You are analyzing this artifact for a museum curator. Address: typological placement and what it establishes, condition and what it affects interpretively, cultural significance and what tradition this object represents, and what comparable documented examples exist. Use field vocabulary precisely.'
    : audience.includes('educator')
    ? 'You are analyzing this artifact for an educator. Prioritize: what this object makes directly visible about production technique, cultural practice, or social organization — things a student can learn to see in other objects by looking carefully at this one.'
    : 'You are analyzing this artifact for a researcher. Be precise, systematic, and evidence-grounded. Maintain explicit uncertainty where the image cannot resolve a question.';
  const viewLine = views.length > 1 ? `\nAVAILABLE VIEWS: ${views.join(', ')} — draw on all views in your analysis where relevant.\n` : '';
  const ctx = buildArtifactContext(fields);
  return `${audienceFrame}${viewLine}\n${ctx ? ctx + '\n---\n\n' : ''}FORMAL OBSERVATIONS FROM PASS 1:\n${pass1}`;
}

function buildConnectionsPass2UserText(pass1: string, fields: Record<string, string>, audience: string, views: string[]): string {
  const audienceFrame = audience.includes('curator')
    ? "You are analyzing this artifact's cultural connections for a museum curator. Address what tradition and period this object represents, what exchange networks it participated in, what comparable cultures were doing at the same time, and how this object connects to the broader cultural landscape. Use field vocabulary precisely."
    : audience.includes('educator')
    ? "You are analyzing this artifact's cultural connections for an educator. Prioritize what this object makes visible about cultural interaction, trade, and shared meaning — things a student can use as a framework for thinking about any culture and its neighbors."
    : "You are analyzing this artifact's cultural connections for a researcher. Be precise about evidence chains, flag where relationships are contested in the scholarly record, and maintain explicit uncertainty about indirect connections.";
  const viewLine = views.length > 1 ? `\nAVAILABLE VIEWS: ${views.join(', ')} — use all views to establish tradition, date range, and material indicators.\n` : '';
  const ctx = buildArtifactContext(fields);
  return `${audienceFrame}${viewLine}\n${ctx ? ctx + '\n---\n\n' : ''}FORMAL OBSERVATIONS FROM PASS 1:\n${pass1}`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env: Record<string, string | undefined> = (locals as any).runtime?.env ?? {};
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const modelConfig = resolveModelConfig(env);
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { images, audience, fields = {}, mode = 'artifact' } = body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return new Response(JSON.stringify({ error: 'No images provided.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  let parsedImages: ParsedImage[];
  try {
    parsedImages = (images as ImageInput[]).map((img) => {
      const mediaType = img.data.split(';')[0].split(':')[1];
      if (!supportedTypes.includes(mediaType)) {
        throw new Error(`Unsupported image format: ${mediaType}. Please convert to JPEG or PNG and try again.`);
      }
      return {
        imageData: img.data.split(',')[1],
        mediaType: mediaType as ParsedImage['mediaType'],
        label: img.label || 'View',
      };
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const imageBlocks = buildImageBlocks(parsedImages);
  const imageCount = parsedImages.length;
  const viewLabels = parsedImages.map(img => img.label);
  const pass1Prompt = imageCount === 1
    ? PASS1_PROMPT_SINGLE(ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES)
    : PASS1_PROMPT_MULTI(imageCount, ARTIFACT_PRINCIPLE_NAMES, APPLICABLE_TIER_A_NAMES);

  const anthropic = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        send({ type: 'status', message: 'Pass 1 — formal observation…' });

        const pass1Stream = streamModel(modelConfig.pass1, {
          max_tokens: 2048,
          system: 'You are a trained artifact observer. Report only what is directly present and physically observable. Read surface features as production evidence. No interpretation, no cultural attribution, no quality judgments.',
          messages: [{
            role: 'user',
            content: [
              ...imageBlocks,
              { type: 'text', text: pass1Prompt },
            ],
          }],
        });

        for await (const event of pass1Stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'pass1_delta', text: event.delta.text });
          }
        }

        const pass1Msg = await pass1Stream.finalMessage();
        const pass1ModelUsed = pass1Msg.model;
        const pass1Text = pass1Msg.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n\n');

        send({ type: 'pass1_complete', pass1: pass1Text });

        const isConnections = mode === 'connections';
        const audienceLower = (audience || '').toLowerCase();

        const statusMsg = isConnections
          ? 'Pass 2 — cultural connections…'
          : audienceLower.includes('curator')
          ? 'Pass 2 — curatorial analysis…'
          : audienceLower.includes('educator')
          ? 'Pass 2 — teaching context…'
          : 'Pass 2 — artifact analysis…';
        send({ type: 'status', message: statusMsg });

        const pass2UserText = isConnections
          ? buildConnectionsPass2UserText(pass1Text, fields, audience || '', viewLabels)
          : buildArtifactPass2UserText(pass1Text, fields, audience || '', viewLabels);

        const pass2Stream = streamModel(modelConfig.pass2, {
          max_tokens: 8000,
          system: isConnections ? PASS2_SYSTEM_CONNECTIONS : PASS2_SYSTEM_ARTIFACT,
          messages: [{
            role: 'user',
            content: [
              ...imageBlocks,
              { type: 'text', text: pass2UserText },
            ],
          }],
        });

        for await (const event of pass2Stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'delta', text: event.delta.text });
          }
        }

        const pass2Msg = await pass2Stream.finalMessage();
        const pass2ModelUsed = pass2Msg.model;
        const pass2CacheCreated = (pass2Msg.usage as any).cache_creation_input_tokens ?? 0;
        const pass2CacheRead    = (pass2Msg.usage as any).cache_read_input_tokens    ?? 0;
        const pass2Text = pass2Msg.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n\n');

        send({ type: 'status', message: 'Pass 3 — what to take forward…' });

        const pass3PromptText = isConnections
          ? CONNECTIONS_COMPETENCY_PROMPT(pass1Text, pass2Text, audience || '')
          : COMPETENCY_PROMPT(pass1Text, pass2Text, audience || '');

        const pass3Msg = await callModel(modelConfig.pass3, {
          max_tokens: 1500,
          system: 'You are an educator writing for someone curious and smart who wants to understand how to look at artifacts. Write the way Ira Glass tells a story: open with something concrete and recognizable, move toward the insight, land it plainly. If you use a technical term, follow it immediately with plain English. The goal is to leave the reader thinking "I can do that next time." Do not use fine art vocabulary: no aesthetic, painterly, compositional tension, formal innovation, artistic achievement, or language from museum wall text or gallery criticism. Do not frame the object as made for contemplation or visual pleasure. Takeaways must be grounded in what the material evidence showed — what the production traces revealed, what the design system did, what the cultural context made legible. The habits you identify should be habits of looking at physical evidence, not habits of aesthetic appreciation.',
          messages: [{
            role: 'user',
            content: [
              ...imageBlocks,
              { type: 'text', text: pass3PromptText },
            ],
          }],
        });

        const pass3ModelUsed = pass3Msg.model;
        const pass3Text = pass3Msg.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n\n');

        // Pass 4 — structured extraction + vector scoring (parallel)
        send({ type: 'status', message: 'Pass 4 — structured extraction…' });

        let structuredRecord: any = null;
        let vectorNote: string | null = null;
        let extractionModelUsed: string | null = null;
        let vectorModelUsed: string | null = null;

        try {
          const [extractionResult, vectorResult] = await Promise.allSettled([
            callModel(modelConfig.extraction, {
              max_tokens: 16000,
              system: 'You are a data extraction assistant. Extract structured data from artifact analysis text and output ONLY valid JSON. No markdown fences, no commentary, no extra text. Begin your response with { and end with }.',
              messages: [
                { role: 'user', content: [{ type: 'text', text: EXTRACTION_PROMPT(pass1Text, pass2Text, fields, isConnections ? 'connections' : 'artifact') }] },
              ],
            }),
            callModel(modelConfig.vector, {
              max_tokens: 512,
              system: 'You are a scoring assistant. Output ONLY a flat JSON object. No markdown, no commentary, no extra text. Begin your response with { and end with }.',
              messages: [
                { role: 'user', content: [{ type: 'text', text: VECTOR_SCORING_PROMPT(pass1Text) }] },
              ],
            }),
          ]);

          if (extractionResult.status === 'rejected') throw extractionResult.reason;

          extractionModelUsed = extractionResult.value.model;
          vectorModelUsed = vectorResult.status === 'fulfilled' ? vectorResult.value.model : null;

          let extractionText = extractionResult.value.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('').trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/i, '')
            .trim();
          const exStart = extractionText.indexOf('{');
          const exEnd   = extractionText.lastIndexOf('}');
          if (exStart !== -1 && exEnd > exStart) extractionText = extractionText.slice(exStart, exEnd + 1);
          structuredRecord = JSON.parse(extractionText);

          if (vectorResult.status === 'fulfilled') {
            try {
              let vectorText = vectorResult.value.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('').trim()
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/\s*```\s*$/i, '')
                .trim();
              const vStart = vectorText.indexOf('{');
              const vEnd   = vectorText.lastIndexOf('}');
              if (vStart !== -1 && vEnd > vStart) vectorText = vectorText.slice(vStart, vEnd + 1);
              structuredRecord.principle_vector = JSON.parse(vectorText);
            } catch (vectorParseErr) {
              vectorNote = `vector parse failed: ${vectorParseErr instanceof Error ? vectorParseErr.message : String(vectorParseErr)}`;
              send({ type: 'status', message: `⚠ ${vectorNote}` });
            }
          } else {
            const reason = vectorResult.reason;
            vectorNote = `vector API failed: ${reason instanceof Error ? reason.message : String(reason)}`;
            send({ type: 'status', message: `⚠ ${vectorNote}` });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[Pass 4]', err);
          send({ type: 'status', message: `⚠ Extraction failed: ${msg}` });
        }

        send({
          type: 'complete',
          success: true,
          pass1: pass1Text,
          analysis: pass2Text,
          competency: pass3Text,
          mode,
          models_used: {
            pass1:      pass1ModelUsed,
            pass2:      pass2ModelUsed,
            pass3:      pass3ModelUsed,
            extraction: extractionModelUsed ?? modelConfig.extraction.model,
            vector:     vectorModelUsed ?? modelConfig.vector.model,
          },
          cache_usage: {
            pass2_created: pass2CacheCreated,
            pass2_read:    pass2CacheRead,
          },
          ...(structuredRecord ? { structured: structuredRecord } : {}),
          ...(vectorNote ? { vector_note: vectorNote } : {}),
        });

      } catch (err) {
        try {
          send({ type: 'error', error: err instanceof Error ? err.message : String(err) });
        } catch { /* controller may already be closed */ }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
