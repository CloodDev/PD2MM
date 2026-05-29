import * as fs from "node:fs";

export type DetectedExtractedMod =
  | { kind: "beardlib"; destination: "mods" }
  | { kind: "map"; destination: "maps" }
  | { kind: "weapon"; destination: "mod_overrides"; moveContents: false }
  | { kind: "blt"; destination: "mods" }
  | { kind: "override-folder"; destination: "mod_overrides"; moveContents: true }
  | { kind: "override"; destination: "mod_overrides"; moveContents: false };

export const detectExtractedMod = (itemPath: string, itemName: string): DetectedExtractedMod | null => {
  if (fs.existsSync(`${itemPath}/main.xml`)) {
    var mainXmlContent = fs.readFileSync(`${itemPath}/main.xml`, "utf-8");
    if (mainXmlContent.includes("<level")) {
      return { kind: "map", destination: "maps" };
    }
    if (mainXmlContent.includes("<Weapon")) {
      return { kind: "weapon", destination: "mod_overrides", moveContents: false };
    }
    return { kind: "beardlib", destination: "mods" };
  }

  if (fs.existsSync(`${itemPath}/mod.txt`)) {
    return { kind: "blt", destination: "mods" };
  }

  if (itemName.toLowerCase() === "mod_overrides") {
    return { kind: "override-folder", destination: "mod_overrides", moveContents: true };
  }

  // Preserve the existing fallback behavior: any extracted folder without a mod.txt
  // is treated as mod_overrides content.
  return { kind: "override", destination: "mod_overrides", moveContents: false };
};
