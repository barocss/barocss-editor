import { mkdir, writeFile } from "node:fs/promises";
import { database } from "../src/database/index.ts";
const output = new URL("../data/formula-game.json", import.meta.url);
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  output,
  JSON.stringify(database.exportSnapshot(), null, 2) + "\n",
);
console.log(`Static database exported: ${output.pathname}`);
