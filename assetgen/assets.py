"""Asset catalogue for AI generation: concept prompt per unit / building / resource.

Every asset is rendered as a single object on a plain background so the image-to-3D
step (TRELLIS) gets a clean silhouette. Team colour is requested as "bright blue
accent panels" so the Blender stage can hue-key it and recolour per player.
"""

STYLE = ("highly detailed 3D game asset render, single object, centered, full view, "
         "three-quarter front view from slightly above, plain pure white background, soft studio lighting, "
         "PBR materials, sharp focus, no text, no ground, no shadow, isolated")
NEG = ("character sheet, turnaround, multiple views, two figures, duplicate, collage, text, watermark, logo, multiple objects, cropped, cut off, blurry, lowres, background scenery, "
       "ground plane, shadow, frame, border, human face closeup, cartoon, sketch, 2d, flat")

RACE = {
    "directorate": "industrial military sci-fi, weathered steel and gunmetal armor plates, orange hazard stripes, glowing amber lights, bright blue accent panels",
    "kyrrh": "organic alien bio-creature, glossy dark purple chitin carapace, pink fleshy membranes, bone spikes, glowing lime green bioluminescent glands, bright blue accent markings",
    "aethel": "elegant alien high-tech, polished gold and ivory white armor, floating glowing cyan crystals, energy runes, bright blue accent panels",
}

