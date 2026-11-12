import JSZip from "jszip";
import { ScormPackages } from "@/lib/queries";
import { saveFile } from "@/lib/storage";
import { parseScormManifest, type ParsedScormManifest } from "@/lib/scorm/manifest";

// Shared by the manual SCORM upload (lib/actions/scorm.ts) and the AI
// generator (lib/aiModuleBuild.ts): read a SCORM .zip, validate it has a
// parseable manifest, and — once the owning module row exists — extract
// every file into storage and record the package. Split in two so the
// caller can fail on a bad zip *before* creating a module row.
export interface ReadScormZip {
  zip: JSZip;
  manifestDir: string;
  parsed: ParsedScormManifest;
}

export async function readScormZip(zipBuffer: Buffer): Promise<ReadScormZip> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const manifestEntry = zip.file(/imsmanifest\.xml$/i)[0];
  if (!manifestEntry) {
    throw new Error("This doesn't look like a SCORM package — no imsmanifest.xml was found in the .zip.");
  }
  const parsed = parseScormManifest(await manifestEntry.async("string"));
  // The manifest may live in a subfolder inside the zip (some export tools
  // wrap the package in an extra folder) — every other path resolves
  // relative to wherever imsmanifest.xml actually sits.
  const manifestDir = manifestEntry.name.includes("/") ? manifestEntry.name.slice(0, manifestEntry.name.lastIndexOf("/") + 1) : "";
  return { zip, manifestDir, parsed };
}

export async function storeScormPackage(input: {
  read: ReadScormZip;
  moduleId: string;
  academyId: string;
  fallbackTitle: string;
}): Promise<void> {
  const { zip, manifestDir, parsed } = input.read;
  const storagePrefix = `scorm/${input.moduleId}`;
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const entry of entries) {
    const buffer = await entry.async("nodebuffer");
    // Store paths relative to the manifest directory so launch_path (also
    // manifest-relative) resolves directly against storagePrefix.
    const relativePath = entry.name.startsWith(manifestDir) ? entry.name.slice(manifestDir.length) : entry.name;
    if (!relativePath) continue;
    await saveFile(`${storagePrefix}/${relativePath}`, buffer);
  }
  await ScormPackages.create({
    module_id: input.moduleId,
    academy_id: input.academyId,
    version: parsed.version,
    title: parsed.title || input.fallbackTitle,
    launch_path: parsed.launchHref,
    storage_prefix: storagePrefix,
    manifest_identifier: parsed.identifier,
  });
}
