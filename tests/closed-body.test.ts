import { describe, expect, it } from 'vitest';
import { DT } from '../src/shared/constants.ts';
import { noSpells, SPELLS } from '../src/shared/spells.ts';
import { bracingActive, closedBodyActive, damageFactor, statusDuration, stepWorld, applyElectrocution } from '../src/shared/sim.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { run, world } from './helpers.ts';

function setup() {
  const w=world([[0,0],[3,0]], {...noSpells(),closedbody:1});
  w.pillars=[]; w.runes=[]; w.isles=[]; w.arenaR=30; w.shrinkAt=Infinity;
  for(const z of w.wizards) { z.regen=0; z.stunLeft=0; }
  return w;
}
function hold(w: ReturnType<typeof setup>, seconds: number) {
  for(let i=0;i<Math.ceil(seconds/DT);i++) stepWorld(w,[{id:'p0',kind:'brace',on:true}],()=>.5);
}
function activate(w: ReturnType<typeof setup>) {
  stepWorld(w,[{id:'p0',kind:'cast',spell:'closedbody',at:{x:0,y:0}}],()=>.5);
}
describe('Corpo fechado',()=>{
  it('reduz90% do novo impulso sem apagar impulso anterior; expiração restaura força normal',()=>{
    const impact = (active: boolean, expired = false, residual = 0) => {
      const w=setup(),z=w.wizards[0]; hold(w,.6);
      if(active) activate(w);
      if(expired) hold(w,4.1);
      z.vel={x:residual,y:0};
      w.projectiles.push({id:w.nextId++,born:w.t,kind:'fireball',owner:'p1',caster:'p1',pos:{x:.55,y:0},vel:{x:-8,y:0},level:1,until:w.t+1,target:null,dmgMult:1});
      stepWorld(w,[{id:'p0',kind:'brace',on:true}],()=>.5);
      return z.vel.x;
    };
    const normal=impact(false);
    expect(impact(true)).toBeCloseTo(normal*.1);
    expect(impact(true,true)).toBeCloseTo(normal);
    expect(impact(true,false,-1)-impact(true)).toBeCloseTo(impact(false,false,-1)-normal);
  });
  it.each([1,4,7])('nível%s: deixa passar10% do dano e não ativa Escudo/invulnerabilidade',level=>{
    const w=setup(),z=w.wizards[0]; z.spells.closedbody=level;
    hold(w,.6); activate(w);
    expect(z.shieldUntil).toBeLessThanOrEqual(w.t);
    expect(z.invulnUntil).toBeLessThanOrEqual(w.t);
    const hp=z.hp;
    w.projectiles.push({id:w.nextId++,born:w.t,kind:'fireball',owner:'p1',caster:'p1',pos:{x:.55,y:0},vel:{x:-8,y:0},level:1,until:w.t+1,target:null,dmgMult:1});
    stepWorld(w,[{id:'p0',kind:'brace',on:true}],()=>.5);
    expect(hp-z.hp).toBeCloseTo(7);
    expect(w.events.find(e=>e.k==='hit'&&e.id===z.id)).toMatchObject({dmg:7});
    expect(decodeSnap(encodeSnap(w,'p0',0,[]),['p0','p1']).wizards[0].hp).toBe(993);
  });
  it('requer postura já ativa, sem gastar recarga ou cancelar ação em pedido inválido',()=>{
    const w=setup(), z=w.wizards[0]; activate(w);
    expect(z.cd.closedbody).toBe(0); expect(z.closedBodyUntil??0).toBe(0);
    hold(w,.25); activate(w); expect(z.cd.closedbody).toBe(0);
    hold(w,.3); activate(w); expect(closedBodyActive(w,z)).toBe(true);
  });
  it('soltar S termina e apertar de novo não restaura o bônus',()=>{
    const w=setup(),z=w.wizards[0]; hold(w,.6); activate(w);
    stepWorld(w,[{id:'p0',kind:'brace',on:false}],()=>.5);
    expect(closedBodyActive(w,z)).toBe(false);
    hold(w,.6); expect(bracingActive(w,z)).toBe(true); expect(closedBodyActive(w,z)).toBe(false);
  });
  it.each([1,2,3,4,5,6,7])('nível%s expira no prazo correto sem encerrar Manter base nem renovar bônus',level=>{
    const w=setup(),z=w.wizards[0]; z.spells.closedbody=level; hold(w,.6); activate(w);
    const duration=3.5+.75*(level-1);
    expect(SPELLS.closedbody.levels[level-1].duration).toBe(duration);
    hold(w,duration-.2); expect(closedBodyActive(w,z)).toBe(true);
    hold(w,.3); expect(closedBodyActive(w,z)).toBe(false); expect(bracingActive(w,z)).toBe(true);
  });
  it('reduz novos status90%, combinando resistências sem limpar os antigos',()=>{
    const w=setup(),z=w.wizards[0]; z.slowUntil=10; hold(w,.6); activate(w);
    expect(statusDuration(w,z,2)).toBeCloseTo(.2); expect(z.slowUntil).toBe(10);
    applyElectrocution(w,z); expect(z.electroUntil!-w.t).toBeCloseTo(.2);
    z.shieldUntil=w.t+1; expect(statusDuration(w,z,2)).toBeCloseTo(.12);
  });
  it('reduz dano real de projétil90%, sem transformar em invulnerabilidade',()=>{
    const w=setup(),z=w.wizards[0]; hold(w,.6); activate(w);
    const before=z.hp;
    stepWorld(w,[{id:'p1',kind:'cast',spell:'fireball',at:z.pos}],()=>.5);
    hold(w,.7);
    expect(before-z.hp).toBeCloseTo(SPELLS.fireball.levels[0].dmg*.1);
  });
  it('reduz dano de lava90% e volta ao normal ao soltar S',()=>{
    const w=setup(),z=w.wizards[0]; hold(w,.6); activate(w);
    z.pos={x:40,y:0}; const hp=z.hp; stepWorld(w,[],()=>.5);
    const reduced=hp-z.hp;
    stepWorld(w,[{id:'p0',kind:'brace',on:false}],()=>.5);
    expect(reduced).toBeCloseTo((hp-reduced-z.hp)*.1);
    expect(damageFactor(w,z)).toBe(1);
  });
  it('lease expirado cancela, e snapshot oculta estado de invisíveis',()=>{
    const w=setup(),z=w.wizards[0]; hold(w,.6); activate(w);
    let snap=decodeSnap(encodeSnap(w,'p1',0,[]),['p0','p1']);
    expect(snap.wizards[0].closedBodyLeft).toBeGreaterThan(3.4);
    z.veilUntil=w.t+2;
    snap=decodeSnap(encodeSnap(w,'p1',0,[]),['p0','p1']);
    expect(snap.wizards[0].closedBodyLeft).toBe(0);
    run(w,.5); hold(w,.6); expect(closedBodyActive(w,z)).toBe(false);
  });
});
