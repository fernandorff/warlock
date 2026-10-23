import { describe, expect, it } from 'vitest';
import { LOOK_PARTS, classOf, lookOf } from '../src/shared/characters.ts';
import { HP_REGEN, WIZ_SPEED } from '../src/shared/constants.ts';
import { gearOf, stepWorld, type World } from '../src/shared/sim.ts';
import { noSpells, spellLevel } from '../src/shared/spells.ts';
import { noItems } from '../src/shared/items.ts';
import { classLine, sheet } from '../src/client/sheet.ts';
import { world } from './helpers.ts';

const BODY = LOOK_PARTS.findIndex((p) => p.id === 'body');
// look de um boneco com o tronco de outro
const withBody = (look: string, from: string) => look.slice(0, BODY) + from[BODY] + look.slice(BODY + 1);

// duelo p0 → p1 a 4 m; devolve o mundo e os acertos (passo e dano) até `seconds`
function duel(spell: 'fireball' | 'drain', setup: (w: World) => void, seconds = 2) {
  const w = world([[0, 0], [4, 0]], { ...noSpells(), fireball: 1, drain: 1 });
  setup(w);
  const hits: { t: number; dmg: number }[] = [];
  stepWorld(w, [{ id: 'p0', kind: 'cast', spell, at: w.wizards[1].pos }]);
  for (let i = 0; i < seconds * 60; i++) {
    stepWorld(w, []);
    for (const e of w.events) if (e.k === 'hit' && e.id === 'p1' && e.dmg > 0) hits.push({ t: w.t, dmg: e.dmg });
  }
  return { w, hits };
}

describe('classes', () => {
  it('a classe sai do tronco do look; os outros bonecos ainda não têm classe', () => {
    expect(classOf(lookOf('knight'))).toBe('knight');
    expect(classOf(lookOf('rogue'))).toBe('rogue');
    expect(classOf(lookOf('mage'))).toBe('mage');
    expect(classOf(lookOf('barbarian'))).toBeNull();
    expect(classOf(undefined)).toBeNull();
    // cabeça, chapéu e mãos de Cavaleiro com tronco de Mago: Mago
    expect(classOf(withBody(lookOf('knight'), lookOf('mage')))).toBe('mage');
  });

  it('cada classe mexe só nos seus atributos', () => {
    const base = gearOf(noItems(), null);
    expect(base).toMatchObject({ kbResist: 0, regen: HP_REGEN, baseSpeed: WIZ_SPEED, dmgF: 1, cdF: 1, afflict: 1 });
    expect(gearOf(noItems(), 'knight')).toMatchObject({ kbResist: 0.05, baseSpeed: WIZ_SPEED, dmgF: 1, cdF: 1, afflict: 1 });
    expect(gearOf(noItems(), 'knight').regen).toBeCloseTo(HP_REGEN * 1.05);
    expect(gearOf(noItems(), 'rogue')).toMatchObject({ kbResist: 0, regen: HP_REGEN, dmgF: 1, cdF: 1, afflict: 1.05 });
    expect(gearOf(noItems(), 'rogue').baseSpeed).toBeCloseTo(WIZ_SPEED * 1.05);
    expect(gearOf(noItems(), 'mage')).toMatchObject({ kbResist: 0, regen: HP_REGEN, baseSpeed: WIZ_SPEED, dmgF: 1.05, cdF: 0.95, afflict: 1 });
  });

  it('Mago: o golpe dele tira 5% a mais e a recarga é 5% mais curta', () => {
    const plain = duel('fireball', () => {});
    const mage = duel('fireball', (w) => Object.assign(w.wizards[0], gearOf(noItems(), 'mage')));
    expect(plain.hits.length).toBe(1);
    expect(mage.hits[0].dmg).toBe(Math.round(plain.hits[0].dmg * 1.05));
    const cd = spellLevel('fireball', 1).cd;
    const w = world([[0, 0], [4, 0]], { ...noSpells(), fireball: 1 });
    Object.assign(w.wizards[0], gearOf(noItems(), 'mage'));
    stepWorld(w, [{ id: 'p0', kind: 'cast', spell: 'fireball', at: w.wizards[1].pos }]);
    // a magia sai depois do preparo (CAST_POINT): a recarga começa no passo em que ela sai
    for (let i = 0; i < 120 && !(w.wizards[0].cd.fireball > w.t); i++) stepWorld(w, []);
    expect(w.wizards[0].cd.fireball - w.t).toBeCloseTo(cd * 0.95, 1);
  });

  it('Ladino: a lentidão do Drenar dura 5% a mais em quem ele acerta', () => {
    const slowFor = (rogue: boolean) => {
      const { w, hits } = duel('drain', (x) => rogue && Object.assign(x.wizards[0], gearOf(noItems(), 'rogue')), 1.5);
      expect(hits.length).toBeGreaterThan(0);
      return w.wizards[1].slowUntil - hits[0].t;
    };
    expect(slowFor(true)).toBeCloseTo(slowFor(false) * 1.05, 2);
  });

  it('a Ficha soma a passiva nos totais e diz de onde ela vem', () => {
    const row = (rows: ReturnType<typeof sheet>, group: string, label: string) => rows.find((r) => r.group === group && r.label === label)!;
    const knight = sheet(noSpells(), noItems(), 'knight');
    expect(row(knight, 'Mago', 'Empurrão recebido').value).toBe('95%');
    expect(row(knight, 'Mago', 'Empurrão recebido').from).toContain('da classe Cavaleiro');
    expect(row(knight, 'Mago', 'Vida por segundo (na pedra)').value).toBe('5,25');
    const spells = { ...noSpells(), fireball: 1 };
    const plain = sheet(spells, noItems()), mage = sheet(spells, noItems(), 'mage');
    expect(row(plain, 'Bola de fogo', 'Dano').value).toBe('70');
    expect(row(mage, 'Bola de fogo', 'Dano').value).toBe('73,5');
    expect(row(mage, 'Bola de fogo', 'Recarga').value).not.toBe(row(plain, 'Bola de fogo', 'Recarga').value);
  });

  it('o criador diz a classe do tronco e que ela muda na próxima rodada', () => {
    expect(classLine(lookOf('knight'))).toContain('Cavaleiro');
    expect(classLine(lookOf('knight'))).toContain('próxima rodada');
    expect(classLine(lookOf('barbarian'))).toContain('Sem classe');
  });

  it('a Ficha do mago mostra a classe e a passiva; sem classe, nada a mais', () => {
    const rows = sheet(noSpells(), noItems(), 'knight');
    expect(rows[0]).toMatchObject({ label: 'Classe (pelo tronco)', value: 'Cavaleiro' });
    expect(rows[0].from).toContain('5% menos empurrão');
    expect(sheet(noSpells(), noItems()).some((r) => r.label.startsWith('Classe'))).toBe(false);
  });
});
