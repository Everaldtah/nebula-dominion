// "The Shattered Veil" — original three-act campaign.
import type { Race } from '../sim/data';

export type Objective =
  | { type: 'destroyAll'; label: string; optional?: boolean }
  | { type: 'destroy'; targets: string[]; label: string; optional?: boolean }
  | { type: 'survive'; seconds: number; label: string; optional?: boolean }
  | { type: 'have'; id: string; count: number; label: string; optional?: boolean }
  | { type: 'tier'; n: number; label: string; optional?: boolean }
  | { type: 'gather'; minerals: number; label: string; optional?: boolean };

export interface Line { speaker: string; portrait: string; text: string }
export interface Wave { from: number; every: number; until: number; units: [string, number][]; grow?: number }

export interface Mission {
  id: string;
  act: number;
  title: string;
  subtitle: string;
  race: Race;
  enemy: Race;
  difficulty: 'easy' | 'normal' | 'hard';
  seed: number;
  briefing: Line[];
  objectives: Objective[];
  start?: { minerals?: number; gas?: number; units?: [string, number][]; buildings?: string[]; enemyBuildings?: string[]; enemyUnits?: [string, number][] };
  bans?: string[];
  enemyBans?: string[];
  enemyPassive?: boolean;
  protect?: string[];
  waves?: Wave[];
  events?: (Line & { at: number })[];
  outro: string;
}

const VARGA = { speaker: 'Commander Ilse Varga', portrait: 'trooper' };
const KADE = { speaker: 'Marshal Oren Kade', portrait: 'titan' };
const MATRIARCH = { speaker: 'The Matriarch', portrait: 'matron' };
const BROOD = { speaker: 'Voice of the Brood', portrait: 'behemoth' };
const AURELION = { speaker: 'Hierarch Aurelion', portrait: 'hierophant' };
const NYSSA = { speaker: 'Seer Nyssa', portrait: 'vindicator' };
const L = (who: { speaker: string; portrait: string }, text: string): Line => ({ ...who, text });
const E = (at: number, who: { speaker: string; portrait: string }, text: string) => ({ at, ...who, text });

export const ACTS = [
  { n: 1, title: 'Act I — Iron Landing', race: 'directorate' as Race, blurb: 'The Vanguard Directorate reaches Veil-9 to claim the living crystal under its crust.' },
  { n: 2, title: 'Act II — The Hunger', race: 'kyrrh' as Race, blurb: 'Deep in the crust, the Kyrrh brood wakes to the taste of steel.' },
  { n: 3, title: 'Act III — Light Remembered', race: 'aethel' as Race, blurb: 'The Aethel Concord returns for what it buried on Veil-9 an age ago.' },
];

