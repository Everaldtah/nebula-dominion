// Static game data: races, units, buildings, research. All names are original.

export type Race = 'directorate' | 'kyrrh' | 'aethel';
export type Attr = 'light' | 'armored' | 'bio' | 'mech' | 'massive' | 'structure';
export type Proj =
  | 'melee' | 'bullet' | 'shell' | 'flame' | 'artillery' | 'missile' | 'laser'
  | 'acid' | 'spine' | 'glaive' | 'bolt' | 'beam' | 'thorn' | 'claw';

export interface Weapon {
  damage: number;
  bonus?: { attr: Attr; amount: number };
  hits?: number;
  range: number;
  minRange?: number;
  cooldown: number;
  targets: 'ground' | 'air' | 'both';
  splash?: number;
  bounce?: number;
  ramp?: boolean;
  perUpgrade: number;
  proj: Proj;
}

export interface Cost { m: number; g: number }

export interface EntityDef {
  id: string;
  name: string;
  race: Race;
  kind: 'unit' | 'building';
  cost: Cost;
  supply: number;
  time: number;
  hp: number;
  shields?: number;
  armor: number;
  energy?: number;
  startEnergy?: number;
  attrs: Attr[];
  radius: number;
  size: number;
  speed: number;
  sight: number;
  air?: boolean;
  weapon?: Weapon;
  worker?: boolean;
  provides?: number;
  requires?: string[];
  producedBy?: string;
  trains?: string[];
  researches?: string[];
  abilities?: string[];
  dropoff?: boolean;
  gas?: boolean;
  needsPower?: boolean;
  powerRadius?: number;
  creepRadius?: number;
  needsCreep?: boolean;
  larva?: boolean;
  pairs?: number;
  regen?: number;
  tier?: number;
  morphFrom?: string;
  morphTo?: string;
  satisfies?: string[];
  larvaHost?: boolean;
  hotkey: string;
  desc: string;
}

export interface ResearchDef {
  id: string;
  name: string;
  race: Race;
  at: string;
  cost: Cost;
  time: number;
  levels?: number;
  kind: 'weapons' | 'armor' | 'air' | 'tech';
  armorBonus?: { units: string[]; amount: number };
  hotkey: string;
  desc: string;
}

export interface AbilityDef {
  id: string;
  name: string;
  hotkey: string;
  target: 'none' | 'point' | 'unit';
  range?: number;
  energy?: number;
  cooldown?: number;
  research?: string;
  desc: string;
}

const LIGHT_BIO: Attr[] = ['light', 'bio'];

export const DEFS: Record<string, EntityDef> = {};
function d(def: EntityDef) { DEFS[def.id] = def; }

// ============================== DIRECTORATE ===============================
// Industrial human remnant fleet. Builders stay on site; production from halls.
d({ id: 'rigger', name: 'Rigger', race: 'directorate', kind: 'unit', cost: { m: 50, g: 0 }, supply: 1, time: 12,
  hp: 45, armor: 0, attrs: ['light', 'bio', 'mech'], radius: 0.375, size: 0, speed: 2.8, sight: 8, worker: true,
  weapon: { damage: 5, range: 0.2, cooldown: 1.07, targets: 'ground', perUpgrade: 0, proj: 'melee' },
  producedBy: 'bastion', hotkey: 'R', desc: 'Construction and harvesting drone-suit. Stays on site while building.' });
d({ id: 'trooper', name: 'Trooper', race: 'directorate', kind: 'unit', cost: { m: 50, g: 0 }, supply: 1, time: 18,
  hp: 45, armor: 0, attrs: LIGHT_BIO, radius: 0.375, size: 0, speed: 2.25, sight: 9,
  weapon: { damage: 6, range: 5, cooldown: 0.61, targets: 'both', perUpgrade: 1, proj: 'bullet' },
  producedBy: 'musterhall', abilities: ['overdrive'], hotkey: 'T', desc: 'Rifle infantry. Hits ground and air.' });
d({ id: 'breacher', name: 'Breacher', race: 'directorate', kind: 'unit', cost: { m: 100, g: 25 }, supply: 2, time: 21,
  hp: 125, armor: 1, attrs: ['armored', 'bio'], radius: 0.5625, size: 0, speed: 2.25, sight: 10,
  weapon: { damage: 10, bonus: { attr: 'armored', amount: 10 }, range: 6, cooldown: 1.07, targets: 'ground', perUpgrade: 1, proj: 'shell' },
  producedBy: 'musterhall', requires: ['arsenal'], abilities: ['overdrive'], hotkey: 'B', desc: 'Heavy grenadier. Bonus vs armored.' });
d({ id: 'mender', name: 'Mender', race: 'directorate', kind: 'unit', cost: { m: 100, g: 75 }, supply: 1, time: 21,
  hp: 70, armor: 1, energy: 200, startEnergy: 75, attrs: LIGHT_BIO, radius: 0.4, size: 0, speed: 2.5, sight: 9,
  producedBy: 'musterhall', requires: ['arsenal'], hotkey: 'E', desc: 'Field medic. Automatically heals nearby biological units.' });
