// "The Look" — Phase 1 content
// Keep EXPERIENCE_NAME here so a rename is one edit.
export const EXPERIENCE_NAME = "The Look";

export type EpistemicTier = "obs" | "interp" | "cons" | "theory";

// Visitor-facing label strings — tune here, nowhere else.
export const TIER_LABELS: Record<EpistemicTier, string> = {
  obs:    "You can see this yourself",
  interp: "We're reading into it",
  cons:   "Most experts agree",
  theory: "This is a guess people argue about",
};

// Color tokens map (mirrors tokens.css — read-only usage)
export const TIER_CLASSES: Record<EpistemicTier, string> = {
  obs:    "tier-obs",
  interp: "tier-interp",
  cons:   "tier-cons",
  theory: "tier-theory",
};

export interface Region {
  // Percentage of rendered image dimensions. TODO: measure on actual image.
  top: string;
  left: string;
  width: string;
  height: string;
}

export interface BowlCard {
  id: string;
  tier: EpistemicTier;           // highest tier on the card
  invite: string;
  reveal: string;
  why: string;
  // Which bowl image to show. "interior" default; revealImage overrides on reveal.
  image: "interior" | "exterior";
  revealImage?: "interior" | "exterior";
  region: Region;                // where to spotlight on reveal
  revealRegion?: Region;         // if revealImage differs, where to spotlight on it
}

export interface PitcherReveal {
  id: string;
  label: string;
  text: string;
  region: Region;
}

// ─── Bowl cards ────────────────────────────────────────────────────────────
// Region coordinates are approximate. TODO: measure on actual images before ship.
// Interior image: 640×529. Bowl occupies roughly left 65% of frame.
// Exterior image: 640×431.

export const BOWL_CARDS: BowlCard[] = [
  {
    id: "figure-ground",
    tier: "obs",
    image: "interior",
    invite: "Look at the black shapes. Now look at the pale shapes in between them. Which ones are the design — the black, or the white?",
    reveal: "Both. The potter painted the black, and shaped the white at the same time — the empty spaces are drawn just as carefully as the painted ones. Once you see the white as shapes, you can't unsee it.",
    why: "Doing that freehand, on the inside of a curved bowl, is hard. Most people can't pull it off on flat paper.",
    // TODO: tighten to just the center design zone
    region: { top: "8%", left: "8%", width: "52%", height: "60%" },
  },
  {
    id: "cracks",
    tier: "obs",
    image: "interior",
    invite: "Run your eye across the surface. See the thin lines that don't belong to the painting? Pick one and trace it.",
    reveal: "Those are cracks. This bowl was broken — and somebody put it back together. Maybe a thousand years ago, maybe in a museum lab last century. We can't tell just by looking, and that's worth sitting with. What we can say for sure: this thing got dropped, or buried, or crushed, and somebody cared enough to save it.",
    why: "A pot doesn't last a thousand years by being left alone. It lasts because people keep choosing to keep it.",
    // TODO: highlight the main crack line running across the upper-left quadrant
    region: { top: "4%", left: "4%", width: "60%", height: "70%" },
  },
  {
    id: "spinning",
    tier: "interp",
    image: "interior",
    invite: "Let your eyes relax and follow the big shapes. Do they sit still — or do they go somewhere?",
    reveal: "They spin. The shapes are set at angles so nothing sits flat or square, and your eye gets pulled around the center like a pinwheel. The bowl turns while you look at it, even though it's holding perfectly still.",
    why: "That motion is a choice. A bowl is round, so the potter built a design that uses the roundness instead of fighting it.",
    // TODO: region should trace the large diagonal sweep from upper-right to lower-left
    region: { top: "4%", left: "4%", width: "60%", height: "70%" },
  },
  {
    id: "one-color",
    tier: "obs",
    image: "interior",
    revealImage: "exterior",
    invite: "How many colors of paint do you count? Then a second question — flip to the outside of the bowl. What's out there?",
    reveal: "One color. One dark paint and the bare clay — that's the whole palette. And the outside is almost blank. They put everything on the inside, the part you see when there's food in it, or when someone holds it up to you.",
    why: "One color forces every decision onto shape and spacing. Nowhere to hide a weak line.",
    // Interior: full design
    region: { top: "4%", left: "4%", width: "60%", height: "70%" },
    // Exterior: the bare lower body — mostly undecorated
    // TODO: highlight the blank lower body of the exterior
    revealRegion: { top: "20%", left: "4%", width: "62%", height: "55%" },
  },
  {
    id: "hand",
    tier: "interp",
    image: "interior",
    invite: "Find the spot where thin lines fill a shape like stripes. Look close at those lines. Are they perfectly even?",
    reveal: "No — and that's the tell. Those stripes got brushed on one at a time, probably with a chewed yucca leaf for a brush. The spacing wavers a little. A line drifts. A person painted this freehand, no ruler, no pencil underneath, no way to undo a mistake.",
    why: "Every wobble is a decision that couldn't be taken back. That's the nerve it took to make this.",
    // TODO: zoom to the upper-left triangular element with cross-hatched fill
    region: { top: "4%", left: "4%", width: "30%", height: "34%", },
  },
  {
    id: "meaning",
    tier: "theory",
    image: "interior",
    invite: "Last one. You've found how it was made and how it moves. Now the hard question — what does the design mean?",
    reveal: "We don't really know. It's tempting to say the shapes stand for water, or mountains, or clouds. Maybe they do. But that's us guessing, with our eyes, a thousand years late. The people who made it didn't leave a key — and a guess dressed up as a fact is how bad history gets written. Seeing clearly means knowing where the seeing stops.",
    why: "That line — between what you can see and what you're guessing — is the whole game. You just walked it.",
    // Pull back to full design
    region: { top: "4%", left: "4%", width: "60%", height: "70%" },
  },
];

