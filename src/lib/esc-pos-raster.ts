/**
 * ESC/POS raster helpers for Ethiopic text.
 *
 * Thermal printers carry no Ethiopic glyphs in their code pages, so Amharic can
 * only reach the paper as a bitmap. Rather than turning a whole ticket into one
 * large image, each Ethiopic line is drawn on its own and cropped to the ink it
 * needs: English text keeps native ESC/POS text mode, which is far faster over
 * Bluetooth. Rendered lines are cached because kitchen preferences repeat.
 */

export const PAPER_DOTS = {
  "58mm": 384,
  "80mm": 576,
} as const;

/** Ethiopic-first stack: readability at 203 dpi matters more than ASCII metrics. */
const RASTER_FONT_STACK =
  '"Noto Sans Ethiopic", "Abyssinica SIL", Nyala, "Courier New", sans-serif';

/** Anything lighter than this becomes a white dot. */
const INK_THRESHOLD = 170;
/** Line box height relative to font size, leaving room for descenders. */
const LINE_BOX = 1.34;
const CACHE_LIMIT = 240;

export type RasterLineOptions = {
  /** Target height in pixels; one pixel is one printer dot at 203 dpi. */
  size: number;
  /** Shrink towards this size before wrapping. Omit to wrap at `size`. */
  minSize?: number;
  bold?: boolean;
  /** Dots available for the whole line, indent included. */
  maxWidth: number;
  /** Blank dots kept at the left so child lines sit under their item. */
  indentDots?: number;
  align?: "left" | "center";
  /**
   * Optional right-edge label (e.g. clock). Drawn flush-right so Ethiopic
   * table names cannot shove the time off the paper.
   */
  rightText?: string;
};

export function containsNonAscii(text: string) {
  return /[\u0080-\uffff]/.test(text);
}

type CanvasLike = {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2D | null;
};

function createCanvas(width: number, height: number): CanvasLike | null {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height) as unknown as CanvasLike;
  }
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function fontSpec(size: number, bold?: boolean) {
  return `${bold ? 600 : 400} ${size}px ${RASTER_FONT_STACK}`;
}

/** Google Fonts loads lazily, so the Ethiopic face must be ready before drawing. */
async function ensureEthiopicFont(size: number, bold?: boolean) {
  if (typeof document === "undefined") return;
  const fonts = document.fonts;
  if (!fonts?.load) return;
  try {
    await fonts.load(fontSpec(size, bold), "ኩሽና");
    await fonts.ready;
  } catch {
    // A missing webfont only degrades glyph quality; keep printing.
  }
}

function wrapToWidth(
  measure: (value: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  if (measure(text) <= maxWidth) return [text];
  const rows: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) rows.push(current);
    // A single word wider than the paper is split by character.
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }
    let part = "";
    for (const char of word) {
      if (measure(part + char) > maxWidth && part) {
        rows.push(part);
        part = char;
        continue;
      }
      part += char;
    }
    current = part;
  }
  if (current) rows.push(current);
  return rows.length > 0 ? rows : [text];
}

/** GS v 0: m=0, xL/xH = bytes per row, yL/yH = row count. */
function rasterCommand(data: Uint8Array, bytesPerRow: number, rows: number) {
  const command = new Uint8Array(8 + data.length);
  command.set(
    [
      0x1d,
      0x76,
      0x30,
      0x00,
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,
      rows & 0xff,
      (rows >> 8) & 0xff,
    ],
    0,
  );
  command.set(data, 8);
  return command;
}

/**
 * Draws one or two strings into a strip and packs it to 1-bit. Unused paper on
 * the right is cropped unless a right-edge label is present — then the full
 * printable width is kept so the clock stays where it was drawn.
 */