d({ id: 'scorcher', name: 'Scorcher', race: 'directorate', kind: 'unit', cost: { m: 100, g: 0 }, supply: 2, time: 21,
  hp: 90, armor: 0, attrs: ['light', 'mech'], radius: 0.5, size: 0, speed: 4.1, sight: 10,
  weapon: { damage: 8, bonus: { attr: 'light', amount: 6 }, range: 5, cooldown: 1.79, targets: 'ground', splash: 1.1, perUpgrade: 1, proj: 'flame' },
  producedBy: 'foundry', hotkey: 'S', desc: 'Fast flame buggy. Splash damage, bonus vs light.' });
d({ id: 'juggernaut', name: 'Juggernaut', race: 'directorate', kind: 'unit', cost: { m: 150, g: 125 }, supply: 3, time: 32,
  hp: 175, armor: 1, attrs: ['armored', 'mech'], radius: 0.875, size: 0, speed: 2.25, sight: 11,
  weapon: { damage: 15, bonus: { attr: 'armored', amount: 10 }, range: 7, cooldown: 1.04, targets: 'ground', perUpgrade: 2, proj: 'shell' },
  producedBy: 'foundry', abilities: ['siege', 'unsiege'], hotkey: 'J', desc: 'Tracked cannon. Anchor Mode: huge range and splash, immobile.' });
d({ id: 'wasp', name: 'Wasp', race: 'directorate', kind: 'unit', cost: { m: 150, g: 100 }, supply: 3, time: 40,
  hp: 140, armor: 0, attrs: ['armored', 'mech'], radius: 0.625, size: 0, speed: 3.85, sight: 10, air: true,
  weapon: { damage: 12, hits: 2, range: 6, cooldown: 1.25, targets: 'both', perUpgrade: 1, proj: 'missile' },
  producedBy: 'skyport', hotkey: 'W', desc: 'Missile gunship. Strikes ground and air.' });
d({ id: 'dreadnought', name: 'Dreadnought', race: 'directorate', kind: 'unit', cost: { m: 400, g: 300 }, supply: 6, time: 64,
  hp: 550, armor: 3, attrs: ['armored', 'mech', 'massive'], radius: 1.25, size: 0, speed: 2.62, sight: 12, air: true,
  weapon: { damage: 8, range: 6, cooldown: 0.24, targets: 'both', perUpgrade: 1, proj: 'laser' },
  producedBy: 'skyport', requires: ['fusionworks'], abilities: ['solarlance'], hotkey: 'D', desc: 'Capital ship. Solar Lance deals 240 damage.' });

d({ id: 'bastion', name: 'Command Bastion', race: 'directorate', kind: 'building', cost: { m: 400, g: 0 }, supply: 0, time: 71,
  hp: 1500, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 2.5, size: 5, speed: 0, sight: 11, provides: 15,
  trains: ['rigger'], dropoff: true, tier: 1, morphTo: 'citadel', hotkey: 'C', desc: 'Main base (Tier 1). Trains Riggers, receives resources.' });
d({ id: 'citadel', name: 'Citadel Bastion', race: 'directorate', kind: 'building', cost: { m: 150, g: 100 }, supply: 0, time: 57,
  hp: 1800, armor: 2, attrs: ['armored', 'mech', 'structure'], radius: 2.5, size: 5, speed: 0, sight: 12, provides: 15,
  trains: ['rigger'], dropoff: true, tier: 2, morphFrom: 'bastion', morphTo: 'stronghold', satisfies: ['bastion'], requires: ['musterhall'],
  hotkey: 'L', desc: 'Tier 2 main base. Unlocks the Machine Foundry, Skyport and level 2 upgrades.' });
d({ id: 'stronghold', name: 'Stronghold Bastion', race: 'directorate', kind: 'building', cost: { m: 200, g: 150 }, supply: 0, time: 71,
  hp: 2200, armor: 3, attrs: ['armored', 'mech', 'structure'], radius: 2.5, size: 5, speed: 0, sight: 13, provides: 15,
  trains: ['rigger'], dropoff: true, tier: 3, morphFrom: 'citadel', satisfies: ['bastion', 'citadel'], requires: ['foundry'],
  hotkey: 'L', desc: 'Tier 3 main base. Unlocks Fusion Works and level 3 upgrades.' });
d({ id: 'habitat', name: 'Habitat Pod', race: 'directorate', kind: 'building', cost: { m: 100, g: 0 }, supply: 0, time: 21,
  hp: 400, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 1, size: 2, speed: 0, sight: 9, provides: 8,
  hotkey: 'S', desc: 'Provides 8 supply.' });
d({ id: 'extractor', name: 'Flux Extractor', race: 'directorate', kind: 'building', cost: { m: 75, g: 0 }, supply: 0, time: 21,
  hp: 500, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 1.5, size: 3, speed: 0, sight: 9, gas: true,
  hotkey: 'R', desc: 'Harvests flux from a vent.' });
d({ id: 'musterhall', name: 'Muster Hall', race: 'directorate', kind: 'building', cost: { m: 150, g: 0 }, supply: 0, time: 46,
  hp: 1000, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 1.5, size: 3, speed: 0, sight: 9, requires: ['bastion'],
  trains: ['trooper', 'breacher', 'mender'], researches: ['overdrive'], hotkey: 'B', desc: 'Infantry production.' });
d({ id: 'arsenal', name: 'Arsenal', race: 'directorate', kind: 'building', cost: { m: 125, g: 0 }, supply: 0, time: 25,
  hp: 850, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 1.5, size: 3, speed: 0, sight: 9, requires: ['musterhall'],
  researches: ['dir_weapons', 'dir_armor', 'dir_air'], hotkey: 'A', desc: 'Upgrade chamber: ground weapons, plating and starship weapons.' });
