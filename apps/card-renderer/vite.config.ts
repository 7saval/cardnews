import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const generatorOutputDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../content-generator/output')

/**
 * 개발 서버 전용: content-generator 산출물을 브라우저 미리보기(?data=<이름>)에서 읽을 수 있게 노출한다.
 *   GET /__outputs            → 산출물 이름 목록 (최신순, .meta.json 제외)
 *   GET /__outputs/<이름>.json → 해당 카드뉴스 JSON
 */
function generatorOutputsPlugin(): Plugin {
  return {
    name: 'generator-outputs',
    configureServer(server) {
      server.middlewares.use('/__outputs', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        const path = decodeURIComponent((req.url ?? '/').split('?')[0])

        if (path === '/' || path === '') {
          const names = existsSync(generatorOutputDir)
            ? readdirSync(generatorOutputDir, { withFileTypes: true })
                .filter((f) => f.isFile() && f.name.endsWith('.json') && !f.name.endsWith('.meta.json'))
                .map((f) => ({ name: f.name.replace(/\.json$/, ''), mtime: statSync(resolve(generatorOutputDir, f.name)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime)
                .map((f) => f.name)
            : []
          res.end(JSON.stringify(names))
          return
        }

        // 경로 조작(../) 방지: 슬래시/역슬래시가 없는 단일 파일명만 허용
        const match = /^\/([^/\\]+)\.json$/.exec(path)
        const filePath = match && resolve(generatorOutputDir, `${match[1]}.json`)
        if (!filePath || !existsSync(filePath)) {
          res.statusCode = 404
          res.end(JSON.stringify({ error: `산출물을 찾을 수 없습니다: ${path}` }))
          return
        }
        res.end(readFileSync(filePath, 'utf-8'))
      })
    },
  }
}

const matcherImagesDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../image-matcher/images')
const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/**
 * image-matcher가 카드 JSON에 넣는 image_url(/__images/<images 기준 경로>)을 실제 파일로 서빙한다.
 * 미리보기(npm run dev)와 Playwright 렌더링(npm run render) 둘 다 이 개발 서버를 쓴다.
 */
function matcherImagesPlugin(): Plugin {
  return {
    name: 'matcher-images',
    configureServer(server) {
      server.middlewares.use('/__images', (req, res) => {
        // 경로 조각별로 디코딩 (places/<가게>/<파일>, topics/<주제>/_cover/<파일>, _cta/<파일>)
        let segments: string[]
        try {
          segments = (req.url ?? '/').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent)
        } catch {
          segments = [] // 잘못된 % 인코딩
        }
        const ext = extname(segments.at(-1) ?? '').toLowerCase()
        // 경로 조작 방지: 빈/./.. 조각이나 슬래시·역슬래시가 섞인 조각 거부 + 최종 경로가 images 안인지 재확인
        const badSegment = segments.some((s) => s === '.' || s === '..' || /[\\/]/.test(s))
        const filePath = resolve(matcherImagesDir, ...segments)
        if (!segments.length || badSegment || !IMAGE_TYPES[ext] || !filePath.startsWith(matcherImagesDir + sep)) {
          res.statusCode = 404
          res.end()
          return
        }
        if (!existsSync(filePath)) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', IMAGE_TYPES[ext])
        res.end(readFileSync(filePath))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), generatorOutputsPlugin(), matcherImagesPlugin()],
})
