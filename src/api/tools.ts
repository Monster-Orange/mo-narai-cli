import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ToolManifest } from "@michinarai/sdk";
import { bundleDigest, digestFiles } from "../lib/digest.js";
import { NaraiError } from "../lib/errors.js";
import { MANIFEST } from "../lib/project.js";
import { ok, type Registry } from "./client.js";
import type { components } from "../generated/api.js";

export type Publisher = components["schemas"]["PublisherOut"];

/** The organizations you can develop for, each with its publisher (slug null: none yet). A 404 here means tool
 *  development isn't open on this Narai. */
export async function publishers(api: Registry, host: string): Promise<Publisher[]> {
  const answer = await api.GET("/api/tools/publishers");
  if (answer.response.status === 404) throw new NaraiError(`tool development isn't open on ${host}`, "tools_unavailable");
  return (await ok(Promise.resolve(answer), "publishers")).publishers;
}

/** `publisher/name` of a manifest. */
export function idParts(manifest: ToolManifest): { publisher: string; name: string } {
  const [publisher = "", name = ""] = manifest.id.split("/");
  return { publisher, name };
}

/** The sealed release in `dir` (narai build), checked to be what's there now and what the manifest says now. */
export async function sealedRelease(root: string, dir: string, manifest: ToolManifest): Promise<ToolManifest & { files: NonNullable<ToolManifest["files"]>; bundle_digest: string }> {
  let release: ToolManifest;
  try {
    release = JSON.parse(await readFile(join(root, dir, MANIFEST), "utf8")) as ToolManifest;
  } catch {
    throw new NaraiError(`${dir}/${MANIFEST} isn't there: run narai build`, "not_built");
  }
  const files = await digestFiles(join(root, dir));
  const { files: _f, bundle_digest: _d, ...sealed } = release;
  const stale = JSON.stringify(files) !== JSON.stringify(release.files) || bundleDigest(files) !== release.bundle_digest
    || JSON.stringify(sealed) !== JSON.stringify(manifest);
  if (stale || !release.bundle_digest || !release.files) {
    throw new NaraiError(`${dir}/ or ${MANIFEST} changed since narai build: run it again`, "stale_build");
  }
  return release as ToolManifest & { files: NonNullable<ToolManifest["files"]>; bundle_digest: string };
}