d({ id: 'turret', name: 'Sentinel Turret', race: 'directorate', kind: 'building', cost: { m: 100, g: 0 }, supply: 0, time: 18,
  hp: 300, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 1, size: 2, speed: 0, sight: 11, requires: ['arsenal'],
  weapon: { damage: 12, range: 7, cooldown: 0.86, targets: 'both', perUpgrade: 0, proj: 'bullet' }, hotkey: 'T', desc: 'Defensive gun turret.' });
d({ id: 'foundry', name: 'Machine Foundry', race: 'directorate', kind: 'building', cost: { m: 150, g: 100 }, supply: 0, time: 43,
  hp: 1250, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 1.5, size: 3, speed: 0, sight: 9, requires: ['musterhall', 'citadel'],
  trains: ['scorcher', 'juggernaut', 'titan'], hotkey: 'F', desc: 'Tier 2 vehicle production.' });
d({ id: 'skyport', name: 'Skyport', race: 'directorate', kind: 'building', cost: { m: 150, g: 100 }, supply: 0, time: 36,
  hp: 1300, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 1.5, size: 3, speed: 0, sight: 9, requires: ['foundry', 'citadel'],
  trains: ['wasp', 'dreadnought'], hotkey: 'P', desc: 'Tier 2 starship production.' });
d({ id: 'fusionworks', name: 'Fusion Works', race: 'directorate', kind: 'building', cost: { m: 200, g: 200 }, supply: 0, time: 64,
  hp: 1000, armor: 1, attrs: ['armored', 'mech', 'structure'], radius: 1.5, size: 3, speed: 0, sight: 9, requires: ['stronghold', 'skyport'],
  researches: ['titanium'], hotkey: 'U', desc: 'Tier 3. Unlocks Titans and Dreadnoughts.' });
d({ id: 'titan', name: 'Titan', race: 'directorate', kind: 'unit', cost: { m: 350, g: 250 }, supply: 6, time: 57,
  hp: 450, armor: 2, attrs: ['armored', 'mech', 'massive'], radius: 1.3, size: 0, speed: 1.9, sight: 11,
  weapon: { damage: 24, hits: 2, bonus: { attr: 'armored', amount: 8 }, range: 7, cooldown: 1.3, targets: 'both', perUpgrade: 2, proj: 'artillery' },
  producedBy: 'foundry', requires: ['fusionworks'], hotkey: 'T', desc: 'Colossal war-walker. Twin cannons strike ground and air.' });

// ================================ KYRRH ===================================
// Chitinous hive swarm. Units hatch from larva; builders are consumed; creep.
d({ id: 'grub', name: 'Grub', race: 'kyrrh', kind: 'unit', cost: { m: 50, g: 0 }, supply: 1, time: 12,
  hp: 40, armor: 0, attrs: LIGHT_BIO, radius: 0.375, size: 0, speed: 2.8, sight: 8, worker: true, larva: true,
  weapon: { damage: 5, range: 0.2, cooldown: 1.07, targets: 'ground', perUpgrade: 0, proj: 'claw' },
  hotkey: 'D', desc: 'Harvester. Mutates into structures (consumed).' });
d({ id: 'drover', name: 'Drover', race: 'kyrrh', kind: 'unit', cost: { m: 100, g: 0 }, supply: 0, time: 18,
  hp: 200, armor: 0, attrs: ['armored', 'bio'], radius: 0.9, size: 0, speed: 0.9, sight: 11, air: true, provides: 8, larva: true,
  hotkey: 'V', desc: 'Floating gasbag. Provides 8 supply.' });
d({ id: 'skitterling', name: 'Skitterling', race: 'kyrrh', kind: 'unit', cost: { m: 50, g: 0 }, supply: 0.5, time: 17,
  hp: 35, armor: 0, attrs: LIGHT_BIO, radius: 0.35, size: 0, speed: 4.1, sight: 8, larva: true, pairs: 2, requires: ['mire'],
  weapon: { damage: 5, range: 0.2, cooldown: 0.5, targets: 'ground', perUpgrade: 1, proj: 'claw' },
  hotkey: 'Z', desc: 'Swift biter. Hatches in pairs.' });
d({ id: 'carapid', name: 'Carapid', race: 'kyrrh', kind: 'unit', cost: { m: 75, g: 25 }, supply: 2, time: 19,
  hp: 145, armor: 1, attrs: ['armored', 'bio'], radius: 0.625, size: 0, speed: 3.15, sight: 9, larva: true, requires: ['warren'], regen: 2.5,
  weapon: { damage: 16, range: 4, cooldown: 1.43, targets: 'ground', perUpgrade: 2, proj: 'acid' },
  hotkey: 'R', desc: 'Armored acid spitter. Rapid regeneration.' });
d({ id: 'quillback', name: 'Quillback', race: 'kyrrh', kind: 'unit', cost: { m: 100, g: 50 }, supply: 2, time: 24,
  hp: 90, armor: 0, attrs: LIGHT_BIO, radius: 0.625, size: 0, speed: 2.25, sight: 9, larva: true, requires: ['quillden'],
  weapon: { damage: 12, range: 5, cooldown: 0.59, targets: 'both', perUpgrade: 1, proj: 'spine' },
  hotkey: 'Q', desc: 'Spine launcher. Hits ground and air.' });