# id: (race, kind, subject prompt)
ASSETS = {
    # ---------------------------------------------------------------- Directorate units
    "rigger": ("directorate", "unit", "small bipedal construction mech suit with a cockpit bubble, welding torch arm and claw arm, backpack tank"),
    "trooper": ("directorate", "unit", "armored space marine soldier in powered combat armor with a large assault rifle, bulky shoulder pads, glowing visor helmet"),
    "breacher": ("directorate", "unit", "heavy armored assault trooper in thick powered armor with a large grenade launcher cannon on the arm"),
    "mender": ("directorate", "unit", "field medic soldier in white armor with a green medical cross emblem and a healing beam emitter backpack"),
    "scorcher": ("directorate", "unit", "fast four-wheeled armored combat buggy with a roll cage and a flamethrower turret with fuel tanks"),
    "juggernaut": ("directorate", "unit", "heavy tracked battle tank with a large rotating turret and a long main cannon, side armor skirts"),
    "juggernaut_sieged": ("directorate", "unit", "heavy tank deployed in artillery siege mode with four stabilizer legs anchored into the ground and a raised long artillery cannon"),
    "wasp": ("directorate", "unit", "military gunship aircraft with two ducted fan rotors on the sides, missile pods and a glass cockpit"),
    "dreadnought": ("directorate", "unit", "massive capital battlecruiser starship with a long armored hull, command tower, gun turrets and three glowing engines"),
    "titan": ("directorate", "unit", "giant bipedal war mech walker with two huge shoulder-mounted twin cannons and heavy armored legs"),
    # ---------------------------------------------------------------- Directorate buildings
    "bastion": ("directorate", "building", "octagonal military command center base with a landing pad on top, corner towers and antenna"),
    "citadel": ("directorate", "building", "fortified octagonal command center with landing pad, gun towers and a radar dish"),
    "stronghold": ("directorate", "building", "massive fortress command center with a glowing reactor dome, four towers, shield emitters and landing pad"),
    "habitat": ("directorate", "building", "compact habitat supply module with three white domes on a steel platform"),
    "extractor": ("directorate", "building", "gas refinery extractor platform with pipes, storage tanks and a derrick over a glowing green vent"),
    "musterhall": ("directorate", "building", "military barracks hangar with an arched roof, large blast door and floodlights"),
    "arsenal": ("directorate", "building", "armory bunker with weapon racks, ammunition crates and a small crane"),
    "turret": ("directorate", "building", "defensive gun turret emplacement with twin cannons on a rotating armored base"),
    "foundry": ("directorate", "building", "vehicle factory building with smokestacks, gantry crane and a big garage door"),
    "skyport": ("directorate", "building", "starport airfield hangar with a landing runway, control tower and landing lights"),
    "fusionworks": ("directorate", "building", "fusion reactor facility with a glowing blue plasma core inside spinning metal rings and cooling pylons"),
    # ---------------------------------------------------------------- Kyrrh units
    "grub": ("kyrrh", "unit", "small six-legged alien worker beetle with mandibles and a segmented body"),
    "drover": ("kyrrh", "unit", "floating alien gasbag creature with a translucent veined sac and dangling tentacles"),
    "skitterling": ("kyrrh", "unit", "small fast four-legged alien predator with two scythe blade arms and a tail"),
    "carapid": ("kyrrh", "unit", "armored alien beetle with a heavy domed segmented shell and glowing acid glands at the mouth"),
    "quillback": ("kyrrh", "unit", "serpentine alien creature raised like a cobra with rows of long bone quill spines on its back"),
    "wyvern": ("kyrrh", "unit", "flying alien wyvern creature with membrane wings and a long tail, spread wings"),
    "behemoth": ("kyrrh", "unit", "gigantic four-legged armored alien beast with huge curved bone tusks and plated back"),
    "matron": ("kyrrh", "unit", "tall alien queen insect with a crown crest, four scythe arms and spider legs"),
    "gravemaw": ("kyrrh", "unit", "enormous floating alien sky whale creature with a gaping toothed maw and fins"),
    # ---------------------------------------------------------------- Kyrrh buildings
    "nest": ("kyrrh", "building", "alien hive mound structure with ribs, a central glowing maw and fleshy walls"),
    "sanctum": ("kyrrh", "building", "large alien hive with tall chitin spikes, bone ribs and a central glowing eye"),
    "throne": ("kyrrh", "building", "colossal alien hive throne with a crown of bone spires, violet glowing heart and massive ribs"),
    "siphon": ("kyrrh", "building", "organic alien gas extractor tube structure with tentacle roots over a glowing green vent"),
    "mire": ("kyrrh", "building", "organic spawning pool of green slime surrounded by bone ribs and bubbling"),
    "mutagen": ("kyrrh", "building", "cluster of pulsating fleshy alien egg pods with glowing core"),
    "warren": ("kyrrh", "building", "organic alien burrow mound with several dark tunnel holes"),
    "quillden": ("kyrrh", "building", "spiky alien den covered with long bone spines and a glowing eye"),
    "aerie": ("kyrrh", "building", "tall organic alien spire tower with membrane vanes and a glowing tip"),
    "elderaerie": ("kyrrh", "building", "towering twisted organic alien spire with many membrane wings and a violet glowing crown"),
    "cavern": ("kyrrh", "building", "huge alien bone arch cavern entrance with a glowing red interior"),
    "thorn": ("kyrrh", "building", "rooted alien defensive tentacle with a giant bone thorn spike on a fleshy base"),
    # ---------------------------------------------------------------- Aethel units
    "acolyte": ("aethel", "unit", "small floating golden probe drone with a cyan crystal core and an orbiting ring"),
    "vindicator": ("aethel", "unit", "golden armored alien warrior with two glowing cyan energy blades on its wrists and a crested helmet"),
    "seeker": ("aethel", "unit", "four-legged golden spider walker robot with a crystal core and a particle cannon"),
    "bulwark": ("aethel", "unit", "squat heavy four-legged golden walker tank with a glowing energy shield projector and twin cannons"),
    "strider": ("aethel", "unit", "tall three-legged golden tripod walker with a disc body and beam emitters"),
    "radiant": ("aethel", "unit", "triangular golden starship with a glowing cyan prism crystal in the center"),
    "empyrean": ("aethel", "unit", "large crescent shaped golden flagship starship studded with glowing cyan crystals"),
    "hierophant": ("aethel", "unit", "towering robed alien avatar in gold and ivory with a glowing halo and orbiting crystal shards"),
    # ---------------------------------------------------------------- Aethel buildings
    "core": ("aethel", "building", "golden octagonal temple platform with a large floating cyan crystal and rotating rings"),
    "radiantcore": ("aethel", "building", "grand golden temple platform with a large floating crystal, multiple rotating rings and smaller crystals"),
    "exaltedcore": ("aethel", "building", "majestic golden temple nexus with a huge floating crystal, glowing energy ring and radiant spires"),
    "obelisk": ("aethel", "building", "tall glowing cyan crystal obelisk pylon on a small golden pedestal with a floating ring"),
    "tap": ("aethel", "building", "golden dome gas extractor with a glowing green ring over a vent"),
    "portal": ("aethel", "building", "golden arch gateway with a shimmering cyan energy portal on a platform"),
    "resonance": ("aethel", "building", "golden platform with three orbiting cyan crystals around a central ivory pillar"),
    "crucible": ("aethel", "building", "golden forge basin with molten glowing metal and curved golden arms"),
    "spire": ("aethel", "building", "defensive golden spire tower topped with a large glowing cyan crystal"),
    "makerforge": ("aethel", "building", "golden robotics loom frame with glowing energy threads on a platform"),
    "skyforge": ("aethel", "building", "golden starship dock with two curved arms holding a ship on a platform"),
    "archive": ("aethel", "building", "floating golden pyramid and inverted violet crystal pyramid above a platform with an energy ring"),
    # ---------------------------------------------------------------- resources
    "mineral": ("neutral", "resource", "cluster of large glowing blue crystal shards growing from dark rock, sci-fi mineral field"),
    "geyser": ("neutral", "resource", "volcanic rock vent crater with glowing green gas, alien geyser"),
}
