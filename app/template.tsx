'use client'

/**
 * Cross-fade between screens.
 *
 * `template.tsx` rather than `layout.tsx` because Next remounts a template on every
 * navigation and keeps a layout alive — remounting is exactly what makes the entrance
 * animation fire per route.
 *
 * ## Why this fades and does not slide
 *
 * A slide would need `transform`, and any ancestor with a transform becomes the
 * containing block for `position: fixed` descendants. This app has three that matter:
 * the bottom tab bar, the pinned primary action on an agreement, and the sheet overlay.
 * Under a transformed wrapper, `bottom: 0` would resolve against the page's full scroll
 * height rather than the viewport, so the tab bar would drop to the bottom of a long
 * page for the length of the animation and then snap back.
 *
 * `opacity` creates a stacking context but *not* a containing block, so a cross-fade
 * leaves fixed positioning untouched. That is the whole reason for the choice, and it is
 * why `will-change` below names opacity specifically and never transform.
 *
 * Short on purpose. This sits between a tap and the screen the person asked for, so it
 * has to feel like the app keeping up with them rather than a thing to sit through.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