d({ id: 'wyvern', name: 'Wyvern', race: 'kyrrh', kind: 'unit', cost: { m: 100, g: 100 }, supply: 2, time: 24,
  hp: 120, armor: 0, attrs: LIGHT_BIO, radius: 0.6, size: 0, speed: 4.0, sight: 11, air: true, larva: true, requires: ['aerie'],
  weapon: { damage: 9, range: 3, cooldown: 1.09, targets: 'both', bounce: 2, perUpgrade: 1, proj: 'glaive' },
  hotkey: 'W', desc: 'Flying raider. Bouncing glaives.' });
d({ id: 'behemoth', name: 'Behemoth', race: 'kyrrh', kind: 'unit', cost: { m: 275, g: 200 }, supply: 6, time: 39,
  hp: 500, armor: 2, attrs: ['armored', 'bio', 'massive'], radius: 1.0, size: 0, speed: 2.95, sight: 9, larva: true, requires: ['cavern'],
  weapon: { damage: 35, range: 1, cooldown: 0.86, targets: 'ground', splash: 1.6, perUpgrade: 3, proj: 'claw' },
  hotkey: 'B', desc: 'Tusked colossus. Cleaving melee.' });
d({ id: 'gravemaw', name: 'Gravemaw', race: 'kyrrh', kind: 'unit', cost: { m: 300, g: 250 }, supply: 5, time: 50,
  hp: 300, armor: 1, attrs: ['armored', 'bio', 'massive'], radius: 1.3, size: 0, speed: 1.7, sight: 12, air: true, larva: true, requires: ['elderaerie'],
  weapon: { damage: 20, bonus: { attr: 'armored', amount: 10 }, range: 10, cooldown: 1.8, targets: 'ground', splash: 1.0, perUpgrade: 2, proj: 'acid' },
  hotkey: 'G', desc: 'Floating siege-beast. Lobs corrosive bile at ground targets from long range.' });
d({ id: 'matron', name: 'Matron', race: 'kyrrh', kind: 'unit', cost: { m: 150, g: 0 }, supply: 2, time: 36,
  hp: 175, armor: 1, energy: 200, startEnergy: 25, attrs: ['bio'], radius: 0.6, size: 0, speed: 1.6, sight: 9,
  producedBy: 'nest', requires: ['mire'], abilities: ['spawnbrood'],
  weapon: { damage: 8, hits: 2, range: 5, cooldown: 0.71, targets: 'both', perUpgrade: 1, proj: 'spine' },
  hotkey: 'M', desc: 'Hive guardian. Spawn Brood grants a Nest 3 extra larva.' });

const KB = (extra: Partial<EntityDef>): Partial<EntityDef> => ({ attrs: ['armored', 'bio', 'structure'], armor: 1, regen: 0.4, needsCreep: true, creepRadius: 6, speed: 0, supply: 0, ...extra });
d({ ...KB({}), id: 'nest', name: 'Brood Nest', race: 'kyrrh', kind: 'building', cost: { m: 300, g: 0 }, time: 71, hp: 1500,
  radius: 2.5, size: 5, sight: 11, provides: 6, dropoff: true, needsCreep: false, creepRadius: 11, larvaHost: true, tier: 1, morphTo: 'sanctum',
  trains: ['matron'], hotkey: 'H', desc: 'Hive heart (Tier 1). Spawns larva, receives resources.' } as EntityDef);
d({ ...KB({ needsCreep: false, creepRadius: 12, armor: 2 }), id: 'sanctum', name: 'Brood Sanctum', race: 'kyrrh', kind: 'building', cost: { m: 150, g: 100 }, time: 57, hp: 2000,
  radius: 2.5, size: 5, sight: 12, provides: 6, dropoff: true, larvaHost: true, tier: 2, morphFrom: 'nest', morphTo: 'throne', satisfies: ['nest'], requires: ['mire'],
  trains: ['matron'], hotkey: 'L', desc: 'Tier 2 hive. Unlocks the Quill Den, Aerie and level 2 mutations.' } as EntityDef);
d({ ...KB({ needsCreep: false, creepRadius: 13, armor: 3 }), id: 'throne', name: 'Brood Throne', race: 'kyrrh', kind: 'building', cost: { m: 200, g: 150 }, time: 71, hp: 2500,
  radius: 2.5, size: 5, sight: 13, provides: 6, dropoff: true, larvaHost: true, tier: 3, morphFrom: 'sanctum', satisfies: ['nest', 'sanctum'], requires: ['quillden'],
  trains: ['matron'], hotkey: 'L', desc: 'Tier 3 hive. Unlocks the Great Cavern, Elder Aerie and level 3 mutations.' } as EntityDef);
d({ ...KB({ needsCreep: false, creepRadius: 0 }), id: 'siphon', name: 'Flux Siphon', race: 'kyrrh', kind: 'building', cost: { m: 25, g: 0 }, time: 21, hp: 500,
  radius: 1.5, size: 3, sight: 9, gas: true, hotkey: 'E', desc: 'Harvests flux from a vent.' } as EntityDef);
d({ ...KB({}), id: 'mire', name: 'Spawning Mire', race: 'kyrrh', kind: 'building', cost: { m: 200, g: 0 }, time: 46, hp: 1000,
  radius: 1.5, size: 3, sight: 9, requires: ['nest'], researches: ['hastening'], hotkey: 'S', desc: 'Unlocks Skitterlings, Matrons, Thorn Colonies.' } as EntityDef);
