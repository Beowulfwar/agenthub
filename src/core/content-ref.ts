import type { ContentRef, ContentType } from './types.js';

const CONTENT_TYPES = new Set<ContentType>(['skill', 'prompt', 'subagent']);

export function isContentType(value: string | undefined | null): value is ContentType {
  return typeof value === 'string' && CONTENT_TYPES.has(value as ContentType);
}

export function formatContentRef(ref: ContentRef): string {
  return `${ref.type}/${ref.name}`;
}

export function parseContentRef(
  raw: string,
  fallbackType?: ContentType,
): ContentRef {
  const [maybeType, ...rest] = raw.split('/');
  if (rest.length > 0 && isContentType(maybeType)) {
    return {
      type: maybeType,
      name: rest.join('/'),
    };
  }

  return {
    type: fallbackType ?? 'skill',
    name: raw,
  };
}

export function contentRefsEqual(a: ContentRef, b: ContentRef): boolean {
  return a.type === b.type && a.name === b.name;
}
