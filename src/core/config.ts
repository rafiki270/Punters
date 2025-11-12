import path from 'node:path'

export type AppConfig = {
  nodeEnv: string
  isProd: boolean
  port: number
  host: string
  webRoot: string
  webDistDir: string
  backgroundsDir: string
  uploadLimitBytes: number
}

const DEFAULT_UPLOAD_LIMIT = 50 * 1024 * 1024

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development'
  const cwd = process.cwd()
  const webRoot = path.join(cwd, 'web')

  const base: AppConfig = {
    nodeEnv,
    isProd: nodeEnv === 'production',
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '0.0.0.0',
    webRoot,
    webDistDir: path.join(webRoot, 'dist'),
    backgroundsDir: path.join(webRoot, 'public', 'bcg'),
    uploadLimitBytes: DEFAULT_UPLOAD_LIMIT,
  }

  return { ...base, ...overrides }
}
