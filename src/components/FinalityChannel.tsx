import { useEffect, useMemo, useRef, useState } from 'react';
import { sharedEngine } from '../lib/beat';
import { SLOTS_PER_EPOCH } from '../lib/clock';
import { pad2 } from '../lib/format';
import ShareButton from './ShareButton';
import ExplainChip from './ExplainChip';
import CropsBadge from './CropsBadge';

/**
 * Channel 5 — FINALITY: the journey from proposed to final, taught with
 * moving bars. Slot maths runs client-side every frame; the finality
 * checkpoints refresh once per epoch from the public Beacon API.
 */

const BEACON = 'https://ethereum-beacon-api.publicnode.com';

interface Checkpoints {
  finalized: number;
  justified: number;
  previousJustified: number;
}

async function fetchCheckpoints(): Promise<Checkpoints | null> {
  try {
    const res = await fetch(`${BEACON}/eth/v1/beacon/states/head/finality_checkpoints`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      data: { finalized: { epoch: string }; current_justified: { epoch: string }; previous_justified: { epoch: string } };
    };
    return {
      finalized: Number(d.data.finalized.epoch),
      justified: Number(d.data.current_justified.epoch),
      previousJustified: Number(d.data.previous_justified.epoch),
    };
  } catch {
    return null;
  }
}

function Bar({ frac, strong = false }: { frac: number; strong?: boolean }) {
  return (
    <div className="relative w-full border border-[color:var(--ink-soft)]" style={{ height: 'clamp(12px, 1.8vh, 22px)' }}>
      <div
        className={`absolute inset-y-0 left-0 ${strong ? 'hatch-coarse' : 'hatch-heavy'}`}
        style={{ width: `${Math.min(100, Math.max(0, frac * 100))}%` }}
      />
    </div>
  );
}

/**
 * The circle construction: three overlapping concentric-circle sets for
 * FINAL, JUSTIFIED and HEAD. Final is heavy and still; justified is
 * dashed; the head set carries a live arc filling through the epoch and
 * a slowly rotating inner ring.
 */
function CircleConstruction({
  epoch,
  justified,
  finalized,
  frac,
}: {
  epoch: number;
  justified: number | null;
  finalized: number | null;
  frac: number;
}) {
  const H = 210;
  const W = 720;
  const r = 78;
  const cy = H / 2 - 10;
  const sets = [
    { cx: W * 0.22, label: finalized !== null ? `FINAL ${finalized}` : 'FINAL', kind: 'final' as const },
    { cx: W * 0.5, label: justified !== null ? `JUSTIFIED ${justified}` : 'JUSTIFIED', kind: 'just' as const },
    { cx: W * 0.78, label: `HEAD ${epoch}`, kind: 'head' as const },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ viewTransitionName: 'stage-core', height: 'clamp(160px, 30vh, 420px)' }} preserveAspectRatio="xMidYMid meet" aria-label="Head, justified and finalized epochs as overlapping circle sets">
      {sets.map((s) => (
        <g key={s.kind}>
          {s.kind === 'final' && (
            <>
              <circle cx={s.cx} cy={cy} r={r} fill="none" stroke="var(--ok)" strokeWidth="2.5" />
              <circle cx={s.cx} cy={cy} r={r * 0.66} fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.7" />
              <circle cx={s.cx} cy={cy} r={r * 0.33} fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.5" />
            </>
          )}
          {s.kind === 'just' && (
            <>
              <circle cx={s.cx} cy={cy} r={r} fill="none" stroke="var(--ink)" strokeWidth="1.2" strokeDasharray="6 4" opacity="0.85" />
              <circle cx={s.cx} cy={cy} r={r * 0.6} fill="none" stroke="var(--ink)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
            </>
          )}
          {s.kind === 'head' && (
            <>
              <circle cx={s.cx} cy={cy} r={r} fill="none" stroke="var(--hairline)" strokeWidth="1" strokeDasharray="1 5" />
              <circle
                cx={s.cx}
                cy={cy}
                r={r * 0.8}
                pathLength={1}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                strokeDasharray={`${frac.toFixed(3)} 1`}
                transform={`rotate(-90 ${s.cx} ${cy})`}
              />
              <circle
                cx={s.cx}
                cy={cy}
                r={r * 0.5}
                fill="none"
                stroke="var(--ink)"
                strokeWidth="0.8"
                strokeDasharray="2 3"
                opacity="0.5"
                className="spin-slow"
                style={{ transformOrigin: `${s.cx}px ${cy}px` }}
              />
            </>
          )}
          <text x={s.cx} y={H - 6} textAnchor="middle" fill="var(--ink)" style={{ fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            {s.label}
          </text>
        </g>
      ))}
      <line x1={W * 0.22 + r} y1={cy} x2={W * 0.5 - r} y2={cy} stroke="var(--hairline)" strokeWidth="1" />
      <line x1={W * 0.5 + r} y1={cy} x2={W * 0.78 - r} y2={cy} stroke="var(--hairline)" strokeWidth="1" />
    </svg>
  );
}

