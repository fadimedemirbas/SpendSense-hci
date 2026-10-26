import { readFile, mkdir, writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
// Render the existing Figma Make SVG identity, with no substitute illustration.
const source = await readFile(new URL("../public/icon.svg", import.meta.url), "utf8");
const output = new URL("../public/icons/", import.meta.url);
await mkdir(output, { recursive: true });
for (const [name, size, inset] of [
  ["pwa-192.png", 192, 0],
  ["pwa-512.png", 512, 0],
  ["pwa-maskable-512.png", 512, 80],
  ["apple-touch-icon.png", 180, 0],
]) {
  const inner = source.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#fff6ec"/><svg x="${inset}" y="${inset}" width="${size - 2 * inset}" height="${size - 2 * inset}" viewBox="0 0 40 40">${inner}</svg></svg>`;
  await writeFile(new URL(name, output), new Resvg(svg).render().asPng());
}
