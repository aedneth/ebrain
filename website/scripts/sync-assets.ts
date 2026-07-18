import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE = fileURLToPath(new URL("../", import.meta.url));
const ROOT = join(WEBSITE, "..");
const target = join(WEBSITE, "public");
const iconSource = join(WEBSITE, "node_modules", "lucide-static", "icons");
const brandIconSource = join(WEBSITE, "node_modules", "simple-icons", "icons");

const sourceAssets = ["ebrain-wordmark.svg", "ebrain-tui-demo.svg"];
const icons = ["search.svg", "arrow-right.svg", "external-link.svg", "menu.svg", "x.svg"];

await mkdir(join(target, "assets"), { recursive: true });
await mkdir(join(target, "icons"), { recursive: true });
for (const asset of sourceAssets) await cp(join(ROOT, "assets", asset), join(target, "assets", asset));
for (const icon of icons) await cp(join(iconSource, icon), join(target, "icons", icon));
for (const icon of ["github.svg", "x.svg"]) await cp(join(brandIconSource, icon), join(target, "icons", icon));
