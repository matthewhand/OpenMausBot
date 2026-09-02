/** Turn a harness screenshot payload into an <img src>. Cloud frames are
 *  raw base64; Local VM frames are already `data:` URLs. */
export function frameSrc(image: string | null | undefined, mime = "image/png"): string | null {
  if (!image) return null;
  if (image.startsWith("data:")) return image;
  return `data:${mime};base64,${image}`;
}
