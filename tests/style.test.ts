import { afterEach, describe, expect, it } from 'vitest';
import { addPlayer, newMatch, startMatch, tickMatch, type Match, type MatchOpts } from '../src/shared/match.ts';
import { addRecord, emptyTotals, roundRecord, styleRows, type RoundRecord } from '../src/shared/telemetry.ts';

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});

// mulberry32; a partida usa Math.random direto (pilares, mundo, plano dos bots), então ele também vira o sorteio com semente
function seedRandom(seed: number) {
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// partida só de bots com semente fixa; devolve o hash (FNV-1a) de todos os eventos dos passos
function botMatch(seed: number, steps: number, opts: Partial<MatchOpts> = {}): { m: Match; hash: number } {
  seedRandom(seed);
  const m = newMatch();
  startMatch(m, 0, 4, 'rounds', true, Math.random, opts);
  let now = 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < steps; i++) {
    const s = JSON.stringify(tickMatch(m, (now += 1000 / 60), [], Math.random));
    for (let j = 0; j < s.length; j++) hash = Math.imul(hash ^ s.charCodeAt(j), 16777619) >>> 0;
  }
  return { m, hash };
}

describe('jeito de jogar', () => {
  // valor gravado com o código de antes da medição (972dab7): a medição só lê, então os eventos não mudam.
  // Muda (e se grava de novo) só quando a jogabilidade muda. 20/10 (issue #80): o baú sorteia o ouro do monte (3 a 5) ao nascer,
  // um sorteio a mais na sequência. 21/10 (issue #217): Flagelo e Pacto viram magia, o Redirecionador sai e as compras dos bots mudam.
  // 22/10 (issue #17, classes): os bots prontos de Cavaleiro, Ladina e Mago ganham a passiva da classe
  it('a medição não muda a partida: mesma semente, mesmos eventos de antes', () => {
    const { m, hash } = botMatch(7, 4000);
    expect(hash).toBe(796906711);
    // e mediu de verdade nessa mesma partida
    const sum = (k: 'threats' | 'reactN' | 'nearN') => m.players.reduce((a, p) => a + p.stats.match[k], 0);
    expect([sum('threats') > 0, sum('reactN') > 0, sum('nearN') > 0]).toEqual([true, true, true]);
  });

  it('o registro da rodada leva a dificuldade, o apelido (só de humano) e o jeito de jogar', () => {
    seedRandom(3);
    const m = newMatch();
    addPlayer(m, 'h', 'Ana');
    startMatch(m, 0, 3, 'rounds', true, Math.random, { difficulty: 'hard' });
    m.players[0].connected = false; // o humano vira bot até voltar: a rodada anda sozinha
    let now = 0;
    for (let i = 0; i < 60 * 240 && m.phase !== 'roundEnd'; i++) tickMatch(m, (now += 1000 / 60), [], Math.random);
    expect(m.phase).toBe('roundEnd');
    const r = roundRecord(m, now);
    expect(r.difficulty).toBe('hard');
    expect(r.players.map((p) => p.name)).toEqual(['Ana', undefined, undefined, undefined]);
    const [ana, ...bots] = r.players;
    expect(bots.reduce((a, p) => a + (p.threats ?? 0), 0)).toBeGreaterThan(0);
    expect(bots.every((p) => (p.nearN ?? 0) > 0)).toBe(true);
    // jogada pelo bot enquanto caiu: o jeito do bot não entra na linha dela
    expect([ana.threats, ana.nearN]).toEqual([0, 0]);
  });

  it('styleRows: uma linha por humano (último apelido) e por dificuldade; fora treino, Automático e registros antigos', () => {
    const style = { threats: 10, struck: 4, shieldable: 4, shielded: 1, reactSum: 3, reactN: 6, nearSum: 50, nearN: 10 };
    const pl = (o: Partial<RoundRecord['players'][number]>): RoundRecord['players'][number] =>
      ({ bot: false, character: 'mage', won: false, spells: {}, items: {}, dmg: 0, dmgBy: {}, fired: {}, landed: {}, kills: 0, ...style, ...o });
    const rec = (o: Partial<RoundRecord>, players: RoundRecord['players']): RoundRecord => ({ at: 0, humans: 1, difficulty: 'normal', players, ...o });
    const t = emptyTotals();
    addRecord(t, rec({}, [pl({ pid: 'x1', name: 'Ana' }), pl({ bot: true, pid: 'b' })]));
    addRecord(t, rec({}, [pl({ pid: 'x1', name: 'Aninha' }), pl({ bot: true, pid: 'b' })]));
    addRecord(t, rec({ setup: true }, [pl({ pid: 'x1', name: 'Treino' })]));
    addRecord(t, rec({ difficulty: 'auto' }, [pl({ pid: 'x1', name: 'Aninha' }), pl({ bot: true, pid: 'b' })]));
    addRecord(t, rec({ difficulty: undefined }, [pl({ pid: 'x1', name: 'Velho' })]));
    const rows = styleRows(t);
    expect(rows).toEqual([
      { who: 'Aninha', pid: 'x1', rounds: 3, threats: 30, reacted: 0.6, react: 0.5, struck: 0.4, shield: 0.25, near: 5 },
      { who: 'bots normal', pid: undefined, rounds: 2, threats: 20, reacted: 0.6, react: 0.5, struck: 0.4, shield: 0.25, near: 5 },
    ]);
    // registro sem os campos (de antes da medição) fica fora
    addRecord(t, rec({}, [{ ...pl({ pid: 'x2' }), threats: undefined }]));
    expect(styleRows(t).length).toBe(2);
  });

  it('Difícil reage mais rápido e a mais ameaças que o Fácil', () => {
    const style = (difficulty: 'easy' | 'hard') => {
      const { m } = botMatch(11, 60 * 600, { difficulty });
      const s = (k: 'threats' | 'reactSum' | 'reactN') => m.players.reduce((a, p) => a + p.stats.match[k], 0);
      return { react: s('reactSum') / s('reactN'), reacted: s('reactN') / s('threats') };
    };
    const easy = style('easy');
    const hard = style('hard');
    expect(hard.react).toBeLessThan(easy.react);
    expect(hard.reacted).toBeGreaterThan(easy.reacted);
  }, 30_000); // duas partidas de 10 min simuladas: ~5,5 s no runner do GitHub
});
