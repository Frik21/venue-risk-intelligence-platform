# VenueGuard Product Constitution

> **Editorial note (Process 3.6):** This document consolidates and restates
> the product decisions already recorded across `docs/Product-Constitution.md`,
> `docs/PROJECT_CONTEXT.md`, and `docs/Operations-Centre-v1.md`. It introduces
> no new product rules — every statement below traces back to one of those
> three files or to an already-shipped, approved implementation decision in
> the codebase. It exists so a single document answers "what is VenueGuard"
> for every future engineering session, per Process 3.6.
>
> This document does not replace the existing three source documents, which
> remain in the repository unchanged. If any wording below is ever found to
> drift from them, the three source documents win until reconciled.

This document is the highest authority for VenueGuard. Engineering must
never override the product decisions recorded here. If an implementation
requirement conflicts with this document, engineering must stop, explain
the conflict, and wait for approval before proceeding.

---

## Mission

**Planning powered by Intelligence.**

VenueGuard is an Operational Intelligence and Operational Planning
platform for security professionals.

VenueGuard reduces uncertainty.

VenueGuard informs. Professionals decide.

VenueGuard does not replace:

- Physical venue assessments
- Professional judgement
- Operational planning
- Security expertise

VenueGuard enhances all four.

**North Star:** Clarity before action.

---

## Product Promise

Every operator begins with an **Operational Brief** before entering the
**Operations Centre**.

Within 30 seconds an operator should understand:

- Current Operating Conditions
- Why
- What deserves attention
- Recommended Actions

**Primary design principle:** Reduce uncertainty. Never increase anxiety.

---

## Operational Canvas Philosophy

The **Operational Canvas** is the centrepiece of the Operations Centre. It
is not simply a map — it is the primary way operators explore operational
intelligence. All additional information is presented through slide-out
panels; the Canvas itself remains the primary focus.

Navigation follows a fixed hierarchy:

**World → Country → Capital → City**

The Operational Canvas stops at the city level. Planning begins after this
point.

The operator should never need to search for information. The platform
progressively reveals operational intelligence as the operator explores
the environment.

---

## Approved Operational Canvas

The Operational Canvas is built as a layered stack (the Layer Registry —
see `docs/ENGINEERING_BASELINE.md` for the current implementation).
Country selection lifts the selected country from the world map and
brings it forward, rather than performing a conventional map zoom. This
"lifted and brought forward" feeling is a deliberate product decision, not
an incidental animation choice.

## Approved Map Asset

VenueGuard uses a single approved static Operational Canvas map image as
the base map for the World view. There is no interactive third-party map
library (no pan/zoom/drag base map, no tile server, no satellite imagery)
in the approved product — only this one static, approved image, with
operational geometry and intelligence layered on top of it. Any change to
the approved map asset is a product decision, not an engineering one.

---

## Operational Geometry Philosophy

Operational Geometry — the invisible country boundary data used for
selection, masking, and intelligence layers — always adapts to the
approved map. The map never adapts to the geometry. Geometry is aligned to
the map at build time and stays locked to it at every viewport size
without ever touching the map image itself.

---

## Country Focus Philosophy

Selecting a country is a "lift and bring forward" moment, not a zoom. The
selected country separates from the world, the background dims and
softens, and the country moves to the centre of the Canvas at a scale that
keeps countries of very different real-world size visually comparable to
one another — no single country should dominate or disappear simply
because of its true geographic size.

Clicking outside the focused country returns to the world view.

---

## Interaction Philosophy

The interface should feel alive, not animated.

Motion should always support situational awareness:

- Camera movement between world, country, capital, and city.
- Slide-out panels.
- Gentle background breathing.
- Very subtle breathing glow on operational markers.
- Smooth transitions between light and dark themes.

Never:

- Flashing alerts.
- Distracting animations.
- Unnecessary movement.

**Ask Intelligence** is not a chatbot. It is an intelligence capability
that lets operators ask questions not already answered by the Operational
Brief or Operational Plan. Every response ends with **"Include this in the
Operational Plan?"** (Include / Not Now).

**Operational Routes** analyse a default 1 km corridor around a selected
route — VenueGuard analyses the corridor, not simply the road.

Every **Operational Plan** (created before an operation) becomes an
**Operational Report** (created after). Every Operational Report improves
the next Operational Plan.

---

## Product Personality

VenueGuard should feel like an experienced operations manager sitting
beside the operator. It provides context, not commands. It recommends, not
decides. It reduces uncertainty without creating anxiety.

The product should always feel: Professional, Calm, Evidence-based,
Trusted, Purposeful.

Never: Alarmist, Overwhelming, Military, Flashy, Cluttered.

VenueGuard is not a dashboard. It is a professional operational workspace.

---

## Approved Terminology

Use only the following terms for these concepts:

| Concept | Approved term |
|---|---|
| Present operational environment level | **Current Operating Conditions** (Normal / Elevated / High / Severe) |
| Operationally relevant local updates | **Area Advisories** |
| Ask-a-question intelligence capability | **Ask Intelligence** |
| Movement corridor analysis | **Operational Route** |
| Pre-operation document | **Operational Plan** |
| Post-operation document | **Operational Report** |
| Primary map workspace | **Operational Canvas** |
| Primary workspace overall | **Operations Centre** |
| Pre-Operations-Centre summary | **Operational Brief** |

## Never Use

- Dashboard
- Threat Level
- Risk Level
- Area of Interest
- Chatbot

---

## Immutable Product Rules

1. VenueGuard informs. Professionals decide. VenueGuard never declares a
   location "safe" or "unsafe."
2. The Operational Canvas stops at city level. Planning begins after this
   point.
3. The Operational Canvas uses one approved static map asset. No
   alternative or additional base map may be introduced without a product
   decision.
4. Operational Geometry always adapts to the map. The map never adapts to
   the geometry.
5. Country Focus is a lift-and-bring-forward motion, not a zoom.
6. Motion always supports situational awareness. Motion is never
   decorative, alarming, or attention-seeking for its own sake.
7. Before building any feature, ask: Does this improve operational
   planning? Does this reduce uncertainty? Does this help someone make a
   better operational decision? Does this belong in VenueGuard? If the
   answer to any of these is "no" — Parking Lot.
8. Approved terminology is mandatory. The banned terms above may never
   appear in product-facing copy.

---

*This document is the highest authority for VenueGuard product decisions.
Engineering serves the product. See `CLAUDE.md` for how this authority is
enforced in the engineering workflow, and `docs/ENGINEERING_BASELINE.md`
for how the product described here is currently implemented.*