export const MISSIONS: Mission[] = [
  // ---------------------------------------------------------------- ACT I
  {
    id: 'm1', act: 1, title: 'Landfall', subtitle: 'Establish a foothold on Veil-9', race: 'directorate', enemy: 'kyrrh', difficulty: 'easy', seed: 101,
    briefing: [
      L(KADE, 'Commander Varga, the survey fleet made orbit six hours ago. Veil-9 is sitting on the richest crystal vein we have ever charted.'),
      L(VARGA, 'And we are the first boots on it. What is waiting down there, Marshal?'),
      L(KADE, 'Something organic. Orbital scans show a hive mound north-east of your landing zone. Get your Riggers mining, raise a Muster Hall, and burn that nest out before it spreads.'),
    ],
    objectives: [
      { type: 'have', id: 'trooper', count: 6, label: 'Train 6 Troopers' },
      { type: 'destroyAll', label: 'Destroy the Kyrrh hive' },
      { type: 'have', id: 'habitat', count: 2, label: 'Build 2 Habitat Pods', optional: true },
    ],
    start: { minerals: 250 },
    bans: ['citadel', 'stronghold', 'foundry', 'skyport', 'fusionworks'],
    enemyBans: ['sanctum', 'warren', 'aerie'],
    enemyPassive: true,
    events: [
      E(4, VARGA, 'Riggers, get the crystal flowing. Every trooper we field starts with that ore.'),
      E(70, KADE, 'Hive activity rising. Do not give them time to grow, Commander.'),
      E(200, VARGA, 'Muster up, Troopers. We move on the nest.'),
    ],
    outro: 'The nest burns, but the ground trembles beneath the landing zone. Whatever sleeps under Veil-9 is waking up.',
  },
  {
    id: 'm2', act: 1, title: 'Hold the Line', subtitle: 'Survive the brood’s counter-attack', race: 'directorate', enemy: 'kyrrh', difficulty: 'normal', seed: 102,
    briefing: [
      L(VARGA, 'Seismic readings everywhere. They are not attacking from one hive, Marshal. They are coming up out of the rock.'),
      L(KADE, 'Then dig in. Evac shuttles need seven minutes of clear sky. Build turrets, keep your Menders alive, and hold that base.'),
    ],
    objectives: [
      { type: 'survive', seconds: 420, label: 'Hold out until the evac window' },
      { type: 'have', id: 'turret', count: 2, label: 'Build 2 Sentinel Turrets', optional: true },
    ],
    start: { minerals: 400, gas: 100, units: [['trooper', 8], ['breacher', 2]], buildings: ['musterhall', 'arsenal'] },
    bans: ['skyport', 'fusionworks', 'stronghold'],
    enemyPassive: true,
    protect: ['bastion', 'citadel', 'stronghold'],
    waves: [
      { from: 60, every: 45, until: 420, units: [['skitterling', 6]], grow: 0.35 },
      { from: 150, every: 60, until: 420, units: [['carapid', 2]], grow: 0.4 },
      { from: 300, every: 55, until: 420, units: [['quillback', 2]], grow: 0.3 },
    ],
    events: [
      E(50, VARGA, 'Contacts! Skitterlings pouring out of the eastern ridge!'),
      E(210, KADE, 'Halfway there. The shuttles are burning for atmosphere.'),
      E(380, VARGA, 'Just a little longer, people. Hold!'),
    ],
    outro: 'The shuttles lift away under covering fire. But Varga stays behind. Golden lights have been seen over the southern plateau.',
  },
  {
    id: 'm3', act: 1, title: 'Spearhead', subtitle: 'Break the Aethel outpost', race: 'directorate', enemy: 'aethel', difficulty: 'normal', seed: 103,
    briefing: [
      L(VARGA, 'We are not alone on Veil-9. Crystal constructs have raised a gateway on the southern plateau, right over the deepest vein.'),
      L(KADE, 'The Aethel. Old, proud, and heavily shielded. Bring armor, Commander. Juggernauts in Anchor Mode will crack those shields.'),
    ],
    objectives: [
      { type: 'tier', n: 2, label: 'Upgrade to a Citadel Bastion (Tier 2)' },
      { type: 'destroyAll', label: 'Destroy the Aethel outpost' },
    ],
    start: { minerals: 400, gas: 150 },
    bans: ['stronghold', 'fusionworks', 'titan', 'dreadnought'],
    outro: 'The gateway falls silent. In its ruins Varga finds carvings of the same creatures the Directorate has been fighting. The Aethel have been here before.',
  },
  // ---------------------------------------------------------------- ACT II
  {
    id: 'm4', act: 2, title: 'Awakening', subtitle: 'The brood rises', race: 'kyrrh', enemy: 'directorate', difficulty: 'easy', seed: 201,
    briefing: [
      L(BROOD, 'Steel... in the crust. Loud. Hot. It tastes of fire.'),
      L(MATRIARCH, 'Then we wake, children. Spread the creep. Grow the Sanctum. We devour what trespasses on the Veil.'),
    ],
    objectives: [
      { type: 'tier', n: 2, label: 'Evolve a Brood Sanctum (Tier 2)' },
      { type: 'have', id: 'skitterling', count: 12, label: 'Hatch 12 Skitterlings' },
      { type: 'destroyAll', label: 'Consume the Directorate camp' },
    ],
    start: { minerals: 300 },
    bans: ['throne', 'cavern', 'elderaerie', 'behemoth', 'gravemaw'],
    enemyPassive: true,
    enemyBans: ['foundry', 'skyport', 'citadel'],
    events: [E(5, MATRIARCH, 'Hatch the grubs. Every larva is a promise.'), E(150, BROOD, 'The steel ones dig in. They smell of fear.')],
    outro: 'The Directorate camp is swallowed by creep. The Matriarch feels something older stir beneath the Veil: light, and it remembers her.',
  },
  {
    id: 'm5', act: 2, title: 'Swarm Tide', subtitle: 'Overrun the Directorate stronghold', race: 'kyrrh', enemy: 'directorate', difficulty: 'normal', seed: 202,
    briefing: [
      L(MATRIARCH, 'The steel ones have regrouped. Walls, turrets, fire. They think it will keep them safe.'),
      L(BROOD, 'Carapids break walls. Quillbacks break wings. The swarm breaks everything.'),
    ],
    objectives: [{ type: 'destroyAll', label: 'Destroy every Directorate structure' }, { type: 'have', id: 'carapid', count: 8, label: 'Hatch 8 Carapids', optional: true }],
    start: { minerals: 400, gas: 100 },
    bans: ['elderaerie', 'gravemaw'],
    outro: 'The last Directorate Bastion falls. Beneath it the brood uncovers a golden vault, sealed and humming.',
  },
  {
    id: 'm6', act: 2, title: 'Skyfall', subtitle: 'Bring down the Aethel temples', race: 'kyrrh', enemy: 'aethel', difficulty: 'normal', seed: 203,
    briefing: [
      L(MATRIARCH, 'The golden ones return to the vault. They built it, and they sealed us in it.'),
      L(BROOD, 'Then we tear down their temples. Wings above, teeth below.'),
    ],
    objectives: [
      { type: 'destroy', targets: ['core', 'radiantcore', 'exaltedcore'], label: 'Destroy every Aethel Core' },
      { type: 'have', id: 'wyvern', count: 4, label: 'Hatch 4 Wyverns', optional: true },
    ],
    start: { minerals: 400, gas: 200 },
    outro: 'The temples burn, and the vault cracks open. From within, a voice speaks the Matriarch’s true name. She has not heard it in ten thousand years.',
  },
  // ---------------------------------------------------------------- ACT III
  {
    id: 'm7', act: 3, title: 'Beacon', subtitle: 'Hold the warp beacon', race: 'aethel', enemy: 'kyrrh', difficulty: 'normal', seed: 301,
    briefing: [
      L(NYSSA, 'Hierarch, the Veil vault is breached. The brood we imprisoned walks free, and the steel ones have woken it fully.'),
      L(AURELION, 'Then we light the beacon and call the Concord home. Hold the Sanctum Core, Seer. It must not fall before the beacon completes.'),
    ],
    objectives: [{ type: 'survive', seconds: 480, label: 'Keep the beacon alive until the Concord arrives' }, { type: 'have', id: 'spire', count: 3, label: 'Raise 3 Warden Spires', optional: true }],
    start: { minerals: 400, gas: 150, units: [['vindicator', 4], ['seeker', 2]], buildings: ['obelisk', 'portal', 'crucible'] },
    enemyPassive: true,
    protect: ['core', 'radiantcore', 'exaltedcore'],
    waves: [
      { from: 50, every: 45, until: 480, units: [['skitterling', 8]], grow: 0.35 },
      { from: 140, every: 55, until: 480, units: [['carapid', 3], ['quillback', 1]], grow: 0.35 },
      { from: 300, every: 60, until: 480, units: [['wyvern', 2]], grow: 0.4 },
    ],
    events: [E(40, NYSSA, 'Creep on the horizon. They know where we are.'), E(240, AURELION, 'The beacon sings. The Concord hears it. Stand fast.'), E(450, NYSSA, 'Warp signatures! They are coming!')],
    outro: 'Golden fleets tear through the nebula. The Concord has returned to Veil-9, and so has its oldest shame.',
  },
  {
    id: 'm8', act: 3, title: 'The Archive', subtitle: 'Awaken the Hierophant', race: 'aethel', enemy: 'directorate', difficulty: 'normal', seed: 302,
    briefing: [
      L(AURELION, 'The Directorate marches on our landing site. They think this world is theirs to strip.'),
      L(NYSSA, 'The Celestial Archive holds the pattern of the Hierophant. Raise it, and we will have an avatar worthy of this war.'),
    ],
    objectives: [
      { type: 'tier', n: 3, label: 'Ascend to an Exalted Core (Tier 3)' },
      { type: 'have', id: 'archive', count: 1, label: 'Build a Celestial Archive' },
      { type: 'have', id: 'hierophant', count: 1, label: 'Summon a Hierophant' },
    ],
    start: { minerals: 600, gas: 300 },
    outro: 'The Hierophant opens its eyes, and the Directorate lines break before it. Only the brood remains.',
  },
  {
    id: 'm9', act: 3, title: 'Dominion', subtitle: 'End the war for the Veil', race: 'aethel', enemy: 'kyrrh', difficulty: 'hard', seed: 303,
    briefing: [
      L(MATRIARCH, 'Aurelion. You sealed my children in the dark. Now the dark comes for you.'),
      L(AURELION, 'I sealed away a hunger that would have eaten the stars, Matriarch. I will do it again.'),
      L(NYSSA, 'Every Concord blade is with you, Hierarch. Let this be the last battle on Veil-9.'),
    ],
    objectives: [{ type: 'destroyAll', label: 'Destroy the Kyrrh hive completely' }],
    start: { minerals: 500, gas: 250 },
    outro: 'The Throne crumbles into crystal dust. The Veil is quiet again, for now. Far above, the Directorate fleet watches and waits. The war for the nebula has only begun.',
  },
];

const KEY = 'nd-campaign-v1';
export function loadProgress(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { return new Set(); }
}
export function saveProgress(done: Set<string>) {
  try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch { /* private mode */ }
}
export function unlocked(m: Mission, done: Set<string>) {
  const i = MISSIONS.indexOf(m);
  return i === 0 || done.has(MISSIONS[i - 1].id) || done.has(m.id);
}
