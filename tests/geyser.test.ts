import { describe, expect, it } from 'vitest';
import { DT, WIZ_R } from '../src/shared/constants.ts';
import { CAST_POINT, noSpells, SPELLS } from '../src/shared/spells.ts';
import { stepWorld } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { world, run } from './helpers.ts';

function setup() {
  const w = world([[-.5,0],[1,0],[2.5,0],[7,0]], { ...noSpells(), geyser: 1 }, [], () => .5, false, [0,0,1,1]);
  w.pillars=[]; w.isles=[]; w.arenaR=30; w.shrinkAt=Infinity;
  for (const z of w.wizards) { z.regen=0; z.hp=500; }
  return w;
}
function cast(w: ReturnType<typeof setup>, at={x:1,y:0}) {
  stepWorld(w,[{id:'p0',kind:'cast',spell:'geyser',at}],()=>.5);
  run(w,CAST_POINT.geyser + DT);
}
describe('Gêiser de suporte no chão', () => {
  it('acerta somente quem toca a nova área25% menor', () => {
    const w=setup(), r=1.5*Math.sqrt(.75);
    w.wizards[0].pos={x:-10,y:0};
    w.wizards[1].pos={x:r+WIZ_R-.01,y:0};
    w.wizards[2].pos={x:-r-WIZ_R-.01,y:0};
    cast(w,{x:0,y:0});
    expect(w.wizards[1].geyserLeft).toBeGreaterThan(0);
    expect(w.wizards[2].geyserLeft??0).toBe(0);
  });
  it('não pausa recargas, e ações só voltam após o jato acabar', () => {
    const w=setup(); w.wizards[1].cd.lightning=10; cast(w);
    const left=w.wizards[1].cd.lightning-w.t;
    run(w,1); expect(w.wizards[1].cd.lightning-w.t).toBeCloseTo(left-1);
    run(w,2);
    stepWorld(w,[{id:'p1',kind:'cast',spell:'fireball',at:w.wizards[3].pos}],()=>.5);
    expect(w.events.some(e=>e.k==='cast' && e.id==='p1')).toBe(true);
  });
  it('snapshot não revela prazo de quem está invisível', () => {
    const w=setup(); cast(w); w.wizards[2].veilUntil=w.t+2;
    const snap=decodeSnap(encodeSnap(w,'p0',0,[]),w.wizards.map(z=>z.id));
    expect(snap.wizards[2].geyserLeft).toBe(0);
    expect(snap.wizards[1].geyserLeft).toBeGreaterThan(0);
  });
  it('limita o ponto a10m e pega quem entra depois apenas pelo prazo restante', () => {
    const w=setup();
    stepWorld(w,[{id:'p0',kind:'cast',spell:'geyser',at:{x:100,y:0}}],()=>.5);
    run(w,.2);
    const p=w.projectiles.find(p=>p.kind==='geyser')!;
    expect(p.pos.x-w.wizards[0].pos.x).toBeCloseTo(10);
    run(w,1);
    w.wizards[3].pos={...p.pos}; stepWorld(w,[],()=>.5);
    expect(w.wizards[3].geyserLeft).toBeCloseTo(p.until-w.t);
    expect(w.wizards[3].geyserLeft).toBeLessThan(1.5);
  });
  it('dura2,5s, alcança10m e não tem dano/empurrão', () => {
    expect(SPELLS.geyser.levels.every(l=>l.duration===2.5 && l.range===10 && l.dmg===0 && l.knock===0)).toBe(true);
  });
  it('suspende lançador, aliado e inimigo, mas não quem está fora da área', () => {
    const w=setup(); cast(w);
    expect(w.wizards.slice(0,3).every(z=>(z.geyserLeft??0)>2.4)).toBe(true);
    expect(w.wizards[3].geyserLeft??0).toBe(0);
    expect(w.projectiles.some(p=>p.kind==='geyser')).toBe(true);
  });
  it('não permite andar, atacar nem conjurar, e não guarda caminhada para depois', () => {
    const w=setup(); cast(w);
    const z=w.wizards[1], pos={...z.pos};
    for(let i=0;i<60;i++) stepWorld(w,[{id:z.id,kind:'move',to:{x:8,y:0}},{id:z.id,kind:'basic',at:w.wizards[3].pos},{id:z.id,kind:'cast',spell:'fireball',at:w.wizards[3].pos}],()=>.5);
    expect(z.pos).toEqual(pos); expect(z.target).toBeNull();
    expect(z.basicCasting).toBeUndefined(); expect(z.casting).toBeNull(); expect(z.cd.fireball).toBe(0);
    run(w,2); expect(z.geyserLeft??0).toBe(0); expect(z.pos).toEqual(pos);
    stepWorld(w,[{id:z.id,kind:'move',to:{x:8,y:0}}],()=>.5);
    expect(z.pos.x).toBeGreaterThan(pos.x);
  });
  it('interrompe preparos e protege de dano/impulso e lava pelo prazo', () => {
    const w=setup(); const z=w.wizards[1];
    z.casting={spell:'scourge',at:z.pos,fireAt:1};
    z.basicCasting={target:'p3',fireAt:1,melee:false}; z.vel={x:4,y:0};
    cast(w); expect(z.casting).toBeNull(); expect(z.basicCasting).toBeUndefined();
    w.arenaR=.1;
    for(let i=0;i<30;i++) {
      w.projectiles.push({id:w.nextId++,kind:'fireball',owner:'p3',caster:'p3',pos:{x:z.pos.x-1,y:z.pos.y},vel:{x:60,y:0},level:1,until:w.t+1,target:null,dmgMult:1});
      stepWorld(w,[],()=>.5);
    }
    expect(z.hp).toBe(500); expect(z.vel).toEqual({x:0,y:0});
  });
  it('envia suspensão no snapshot, expira junto com o jato e permite novo uso', () => {
    const w=setup(); cast(w);
    const snap=decodeSnap(encodeSnap(w,'p0',0,[]),w.wizards.map(z=>z.id));
    expect(snap.wizards[1].geyserLeft).toBeGreaterThan(2.4);
    run(w,2.6); expect(w.projectiles.some(p=>p.kind==='geyser')).toBe(false);
    expect(w.wizards.every(z=>(z.geyserLeft??0)===0)).toBe(true);
    w.wizards[0].cd.geyser=0; cast(w);
    expect(w.wizards[1].geyserLeft).toBeGreaterThan(2.4);
  });
});