d({ ...KB({}), id: 'mutagen', name: 'Mutagen Pit', race: 'kyrrh', kind: 'building', cost: { m: 75, g: 0 }, time: 25, hp: 750,
  radius: 1.5, size: 3, sight: 9, requires: ['mire'], researches: ['kyr_weapons', 'kyr_armor'], hotkey: 'V', desc: 'Upgrade chamber: talon and carapace mutations.' } as EntityDef);
d({ ...KB({}), id: 'warren', name: 'Acid Warren', race: 'kyrrh', kind: 'building', cost: { m: 150, g: 0 }, time: 39, hp: 1000,
  radius: 1.5, size: 3, sight: 9, requires: ['mire'], hotkey: 'R', desc: 'Unlocks Carapids.' } as EntityDef);
d({ ...KB({}), id: 'quillden', name: 'Quill Den', race: 'kyrrh', kind: 'building', cost: { m: 100, g: 100 }, time: 29, hp: 850,
  radius: 1.5, size: 3, sight: 9, requires: ['warren', 'sanctum'], hotkey: 'Q', desc: 'Tier 2. Unlocks Quillbacks.' } as EntityDef);
d({ ...KB({}), id: 'aerie', name: 'Aerie', race: 'kyrrh', kind: 'building', cost: { m: 200, g: 200 }, time: 64, hp: 850,
  radius: 1.5, size: 3, sight: 9, requires: ['sanctum'], researches: ['kyr_air'], hotkey: 'A', desc: 'Tier 2. Unlocks Wyverns and evolves flyer attacks.' } as EntityDef);
d({ ...KB({}), id: 'cavern', name: 'Great Cavern', race: 'kyrrh', kind: 'building', cost: { m: 150, g: 200 }, time: 46, hp: 850,
  radius: 1.5, size: 3, sight: 9, requires: ['throne'], researches: ['chitin'], hotkey: 'C', desc: 'Tier 3. Unlocks Behemoths.' } as EntityDef);
d({ ...KB({}), id: 'elderaerie', name: 'Elder Aerie', race: 'kyrrh', kind: 'building', cost: { m: 150, g: 250 }, time: 71, hp: 1000,
  radius: 1.5, size: 3, sight: 9, requires: ['throne', 'aerie'], hotkey: 'E', desc: 'Tier 3. Unlocks Gravemaws.' } as EntityDef);
d({ ...KB({ armor: 2 }), id: 'thorn', name: 'Thorn Colony', race: 'kyrrh', kind: 'building', cost: { m: 100, g: 0 }, time: 36, hp: 300,
  radius: 1, size: 2, sight: 11, requires: ['mire'], creepRadius: 3,
  weapon: { damage: 25, bonus: { attr: 'armored', amount: 5 }, range: 7, cooldown: 1.85, targets: 'ground', perUpgrade: 0, proj: 'thorn' },
  hotkey: 'T', desc: 'Rooted defensive spine. Ground only.' } as EntityDef);

// ================================ AETHEL ==================================
// Radiant crystalline concord. Shields regenerate; buildings self-assemble in Lumen fields.
d({ id: 'acolyte', name: 'Acolyte', race: 'aethel', kind: 'unit', cost: { m: 50, g: 0 }, supply: 1, time: 12,
  hp: 20, shields: 20, armor: 0, attrs: ['light', 'mech'], radius: 0.375, size: 0, speed: 2.8, sight: 8, worker: true,
  weapon: { damage: 5, range: 0.2, cooldown: 1.07, targets: 'ground', perUpgrade: 0, proj: 'melee' },
  producedBy: 'core', hotkey: 'E', desc: 'Harvesting construct. Starts structures that assemble themselves.' });
d({ id: 'vindicator', name: 'Vindicator', race: 'aethel', kind: 'unit', cost: { m: 100, g: 0 }, supply: 2, time: 27,
  hp: 100, shields: 50, armor: 1, attrs: LIGHT_BIO, radius: 0.5, size: 0, speed: 2.6, sight: 9,
  weapon: { damage: 8, hits: 2, range: 0.2, cooldown: 0.86, targets: 'ground', perUpgrade: 1, proj: 'melee' },
  producedBy: 'portal', hotkey: 'Z', desc: 'Shielded blade warrior.' });
d({ id: 'seeker', name: 'Seeker', race: 'aethel', kind: 'unit', cost: { m: 125, g: 50 }, supply: 2, time: 30,
  hp: 80, shields: 80, armor: 1, attrs: ['armored', 'mech'], radius: 0.625, size: 0, speed: 2.95, sight: 10,
  weapon: { damage: 13, bonus: { attr: 'armored', amount: 5 }, range: 6, cooldown: 1.34, targets: 'both', perUpgrade: 1, proj: 'bolt' },
  producedBy: 'portal', requires: ['resonance'], abilities: ['phase'], hotkey: 'S', desc: 'Striding walker. Phase Step teleports a short distance.' });
d({ id: 'bulwark', name: 'Bulwark', race: 'aethel', kind: 'unit', cost: { m: 275, g: 100 }, supply: 4, time: 39,
  hp: 200, shields: 100, armor: 1, attrs: ['armored', 'mech'], radius: 0.75, size: 0, speed: 2.25, sight: 9,
  weapon: { damage: 20, bonus: { attr: 'armored', amount: 30 }, range: 6, cooldown: 1.04, targets: 'ground', perUpgrade: 2, proj: 'bolt' },
  producedBy: 'makerforge', hotkey: 'B', desc: 'Siege breaker. Massive bonus vs armored.' });
