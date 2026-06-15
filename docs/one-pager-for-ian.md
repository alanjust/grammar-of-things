# The Grammar of Things — one-pager for Ian

**Purpose:** leave-behind / talking script for the Monday conversation with Ian Ingram (recent SOU CS grad). Audience of one. Goal: get him to (a) understand the instrument, (b) want in as a technical collaborator and scout, and (c) point me toward the right SOU faculty member.

**How to use this file:** each numbered block is one panel. The body text is the actual copy — written in my voice, first person. The *[show:]* line tells the builder what to render. Feed the whole thing to the HTML presentation builder.

**Tone:** plain, direct, no jargon I wouldn't say out loud. Short sentences. This is a conversation, not a brochure.

---

## Panel 1 — What it is

**Headline:** A forensic reading tool for archaeological objects.

**Body:**
I built a tool that looks at an object — a pot, a sherd, a piece — and reads what the object itself shows, separate from whatever the catalog says it is. It's working software, not a mockup. You can upload an object right now and it gives you back a structured read.

The first object I ran it on all the way through is a Mimbres Black-on-white bowl from the Smithsonian, collected in 1923.

*[show: the bowl interior image, bowl-interior.jpg. Clean, large, one object. Caption: "Bowl A326247 · Mimbres Valley, NM · collected 1923 · NMNH Smithsonian."]*

---

## Panel 2 — The one idea that matters

**Headline:** Separate the evidence from the claim.

**Body:**
Here's the whole thing in one move. The tool scores the object from the image alone — with the museum's attribution physically walled out of what it can see. Only after that does it compare its blind read against what the paperwork claims.

When the two line up, fine. When they diverge, that's a real flag — because the read was produced in deliberate ignorance of the claim. It can't be circular.

That's not a trick I added on top. It's the core discipline of a forensic lab — you don't let the analyst see the detective's theory before they examine the evidence, or you've poisoned the result. I built that rule into the software.

*[show: a simple two-column diagram. LEFT: "The object" → arrow → "Blind fingerprint (image only)". RIGHT: "The catalog claim" in a boxed/quarantined area. A "compare" step at the bottom where the two meet. Make the wall between them visually obvious.]*

---

## Panel 3 — What it actually does today

**Headline:** This part already works.

**Body:**
Not a plan. Running code. Right now the tool:

- Reads an object blind and scores it on 27 perceptual principles, stored as a vector — so objects can be compared to each other later.
- Quarantines the catalog record in three layers so the institutional claim never contaminates the read.
- Labels every statement it makes by how much it can actually back up — direct observation, interpretation, consensus, theory — and anchors claims to the real scholarship (Brody, Shafer, Hegmon, Schaafsma).
- Catalogs cheaply at upload, so a corpus of fingerprints can accrue without running expensive deep analysis on everything.
- Reads the documentation critically on a second axis — flags structural gaps in the provenance record (no institutional anchor, no excavation context, private collection terminus, acquisition chain anomalies, and others). That's not the fingerprint. That's the paperwork failing its own test.
- Cross-references the documentation claims against the blind observations and surfaces explicit contradictions — when what the catalog says about construction or condition doesn't match what the object shows.

*[show: the fingerprint sample as horizontal bars — 6 of 27 principles, all scored. Reuse the labels: Production Trace Reading, Symmetry as Evidence, Color Zone Logic, Edge Detection, Figure-Ground, Closure/Negative Space. Footnote: "+ 21 more · full fingerprint stored as a vector."]*

---

## Panel 4 — What it's shown so far (honest version)

**Headline:** It can see straight. That's step one — not the finish line.

**Body:**
On the Mimbres bowl, the tool read the object blind and landed exactly where the experts land: Classic Mimbres Black-on-white, for the right reasons — slip and pigment program, the geometric structure, the construction method.

That matters, but I want to be straight about what it proves. It proves the instrument reads correctly on an authenticated piece.

I've also run it on a known commercial replica — an object sold as decorative with no provenance at all. The tool fired on eight independent axes: no institutional anchor, no excavation record, no catalog identifier, private collection terminus, acquisition chain anomaly, and a direct contradiction between the claimed construction method and what the blind pass observed. It didn't know it was a replica. It just read what was there.

That's the mechanism working. The real validation — running it against objects whose attribution is genuinely disputed, with a domain expert to judge whether the flags hold up — is still ahead. That's the study.

*[show: a short before/after or "blind read → matches claim" confirmation graphic. Keep it understated — this panel is about honesty, not victory.]*

---

## Panel 5 — The actual open problem

**Headline:** Here's the part nobody's solved yet.

**Body:**
The real test is a validation study: feed the instrument objects where the blind fingerprint diverges from the documented attribution, and find out whether those flags are credible — whether the tool catches genuine misattributions, or just makes noise.

That's a real research question. It needs a corpus, a way to measure the fingerprint against the claim across many objects, and a domain expert to judge whether a flag holds up. I've got the domain expert — my partner is the deputy director of the federal forensic lab in Ashland, and his graduate work was on Mimbres. What the project needs next is the technical build to run the comparison at scale, and the academic standing to make it count.

*[show: a simple "what's built / what's next" split. Built: instrument, blind fingerprint, catalog, provenance and contradiction detection, reference corpus infrastructure. Next: populate the reference corpus with authenticated objects, z-score comparison layer, the validation study. Label honestly.]*

---

## Panel 6 — Where you come in

**Headline:** Two things I need, and you might be both doors.

**Body:**
There's a real funding path — Schmidt Sciences runs an AI-and-humanities grant, up to $800K, and the next round is likely around March 2027. It requires co-leads from both the humanities and computer science. I've got the humanities and the domain covered. The computer-science side is the open seat.

So two questions for you, Ian:

First — does this problem interest you enough to build on it? The validation engine is a genuinely unsolved, fundable piece of work, not grunt labor.

Second — who at SOU should I be talking to? I need a CS or data-science faculty member who'd want to put their name on a study like this. You know that department. An intro from you is worth more than a cold email from me.

No money on the table today. A real instrument, a real problem, and a credible path. That's the honest offer.

*[show: minimal closing. The two questions, large. Contact line. The domain: thegrammarofthings.com.]*

---

## Speaking notes (not a panel — for me)

- Lead with the object, not the tech. Let him look at the bowl before I explain anything.
- The forensic line ("don't let the analyst see the detective's theory") is the hook. Watch whether it lands. If it does, he gets it.
- Don't oversell the grant. The instrument and the open problem are the real draw. The grant is just proof this isn't a hobby.
- Ask him the two questions directly and then shut up. Let him answer.
- If he's in: next step is him naming a faculty member, and me getting the validation case ready with the deputy director.
