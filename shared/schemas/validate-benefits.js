// shared/schemas/benefit.ts(CollectedBenefits) 스키마에 대한 런타임 검증.
// benefit-collector가 쓰기 전, content-generator가 읽은 직후에 확인한다.

const SERIES_TYPES = ['always', 'district', 'deadline'];
const SOURCE_ID_RE = /^[a-z0-9]+:.+$/;
const ITEM_STRING_FIELDS = ['source_id', 'source', 'title', 'category', 'org_name', 'source_url', 'period_text', 'updated_at'];

export function assertValidCollectedBenefits(data, source) {
  const errors = [];
  if (!SERIES_TYPES.includes(data.series_type)) {
    errors.push(`series_type은 ${SERIES_TYPES.join(' | ')} 중 하나여야 합니다`);
  }
  if (typeof data.data_source !== 'string') errors.push('data_source(string)가 없습니다');
  if (data.series_type === 'district' && typeof data.region !== 'string') {
    errors.push('series_type이 district이면 region(string)이 있어야 합니다');
  }
  if (data.series_type !== 'district' && typeof data.category !== 'string') {
    errors.push('category(string)가 없습니다');
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.push('items(비어있지 않은 배열)가 없습니다');
  } else {
    const seen = new Set();
    data.items.forEach((r, i) => {
      for (const f of ITEM_STRING_FIELDS) {
        if (typeof r[f] !== 'string') errors.push(`items[${i}].${f}(string)이 없습니다`);
      }
      if (typeof r.source_id === 'string') {
        if (!SOURCE_ID_RE.test(r.source_id)) errors.push(`items[${i}].source_id는 "<소스>:<ID>" 형식이어야 합니다`);
        if (seen.has(r.source_id)) errors.push(`items[${i}].source_id가 중복됩니다: ${r.source_id}`);
        seen.add(r.source_id);
      }
      if (!r.raw || typeof r.raw.support_content !== 'string' || typeof r.raw.target !== 'string') {
        errors.push(`items[${i}].raw(support_content, target 원문)가 없습니다`);
      }
    });
  }

  if (errors.length > 0) {
    throw new Error(
      `${source}가 수집 결과 스키마(shared/schemas/benefit.ts)와 맞지 않습니다:\n` +
        errors.map((e) => `  - ${e}`).join('\n'),
    );
  }
}
