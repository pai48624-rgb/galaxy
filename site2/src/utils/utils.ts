// astrowind utils/utils.ts에서 쓰는 것만 + 기존 생성 스크립트(gen-seo-pages.mjs)의 보조 함수
export const trim = (str = '', ch?: string) => {
  let start = 0,
    end = str.length || 0;
  while (start < end && str[start] === ch) ++start;
  while (end > start && str[end - 1] === ch) --end;
  return start > 0 || end < str.length ? str.substring(start, end) : str;
};
export const trimSlash = (s: string) => trim(trim(s, '/'));

/** 메타 설명 등 글자 수 제한(단어 경계에서 자름) */
export const truncateAtWord = (text = '', limit = 155): string => {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '')}…`;
};

export const getColumnsClass = (columns?: number, fallback = ''): string =>
  columns === 4
    ? 'lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2'
    : columns === 3
      ? 'lg:grid-cols-3 sm:grid-cols-2'
      : columns === 2
        ? 'sm:grid-cols-2'
        : fallback;

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export const clip = (s: unknown, n: number) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export const fmtDate = (iso: string, lang: 'ko' | 'en' = 'ko') => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const k = new Date(d.getTime() + 9 * 3600e3);
  return lang === 'en' ? k.toISOString().slice(0, 10) : `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
};

export const textLen = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
