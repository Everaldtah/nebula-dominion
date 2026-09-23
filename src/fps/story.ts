// Operation Iron Descent — first-person campaign story, cinematic script and missions.

export interface Radio { speaker: string; portrait: string; text: string }
export interface CineLine { at: number; text: string; speaker?: string; portrait?: string }

export const OPERATION = {
  title: 'Operation Iron Descent',
  tagline: 'One flagship. One strike team. One hive world.',
};

/** Intro cinematic narration, keyed to the cinematic timeline (seconds). */
export const INTRO: CineLine[] = [
  { at: 0.5, text: 'Vorrhaal. The cradle of the Kyrrh Swarm.' },
  { at: 5.5, text: 'For a thousand years the hive spread from this world, devouring every colony in its path.' },
  { at: 11, text: 'After the war on Veil-9, the Vanguard Directorate swore an oath: never again.' },
  { at: 16.5, text: 'The flagship Unyielding Covenant carries ten thousand soldiers — and one purpose.' },
  { at: 22, speaker: 'Commander Ilse Varga', portrait: 'trooper', text: 'Ember squad, this is Covenant Actual. Dropships are green. You are the tip of the spear.' },
  { at: 28, speaker: 'Commander Ilse Varga', portrait: 'trooper', text: 'Burn the brood. Break the Throne. Come home.' },
  { at: 33, speaker: 'Dropship Pilot', portrait: 'wasp', text: 'Hitting atmosphere! Hold on to something, Ember-One!' },
  { at: 39, speaker: 'Dropship Pilot', portrait: 'wasp', text: 'Hive signatures everywhere down there. This is a hot drop!' },
  { at: 45, speaker: 'Commander Ilse Varga', portrait: 'trooper', text: 'Boots on the ground. Welcome to Vorrhaal.' },
];
export const INTRO_LENGTH = 50;

export type FpsObjective =
  | { type: 'survive'; seconds: number; label: string }
  | { type: 'kill'; kind: string; count: number; label: string }
  | { type: 'destroy'; kind: string; label: string };

export interface SpawnRule { kinds: [string, number][]; every: number; from: number; until?: number; grow?: number; max?: number }

export interface FpsMission {
  id: string;
  title: string;
  subtitle: string;
  biome: 'creep' | 'mire' | 'bone';
  briefing: string;
  objectives: FpsObjective[];
  structures: [string, number][];    // static Kyrrh structures placed on the map (thorn, nest, throne)
  waves: SpawnRule[];
  unlock: ('juggernaut' | 'titan')[];
  unlockAt?: number;                  // seconds until the mech drop pod lands
  lance?: boolean;                    // Dreadnought Solar Lance available
  radio: (Radio & { at: number })[];
  outro: string;
}

const VARGA = { speaker: 'Commander Ilse Varga', portrait: 'trooper' };
const QUARTERMASTER = { speaker: 'Quartermaster Hale', portrait: 'rigger' };
const R = (at: number, who: { speaker: string; portrait: string }, text: string) => ({ at, ...who, text });

