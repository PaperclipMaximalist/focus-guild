import { describe, expect, it } from 'vitest';
import { findDuplicate, titleKey } from './duplicates';

describe('titleKey', () => {
  it('ignores case and surrounding space', () => {
    expect(titleKey('  Call The Dentist ')).toBe('call the dentist');
  });

  it('collapses inner whitespace', () => {
    expect(titleKey('Call   the\tdentist')).toBe('call the dentist');
  });

  it('treats straight and typographic quotes as the same', () => {
    expect(titleKey('Read “Dune” and Sam\u2019s notes')).toBe(titleKey('Read "Dune" and Sam\'s notes'));
  });

  it('drops trailing . ! ? and ellipsis', () => {
    expect(titleKey('Call the dentist!')).toBe('call the dentist');
    expect(titleKey('Call the dentist?!')).toBe('call the dentist');
    expect(titleKey('Call the dentist\u2026')).toBe('call the dentist');
    expect(titleKey('Call the dentist...')).toBe('call the dentist');
  });

  it('keeps empty empty', () => {
    expect(titleKey('')).toBe('');
    expect(titleKey('  ')).toBe('');
    expect(titleKey('...')).toBe('');
  });
});

describe('findDuplicate', () => {
  const list = [
    { id: 'a', title: 'Call the dentist' },
    { id: 'b', title: 'Stretch' },
  ];

  it('finds the first match across case, spacing and punctuation', () => {
    expect(findDuplicate('  call  THE dentist. ', list)?.id).toBe('a');
  });

  it('does not match a near miss', () => {
    expect(findDuplicate('Call the dentist back', list)).toBeUndefined();
  });

  it('returns undefined for an empty title', () => {
    expect(findDuplicate('', [{ title: '' }])).toBeUndefined();
    expect(findDuplicate('...', list)).toBeUndefined();
  });

  it('returns the first of several matches', () => {
    expect(findDuplicate('stretch', [{ id: 1, title: 'Stretch' }, { id: 2, title: 'stretch!' }])?.id).toBe(1);
  });
});
