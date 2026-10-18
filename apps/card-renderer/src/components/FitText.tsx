import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface FitTextProps {
  /** 내용이 바뀌면 다시 맞추기 위한 키 (보통 표시할 문자열) */
  fitKey: string;
  max: number;
  min: number;
  className?: string;
  children: ReactNode;
}

/**
 * 고정 크기 박스(className의 CSS가 높이를 정한다)에 글자가 다 들어갈 때까지 font-size를 줄인다.
 * 정책명·지원 내용 길이가 항목마다 크게 달라서(정책명 p50 14자, p99 34자) 크기를 하나로 못 정한다.
 *
 * 웹폰트가 늦게 오면 글자 폭이 바뀌므로 document.fonts.ready 뒤에 한 번 더 맞추고
 * data-fitted="true"를 단다. min까지 줄여도 넘치면 data-overflow="true" — 렌더 스크립트가
 * 이 값을 보고 실패시킨다 (글자를 잘라서 내보내면 사실 정보가 빠진다).
 */
export function FitText({ fitKey, max, min, className = '', children }: FitTextProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 높이 대신 max-height로 잡은 박스는 max-height가 한계다. 글리프가 line-height보다 커서
    // 자동 높이 박스는 scrollHeight가 clientHeight보다 늘 몇 px 크기 때문.
    const maxHeight = parseFloat(getComputedStyle(el).maxHeight);
    const limit = () => (Number.isNaN(maxHeight) ? el.clientHeight : maxHeight);
    const overflows = () => el.scrollHeight > limit() + 1 || el.scrollWidth > el.clientWidth + 1;
    const fit = () => {
      let size = max;
      el.style.fontSize = `${size}px`;
      while (size > min && overflows()) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      el.dataset.overflow = String(overflows());
    };

    fit();
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      fit();
      el.dataset.fitted = 'true';
    });
    return () => {
      cancelled = true;
    };
  }, [fitKey, max, min]);

  return (
    <div ref={ref} className={`fit-text ${className}`} data-fit>
      {children}
    </div>
  );
}