d({ id: 'strider', name: 'Strider', race: 'aethel', kind: 'unit', cost: { m: 300, g: 200 }, supply: 6, time: 54,
  hp: 200, shields: 150, armor: 1, attrs: ['armored', 'mech', 'massive'], radius: 1.0, size: 0, speed: 2.25, sight: 10,
  weapon: { damage: 10, hits: 2, bonus: { attr: 'light', amount: 5 }, range: 7, cooldown: 1.07, targets: 'ground', splash: 1.2, perUpgrade: 1, proj: 'beam' },
  producedBy: 'makerforge', hotkey: 'T', desc: 'Towering tripod. Sweeping splash beams.' });
d({ id: 'radiant', name: 'Radiant', race: 'aethel', kind: 'unit', cost: { m: 250, g: 150 }, supply: 4, time: 43,
  hp: 150, shields: 100, armor: 0, attrs: ['armored', 'mech'], radius: 0.9, size: 0, speed: 2.75, sight: 10, air: true,
  weapon: { damage: 6, bonus: { attr: 'armored', amount: 4 }, range: 6, cooldown: 0.36, targets: 'both', ramp: true, perUpgrade: 1, proj: 'beam' },
  producedBy: 'skyforge', hotkey: 'R', desc: 'Prism ship. Beam intensifies on a sustained target.' });
d({ id: 'empyrean', name: 'Empyrean', race: 'aethel', kind: 'unit', cost: { m: 350, g: 250 }, supply: 6, time: 64,
  hp: 300, shields: 150, armor: 2, attrs: ['armored', 'mech', 'massive'], radius: 1.4, size: 0, speed: 2.0, sight: 12, air: true,
  weapon: { damage: 10, hits: 2, range: 9, cooldown: 1.5, targets: 'both', splash: 0.8, perUpgrade: 1, proj: 'bolt' },
  producedBy: 'skyforge', requires: ['archive'], hotkey: 'E', desc: 'Long-range flagship. Splash bolts.' });
d({ id: 'hierophant', name: 'Hierophant', race: 'aethel', kind: 'unit', cost: { m: 300, g: 300 }, supply: 6, time: 57,
  hp: 250, shields: 250, armor: 1, attrs: ['armored', 'bio', 'massive'], radius: 1.2, size: 0, speed: 2.0, sight: 10,
  weapon: { damage: 25, range: 3, cooldown: 1.25, targets: 'both', splash: 1.6, perUpgrade: 2, proj: 'beam' },
  producedBy: 'makerforge', requires: ['archive'], hotkey: 'H', desc: 'Towering psionic avatar. Radiant novas scorch everything around its target.' });

const AB = (extra: Partial<EntityDef>): Partial<EntityDef> => ({ attrs: ['armored', 'structure'], armor: 1, speed: 0, supply: 0, needsPower: true, ...extra });
d({ ...AB({ needsPower: false }), id: 'core', name: 'Sanctum Core', race: 'aethel', kind: 'building', cost: { m: 400, g: 0 }, time: 71,
  hp: 1000, shields: 1000, radius: 2.5, size: 5, sight: 11, provides: 15, dropoff: true, trains: ['acolyte'], tier: 1, morphTo: 'radiantcore', hotkey: 'N', desc: 'Main base (Tier 1). Trains Acolytes.' } as EntityDef);
d({ ...AB({ needsPower: false, armor: 2 }), id: 'radiantcore', name: 'Radiant Core', race: 'aethel', kind: 'building', cost: { m: 150, g: 100 }, time: 57,
  hp: 1200, shields: 1300, radius: 2.5, size: 5, sight: 12, provides: 15, dropoff: true, trains: ['acolyte'], tier: 2, morphFrom: 'core', morphTo: 'exaltedcore', satisfies: ['core'], requires: ['portal'],
  hotkey: 'L', desc: 'Tier 2 core. Unlocks the Construct Loom, Skyforge and level 2 upgrades.' } as EntityDef);
d({ ...AB({ needsPower: false, armor: 3 }), id: 'exaltedcore', name: 'Exalted Core', race: 'aethel', kind: 'building', cost: { m: 200, g: 150 }, time: 71,
  hp: 1400, shields: 1600, radius: 2.5, size: 5, sight: 13, provides: 15, dropoff: true, trains: ['acolyte'], tier: 3, morphFrom: 'radiantcore', satisfies: ['core', 'radiantcore'], requires: ['resonance'],
  hotkey: 'L', desc: 'Tier 3 core. Unlocks the Celestial Archive and level 3 upgrades.' } as EntityDef);
d({ ...AB({ needsPower: false }), id: 'obelisk', name: 'Lumen Obelisk', race: 'aethel', kind: 'building', cost: { m: 100, g: 0 }, time: 18,
  hp: 200, shields: 200, radius: 1, size: 2, sight: 9, provides: 8, powerRadius: 6.5, hotkey: 'E', desc: '+8 supply. Projects a Lumen field that powers structures.' } as EntityDef);
d({ ...AB({ needsPower: false }), id: 'tap', name: 'Aether Tap', race: 'aethel', kind: 'building', cost: { m: 75, g: 0 }, time: 21,
  hp: 450, shields: 450, radius: 1.5, size: 3, sight: 9, gas: true, hotkey: 'A', desc: 'Harvests flux from a vent.' } as EntityDef);
