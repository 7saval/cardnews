import { useEffect, useState, type ReactNode } from 'react';
import './App.css';
import { CoverCard } from './components/CoverCard';
import { ContentCard } from './components/ContentCard';
import { FollowCTACard } from './components/FollowCTACard';
import { sampleCardNews } from './sampleData';
import type { CardNewsData } from '../../../shared/schemas/card-news';

declare global {
  interface Window {
    /** Playwright 렌더 스크립트가 page.addInitScript()로 주입하는 렌더 대상 데이터. */
    __RENDER_DATA__?: CardNewsData;
    /** 실제로 화면에 쓰인 데이터(주입 데이터 or 샘플 폴백). 렌더 스크립트가 카드 개수 등을 읽어갈 때 사용. */
    __RESOLVED_RENDER_DATA__?: CardNewsData;
  }
}

function getCardNewsData(): CardNewsData {
  const data = window.__RENDER_DATA__ ?? sampleCardNews;
  window.__RESOLVED_RENDER_DATA__ = data;
  return data;
}

function buildCards(data: CardNewsData) {
  const cover = (
    <CoverCard
      sourceHandle={data.source_handle}
      hookLine={data.hook_line}
      backgroundImageUrl={data.cover_image_url}
    />
  );

  const contents = data.cards.map((c) => (
    <ContentCard
      key={c.order}
      sourceHandle={data.source_handle}
      placeName={c.place_name}
      caption={c.caption}
      address={c.address}
      backgroundImageUrl={c.image_url}
    />
  ));

  const cta = (
    <FollowCTACard
      handle={data.cta_card.handle}
      ctaText={data.cta_card.cta_text}
      hookLines={data.cta_card.hook_lines}
      backgroundImageUrl={data.cta_card.image_url}
    />
  );

  return { cover, contents, cta };
}

/**
 * ?card=cover|content-1..N|cta 로 접근하면 카드 1장만 단독 렌더링한다.
 * Playwright가 이 모드로 각 카드를 개별 스크린샷할 때 사용.
 */
function renderSingleCardForPlaywright(cardParam: string, data: CardNewsData): ReactNode | null {
  const { cover, contents, cta } = buildCards(data);

  if (cardParam === 'cover') return cover;
  if (cardParam === 'cta') return cta;

  const match = /^content-(\d+)$/.exec(cardParam);
  if (match) {
    const index = Number(match[1]) - 1;
    return contents[index] ?? null;
  }

  return null;
}

function App() {
  const data = getCardNewsData();
  const params = new URLSearchParams(window.location.search);
  const cardParam = params.get('card');

  if (cardParam) {
    const single = renderSingleCardForPlaywright(cardParam, data);
    return single ?? <p>알 수 없는 card 파라미터: {cardParam}</p>;
  }

  return <PreviewGallery fallbackData={data} initialName={params.get('data')} />;
}

/**
 * 개발 서버 미리보기. ?data=<이름>이면 content-generator/output/<이름>.json을
 * vite.config.ts의 /__outputs 미들웨어로 불러와 보여주고, 없으면 샘플 데이터를 보여준다.
 */
function PreviewGallery({ fallbackData, initialName }: { fallbackData: CardNewsData; initialName: string | null }) {
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState(initialName ?? '');
  const [loaded, setLoaded] = useState<{ name: string; data: CardNewsData } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/__outputs')
      .then((res) => res.json())
      .then(setNames)
      .catch(() => setNames([]));
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set('data', selected);
    else url.searchParams.delete('data');
    window.history.replaceState(null, '', url);

    if (!selected) return;
    let cancelled = false;
    fetch(`/__outputs/${encodeURIComponent(selected)}.json`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as CardNewsData;
      })
      .then((data) => {
        if (cancelled) return;
        setLoaded({ name: selected, data });
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const data = selected && loaded?.name === selected ? loaded.data : fallbackData;
  const { cover, contents, cta } = buildCards(data);

  return (
    <div className="preview-gallery">
      <div className="preview-toolbar">
        <label>
          데이터{' '}
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">(내장 샘플)</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {error && <span className="preview-toolbar__error">불러오기 실패: {error}</span>}
      </div>
      <PreviewSlot label="Cover">{cover}</PreviewSlot>
      {contents.map((content, i) => (
        <PreviewSlot label={`Content ${i + 1}`} key={i}>
          {content}
        </PreviewSlot>
      ))}
      <PreviewSlot label="CTA">{cta}</PreviewSlot>
    </div>
  );
}

function PreviewSlot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="preview-slot">
      <div className="preview-slot__label">{label}</div>
      <div className="preview-slot__scale">{children}</div>
    </div>
  );
}

export default App;
