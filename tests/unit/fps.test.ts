import { describe, expect, it } from 'vitest';
import { DEFS } from '../../src/sim/data';
import { FPS_MISSIONS, INTRO, INTRO_LENGTH } from '../../src/fps/story';

describe('FPS campaign data', () => {
  it('every enemy, structure and objective refers to a real Kyrrh entity', () => {
    for (const m of FPS_MISSIONS) {
      for (const w of m.waves) for (const [id] of w.kinds) expect(DEFS[id]?.race, `${m.id} wave ${id}`).toBe('kyrrh');
      for (const [id] of m.structures) expect(DEFS[id]?.kind, `${m.id} structure ${id}`).toBe('building');
      for (const o of m.objectives) if (o.type !== 'survive') expect(DEFS[o.kind]?.race, `${m.id} objective ${o.kind}`).toBe('kyrrh');
    }
  });
  it('destroy objectives target structures that are placed on the map', () => {
    for (const m of FPS_MISSIONS) for (const o of m.objectives)
      if (o.type === 'destroy') expect(m.structures.some(([id]) => id === o.kind), `${m.id} ${o.kind}`).toBe(true);
  });
  it('kill objectives can be met by the waves', () => {
    for (const m of FPS_MISSIONS) for (const o of m.objectives)
      if (o.type === 'kill') expect(m.waves.some(w => w.kinds.some(([id]) => id === o.kind)), `${m.id} ${o.kind}`).toBe(true);
  });
  it('mechs unlock progressively: foot, Tier 2 Juggernaut, Tier 3 Titan', () => {
    expect(FPS_MISSIONS.map(m => m.unlock.join('+'))).toEqual(['', 'juggernaut', 'juggernaut+titan']);
    expect(DEFS.juggernaut.tier ?? 2).toBeGreaterThanOrEqual(1);
  });
  it('intro narration fits the cinematic and is in order', () => {
    const t = INTRO.map(l => l.at);
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(t[t.length - 1]).toBeLessThan(INTRO_LENGTH);
  });
});
