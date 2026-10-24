import { describe, expect, it } from 'vitest';
import { newWorld, stepWorld, type ProjKind, type Projectile } from '../src/shared/sim.ts';
import { noSpells } from '../src/shared/spells.ts';
import { run } from './helpers.ts';
import { demoWorld, demoStep } from '../src/client/demo.ts';

function setup() {
  const w=newWorld(['a','b','c'],{a:{...noSpells(),geyser:1},b:noSpells(),c:noSpells()}, {},0,()=>.5);
  w.pillars=[]; w.isles=[]; w.arenaR=30; w.shrinkAt=Infinity;
  w.wizards.forEach((z,i)=>{z.pos={x:[-5,0,4][i],y:0};z.invulnUntil=0;z.regen=0;});
  stepWorld(w,[{id:'a',kind:'cast',spell:'geyser',at:{x:0,y:0}}],()=>.5); run(w,.2);
  return w;
}
function bolt(w: ReturnType<typeof setup>,kind: ProjKind):Projectile {
  const p:Projectile={id:w.nextId++,kind,owner:'a',caster:'a',pos:{x:-1.5,y:0},vel:{x:8,y:0},level:1,until:w.t+3,target:kind==='basic'||kind==='homing'?'b':null,dmgMult:1};
  if(kind==='boomerang')p.curve={acc:{x:0,y:0},next:{x:0,y:0},flipAt:w.t+2,stopAt:w.t+3};
  w.projectiles.push(p); return p;
}
describe('projéteis atravessam corpos suspensos',()=>{
  it('demonstra projétil passando por baixo do jato ocupado',()=>{
    const s=demoWorld('geyser');let through=false;
    while(s.w.t<s.script.end){demoStep(s);through ||= s.w.projectiles.some(p=>p.kind==='fireball'&&p.owner==='d'&&p.pos.x>2);}
    expect(through).toBe(true);
  });
  it.each(['fireball','homing','swap','cluster','boomerang','bouncer','drain','snowball','magnetize','recharge','link','splitter','shard','basic'] as ProjKind[])('%s atravessa sem acerto/reflexo ou consumo',kind=>{
    const w=setup(), p=bolt(w,kind); const events=[];
    for(let i=0;i<18;i++){stepWorld(w,[],()=>.5);events.push(...w.events);}
    expect(w.projectiles.some(q=>q.id===p.id),kind).toBe(true);
    expect(p.pos.x,kind).toBeGreaterThan(0);
    expect(events.some(e=>(e.k==='hit'||e.k==='reflect'||e.k==='teleport') && e.id==='b'),kind).toBe(false);
  });
  it('atravessa mesmo Escudo e Alteração já ativos no suspenso',()=>{
    const w=setup(), z=w.wizards[1];
    z.shieldUntil=w.t+5;z.alterUntil=w.t+5;z.spells.alteration=1;z.shieldR=2;
    const p=bolt(w,'fireball');run(w,.3);
    expect(w.projectiles.some(q=>q.id===p.id)).toBe(true);
    expect(p.pos.x).toBeGreaterThan(0);expect(p.owner).toBe('a');
  });
  it('continua até acertar um alvo no chão atrás do suspenso',()=>{
    const w=setup();bolt(w,'fireball');const hp=w.wizards[2].hp;
    run(w,.8);expect(w.wizards[2].hp).toBeLessThan(hp);
    expect(w.wizards[1].hp).toBe(w.wizards[1].hpMax);
  });
  it('volta a colidir com o mesmo personagem depois da suspensão',()=>{
    const w=setup();run(w,2.6);const hp=w.wizards[1].hp;
    bolt(w,'fireball');run(w,.3);expect(w.wizards[1].hp).toBeLessThan(hp);
  });
});
