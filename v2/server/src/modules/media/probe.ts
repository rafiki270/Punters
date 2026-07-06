import { spawn } from 'node:child_process'

/**
 * Best-effort video probing via `ffprobe`/`ffmpeg` on PATH. Neither binary is guaranteed
 * to be present (this container doesn't ship them) — every function here degrades to
 * `null` rather than throwing, so the upload pipeline never fails because probing failed.
 */

function run(bin: string, args: string[]): Promise<{ stdout: Buffer; code: number | null }> {
  return new Promise((resolve, reject) => {
    let proc
    try {
      proc = spawn(bin, args)
    } catch (err) {
      reject(err)
      return
    }
    const chunks: Buffer[] = []
    proc.stdout?.on('data', (d: Buffer) => chunks.push(d))
    proc.stderr?.resume() // drain, we don't care about stderr content
    proc.once('error', reject) // ENOENT when the binary isn't on PATH
    proc.once('close', (code) => resolve({ stdout: Buffer.concat(chunks), code }))
  })
}

export interface VideoProbeResult {
  durationSec: number | null
  width: number | null
  height: number | null
}

/** Returns null if ffprobe is missing, errors, or its output can't be parsed. */
export async function probeVideo(filePath: string): Promise<VideoProbeResult | null> {
  try {
    const { stdout, code } = await run('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_entries', 'format=duration:stream=width,height',
      '-select_streams', 'v:0',
      filePath,
    ])
    if (code !== 0) return null
    const parsed = JSON.parse(stdout.toString('utf8')) as {
      format?: { duration?: string }
      streams?: { width?: number; height?: number }[]
    }
    const durationRaw = parsed.format?.duration
    const durationSec = durationRaw !== undefined ? Number(durationRaw) : null
    const stream = parsed.streams?.[0]
    return {
      durationSec: durationSec !== null && Number.isFinite(durationSec) ? durationSec : null,
      width: stream?.width ?? null,
      height: stream?.height ?? null,
    }
  } catch {
    return null
  }
}

/** Extracts a single poster frame (~1s in) as a PNG buffer. Returns null on any failure. */
export async function extractPosterFrame(filePath: string): Promise<Buffer | null> {
  try {
    const { stdout, code } = await run('ffmpeg', [
      '-y',
      '-ss', '1',
      '-i', filePath,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      'pipe:1',
    ])
    if (code !== 0 || stdout.length === 0) return null
    return stdout
  } catch {
    return null
  }
}