function rasterizeSegment(
  text: string,
  options: {
    size: number;
    bold?: boolean;
    left: number;
    width: number;
    rightText?: string;
    /** Keep the full canvas width (centered titles / split meta rows). */
    keepWidth?: boolean;
  },
) {
  const height = Math.ceil(options.size * LINE_BOX);
  const canvasWidth = Math.ceil(options.width / 8) * 8;
  const canvas = createCanvas(canvasWidth, height);
  const ctx = canvas?.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvasWidth, height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  ctx.font = fontSpec(options.size, options.bold);
  const y = Math.floor((height - options.size) / 2);
  ctx.fillText(text, options.left, y);
  if (options.rightText) {
    const rightWidth = ctx.measureText(options.rightText).width;
    ctx.fillText(options.rightText, Math.max(0, canvasWidth - rightWidth - 2), y);
  }

  const pixels = ctx.getImageData(0, 0, canvasWidth, height).data;
  const ink = new Uint8Array(canvasWidth * height);
  let lastColumn = -1;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < canvasWidth; column += 1) {
      const offset = (row * canvasWidth + column) * 4;
      const alpha = pixels[offset + 3];
      const luminance =
        alpha === 0
          ? 255
          : 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
      if (luminance < INK_THRESHOLD) {
        ink[row * canvasWidth + column] = 1;
        if (column > lastColumn) lastColumn = column;
      }
    }
  }
  if (lastColumn < 0) return null;

  // Keep the full strip when a right label or centered title is present —
  // right-cropping would throw centered text off to the left of the ticket.
  const croppedWidth =
    options.rightText || options.keepWidth
      ? canvasWidth
      : Math.min(canvasWidth, ((lastColumn >> 3) + 1) << 3);
  const bytesPerRow = croppedWidth >> 3;
  const data = new Uint8Array(bytesPerRow * height);
  for (let row = 0; row < height; row += 1) {
    const source = row * canvasWidth;
    const target = row * bytesPerRow;
    for (let column = 0; column < croppedWidth; column += 1) {
      if (ink[source + column]) {
        data[target + (column >> 3)] |= 0x80 >> (column & 7);
      }
    }
  }
  return rasterCommand(data, bytesPerRow, height);
}

const lineCache = new Map<string, Uint8Array[]>();

function cacheKey(text: string, options: RasterLineOptions) {
  return [
    text,
    options.rightText ?? "",
    options.size,
    options.minSize ?? options.size,
    options.bold ? 1 : 0,
    options.maxWidth,
    options.indentDots ?? 0,
    options.align ?? "left",
  ].join("|");
}

function remember(key: string, commands: Uint8Array[]) {
  if (lineCache.size >= CACHE_LIMIT) {
    const oldest = lineCache.keys().next().value;
    if (oldest !== undefined) lineCache.delete(oldest);
  }
  lineCache.set(key, commands);
}

/**
 * Renders a single Ethiopic line as one ESC/POS bitmap per printed row, or
 * `null` when no canvas is available so callers can fall back to text mode.
 */
export async function renderEthiopicLine(
  text: string,
  options: RasterLineOptions,
): Promise<Uint8Array[] | null> {
  const key = cacheKey(text, options);
  const cached = lineCache.get(key);
  if (cached) return cached;

  const measureCtx = createCanvas(8, 8)?.getContext("2d");
  if (!measureCtx) return null;

  const indent = options.indentDots ?? 0;
  const available = options.maxWidth - indent;
  if (available <= 0) return null;

  const body = text.trim();
  if (!body && !options.rightText) return [];

  await ensureEthiopicFont(options.size, options.bold);
  const measure = (value: string) => measureCtx.measureText(value).width;

  // Shrink towards minSize first; preferences pass no minSize so they wrap
  // instead of becoming unreadable.
  let size = options.size;
  const floorSize = Math.min(options.minSize ?? options.size, options.size);
  measureCtx.font = fontSpec(size, options.bold);
  const rightReserve = options.rightText
    ? Math.ceil(measure(options.rightText)) + 12
    : 0;
  const leftBudget = Math.max(24, available - rightReserve);
  while (size > floorSize && body && measure(body) > leftBudget) {
    size -= 2;
    measureCtx.font = fontSpec(size, options.bold);
  }
  if (size !== options.size) await ensureEthiopicFont(size, options.bold);

  const commands: Uint8Array[] = [];
  if (options.rightText) {
    // Table + clock: left text wraps under itself; clock stays on the first row.
    const segments = body ? wrapToWidth(measure, body, leftBudget) : [""];
    segments.forEach((segment, index) => {
      const command = rasterizeSegment(segment, {
        size,
        bold: options.bold,
        left: indent,
        width: options.maxWidth,
        rightText: index === 0 ? options.rightText : undefined,
      });
      if (command) commands.push(command);
    });
  } else {
    for (const segment of wrapToWidth(measure, body, available)) {
      const inkWidth = Math.min(available, Math.ceil(measure(segment)) + 2);
      const centered = options.align === "center";
      // Wrapped rows keep the parent indentation so they stay visually attached.
      const left = centered
        ? indent + Math.max(0, Math.floor((available - inkWidth) / 2))
        : indent;
      const command = rasterizeSegment(segment, {
        size,
        bold: options.bold,
        left,
        // Centered titles must span the full paper; a cropped strip prints left-biased.
        width: centered ? options.maxWidth : left + inkWidth,
        keepWidth: centered,
      });
      if (command) commands.push(command);
    }
  }
  remember(key, commands);
  return commands;
}
