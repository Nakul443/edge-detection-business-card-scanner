import sharp from 'sharp';

export type OcrImageVariant = {
  name: string;
  buffer: Buffer;
  pageSegmentationMode?: string;
};

export async function createBusinessCardOcrVariants(
  input: Buffer,
): Promise<OcrImageVariant[]> {
  const base = sharp(input).rotate();
  const metadata = await base.metadata();
  const width = metadata.width ?? 1800;
  const targetWidth = Math.min(Math.max(width, 1800), 2400);
  const detectedCard = await cropDetectedCard(input);
  const textRegions = await createTextRegionVariants(
    detectedCard ?? input,
    targetWidth,
  );

  const normalized = await base
    .clone()
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();

  const highContrast = await base
    .clone()
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .threshold(165)
    .sharpen()
    .png()
    .toBuffer();

  const croppedNormalized = detectedCard
    ? await sharp(detectedCard)
        .resize({ width: targetWidth, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer()
    : null;

  const croppedHighContrast = detectedCard
    ? await sharp(detectedCard)
        .resize({ width: targetWidth, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .threshold(165)
        .sharpen()
        .png()
        .toBuffer()
    : null;

  return [
    ...(croppedHighContrast
      ? [
          {
            name: 'detected-card-high-contrast',
            buffer: croppedHighContrast,
            pageSegmentationMode: '6',
          },
        ]
      : []),
    {
      name: 'high-contrast',
      buffer: highContrast,
      pageSegmentationMode: '6',
    },
    ...(croppedNormalized
      ? [
          {
            name: 'detected-card-normalized',
            buffer: croppedNormalized,
            pageSegmentationMode: '6',
          },
        ]
      : []),
    {
      name: 'normalized',
      buffer: normalized,
      pageSegmentationMode: '11',
    },
    ...textRegions,
    {
      name: 'original',
      pageSegmentationMode: '11',
      buffer: input,
    },
  ];
}

async function createTextRegionVariants(input: Buffer, targetWidth: number) {
  const normalized = sharp(input)
    .rotate()
    .resize({ width: targetWidth, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen();

  const { data, info } = await normalized
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const boxes = detectTextBoxes(data, info.width, info.height);
  const png = await normalized.png().toBuffer();
  const variants: OcrImageVariant[] = [];

  for (const [index, box] of boxes.entries()) {
    const paddingX = Math.max(10, Math.round(box.width * 0.08));
    const paddingY = Math.max(6, Math.round(box.height * 0.45));
    const left = Math.max(0, box.left - paddingX);
    const top = Math.max(0, box.top - paddingY);
    const right = Math.min(info.width, box.left + box.width + paddingX);
    const bottom = Math.min(info.height, box.top + box.height + paddingY);
    const width = right - left;
    const height = bottom - top;

    if (width < 40 || height < 12) continue;

    const buffer = await sharp(png)
      .extract({ left, top, width, height })
      .resize({ width: Math.max(width * 2, 320), withoutEnlargement: false })
      .threshold(170)
      .png()
      .toBuffer();

    variants.push({
      name: `text-region-${String(index + 1).padStart(2, '0')}`,
      buffer,
      pageSegmentationMode: '7',
    });
  }

  return variants;
}

type TextBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function detectTextBoxes(
  data: Buffer,
  width: number,
  height: number,
): TextBox[] {
  const mask = new Uint8Array(width * height);
  const darkThreshold = 178;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = data[y * width + x];
      mask[y * width + x] = value < darkThreshold ? 1 : 0;
    }
  }

  const dilated = dilateMask(mask, width, height, 18, 4);
  const boxes = findConnectedBoxes(dilated, width, height)
    .filter((box) => {
      const area = box.width * box.height;
      return (
        box.width >= 45 &&
        box.height >= 10 &&
        box.width <= width * 0.9 &&
        box.height <= height * 0.18 &&
        area >= 600
      );
    })
    .map((box) => tightenBox(mask, width, height, box))
    .filter((box) => box.width >= 30 && box.height >= 8);

  return mergeNearbyTextBoxes(boxes)
    .sort((left, right) =>
      Math.abs(left.top - right.top) > 16
        ? left.top - right.top
        : left.left - right.left,
    )
    .slice(0, 18);
}

function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusX: number,
  radiusY: number,
) {
  const output = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;

      for (let dy = -radiusY; dy <= radiusY; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;

        for (let dx = -radiusX; dx <= radiusX; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          output[yy * width + xx] = 1;
        }
      }
    }
  }

  return output;
}

function findConnectedBoxes(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(width * height);
  const boxes: TextBox[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;

      const queue = [start];
      seen[start] = 1;
      let left = x;
      let right = x;
      let top = y;
      let bottom = y;

      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        const cx = current % width;
        const cy = Math.floor(current / width);

        left = Math.min(left, cx);
        right = Math.max(right, cx);
        top = Math.min(top, cy);
        bottom = Math.max(bottom, cy);

        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (!mask[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }

      boxes.push({
        left,
        top,
        width: right - left + 1,
        height: bottom - top + 1,
      });
    }
  }

  return boxes;
}

function tightenBox(
  mask: Uint8Array,
  width: number,
  height: number,
  box: TextBox,
) {
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;

  for (let y = box.top; y < box.top + box.height; y += 1) {
    for (let x = box.left; x < box.left + box.width; x += 1) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (left > right || top > bottom) return box;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function mergeNearbyTextBoxes(boxes: TextBox[]) {
  const sorted = [...boxes].sort((left, right) => left.top - right.top);
  const merged: TextBox[] = [];

  for (const box of sorted) {
    const target = merged.find((candidate) => {
      const verticalOverlap =
        Math.min(candidate.top + candidate.height, box.top + box.height) -
        Math.max(candidate.top, box.top);
      const verticalRatio =
        verticalOverlap / Math.min(candidate.height, box.height);
      const gap =
        Math.max(candidate.left, box.left) -
        Math.min(candidate.left + candidate.width, box.left + box.width);
      return verticalRatio > 0.45 && gap < 90;
    });

    if (!target) {
      merged.push({ ...box });
      continue;
    }

    const left = Math.min(target.left, box.left);
    const top = Math.min(target.top, box.top);
    const right = Math.max(target.left + target.width, box.left + box.width);
    const bottom = Math.max(target.top + target.height, box.top + box.height);
    target.left = left;
    target.top = top;
    target.width = right - left;
    target.height = bottom - top;
  }

  return merged;
}

async function cropDetectedCard(input: Buffer) {
  const detectionWidth = 1000;
  const image = sharp(input).rotate();
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    return null;
  }

  const { data, info } = await image
    .clone()
    .resize({ width: detectionWidth, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const background = estimateBorderColor(
    data,
    info.width,
    info.height,
    info.channels,
  );
  const mask = createForegroundMask(
    data,
    info.width,
    info.height,
    info.channels,
    background,
  );
  const box = findForegroundBox(mask, info.width, info.height);

  if (!box) {
    return null;
  }

  const scaleX = metadata.width / info.width;
  const scaleY = metadata.height / info.height;
  const paddingX = Math.round((box.right - box.left) * 0.035);
  const paddingY = Math.round((box.bottom - box.top) * 0.06);
  const left = Math.max(0, Math.round((box.left - paddingX) * scaleX));
  const top = Math.max(0, Math.round((box.top - paddingY) * scaleY));
  const right = Math.min(
    metadata.width - 1,
    Math.round((box.right + paddingX) * scaleX),
  );
  const bottom = Math.min(
    metadata.height - 1,
    Math.round((box.bottom + paddingY) * scaleY),
  );
  const cropWidth = Math.max(0, right - left);
  const cropHeight = Math.max(0, bottom - top);

  if (
    left < 0 ||
    top < 0 ||
    left >= metadata.width ||
    top >= metadata.height ||
    cropWidth <= 0 ||
    cropHeight <= 0 ||
    left + cropWidth > metadata.width ||
    top + cropHeight > metadata.height ||
    cropWidth < metadata.width * 0.2 ||
    cropHeight < metadata.height * 0.12 ||
    cropWidth * cropHeight > metadata.width * metadata.height * 0.95
  ) {
    return null;
  }

  try {
    return await sharp(input)
      .rotate()
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

function estimateBorderColor(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
) {
  const samples: Array<[number, number, number]> = [];
  const border = Math.max(6, Math.round(Math.min(width, height) * 0.04));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x > border &&
        x < width - border &&
        y > border &&
        y < height - border
      ) {
        continue;
      }

      const index = (y * width + x) * channels;
      samples.push([data[index], data[index + 1], data[index + 2]]);
    }
  }

  return [
    median(samples.map((sample) => sample[0])),
    median(samples.map((sample) => sample[1])),
    median(samples.map((sample) => sample[2])),
  ] as const;
}

function createForegroundMask(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  background: readonly [number, number, number],
) {
  const mask = new Uint8Array(width * height);
  const threshold = 48;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const distance = Math.sqrt(
        (r - background[0]) ** 2 +
          (g - background[1]) ** 2 +
          (b - background[2]) ** 2,
      );
      mask[y * width + x] = distance > threshold ? 1 : 0;
    }
  }

  return mask;
}

function findForegroundBox(mask: Uint8Array, width: number, height: number) {
  const rowCounts = Array.from({ length: height }, () => 0);
  const colCounts = Array.from({ length: width }, () => 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      rowCounts[y] += 1;
      colCounts[x] += 1;
    }
  }

  const minRowCount = Math.max(8, Math.round(width * 0.08));
  const minColCount = Math.max(8, Math.round(height * 0.08));
  const top = firstIndex(rowCounts, (count) => count >= minRowCount);
  const bottom = lastIndex(rowCounts, (count) => count >= minRowCount);
  const left = firstIndex(colCounts, (count) => count >= minColCount);
  const right = lastIndex(colCounts, (count) => count >= minColCount);

  if (top === -1 || bottom === -1 || left === -1 || right === -1) {
    return null;
  }

  return { left, top, right, bottom };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function firstIndex<T>(values: T[], predicate: (value: T) => boolean) {
  return values.findIndex(predicate);
}

function lastIndex<T>(values: T[], predicate: (value: T) => boolean) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index])) return index;
  }
  return -1;
}