// ─── Pitcher reveals ────────────────────────────────────────────────────────
// Image: https://images.metmuseum.org/CRDImages/ao/original/DP-24281-002.jpg
// Credit: "Pitcher. The Metropolitan Museum of Art. Public domain."
// TODO: measure regions on actual image after verifying URL resolves.

export const PITCHER_IMAGE_URL = "https://images.metmuseum.org/CRDImages/ao/original/DP-24281-002.jpg";
export const PITCHER_CREDIT = "Pitcher. The Metropolitan Museum of Art. Public domain.";

export const PITCHER_REVEALS: PitcherReveal[] = [
  {
    id: "spirals",
    label: "Movement — the spirals",
    text: "See the two big spirals? They wind your eye inward and set the whole pot turning — same trick the bowl pulled, a different way. You already know how to spot this.",
    // TODO: tighten to the two spiral forms on the body
    region: { top: "28%", left: "18%", width: "62%", height: "45%", },
  },
  {
    id: "rim",
    label: "It got hurt — the rim",
    text: "Look at the top edge. Pieces are missing — the rim's been chipped and broken. Like the bowl, this thing has been through something and survived it.",
    // TODO: highlight chipped/broken rim edge
    region: { top: "0%", left: "15%", width: "65%", height: "22%", },
  },
  {
    id: "line-fill",
    label: "The hand — the line-fill",
    text: "Look inside the dark shapes — they're filled with thin lines, brushed by hand, one after another. Get close and the spacing wanders. A person did this, freehand, the same way they painted the bowl.",
    // TODO: zoom to a dark shape with visible hand-painted line fill
    region: { top: "30%", left: "22%", width: "50%", height: "38%", },
  },
  {
    id: "sawtooth",
    label: "One color, figure and ground — the sawtooth",
    text: "One paint again, on bare clay. And look at the white zigzag between the dark shapes — the empty space is a shape too. You caught that on the bowl. Here it is again.",
    // TODO: highlight the white sawtooth/zigzag band
    region: { top: "42%", left: "8%", width: "82%", height: "28%", },
  },
  {
    id: "meaning",
    label: "The honest one — the meaning",
    text: "So what do the spirals mean? Same honest answer as before: we don't know. People love to say a spiral is water, or wind, or a journey. Maybe. But the potter didn't leave a note, and a good guess isn't a fact. You knowing the difference — that's the part that matters.",
    // Full pot
    region: { top: "4%", left: "8%", width: "82%", height: "88%", },
  },
];

// ─── Stage copy ─────────────────────────────────────────────────────────────

export const STAGE_0_TEXT = "This is a bowl somebody made about a thousand years ago. We'll get to all that. First — look at it. Don't read anything yet. Ten seconds. Notice whatever you notice.";
export const STAGE_0_BUTTON = "Okay, I looked.";

export const STAGE_FINAL_INTRO = "Your turn. Here's another pot — a pitcher this time, with a neck and a handle. Nobody's going to point. Look at it for a while. Find one thing. How it was made, how it moves, where it got hurt — anything.";
export const STAGE_FINAL_BUTTON = "Show me what I might have missed.";
export const STAGE_FINAL_CLOSE = "Same five moves. A different pot. That's not luck — it's a method, and it's yours now. You walked in able to see an old jar. You're walking out able to read one.";
