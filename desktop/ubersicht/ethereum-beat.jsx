// Ethereum Beat — Übersicht desktop widget (free · open source)
//
// Renders the Ethereum Beat /ambient wallpaper on the macOS desktop layer via
// a transparent, full-viewport iframe. The inner page keeps its OWN live
// 12-second slot pulse, so no shell command and no refresh are needed. The
// widget is non-financial (protocol health, never price) and self-contained.
//
// Übersicht: https://tracesof.net/uebersicht/ (free, open source). Drop this
// file into the Übersicht widgets folder — that's it.

// Pick a locked ambient design 1..10. Preview + copy a link at
// https://ethereumbeat.org/ambient . Designs 8 (strip) and 10 (wall) are
// left-anchored and pair well with a desktop icon column on the right.
const AMBIENT_URL = 'https://ethereumbeat.org/ambient/8';

// No polling: the iframe's own 12s pulse keeps it live.
export const refreshFrequency = false;

// The widget wrapper: pinned to the top-left, spanning the whole screen so the
// ambient design (which anchors itself left/bottom) lands where it should.
// Transparent, and pointer-events:none so desktop icons stay clickable.
export const className = `
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  background: transparent;
  pointer-events: none;
  z-index: 0;
`;

export const render = () => (
  <iframe
    src={AMBIENT_URL}
    scrolling="no"
    style={{
      display: 'block',
      width: '100vw',
      height: '100vh',
      border: '0',
      background: 'transparent',
      pointerEvents: 'none',
    }}
  />
);
