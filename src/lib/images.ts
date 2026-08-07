import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export interface ImageDimensions {
  width: number;
  height: number;
}

const publicRoot = path.resolve(fileURLToPath(new URL("../../public/", import.meta.url)));
const metadataCache = new Map<string, Promise<ImageDimensions | undefined>>();

export const getPublicImageDimensions = (source: string) => {
  const cached = metadataCache.get(source);
  if (cached) return cached;

  const metadata = readImageDimensions(source);
  metadataCache.set(source, metadata);
  return metadata;
};

async function readImageDimensions(source: string): Promise<ImageDimensions | undefined> {
  if (!source.startsWith("/") || source.startsWith("//")) return undefined;

  const pathname = decodeURIComponent(source.split(/[?#]/, 1)[0]);
  const absolutePath = path.resolve(publicRoot, pathname.slice(1));
  const rootPrefix = `${publicRoot}${path.sep}`;

  if (!absolutePath.startsWith(rootPrefix)) return undefined;

  try {
    const { width, height } = await sharp(absolutePath).metadata();
    return width && height ? { width, height } : undefined;
  } catch {
    return undefined;
  }
}