d({ ...AB({}), id: 'portal', name: 'Portal Hall', race: 'aethel', kind: 'building', cost: { m: 150, g: 0 }, time: 46,
  hp: 500, shields: 500, radius: 1.5, size: 3, sight: 9, requires: ['obelisk'], trains: ['vindicator', 'seeker'], hotkey: 'G', desc: 'Warrior production.' } as EntityDef);
d({ ...AB({}), id: 'resonance', name: 'Resonance Chamber', race: 'aethel', kind: 'building', cost: { m: 150, g: 0 }, time: 36,
  hp: 550, shields: 550, radius: 1.5, size: 3, sight: 9, requires: ['portal'], researches: ['phasestep'], hotkey: 'Y', desc: 'Unlocks Seekers, the Construct Loom and Skyforge.' } as EntityDef);
d({ ...AB({}), id: 'crucible', name: 'Crucible', race: 'aethel', kind: 'building', cost: { m: 150, g: 0 }, time: 32,
  hp: 400, shields: 400, radius: 1.5, size: 3, sight: 9, requires: ['core'], researches: ['aet_weapons', 'aet_armor'], hotkey: 'F', desc: 'Weapon and plating upgrades.' } as EntityDef);
d({ ...AB({}), id: 'spire', name: 'Warden Spire', race: 'aethel', kind: 'building', cost: { m: 150, g: 0 }, time: 29,
  hp: 150, shields: 150, radius: 1, size: 2, sight: 11, requires: ['crucible'],
  weapon: { damage: 20, range: 7, cooldown: 1.25, targets: 'both', perUpgrade: 0, proj: 'bolt' }, hotkey: 'C', desc: 'Defensive crystal spire.' } as EntityDef);
d({ ...AB({}), id: 'makerforge', name: 'Construct Loom', race: 'aethel', kind: 'building', cost: { m: 150, g: 100 }, time: 46,
  hp: 450, shields: 450, radius: 1.5, size: 3, sight: 9, requires: ['resonance', 'radiantcore'], trains: ['bulwark', 'strider', 'hierophant'], hotkey: 'R', desc: 'Tier 2 construct production.' } as EntityDef);
d({ ...AB({}), id: 'skyforge', name: 'Skyforge', race: 'aethel', kind: 'building', cost: { m: 150, g: 150 }, time: 43,
  hp: 600, shields: 600, radius: 1.5, size: 3, sight: 9, requires: ['resonance', 'radiantcore'], trains: ['radiant', 'empyrean'], researches: ['aet_air'], hotkey: 'S', desc: 'Tier 2 starship production; refines ship weapons.' } as EntityDef);
d({ ...AB({}), id: 'archive', name: 'Celestial Archive', race: 'aethel', kind: 'building', cost: { m: 200, g: 200 }, time: 64,
  hp: 500, shields: 500, radius: 1.5, size: 3, sight: 9, requires: ['exaltedcore', 'skyforge'], researches: ['aegis'], hotkey: 'C', desc: 'Tier 3. Unlocks Empyreans and Hierophants.' } as EntityDef);

// Nest larva morph list
export const LARVA_UNITS = ['grub', 'drover', 'skitterling', 'carapid', 'quillback', 'wyvern', 'behemoth', 'gravemaw'];

export const RESEARCH: Record<string, ResearchDef> = {};
function r(def: ResearchDef) { RESEARCH[def.id] = def; }
r({ id: 'overdrive', name: 'Overdrive Protocol', race: 'directorate', at: 'musterhall', cost: { m: 100, g: 100 }, time: 70, kind: 'tech', hotkey: 'O', desc: 'Troopers and Breachers can trigger Overdrive: +50% attack and move speed for 11s at a cost of health.' });
r({ id: 'dir_weapons', name: 'Directorate Weapons', race: 'directorate', at: 'arsenal', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'weapons', hotkey: 'W', desc: 'Increases the damage of all Directorate units.' });
r({ id: 'dir_armor', name: 'Directorate Plating', race: 'directorate', at: 'arsenal', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'armor', hotkey: 'A', desc: 'Increases the armor of all Directorate units.' });
r({ id: 'dir_air', name: 'Starship Weapons', race: 'directorate', at: 'arsenal', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'air', hotkey: 'S', desc: 'Increases the damage of Directorate air units.' });
r({ id: 'titanium', name: 'Titanium Hulls', race: 'directorate', at: 'fusionworks', cost: { m: 150, g: 150 }, time: 90, kind: 'tech', armorBonus: { units: ['titan', 'dreadnought'], amount: 2 }, hotkey: 'H', desc: 'Titans and Dreadnoughts gain +2 armor.' });
r({ id: 'hastening', name: 'Hastening Glands', race: 'kyrrh', at: 'mire', cost: { m: 100, g: 100 }, time: 60, kind: 'tech', hotkey: 'G', desc: 'Skitterlings move 60% faster.' });
r({ id: 'kyr_weapons', name: 'Kyrrh Talons', race: 'kyrrh', at: 'mutagen', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'weapons', hotkey: 'W', desc: 'Increases the damage of all Kyrrh units.' });
r({ id: 'kyr_armor', name: 'Kyrrh Carapace', race: 'kyrrh', at: 'mutagen', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'armor', hotkey: 'A', desc: 'Increases the armor of all Kyrrh units.' });
r({ id: 'kyr_air', name: 'Flyer Attacks', race: 'kyrrh', at: 'aerie', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'air', hotkey: 'F', desc: 'Increases the damage of Kyrrh flyers.' });
r({ id: 'chitin', name: 'Chitin Bulwark', race: 'kyrrh', at: 'cavern', cost: { m: 150, g: 150 }, time: 90, kind: 'tech', armorBonus: { units: ['behemoth', 'gravemaw'], amount: 2 }, hotkey: 'P', desc: 'Behemoths and Gravemaws gain +2 armor.' });
r({ id: 'phasestep', name: 'Phase Step', race: 'aethel', at: 'resonance', cost: { m: 150, g: 150 }, time: 80, kind: 'tech', hotkey: 'P', desc: 'Seekers can teleport a short distance.' });
r({ id: 'aet_weapons', name: 'Aethel Arms', race: 'aethel', at: 'crucible', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'weapons', hotkey: 'W', desc: 'Increases the damage of all Aethel units.' });
r({ id: 'aet_armor', name: 'Aethel Plating', race: 'aethel', at: 'crucible', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'armor', hotkey: 'A', desc: 'Increases the armor of all Aethel units.' });