export default function FinalityChannel() {
  const reducedMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const engine = useMemo(() => sharedEngine(reducedMotion), [reducedMotion]);
  const [cp, setCp] = useState<Checkpoints | null>(null);
  const [clockState, setClockState] = useState({ epoch: 0, slotInEpoch: 0, secondsIntoSlot: 0, slot: 0, secondsToFinality: 0 });
  const lastEpochRef = useRef(-1);

  useEffect(() => {
    void fetchCheckpoints().then(setCp);
    const off = engine.onFrame(({ clock }) => {
      setClockState((cur) =>
        cur.slot !== clock.slot || Math.abs(cur.secondsIntoSlot - clock.secondsIntoSlot) > 0.25
          ? {
              epoch: clock.epoch,
              slotInEpoch: clock.slotInEpoch,
              secondsIntoSlot: clock.secondsIntoSlot,
              slot: clock.slot,
              secondsToFinality: clock.secondsToFinality,
            }
          : cur,
      );
      if (clock.epoch !== lastEpochRef.current) {
        lastEpochRef.current = clock.epoch;
        void fetchCheckpoints().then((v) => v && setCp(v));
      }
    });
    return () => {
      off();
    };
  }, [engine]);

  const epochFrac = (clockState.slotInEpoch + clockState.secondsIntoSlot / 12) / SLOTS_PER_EPOCH;
  const behind = cp ? clockState.epoch - cp.finalized : null;
  const prevJustified = cp ? cp.justified >= clockState.epoch - 1 : null;
  const toBoundary = Math.max(0, (SLOTS_PER_EPOCH - clockState.slotInEpoch) * 12 - clockState.secondsIntoSlot);
  const finalityEta = new Date(Date.now() + clockState.secondsToFinality * 1000);

  // HEAD -> SAFE -> FINAL: the last 96 slots as a strip
  const stripSlots = 96;
  const headPos = 1;
  const safePos = cp ? 1 - (clockState.slot - cp.justified * 32) / stripSlots : null;
  const finalPos = cp ? 1 - (clockState.slot - cp.finalized * 32) / stripSlots : null;

  const rows: { label: string; frac: number; strong?: boolean; note: string; value: string; tone?: 'ok' | 'warn' }[] = [
    {
      label: `CURRENT EPOCH ${clockState.epoch}`,
      frac: epochFrac,
      strong: true,
      value: `SLOT ${pad2(clockState.slotInEpoch + 1)}/32 · BOUNDARY IN ${pad2(Math.floor(toBoundary / 60))}:${pad2(Math.floor(toBoundary % 60))}`,
      note: 'Blocks are being proposed right now, one per 12-second slot. Validators vote on what they see.',
    },
    {
      label: `PREVIOUS EPOCH ${clockState.epoch - 1}`,
      frac: prevJustified === null ? 0 : prevJustified ? 1 : 0.5,
      value: prevJustified === null ? 'CHECKING…' : prevJustified ? 'JUSTIFIED ✓' : 'AWAITING JUSTIFICATION',
      tone: prevJustified === null ? undefined : prevJustified ? 'ok' : 'warn',
      note: 'When two-thirds of all staked ETH has voted for an epoch, it is justified: the first lock of the ratchet.',
    },
    {
      label: cp ? `FINALIZED EPOCH ${cp.finalized}` : 'FINALIZED',
      frac: 1,
      value: behind !== null ? `${behind} EPOCHS BEHIND HEAD (~${Math.round((behind * 384) / 60)} MIN)` : '…',
      tone: 'ok',
      note: 'A justified epoch whose successor is also justified becomes final. Reversing it would burn at least a third of all staked ETH.',
    },
  ];

  return (
    <div className="plus-field flex h-full min-h-0 flex-col justify-between">
      <div className="grid flex-none items-center gap-4 lg:grid-cols-[1fr_auto]">
        <CircleConstruction
          epoch={clockState.epoch}
          justified={cp?.justified ?? null}
          finalized={cp?.finalized ?? null}
          frac={epochFrac}
        />
        <div className="text-center lg:text-right">
          <p className="micro">NEXT EPOCH BOUNDARY</p>
          <p className="font-display tabular-nums" style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', lineHeight: 1 }}>
            {pad2(Math.floor(toBoundary / 60))}:{pad2(Math.floor(toBoundary % 60))}
          </p>
          <p className="micro mt-1 text-[color:var(--ink-faint)]">
            HEAD FINAL ≈ {pad2(finalityEta.getHours())}:{pad2(finalityEta.getMinutes())}:{pad2(finalityEta.getSeconds())}
          </p>
        </div>
      </div>
      <div className="mb-3 flex justify-end gap-2">
        <CropsBadge category="security" context="Finality: history locked by economics" />
        <ShareButton
          data={{
            value: cp ? `EPOCH ${cp.finalized} FINAL` : '…',
            label: 'Finality',
            index: '_05',
            url: `${typeof location !== 'undefined' ? location.origin : ''}/finality`,
          }}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-evenly">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="micro flex items-center gap-2">
                {r.label}
                <ExplainChip title={r.label} text={r.note} />
              </span>
              <span
                className="micro tabular-nums font-bold"
                style={{ color: r.tone === 'ok' ? 'var(--ok)' : r.tone === 'warn' ? 'var(--warn)' : 'var(--ink)' }}
              >
                {r.value}
              </span>
            </div>
            <Bar frac={r.frac} strong={r.strong} />
          </div>
        ))}

        {/* HEAD -> SAFE -> FINAL strip over the last 96 slots */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="micro">LAST {stripSlots} SLOTS · HEAD → SAFE → FINAL</span>
            <span className="micro text-[color:var(--ink-faint)]">≈ {Math.round((stripSlots * 12) / 60)} MINUTES OF CHAIN</span>
          </div>
          <div className="relative mt-6 w-full border border-[color:var(--ink-soft)]" style={{ height: 'clamp(28px, 4.5vh, 56px)' }}>
            {/* epoch gridlines */}
            {[1, 2].map((i) => (
              <div key={i} className="absolute inset-y-0 w-px bg-[color:var(--hairline-faint)]" style={{ left: `${(i / 3) * 100}%` }} />
            ))}
            {[
              { pos: finalPos, label: 'FINAL', red: false },
              { pos: safePos, label: 'SAFE', red: false },
              { pos: headPos, label: 'HEAD', red: true },
            ].map(
              (m) =>
                m.pos !== null &&
                m.pos >= 0 && (
                  <div key={m.label} className="absolute inset-y-0" style={{ left: `calc(${Math.min(100, m.pos * 100)}% - 1px)` }}>
                    <div className="h-full w-0.5" style={{ background: m.red ? 'var(--ink)' : 'var(--ink)' }} />
                    <span className={`micro absolute -top-4 -translate-x-1/2 ${m.red ? 'font-bold text-[color:var(--ink)]' : ''}`}>{m.label}</span>
                  </div>
                ),
            )}
          </div>
          <p className="micro mt-1.5 flex items-center gap-2 text-[color:var(--ink-faint)]">
            MARKERS TRAVEL LEFT AS SLOTS ARRIVE
            <ExplainChip
              title="Head, safe, final"
              text="The head is the newest block. Safe means justified: unlikely to move. Final means locked: reversing it would burn at least a third of all staked ETH. The markers travel left as new slots arrive on the right."
            />
          </p>
        </div>

      </div>
    </div>
  );
}