export const FPS_MISSIONS: FpsMission[] = [
  {
    id: 'f1', title: 'Landfall', subtitle: 'Hold the drop zone', biome: 'creep',
    briefing: 'Your dropship came down hard in the creep fields of Vorrhaal. Hold the landing zone until the second wave lands, then silence the Thorn Colonies guarding the ridge. Your Trooper rifle and Breacher grenade launcher are all you have. Overdrive will push you faster than any Kyrrh, but it costs blood. The Covenant armed you with its best: Level 3 weapons and plating.',
    objectives: [
      { type: 'survive', seconds: 120, label: 'Hold the drop zone' },
      { type: 'destroy', kind: 'thorn', label: 'Destroy every Thorn Colony' },
    ],
    structures: [['thorn', 3]],
    waves: [
      { kinds: [['skitterling', 3]], every: 15, from: 6, grow: 0.12, max: 14 },
      { kinds: [['carapid', 1]], every: 30, from: 40, grow: 0.1, max: 16 },
    ],
    unlock: [],
    radio: [
      R(3, VARGA, 'Ember-One, you are the only survivor of Dropship Four. Dig in. Reinforcements are ninety seconds out.'),
      R(24, VARGA, 'Skitterlings, fast ones. Hit them before they close. Q for Overdrive if you need speed. Your Mender drone patches you up once you break contact.'),
      R(70, VARGA, 'Carapids moving in. Their armor shrugs off rifle rounds. Switch to the grenade launcher: key 2.'),
      R(122, VARGA, 'Second wave is down. Now take out those Thorn Colonies on the ridge.'),
    ],
    outro: 'The ridge falls silent. From its crest, Ember-One sees the mire below, pulsing with green light. The Brood Nests are down there.',
  },
  {
    id: 'f2', title: 'Into the Mire', subtitle: 'Burn the Brood Nests', biome: 'mire',
    briefing: 'Two Brood Nests are feeding the swarm from the toxic mire. Push in and destroy both. Quartermaster Hale is dropping a Juggernaut walker-tank at your position. Board it, and use Anchor Mode to shell the nests from range, just like on Veil-9.',
    objectives: [
      { type: 'destroy', kind: 'nest', label: 'Destroy both Brood Nests' },
      { type: 'kill', kind: 'matron', count: 2, label: 'Kill 2 Matrons' },
    ],
    structures: [['nest', 2], ['thorn', 2]],
    waves: [
      { kinds: [['skitterling', 4], ['quillback', 1]], every: 22, from: 8, grow: 0.1, max: 14 },
      { kinds: [['carapid', 1]], every: 30, from: 30, grow: 0.1, max: 14 },
      { kinds: [['matron', 1]], every: 50, from: 45, until: 200 },
    ],
    unlock: ['juggernaut'], unlockAt: 25,
    radio: [
      R(4, VARGA, 'Two nests, Ember-One. Burn them both, and the Matrons that tend them.'),
      R(25, QUARTERMASTER, 'Juggernaut drop pod is down, marked on your radar. Walk up and press E to board.'),
      R(40, QUARTERMASTER, 'Press F for Anchor Mode. It locks you down, but that cannon reaches half the valley.'),
      R(90, VARGA, 'Matrons use Spawn Brood to force extra larva from the nests. Kill them first or the swarm never ends.'),
    ],
    outro: 'The nests burst in green fire. Deep beneath the bone plains, something vast stirs. The Brood Throne knows the Directorate has come.',
  },
  {
    id: 'f3', title: 'Titanfall', subtitle: 'Break the Brood Throne', biome: 'bone',
    briefing: 'The Brood Throne sits in the bone plains, guarded by Behemoths and flying Gravemaws. The Covenant is sending down a Titan war-walker, and the flagship itself has you on target lock: call in the Dreadnought’s Solar Lance with R. Destroy the Throne and end the swarm on Vorrhaal.',
    objectives: [
      { type: 'kill', kind: 'behemoth', count: 2, label: 'Kill 2 Behemoths' },
      { type: 'destroy', kind: 'throne', label: 'Destroy the Brood Throne' },
    ],
    structures: [['throne', 1], ['nest', 1], ['thorn', 4]],
    waves: [
      { kinds: [['skitterling', 5], ['quillback', 2]], every: 20, from: 8, grow: 0.12, max: 22 },
      { kinds: [['wyvern', 2]], every: 30, from: 25, grow: 0.1, max: 22 },
      { kinds: [['behemoth', 1]], every: 55, from: 50, max: 18 },
      { kinds: [['gravemaw', 1]], every: 60, from: 70, max: 18 },
    ],
    unlock: ['juggernaut', 'titan'], unlockAt: 6, lance: true,
    radio: [
      R(3, VARGA, 'This is it, Ember-One. The Throne is the heart of the swarm on Vorrhaal.'),
      R(8, QUARTERMASTER, 'Titan and Juggernaut pods are down. The Titan is the biggest thing we have ever dropped. Use it.'),
      R(30, VARGA, 'The Covenant has you on target lock. Press R to paint a target for the Solar Lance. Two seconds to charge.'),
      R(75, VARGA, 'Gravemaws overhead! They lob bile from long range. Titan cannons can hit air.'),
    ],
    outro: 'The Brood Throne collapses into its own pit. Across Vorrhaal, the swarm falls silent. On the Unyielding Covenant, ten thousand soldiers cheer as Ember-One walks out of the smoke. The oath is kept.',
  },
];

const KEY = 'nd-fps-v1';
export function fpsProgress(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { return new Set(); } }
export function fpsSave(done: Set<string>) { try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch { /* ignore */ } }
