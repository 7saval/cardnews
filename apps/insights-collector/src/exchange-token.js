// Graph API Explorer에서 받은 단기 액세스 토큰(~1-2시간)을 60일짜리 장기 토큰으로
// 교환하는 CLI. 크론으로 매일 도는 insights-collector가 계속 살아있으려면 필요.
//
// 사용법:
//   npm run exchange-token
//
// META_APP_ID/META_APP_SECRET은 Meta 개발자 콘솔 > 앱 설정 > 기본 설정에서 확인.

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_VERSION = 'v26.0';

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`${missing.join(', ')}가 없습니다. apps/insights-collector/.env를 확인하세요 (.env.example 참고).`);
  }
}

async function main() {
  requireEnv(['META_APP_ID', 'META_APP_SECRET', 'META_ACCESS_TOKEN']);

  const url = new URL(`https://graph.facebook.com/${API_VERSION}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', process.env.META_APP_ID);
  url.searchParams.set('client_secret', process.env.META_APP_SECRET);
  url.searchParams.set('fb_exchange_token', process.env.META_ACCESS_TOKEN);

  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`토큰 교환 실패 (${res.status}): ${JSON.stringify(body)}`);
  }

  const days = Math.round(body.expires_in / 86400);
  console.log(`✔ 장기 토큰 발급 성공 (만료까지 약 ${days}일)`);

  const envPath = resolve(process.cwd(), '.env');
  const envText = readFileSync(envPath, 'utf-8');
  const updated = envText.replace(/^META_ACCESS_TOKEN=.*$/m, `META_ACCESS_TOKEN=${body.access_token}`);
  writeFileSync(envPath, updated, 'utf-8');

  console.log('✔ .env의 META_ACCESS_TOKEN을 새 장기 토큰으로 갱신했습니다.');
}

main().catch((err) => {
  console.error(`\n✘ 실패: ${err.message}`);
  process.exit(1);
});