r({ id: 'aet_air', name: 'Starfire Arrays', race: 'aethel', at: 'skyforge', cost: { m: 100, g: 100 }, time: 80, levels: 3, kind: 'air', hotkey: 'F', desc: 'Increases the damage of Aethel ships.' });
r({ id: 'aegis', name: 'Aegis Lattice', race: 'aethel', at: 'archive', cost: { m: 150, g: 150 }, time: 90, kind: 'tech', armorBonus: { units: ['hierophant', 'empyrean'], amount: 2 }, hotkey: 'A', desc: 'Hierophants and Empyreans gain +2 armor.' });

export const ABILITIES: Record<string, AbilityDef> = {
  overdrive: { id: 'overdrive', name: 'Overdrive', hotkey: 'T', target: 'none', research: 'overdrive', desc: 'Costs 10 (20 for Breachers) health. +50% attack and movement speed for 11 seconds.' },
  siege: { id: 'siege', name: 'Anchor Mode', hotkey: 'E', target: 'none', desc: 'Deploy: range 13, 40 (+30 armored) splash damage. Cannot move.' },
  unsiege: { id: 'unsiege', name: 'Mobile Mode', hotkey: 'D', target: 'none', desc: 'Return to mobile tank mode.' },
  phase: { id: 'phase', name: 'Phase Step', hotkey: 'B', target: 'point', range: 8, cooldown: 10, research: 'phasestep', desc: 'Teleport up to 8 range.' },
  spawnbrood: { id: 'spawnbrood', name: 'Spawn Brood', hotkey: 'V', target: 'unit', range: 1.5, energy: 25, desc: 'Target Brood Nest spawns 3 extra larva after 29 seconds.' },
  solarlance: { id: 'solarlance', name: 'Solar Lance', hotkey: 'Y', target: 'unit', range: 10, cooldown: 71, desc: 'Channel 2 seconds, then deal 240 damage to the target.' },
};

export const RACES: Record<Race, { name: string; tagline: string; worker: string; main: string; supply: string; gasBuilding: string; color: string; accent: string }> = {
  directorate: { name: 'Vanguard Directorate', tagline: 'Iron will. Steel hulls. Every inch paid in brass.', worker: 'rigger', main: 'bastion', supply: 'habitat', gasBuilding: 'extractor', color: '#6f8fb3', accent: '#ffb347' },
  kyrrh: { name: 'Kyrrh Swarm', tagline: 'The hive hungers. The hive grows. The hive endures.', worker: 'grub', main: 'nest', supply: 'drover', gasBuilding: 'siphon', color: '#8d4a86', accent: '#c8ff5a' },
  aethel: { name: 'Aethel Concord', tagline: 'We are the light that remembers the stars.', worker: 'acolyte', main: 'core', supply: 'obelisk', gasBuilding: 'tap', color: '#d9b45a', accent: '#5ef0ff' },
};

export const BUILD_MENUS: Record<Race, { basic: string[]; advanced: string[] }> = {
  directorate: { basic: ['bastion', 'habitat', 'extractor', 'musterhall', 'arsenal', 'turret'], advanced: ['foundry', 'skyport', 'fusionworks'] },
  kyrrh: { basic: ['nest', 'siphon', 'mire', 'mutagen', 'thorn'], advanced: ['warren', 'quillden', 'aerie', 'cavern', 'elderaerie'] },
  aethel: { basic: ['core', 'obelisk', 'tap', 'portal', 'crucible', 'spire'], advanced: ['resonance', 'makerforge', 'skyforge', 'archive'] },
};

export function researchCost(res: ResearchDef, level: number): Cost {
  if (!res.levels) return res.cost;
  return { m: res.cost.m + 50 * level, g: res.cost.g + 50 * level };
}
export function researchTime(res: ResearchDef, level: number): number {
  return res.levels ? res.time + 15 * level : res.time;
}

export const TIER_NAMES = ['', 'Tier 1', 'Tier 2', 'Tier 3'];

export const MINERAL_TRIP = 5;
export const GAS_TRIP = 4;
export const MINE_TIME = 2.8;
export const GAS_TIME = 1.4;
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const MAX_SUPPLY = 200;
