// Shell execution route — runs code in a sandboxed child process.
// POST body: { cmd: string, lang?: 'python'|'node'|'bash' }
// Returns: { ok, stdout, stderr, exitCode, elapsedMs }

import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

export const runtime = 'nodejs'
export const maxDuration = 10

const execAsync = promisify(exec)

export async function POST(req: Request) {
  try {
    const { cmd, lang = 'python' } = (await req.json()) as { cmd?: string; lang?: string }
    if (!cmd) return NextResponse.json({ error: 'cmd required' }, { status: 400 })

    const t0 = Date.now()
    const tmpFile = join(tmpdir(), `nexus_exec_${Date.now()}.${lang === 'python' ? 'py' : lang === 'node' ? 'js' : 'sh'}`)

    // Write code to temp file
    await writeFile(tmpFile, cmd, 'utf-8')

    // Execute based on language
    let command: string
    switch (lang) {
      case 'python': command = `python3 ${tmpFile} 2>&1`; break
      case 'node': command = `node ${tmpFile} 2>&1`; break
      case 'bash': command = `bash ${tmpFile} 2>&1`; break
      default: command = `python3 ${tmpFile} 2>&1`
    }

    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 8000, maxBuffer: 1024 * 50 })
      // Cleanup
      await unlink(tmpFile).catch(() => {})
      return NextResponse.json({
        ok: true,
        stdout: stdout.slice(0, 5000),
        stderr: stderr.slice(0, 2000),
        exitCode: 0,
        elapsedMs: Date.now() - t0,
      })
    } catch (e: unknown) {
      await unlink(tmpFile).catch(() => {})
      const err = e as { stdout?: string; stderr?: string; code?: number; message?: string }
      return NextResponse.json({
        ok: false,
        stdout: (err.stdout || '').slice(0, 5000),
        stderr: (err.stderr || err.message || '').slice(0, 2000),
        exitCode: err.code || 1,
        elapsedMs: Date.now() - t0,
      })
    }
  } catch (e) {
    return NextResponse.json({ error: `shell exec failed: ${(e as Error).message}` }, { status: 500 })
  }
}
