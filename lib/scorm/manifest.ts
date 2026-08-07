import { XMLParser } from "fast-xml-parser";

export interface ParsedScormManifest {
  version: "1.2" | "2004";
  title: string;
  identifier: string | null;
  launchHref: string;
}

// Minimal but real IMS manifest parsing — good enough for the standard
// Articulate/Captivate/iSpring output shape: a single <organization> with a
// tree of <item>s, each pointing at a <resource> (by identifierref) whose
// `href` is the file to launch. We take the first item's resource as the
// launch file, which covers the overwhelming majority of real-world SCORM
// packages (single-SCO courses). Multi-SCO packages will launch their first
// SCO only — a reasonable limitation to flag rather than silently guess at.
export function parseScormManifest(xml: string): ParsedScormManifest {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const manifest = doc.manifest;
  if (!manifest) throw new Error("imsmanifest.xml has no <manifest> root element");

  const schemaVersionRaw =
    manifest.metadata?.schemaversion ?? manifest["@_version"] ?? manifest.organizations?.["@_default"] ?? "";
  const schemaVersionText = String(schemaVersionRaw);
  const version: "1.2" | "2004" = schemaVersionText.includes("2004") ? "2004" : "1.2";

  const identifier: string | null = manifest["@_identifier"] ?? null;

  const organizations = manifest.organizations;
  const orgList = asArray(organizations?.organization);
  const org = orgList[0];
  if (!org) throw new Error("imsmanifest.xml has no <organization> defined");

  const items = asArray(org.item);
  const firstItem = findFirstItemWithResource(items);
  if (!firstItem) throw new Error("imsmanifest.xml has no launchable <item> with an identifierref");

  const title = String(firstItem.title ?? org.title ?? "SCORM Content");
  const identifierRef = firstItem["@_identifierref"];

  const resources = asArray(manifest.resources?.resource);
  const resource = resources.find((r) => r["@_identifier"] === identifierRef);
  if (!resource || !resource["@_href"]) {
    throw new Error("imsmanifest.xml: couldn't resolve the launch resource's href");
  }

  return { version, title, identifier, launchHref: String(resource["@_href"]) };
}

function findFirstItemWithResource(items: unknown[]): Record<string, unknown> | null {
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    if (item["@_identifierref"]) return item;
    const children = asArray(item.item);
    if (children.length > 0) {
      const found = findFirstItemWithResource(children);
      if (found) return found;
    }
  }
  return null;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
