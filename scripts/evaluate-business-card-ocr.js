const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { recognize } = require('tesseract.js')

const projectRoot = path.resolve(__dirname, '..')
const datasetDir = path.join(projectRoot, 'datasets', 'business-cards')
const labelsPath = path.join(datasetDir, 'labels.csv')
const args = parseArgs(process.argv.slice(2))
const imagesDir = args.imageDir
  ? path.resolve(projectRoot, args.imageDir)
  : path.join(datasetDir, 'images')
const cachePath = path.join(datasetDir, '.ocr-cache.json')
const engine = args.engine ?? 'paddle'
const reportPath = path.join(datasetDir, `ocr-evaluation-report-${engine}.json`)
const parserPath = path.join(
  projectRoot,
  'apps',
  'api',
  'dist',
  'src',
  'extractions',
  'contact-text-parser.js',
)
const imageProcessorPath = path.join(
  projectRoot,
  'apps',
  'api',
  'dist',
  'src',
  'extractions',
  'business-card-image-processor.js',
)
const paddleBridgePath = path.join(projectRoot, 'scripts', 'paddle_ocr_bridge.py')

if (!fs.existsSync(parserPath) || !fs.existsSync(imageProcessorPath)) {
  console.error('Built parser not found. Run `npm --workspace apps/api run build` first.')
  process.exit(1)
}

const { parseBusinessCardText } = require(parserPath)
const { createBusinessCardOcrVariants } = require(imageProcessorPath)

const fields = ['full_name', 'designation', 'company', 'emails', 'phones', 'website', 'address']
const minOverallAccuracy = Number(
  args.min ?? process.env.OCR_MIN_OVERALL_ACCURACY ?? '0',
)
const failOnThreshold = Boolean(args.strict) || process.env.OCR_FAIL_ON_THRESHOLD === 'true'
const useCache = !args.noCache
const useReportOcr = Boolean(args.useReportOcr)
const supportedEngines = new Set(['tesseract', 'paddle'])
const paddleBatchSize = Number(args.paddleBatchSize ?? process.env.OCR_PADDLE_BATCH_SIZE ?? '5')
const paddleSideLen = Number(args.paddleSideLen ?? process.env.OCR_PADDLE_SIDE_LEN ?? '960')

if (!supportedEngines.has(engine)) {
  console.error(`Unsupported OCR engine "${engine}". Use one of: ${[...supportedEngines].join(', ')}`)
  process.exit(1)
}

if (!Number.isInteger(paddleBatchSize) || paddleBatchSize < 1) {
  console.error('Invalid Paddle batch size. Use --paddle-batch-size=1 or higher.')
  process.exit(1)
}

