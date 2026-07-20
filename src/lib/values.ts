/**
 * The principles behind the numbers. One of these takes a beat of its own
 * after each full KPI rotation; category detail pages carry theirs too.
 */

export interface Principle {
  category: string;
  title: string;
  gloss: string;
}

// pass 13c: the values beats are the four CROPS properties (CR · O · P · S)
// plus the heartbeat framing (uptime), which is deliberately not a property.
export const PRINCIPLES: Principle[] = [
  {
    category: 'censorship-resistance',
    title: 'NO ONE CAN STOP YOU',
    gloss: 'No actor can selectively exclude a valid transaction — no company, bank or government.',
  },
  {
    category: 'openness',
    title: 'OPEN SOURCE, NO PRIVILEGE',
    gloss: 'No privileged code, no hidden specs. All of it public, auditable and free to run and fork.',
  },
  {
    category: 'privacy',
    title: 'YOUR DATA IS YOURS',
    gloss: 'User data is not exposed beyond necessity or against your interests. Held by cryptography.',
  },
  {
    category: 'security',
    title: 'IT DOES WHAT IT CLAIMS',
    gloss: 'Things do exactly what they claim — no more, no less. History is locked by economics.',
  },
  {
    category: 'heartbeat',
    title: '100% UPTIME SINCE 2015',
    gloss: 'Not one day of downtime since 30 July 2015. The heartbeat you are watching has never stopped.',
  },
];

export function principleFor(category: string): Principle | undefined {
  return PRINCIPLES.find((p) => p.category === category);
}
