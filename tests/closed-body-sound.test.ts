import { describe, expect, it } from 'vitest';
import { closedBodySound } from '../src/client/closed-body-sound.ts';

describe('avisos de Corpo fechado', () => {
  it('toca começo uma vez, não repete a cada snapshot', () => {
    expect(closedBodySound(0,4)).toBe('closedbody');
    expect(closedBodySound(4,3.9)).toBeNull();
    expect(closedBodySound(3.9,3.8)).toBeNull();
  });
  it('toca fim uma vez ao expirar ou soltar, mesmo sem cb no snapshot', () => {
    expect(closedBodySound(.03,0)).toBe('closedbodyEnd');
    expect(closedBodySound(3,undefined)).toBe('closedbodyEnd');
    expect(closedBodySound(0,undefined)).toBeNull();
    expect(closedBodySound()).toBeNull();
  });
});
