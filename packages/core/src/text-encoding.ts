const UTF8_BOM = "\uFEFF";

export function ensureUtf8Bom(content: string): string {
  return content.startsWith(UTF8_BOM) ? content : `${UTF8_BOM}${content}`;
}

export function stripUtf8Bom(content: string): string {
  return content.startsWith(UTF8_BOM) ? content.slice(1) : content;
}

export function hasUtf8BomPrefix(content: string | Buffer): boolean {
  if (typeof content === "string") {
    return content.startsWith(UTF8_BOM);
  }
  return content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf;
}
