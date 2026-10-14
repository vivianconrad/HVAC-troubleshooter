import { describe, it, expect } from 'vitest';
import { validateTree, createSession } from '../src/lib/tree.js';

const good = () => ({
  id: 't1',
  title: 'Test tree',
  start: 'q1',
  nodes: {
    q1: { type: 'question', text: 'Is it on?', options: [{ label: 'Yes', next: 'q2' }, { label: 'No', next: 'r1' }] },
    q2: { type: 'question', text: 'Is it hot?', options: [{ label: 'Yes', next: 'r2' }, { label: 'No', next: 'r1' }] },
    r1: { type: 'result', cause: 'Off', fix: ['Turn on'] },
    r2: { type: 'result', cause: 'Hot', fix: ['Cool it'], source: { manufacturer: 'tekmar', doc: 'a.pdf', page: 3 } },
  },
});

describe('validateTree', () => {
  it('accepts a good tree', () => expect(validateTree(good())).toEqual([]));
  it('requires id, title and nodes', () => {
    expect(validateTree({}).length).toBeGreaterThan(0);
    expect(validateTree(null)).toEqual(['tree must be an object']);
  });
  it('flags a missing start node', () => {
    const t = good();
    t.start = 'nope';
    expect(validateTree(t).join(' ')).toMatch(/start node "nope"/);
  });
  it('flags options that point to missing nodes', () => {
    const t = good();
    t.nodes.q1.options[1].next = 'ghost';
    expect(validateTree(t).join(' ')).toMatch(/missing node "ghost"/);
  });
  it('flags question nodes with fewer than two options', () => {
    const t = good();
    t.nodes.q2.options = [{ label: 'Only', next: 'r1' }];
    expect(validateTree(t).join(' ')).toMatch(/at least two options/);
  });
  it('flags results with no cause or no fix', () => {
    const t = good();
    t.nodes.r1.fix = [];
    delete t.nodes.r2.cause;
    const msg = validateTree(t).join(' ');
    expect(msg).toMatch(/r1.*fix/);
    expect(msg).toMatch(/r2.*cause/);
  });
  it('flags unreachable nodes', () => {
    const t = good();
    t.nodes.orphan = { type: 'result', cause: 'x', fix: ['y'] };
    expect(validateTree(t).join(' ')).toMatch(/"orphan" is unreachable/);
  });
  it('flags cycles', () => {
    const t = good();
    t.nodes.q2.options[1].next = 'q1';
    expect(validateTree(t).join(' ')).toMatch(/cycle/);
  });
  it('flags a malformed source', () => {
    const t = good();
    t.nodes.r2.source = { doc: 'a.pdf', page: 0 };
    expect(validateTree(t).join(' ')).toMatch(/source/);
  });
  it('flags unknown node types', () => {
    const t = good();
    t.nodes.r1.type = 'banana';
    expect(validateTree(t).join(' ')).toMatch(/unknown type/);
  });
});

describe('createSession', () => {
  it('walks to a result and records the path', () => {
    const s = createSession(good());
    expect(s.current().id).toBe('q1');
    s.choose(0);
    expect(s.current().id).toBe('q2');
    s.choose(0);
    expect(s.isDone()).toBe(true);
    expect(s.current().cause).toBe('Hot');
    expect(s.path()).toEqual([
      { question: 'Is it on?', answer: 'Yes' },
      { question: 'Is it hot?', answer: 'Yes' },
    ]);
  });
  it('can go back and restart', () => {
    const s = createSession(good());
    s.choose(0);
    expect(s.back()).toBe(true);
    expect(s.current().id).toBe('q1');
    expect(s.back()).toBe(false);
    s.choose(1);
    s.restart();
    expect(s.current().id).toBe('q1');
    expect(s.path()).toEqual([]);
  });
  it('rejects bad choices', () => {
    const s = createSession(good());
    expect(() => s.choose(5)).toThrow(RangeError);
    expect(() => s.choose(-1)).toThrow(RangeError);
    s.choose(1);
    expect(() => s.choose(0)).toThrow(/result/);
  });
  it('refuses an invalid tree', () => {
    const t = good();
    t.start = 'nope';
    expect(() => createSession(t)).toThrow(/Invalid tree/);
  });
});
