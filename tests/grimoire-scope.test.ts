import { describe, expect, it } from 'vitest';
import { NEGATIVE_GUIDES } from '../src/client/rules-text.ts';
import book from '../src/client/grimoire.ts?raw';
import shop from '../src/client/ui.ts?raw';

describe('escopo dos capítulos do Grimório', () => {
  it('status são descrições independentes, sem magia ou roteiro anexado', () => {
    for (const g of NEGATIVE_GUIDES) {
      expect(g).not.toHaveProperty('demo');
      expect(g.text).not.toMatch(/Meteoro|Meteor|Drenar|Drain|Bola de neve|Snowball|Eletrocutar|Electrocute|Magnetizar|Magnetize|Investida|Rush|Gravidade|Gravity|demonstração|demonstration/);
    }
  });
  it('Aprender mantém apenas grupos de magias e itens', () => {
    const library = book.slice(book.indexOf('export function library('));
    expect(library).not.toContain('MECHANIC_GUIDES');
    expect(library).not.toContain('NEGATIVE_GUIDES');
    expect(library).not.toContain("['controls'");
    expect(library).not.toContain("['statuses'");
  });
  it('os guias de controles não são repetidos na loja', () => {
    expect(shop).not.toContain('mechanicsHelp');
    expect(shop).not.toContain('MECHANIC_GUIDES');
  });
  it('a abertura normal começa na primeira página e não salva a anterior', () => {
    expect(book).toMatch(/let at = 0;/);
    expect(book).not.toContain('warlock:grimoire');
    expect(book).not.toContain('store.set');
    expect(book).not.toContain('store.get');
  });
});
