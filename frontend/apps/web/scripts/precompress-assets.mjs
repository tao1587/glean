import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

const rootDir = path.resolve(process.cwd(), 'dist', 'assets')
const minBytes = 1024
const extensions = new Set(['.js', '.css', '.svg', '.json', '.txt'])

async function walk(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const results = await Promise.all(
    dirents.map(async (dirent) => {
      const fullPath = path.join(dir, dirent.name)
      if (dirent.isDirectory()) return walk(fullPath)
      return [fullPath]
    })
  )
  return results.flat()
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function shouldCompress(filePath, size) {
  if (size < minBytes) return false
  if (filePath.endsWith('.gz') || filePath.endsWith('.br')) return false
  return extensions.has(path.extname(filePath))
}

async function compressOne(filePath) {
  const stat = await fs.stat(filePath)
  if (!shouldCompress(filePath, stat.size)) return null

  const source = await fs.readFile(filePath)
  const gzip = zlib.gzipSync(source, { level: 9 })
  const brotli = zlib.brotliCompressSync(source, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    },
  })

  const gzipPath = `${filePath}.gz`
  const brotliPath = `${filePath}.br`

  await fs.writeFile(gzipPath, gzip)
  await fs.writeFile(brotliPath, brotli)

  return {
    filePath,
    raw: stat.size,
    gzip: gzip.length,
    brotli: brotli.length,
  }
}

async function main() {
  const exists = await fileExists(rootDir)
  if (!exists) {
    console.log(`[compress-assets] skip: ${rootDir} not found`)
    return
  }

  const files = await walk(rootDir)
  const compressed = []
  const failedFiles = []

  for (const filePath of files) {
    try {
      const result = await compressOne(filePath)
      if (result) compressed.push(result)
    } catch (error) {
      failedFiles.push({ filePath, error })
    }
  }

  const totalRaw = compressed.reduce((sum, item) => sum + item.raw, 0)
  const totalGzip = compressed.reduce((sum, item) => sum + item.gzip, 0)
  const totalBrotli = compressed.reduce((sum, item) => sum + item.brotli, 0)

  console.log(
    `[compress-assets] files=${compressed.length} raw=${(totalRaw / 1024).toFixed(1)}KB gzip=${(
      totalGzip / 1024
    ).toFixed(1)}KB br=${(totalBrotli / 1024).toFixed(1)}KB`
  )

  if (failedFiles.length > 0) {
    console.error(`\n[compress-assets] ERROR: Failed to compress ${failedFiles.length} file(s):`)
    for (const { filePath, error } of failedFiles) {
      const relativePath = path.relative(process.cwd(), filePath)
      console.error(`  - ${relativePath}: ${error.message || error}`)
    }
    throw new Error(`Asset compression failed for ${failedFiles.length} file(s).`)
  }
}

main().catch((error) => {
  console.error('[compress-assets] failed:', error)
  process.exitCode = 1
})
