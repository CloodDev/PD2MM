import * as fs from "node:fs";

export const detectExtractedMod = (itemPath: string, itemName: string): { kind: string; destination: string; moveContents?: boolean } | null => {
  if (fs.existsSync(`${itemPath}/main.xml`)) {
    var mainXmlContent = fs.readFileSync(`${itemPath}/main.xml`, "utf-8");
    if (mainXmlContent.includes("<level")) {
      return { kind: "map", destination: "Maps" };
    }
    if (mainXmlContent.includes("<Weapon")) {
      return { kind: "weapon", destination: "assets/mod_overrides", moveContents: false };
    }
    return { kind: "beardlib", destination: "mods" };
  }

  if (fs.existsSync(`${itemPath}/mod.txt`)) {
    return { kind: "blt", destination: "mods" };
  }

  if (itemName.toLowerCase() === "mod_overrides") {
    return { kind: "override", destination: "assets/mod_overrides", moveContents: true };
  }

  // Preserve the existing fallback behavior: any extracted folder without a mod.txt
  // is treated as mod_overrides content.
  return { kind: "override", destination: "assets/mod_overrides"};
};
