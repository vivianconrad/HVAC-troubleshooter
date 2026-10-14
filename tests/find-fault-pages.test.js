import { describe, it, expect } from 'vitest';
import { scoreFaultPages } from '../build/find-fault-pages.js';

const mk = (doc, page, text) => ({ manufacturer: 'tekmar', doc, page, text });

describe('scoreFaultPages', () => {
  const pages = [
    mk('a.pdf', 1, 'Welcome to the product. Installation overview.'),
    mk('a.pdf', 2, 'Error codes: Error 1 sensor fault. Fault display flashes. Lockout alarm. Reset the control. Error 2 fault.'),
    mk('a.pdf', 3, 'One error mentioned here.'),
    mk('b.pdf', 1, 'Troubleshooting guide: fault code table, LED flashes, alarm, error, lockout, reset.'),
  ];
  it('ranks dense fault pages first within each document', () => {
    const r = scoreFaultPages(pages);
    const a = r.filter((x) => x.doc === 'a.pdf');
    expect(a[0].page).toBe(2);
  });
  it('drops pages below the minimum score', () => {
    const r = scoreFaultPages(pages);
    expect(r.some((x) => x.doc === 'a.pdf' && x.page === 1)).toBe(false);
  });
  it('limits results per document', () => {
    expect(scoreFaultPages(pages, 1).filter((x) => x.doc === 'a.pdf')).toHaveLength(1);
  });
  it('handles no pages', () => expect(scoreFaultPages([])).toEqual([]));
});
