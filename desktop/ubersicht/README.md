# Ethereum Beat — Übersicht desktop widget

A free, **open-source** [Übersicht](https://tracesof.net/uebersicht/) widget that
shows the Ethereum Beat **/ambient** wallpaper on your macOS desktop — live
protocol health, one beat per 12-second slot. Non-financial: no price, no market
framing.

## Install

1. Install **Übersicht** — free and open source: <https://tracesof.net/uebersicht/>
2. Copy **`ethereum-beat.jsx`** into your Übersicht widgets folder
   (Übersicht menu bar icon → **Open Widgets Folder**).
3. Done. The widget renders `/ambient` on the desktop and stays live on its own —
   the inner page keeps its own 12-second pulse, so there is no command to run and
   nothing to refresh.

## Choose a design

Edit the `AMBIENT_URL` line in `ethereum-beat.jsx` and set the design number
`1..10` — preview them at <https://ethereumbeat.org/ambient>. Designs **8 (strip)**
and **10 (wall)** are left-anchored and pair well with a desktop icon column on the
right; **1 (glyph)** and **2 (slot)** are minimal corner marks.

## Notes

- Transparent background, `pointer-events: none` — your desktop icons stay clickable.
- The widget is self-contained: it only loads `ethereumbeat.org/ambient/N`.
- Prefer a closed-source, zero-config option? The in-app **WALLPAPER SETUP** panel
  at <https://ethereumbeat.org/ambient> also documents the Plash path.
