import * as fs from "node:fs";

const knownModFolders = [
  "anims", "core", "effects", "environments", "fonts", "gamedata",
  "guis", "lib", "movies", "physic_effects", "settings", "shaders",
  "soundbanks", "strings", "units",
];

export const detectExtractedMod = (
  itemPath: string,
  itemName: string
): { kind: string; destination: string; moveContents?: boolean } | null => {
  if (itemName === "mod_overrides") {
    return { kind: "override-folder", destination: "mod_overrides", moveContents: true };
  }

  if (fs.existsSync(`${itemPath}/mod.txt`)) {
    return { kind: "blt", destination: "mods" };
  }

  if (fs.existsSync(`${itemPath}/main.xml`)) {
    const content = fs.readFileSync(`${itemPath}/main.xml`, "utf-8");
    if (content.includes("<level")) {
      return { kind: "map", destination: "maps" };
    } else if (content.includes("<Weapon")) {
      return { kind: "weapon", destination: "mod_overrides", moveContents: false };
    }
  }

  if (fs.existsSync(`${itemPath}/add.xml`) || fs.existsSync(`${itemPath}/supermod.xml`)) {
    return { kind: "weapon", destination: "mod_overrides", moveContents: false };
  }

  for (const folder of knownModFolders) {
    if (fs.existsSync(`${itemPath}/${folder}`)) {
      return { kind: "override-folder", destination: "mod_overrides", moveContents: true };
    }
  }

  return { kind: "override", destination: "mod_overrides", moveContents: false };
};
