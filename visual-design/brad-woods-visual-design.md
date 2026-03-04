# Brad Woods Visual Design

## Source
- https://garden.bradwoods.io/notes/css/3d

## High-Level Summary
This note explains how to create and use 3D effects in CSS for interface design, not just decoration. The core idea is to define a 3D context on a parent, then transform child elements along x/y/z axes. Brad frames 3D motion as a tool for preserving context and reorganizing space, especially on smaller screens, while acknowledging that stronger effects reduce readability.

## Core 3D CSS Concepts
- `perspective` on a parent creates the 3D space for descendants.
- `perspective` value controls depth intensity:
  - larger values = subtler z movement
  - smaller values = stronger z movement
- `perspective-origin` sets the vanishing point (default centered at `50% 50%`).
- `translate3d(x, y, z)` moves elements across horizontal, vertical, and depth axes.
- `scale3d(x, y, z)` scales in 3D space.
- `rotateX()`, `rotateY()`, `rotateZ()` rotate around each axis.
- Real interfaces combine these transforms rather than using them in isolation.

## Preserve 3D in Nested Structures
- Multi-level DOM structures can flatten unexpectedly.
- `transform-style: preserve-3d` is required when you want nested descendants to remain in the same 3D context instead of collapsing into a parent plane.

## Constraints and Gotchas
- 3D transforms on SVG children are currently not supported (as noted in the article).
- Over-rotation can make UI hard to read.
- Depth effects are easier to overuse than to tune; restraint matters.

## Practical Visual Design Takeaways
- Use y-axis rotation as a space-management strategy when viewport width shrinks.
- Keep lower-priority UI visible by rotating/repositioning instead of removing it immediately.
- Use depth transitions to help users maintain context between steps or states.
- 3D can support:
  - distinctive navigation layouts
  - above-the-fold animation storytelling
  - process walkthroughs
  - slide/presentation experiences
  - progressive architecture explanations via zoom and detail reveal

## Readability vs Expressiveness
Brad’s framing: design can be understandable without being perfectly readable. In other words, 3D and stylized treatments may reduce literal clarity but still communicate structure, hierarchy, and direction when used intentionally.

## Quick Implementation Checklist
- Set `perspective` on the container.
- Adjust `perspective-origin` to control depth focus.
- Combine `translate3d`/`scale3d`/`rotate*` for purposeful motion.
- Add `transform-style: preserve-3d` where nested depth is required.
- Test responsiveness, especially at narrow widths.
- Evaluate readability at stronger angles before shipping.
