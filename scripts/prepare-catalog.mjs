import { copyFileSync, constants, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const target = fileURLToPath(
  new URL("../public/data/catalog.json", import.meta.url),
);
if (!existsSync(target))
  copyFileSync(
    fileURLToPath(new URL("../catalog.example.json", import.meta.url)),
    target,
    constants.COPYFILE_EXCL,
  );
