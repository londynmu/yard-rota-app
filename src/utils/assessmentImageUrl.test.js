import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_IMAGES_BUCKET,
  buildAssessmentImagePath,
  extractAssessmentStoragePath,
} from './assessmentImageUrl';

describe('extractAssessmentStoragePath', () => {
  it('returns raw paths as-is', () => {
    expect(extractAssessmentStoragePath('uid/aid/photo.jpg')).toBe('uid/aid/photo.jpg');
  });

  it('extracts from public and signed URLs', () => {
    expect(
      extractAssessmentStoragePath(
        `https://example.supabase.co/storage/v1/object/public/${ASSESSMENT_IMAGES_BUCKET}/uid/aid/a.jpg`,
      ),
    ).toBe('uid/aid/a.jpg');
    expect(
      extractAssessmentStoragePath(
        `https://example.supabase.co/storage/v1/object/sign/${ASSESSMENT_IMAGES_BUCKET}/uid/aid/a.jpg?token=x`,
      ),
    ).toBe('uid/aid/a.jpg');
  });

  it('returns null for empty input', () => {
    expect(extractAssessmentStoragePath('')).toBeNull();
    expect(extractAssessmentStoragePath(null)).toBeNull();
  });
});

describe('buildAssessmentImagePath', () => {
  it('joins user, assessment, and filename', () => {
    expect(buildAssessmentImagePath('u1', 'a1', 'photo.jpg')).toBe('u1/a1/photo.jpg');
  });

  it('requires userId and assessmentId', () => {
    expect(() => buildAssessmentImagePath('', 'a1', 'x.jpg')).toThrow(/userId/);
    expect(() => buildAssessmentImagePath('u1', '', 'x.jpg')).toThrow(/assessmentId/);
  });
});
