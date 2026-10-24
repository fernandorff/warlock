import { describe, expect, it } from 'vitest';
import { DT, WIZ_R } from '../src/shared/constants.ts';
import { CAST_POINT, noSpells, SPELLS, BLINDNESS } from '../src/shared/spells.ts';
import { incapacitatedUntil, stepWorld } from '../src/shared/sim.ts';
import { inCone } from '../src/shared/sand-cone.ts';
import { decodeSnap, encodeSnap } from '../src/shared/snapshot.ts';
import { run, world } from './helpers.ts';

function setup(level=1) {
  const w=world([[0,0],[2.5,0],[5,3]],{...noSpells(),cluster:level,pact:1});
  w.pillars=[];w.isles=[];w.runes=[];w.arenaR=30;w.shrinkAt=Infinity;
  for(const z of w.wizards){z.regen=0;z.stunLeft=0;}
  return w;
}
function cast(w:ReturnType<typeof setup>){
  stepWorld(w,[{id:'p0',kind:'cast',spell:'cluster',at:{x:3,y:0}}],()=>.5);
  run(w,CAST_POINT.cluster+DT);
}
describe('Rajada de areia e Cegueira',()=>{
  it.each([1,2,3,4,5,6,7])('nível%s: dano único e prazos independentes, sem impulso/projéteis',level=>{
    const w=setup(level),z=w.wizards[1],l=SPELLS.cluster.levels[level-1];cast(w);
    expect(l.dmg).toBe(20+8*(level-1));expect(l.blind).toBe(2+.5*(level-1));expect(l.incapacitate).toBe(1+.25*(level-1));
    expect(z.hp).toBe(1000-l.dmg);expect(z.vel).toEqual({x:0,y:0});
    expect(z.blindUntil!-z.incapacitateUntil!).toBeCloseTo(l.blind-l.incapacitate);
    expect(z.blindUntil!-w.t).toBeGreaterThan(l.blind-.1);
    expect(w.projectiles).toHaveLength(0);
  });
  it('cone3×2 acompanha rotação, corpo na borda e exclui atrás/laterais/distante',()=>{
    expect(inCone({x:0,y:0},{x:1,y:0},3,2,{x:3,y:1})).toBe(true);
    expect(inCone({x:0,y:0},{x:1,y:0},3,2,{x:1,y:1})).toBe(false);
    expect(inCone({x:0,y:0},{x:1,y:0},3,2,{x:-1,y:0},WIZ_R)).toBe(false);
    expect(inCone({x:0,y:0},{x:1,y:0},3,2,{x:3+WIZ_R-.01,y:0},WIZ_R)).toBe(true);
    expect(inCone({x:0,y:0},{x:0,y:1},3,2,{x:1,y:3})).toBe(true);
    const w=setup();w.wizards[1].pos={x:4,y:0};cast(w);expect(w.wizards[1].blindUntil??0).toBe(0);
  });
  it('não afeta lançador/aliado, suspenso ou invulnerável; obstáculos bloqueiam',()=>{
    for(const mode of ['ally','invuln','geyser','wall'] as const){
      const w=setup(),z=w.wizards[1];
      if(mode==='ally')w.wizards[0].team=z.team=0;
      if(mode==='invuln')z.invulnUntil=10;
      if(mode==='geyser'){z.geyserLeft=2;z.geyserAt={...z.pos};z.invulnUntil=2;}
      if(mode==='wall')w.pillars=[{pos:{x:1.5,y:0},hp:1000,alive:true,kind:'rockpillar',until:10}];
      cast(w);expect(z.hp,mode).toBe(1000);expect(z.blindUntil??0,mode).toBe(0);expect(w.wizards[0].blindUntil??0).toBe(0);
    }
  });
  it('status respeitam resistências gerais e Escudo não reflete cone',()=>{
    const w=setup(),z=w.wizards[1];z.shieldUntil=10;cast(w);
    expect(z.hp).toBe(1000);
    expect(z.blindUntil!-z.incapacitateUntil!).toBeCloseTo(.6);
    expect(w.wizards[0].blindUntil??0).toBe(0);
    const v=setup(),q=v.wizards[1];q.braceReadyAt=0;q.braceUntil=10;q.closedBodyUntil=10;cast(v);
    expect(q.hp).toBe(998);expect(q.blindUntil!-q.incapacitateUntil!).toBeCloseTo(.1);
  });
  it('Incapacitar pausa recarga sem slow/stun nem bloqueio de magia pronta',()=>{
    const w=setup(),z=w.wizards[1];z.cd.fireball=10;cast(w);
    const left=z.cd.fireball-w.t;
    run(w,.2);
    expect(z.cd.fireball-w.t).toBeCloseTo(left);
    expect(z.slowUntil).toBeLessThanOrEqual(w.t);expect(z.electroUntil??0).toBe(0);expect(z.stunLeft).toBe(0);
    stepWorld(w,[{id:'p1',kind:'cast',spell:'pact',at:z.pos}],()=>.5);
    expect(w.events.some(e=>e.k==='cast'&&e.id==='p1'&&e.spell==='pact')).toBe(true);
    run(w,.15);expect(z.pactUntil).toBeGreaterThan(w.t);
    run(w,2);expect(incapacitatedUntil(z,w.t)).toBeLessThanOrEqual(w.t);
  });
  it('cegueira só restringe a visão de quem recebe, restaura após prazo e sincroniza snapshot',()=>{
    const w=setup();cast(w);
    let own=decodeSnap(encodeSnap(w,'p1',0,[]),['p0','p1','p2']);
    const other=decodeSnap(encodeSnap(w,'p0',0,[]),['p0','p1','p2']);
    expect(own.wizards[1].blindLeft).toBeGreaterThan(1.8);
    expect(own.wizards[2].status&2048).toBe(2048);expect(other.wizards[2].status&2048).toBe(0);
    expect(own.wizards[0].status&2048).toBe(0);expect(BLINDNESS.radius*2).toBe(6);
    run(w,2.1);own=decodeSnap(encodeSnap(w,'p1',0,[]),['p0','p1','p2']);
    expect(own.wizards[1].blindLeft).toBe(0);expect(own.wizards[2].status&2048).toBe(0);
  });
});
