# Text2Shape — Demo Video + Q&A Script

Tuned to the OHIO judging rubric (6 criteria, 5 pts each = 30 pts). The rubric
rewards **process and thinking**, not just a working app, so the script says the
quiet parts out loud: research, cross-domain work, and pivots.

---

## Before you record

1. Start Ollama: `ollama run qwen3.5:4b`
2. Launch the app: `.\demo.ps1`
3. **Warm up** Ollama with one throwaway prompt (first response is slow).
4. Record at 1080p. Do a silent screen-capture pass, then narrate over it.
5. Use explicit coordinates in prompts so geometry lands cleanly on camera.

---

## 3-minute video script

**[0:00–0:25] Hook + problem (Innovation, Impact)**
> "Professional CAD like SolidWorks or Fusion 360 is powerful but takes months
> to learn. That locks out makers, students, and early hardware founders.
> Text2Shape lets anyone design a *real, manufacturable* part just by chatting."

**[0:25–0:50] What it is + the differentiator (Innovation, Curiosity)**
> "We looked at existing text-to-CAD tools. Most just generate a mesh, or worse,
> run AI-generated code directly. We asked: can an AI drive a real CAD kernel
> *without* ever executing its code? Our answer — the model returns a
> constrained, validated plan, and our backend builds genuine parametric
> geometry with build123d."

**[0:50–2:10] Live prototype walkthrough (Communication — the core)**
Screen-record this flow while narrating:
1. Type: `Create a 100 x 60 mm baseplate with 6 mm corner holes` → model appears in 3D.
2. Type: `Add a 20 mm box on top` → box appears.
3. Type: `Add a 6 mm hole at x 0 y 0` → centered hole (use explicit coords!).
4. Switch **material** (steel → brass) to show the live render.
5. Open the **Code & STEP** tab — show the generated build123d script.
6. **Download the STEP file** and show it land in the downloads folder.
   > "That's a real STEP file — it opens in any CAD tool and goes straight to a
   > CNC machine or 3D printer."
7. Quickly show **Save project** / **Export session** and **STL import**.

**[2:10–2:40] Tech depth + cross-domain (Breadth & Complexity)**
> "This combines three domains: mechanical/manufacturing engineering — real
> B-rep solids and STEP output; AI — a constrained LLM planner; and 3D graphics
> for the live viewport. It's local-first for privacy, but architected to scale
> on AWS with S3 storage and a hosted model."

**[2:40–3:00] A pivot + close (Navigating challenges, Impact)**
> "One thing that didn't work at first: our STEP export silently dropped
> imported meshes. We learned a triangle mesh isn't a solid, so we split the
> pipeline — solids to STEP, mesh merged into the STL. Text2Shape makes real
> CAD accessible to anyone who can type a sentence. Thanks — Team [NAME]."

---

## 6-minute Q&A — anticipated questions mapped to the rubric

**Innovation — "What did you do differently?"**
> We researched existing CAD and text-to-CAD tools. The gap: they either need
> deep expertise, produce non-manufacturable meshes, or execute unsafe generated
> code. We generate validated, parametric, manufacturable geometry.

**Curiosity — "Show us something clever."**
> The safety model: the LLM never touches our geometry kernel. It emits a JSON
> plan we validate field-by-field, then WE build the CAD. No code execution.

**Breadth & Complexity — "Two different areas? What scales?"**
> Manufacturing engineering + AI + 3D graphics. At 10x: swap local Ollama for a
> hosted model, store artifacts in S3, run the API on ECS Fargate behind a load
> balancer — we already wrote those deploy manifests.

**Impact — "Who does this help? Any feedback?"**
> Makers, students, hardware startups without CAD training. It's feasible today:
> it runs and exports real STEP/STL. [If you showed it to anyone, say so here —
> the rubric explicitly asks about target-audience feedback.]

**Navigating challenges — "Name something that didn't work."**
> Pick ONE and go deep:
> 1. Hosted Hugging Face was slow/costly → pivoted to local Ollama.
> 2. STEP silently dropped imported meshes → split STEP (solid) vs STL (mesh).
> 3. Vague hole prompts placed holes off the plate → added validation with an
>    actionable error telling the user the valid coordinate range.

---

## Rubric self-check (aim for all 30)

- [ ] Innovation: named existing solutions + their weakness + our alternative
- [ ] Curiosity: stated a question we asked + showed the clever safety design
- [ ] Communication: working prototype shown end-to-end in the video
- [ ] Breadth: explicitly named 2+ domains incl. one outside computing
- [ ] Impact: named the user + said it's feasible today
- [ ] Navigating challenges: told one real failure -> pivot -> lesson

## Submission reminder
Have the final video file ready **60–90 minutes before the deadline**. Uploads
and format processing take longer than expected. Breakout rooms + slots go out
~10:45 AM Sunday; at least one teammate must be present.
