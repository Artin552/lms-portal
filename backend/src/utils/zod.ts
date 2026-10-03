import { z } from 'zod';

/** Список id из multipart-формы: "1,2", ["1","2"] или JSON "[1,2]" */
export const idList = z.preprocess((v) => {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v.map(Number);
  const s = String(v).trim();
  if (s.startsWith('[')) {
    try {
      return (JSON.parse(s) as unknown[]).map(Number);
    } catch {
      return [NaN];
    }
  }
  return s.split(',').map(Number);
}, z.array(z.number().int().positive()));

export const idParam = z.coerce.number().int().positive();