if (!Number.isInteger(paddleSideLen) || paddleSideLen < 320) {
  console.error('Invalid Paddle side length. Use --paddle-side-len=320 or higher.')
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function main() {
  const labels = readCsv(labelsPath).slice(0, args.limit ? Number(args.limit) : undefined)
  const cache = readCache()
  const reportOcr = useReportOcr ? readReportOcr() : {}
  const imagePaths = labels.map((label) => ({
    label,
    imagePath: resolveImagePath(imagesDir, label.image_file),
  }))
  const paddleTargets =
    engine === 'paddle'
      ? imagePaths.filter(({ label, imagePath }) => {
          const cacheKey = getCacheKey(imagePath)
          return !useCache || (!cache[cacheKey] && !reportOcr[label.image_file])
        })
      : []
  const paddleResults =
    engine === 'paddle' && paddleTargets.length > 0
      ? recognizePaddleTargets(paddleTargets, cache)
      : {}
  const results = []

  console.log('\nBusiness card OCR evaluation')
  console.log(`Engine: ${engine}`)
  console.log(`Dataset: ${labelsPath}`)
  console.log(`Cards: ${labels.length}`)
  console.log(`Running ${engine} OCR on labeled images...\n`)

  for (const [index, label] of labels.entries()) {
    const imagePath = imagePaths[index].imagePath
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Missing image for label row: ${label.image_file}`)
    }

    process.stdout.write(`[${index + 1}/${labels.length}] ${label.image_file} ... `)
    const startedAt = Date.now()
    const cacheKey = getCacheKey(imagePath)
    const cached = useReportOcr
      ? reportOcr[label.image_file]
      : useCache
        ? cache[cacheKey]
        : null
    const rawText =
      cached ??
      (engine === 'paddle'
        ? (paddleResults[label.image_file]?.rawText ?? '')
        : await recognizeBusinessCardImage(imagePath))
    if (!cached && useCache) {
      cache[cacheKey] = rawText
      writeCache(cache)
    }
    const predicted = parseBusinessCardText(rawText)
    const fieldResults = compareFields(label, predicted)
    const passed = fieldResults.filter((field) => field.pass).length
    const evaluated = fieldResults.length
    const rowAccuracy = evaluated === 0 ? 1 : passed / evaluated
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

    results.push({
      image_file: label.image_file,
      accuracy: rowAccuracy,
      passed,
      evaluated,
      fieldResults,
      predicted,
      rawText,
      ocrLines: engine === 'paddle' ? (paddleResults[label.image_file]?.lines ?? []) : undefined,
      notes: label.notes,
    })

    console.log(
      `${formatPercent(rowAccuracy)} (${passed}/${evaluated}) in ${elapsed}s${cached ? ' cached' : ''}`,
    )
  }

  const summary = summarize(results)
  printReport(results, summary)
  writeReportFiles(results, summary)

  if (failOnThreshold && summary.overallAccuracy < minOverallAccuracy) {
    console.error(
      `\nOCR accuracy ${formatPercent(summary.overallAccuracy)} is below threshold ${formatPercent(
        minOverallAccuracy,
      )}.`,
    )
    process.exit(1)
  }
}

function resolveImagePath(imageDir, imageFile) {
  const direct = path.join(imageDir, imageFile)
  if (fs.existsSync(direct)) return direct

  const stem = path.parse(imageFile).name
  for (const extension of ['.png', '.jpg', '.jpeg', '.webp']) {
    const candidate = path.join(imageDir, `${stem}${extension}`)
    if (fs.existsSync(candidate)) return candidate
  }

  return direct
}

function getCacheKey(imagePath) {
  const imageStat = fs.statSync(imagePath)
  const processorStat = fs.statSync(imageProcessorPath)
  const bridgeStat =
    engine === 'paddle' && fs.existsSync(paddleBridgePath)
      ? fs.statSync(paddleBridgePath)
      : null
  return [
    engine,
    path.basename(imagePath),
    imageStat.size,
    Math.round(imageStat.mtimeMs),
    processorStat.size,
    Math.round(processorStat.mtimeMs),
    bridgeStat?.size ?? 0,
    Math.round(bridgeStat?.mtimeMs ?? 0),
  ].join(':')
}

function recognizePaddleTargets(targets, cache) {
  const results = {}
  const chunks = chunk(targets, paddleBatchSize)

  for (const [index, targetsChunk] of chunks.entries()) {
    console.log(
      `Paddle OCR batch ${index + 1}/${chunks.length}: ${targetsChunk
        .map((target) => target.label.image_file)
        .join(', ')}`,
    )
    const chunkResults = recognizeImagesWithPaddle(targetsChunk.map((target) => target.imagePath))
    Object.assign(results, chunkResults)

    if (useCache) {
      for (const target of targetsChunk) {
        const rawText = chunkResults[target.label.image_file]?.rawText
        if (typeof rawText === 'string') {
          cache[getCacheKey(target.imagePath)] = rawText
        }
      }
      writeCache(cache)
    }
  }

  return results
}

function recognizeImagesWithPaddle(imagePaths) {
  const outputPath = path.join(datasetDir, `.paddle-ocr-${Date.now()}.json`)

  try {
    execFileSync(
      'python',
      [paddleBridgePath, '--output', outputPath, '--side-len', String(paddleSideLen), ...imagePaths],
      {
      cwd: projectRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: {
        ...process.env,
        PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT: '0',
        PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
      },
      maxBuffer: 1024 * 1024 * 20,
      },
    )

    return JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  } finally {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath)
    }
  }
}

function chunk(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function readCache() {
  if (!fs.existsSync(cachePath)) return {}

  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  } catch {
    return {}
  }
}

function writeCache(cache) {
  fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8')
}

async function recognizeBusinessCardImage(imagePath) {
  const image = fs.readFileSync(imagePath)
  const variants = await createBusinessCardOcrVariants(image)
  const texts = []

  for (const variant of variants) {
    const ocr = await recognize(variant.buffer, 'eng', {
      tessedit_pageseg_mode: variant.pageSegmentationMode,
    })
    texts.push(`--- ${variant.name} ---\n${ocr.data.text.trim()}`)
  }

  return texts.join('\n\n')
}

function compareFields(label, predicted) {
  return fields
    .map((field) => {
      const expected = label[field]?.trim() ?? ''
      if (!expected) return null

      const actual = valueForField(field, predicted)
      const pass = fieldMatches(field, expected, actual)

      return {
        field,
        pass,
        expected,
        actual,
      }
    })
    .filter(Boolean)
}

function valueForField(field, predicted) {
  if (field === 'full_name') return predicted.fullName ?? ''
  if (field === 'designation') return predicted.designation ?? ''
  if (field === 'company') return predicted.company ?? ''
  if (field === 'emails') return (predicted.emails ?? []).join(';')
  if (field === 'phones') return (predicted.phones ?? []).map((phone) => phone.number).join(';')
  if (field === 'website') return predicted.website ?? ''
  if (field === 'address') return predicted.address ?? ''
  return ''
}

function fieldMatches(field, expected, actual) {
  if (field === 'emails') {
    return hasAnyIntersection(splitValues(expected).map(normalizeEmail), splitValues(actual).map(normalizeEmail))
  }

  if (field === 'phones') {
    return hasAnyIntersection(splitValues(expected).map(normalizePhone), splitValues(actual).map(normalizePhone))
  }

  if (field === 'website') {
    return normalizeWebsite(expected) === normalizeWebsite(actual)
  }

  if (field === 'full_name') {
    return splitValues(expected).some((name) => fuzzyTextMatch(name, actual, 0.72))
  }

  if (field === 'address') {
    return fuzzyTextMatch(expected, actual, 0.45)
  }

  return fuzzyTextMatch(expected, actual, 0.6)
}

function fuzzyTextMatch(expected, actual, threshold) {
  const expectedTokens = tokenize(expected)
  const actualTokens = tokenize(actual)
  if (expectedTokens.length === 0 || actualTokens.length === 0) return false

  const matched = expectedTokens.filter((token) =>
    actualTokens.some((actualToken) => tokenSimilar(token, actualToken)),
  ).length
  return matched / expectedTokens.length >= threshold
}

function tokenSimilar(expected, actual) {
  if (expected === actual) return true
  if (expected.length <= 3 || actual.length <= 3) return false
  if (expected.includes(actual) || actual.includes(expected)) return true

  const maxLength = Math.max(expected.length, actual.length)
  const distance = levenshtein(expected, actual)
  return 1 - distance / maxLength >= 0.78
}

function levenshtein(left, right) {
  const dp = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  )

  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
    }
  }

  return dp[left.length][right.length]
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 1)
}

function splitValues(value) {
  return value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

function hasAnyIntersection(left, right) {
  const rightSet = new Set(right.filter(Boolean))
  return left.some((value) => rightSet.has(value))
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeWebsite(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')

  return normalized
}

function summarize(results) {
  const fieldSummary = new Map()
  let passed = 0
  let evaluated = 0

  for (const result of results) {
    for (const fieldResult of result.fieldResults) {
      const current = fieldSummary.get(fieldResult.field) ?? { passed: 0, evaluated: 0 }
      current.evaluated += 1
      evaluated += 1

      if (fieldResult.pass) {
        current.passed += 1
        passed += 1
      }

      fieldSummary.set(fieldResult.field, current)
    }
  }

  return {
    passed,
    evaluated,
    overallAccuracy: evaluated === 0 ? 1 : passed / evaluated,
    fields: Object.fromEntries(
      [...fieldSummary.entries()].map(([field, value]) => [
        field,
        {
          ...value,
          accuracy: value.evaluated === 0 ? 1 : value.passed / value.evaluated,
        },
      ]),
    ),
  }
}

function printReport(results, summary) {
  console.log('\nOCR accuracy report')
  console.log('='.repeat(72))
  console.log(
    `Overall: ${formatPercent(summary.overallAccuracy)} (${summary.passed}/${summary.evaluated} evaluated fields)`,
  )
  console.log('\nBy field:')

  for (const field of fields) {
    const fieldSummary = summary.fields[field]
    if (!fieldSummary) continue
    console.log(
      `  ${field.padEnd(12)} ${formatPercent(fieldSummary.accuracy).padStart(7)}  (${fieldSummary.passed}/${fieldSummary.evaluated})`,
    )
  }

  console.log('\nCards needing attention:')
  const failedRows = results.filter((result) => result.fieldResults.some((field) => !field.pass))
  if (failedRows.length === 0) {
    console.log('  None')
  } else {
    for (const result of failedRows) {
      const failedFields = result.fieldResults.filter((field) => !field.pass)
      console.log(`\n  ${result.image_file}  ${formatPercent(result.accuracy)} (${result.passed}/${result.evaluated})`)
      for (const failed of failedFields) {
        console.log(`    - ${failed.field}`)
        console.log(`      expected: ${clip(failed.expected)}`)
        console.log(`      actual:   ${clip(failed.actual)}`)
      }
      if (result.notes) {
        console.log(`      notes:    ${result.notes}`)
      }
    }
  }

  console.log('\nThreshold mode:')
  console.log(`  OCR_MIN_OVERALL_ACCURACY=${minOverallAccuracy}`)
  console.log(`  OCR_FAIL_ON_THRESHOLD=${failOnThreshold}`)
}

function writeReportFiles(results, summary) {
  const report = {
    generatedAt: new Date().toISOString(),
    engine,
    dataset: labelsPath,
    imagesDir,
    summary,
    results,
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\nSaved JSON report: ${reportPath}`)
}

function readReportOcr() {
  if (!fs.existsSync(reportPath)) {
    throw new Error(`No previous OCR report found at ${reportPath}`)
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  return Object.fromEntries(
    report.results.map((result) => [result.image_file, result.rawText]),
  )
}

function formatPercent(value) {
  return `${Math.round(value * 1000) / 10}%`
}

function clip(value) {
  const text = String(value ?? '')
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const rows = parseCsv(text)
  const [headers, ...records] = rows

  const malformedRowIndex = records.findIndex((record) => record.length !== headers.length)
  if (malformedRowIndex !== -1) {
    throw new Error(
      `Malformed CSV row ${malformedRowIndex + 2}: expected ${headers.length} columns but found ${records[malformedRowIndex].length}`,
    )
  }

  return records
    .filter((record) => record.some((cell) => cell.trim()))
    .map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])),
    )
}

function parseArgs(values) {
  return values.reduce((current, value) => {
    if (value === '--strict') {
      current.strict = true
      return current
    }

    if (value === '--no-cache') {
      current.noCache = true
      return current
    }

    if (value === '--use-report-ocr') {
      current.useReportOcr = true
      return current
    }

    if (value.startsWith('--min=')) {
      current.min = value.slice('--min='.length)
    }

    if (value.startsWith('--image-dir=')) {
      current.imageDir = value.slice('--image-dir='.length)
    }

    if (value.startsWith('--engine=')) {
      current.engine = value.slice('--engine='.length)
    }

    if (value.startsWith('--limit=')) {
      current.limit = value.slice('--limit='.length)
    }

    if (value.startsWith('--paddle-batch-size=')) {
      current.paddleBatchSize = value.slice('--paddle-batch-size='.length)
    }

    if (value.startsWith('--paddle-side-len=')) {
      current.paddleSideLen = value.slice('--paddle-side-len='.length)
    }

    return current
  }, {})
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}
