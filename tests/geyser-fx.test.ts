import { afterEach, describe, expect, it, vi } from 'vitest';
import { geyserHeight } from '../src/client/geyser-fx.ts';
import { createPredict } from '../src/client/predict.ts';
import type { WizView } from '../src/shared/snapshot.ts';
import { reachOf, blastOf } from '../src/client/reach.ts';
import { noSpells } from '../src/shared/spells.ts';
import { noItems } from '../src/shared/items.ts';

afterEach(()=>vi.unstubAllGlobals());
describe('Gêiser: mira, altura e previsão',()=>{
  it('mira10m e área25% menor acompanham os dados da magia',()=>{
    expect(reachOf('geyser',{...noSpells(),geyser:1},noItems())).toBe(10);
    expect(blastOf('geyser',{...noSpells(),geyser:1}) ** 2 / 1.5 ** 2).toBeCloseTo(.75);
    expect(geyserHeight(2.5)).toBe(1.8);
    expect(geyserHeight(.1)).toBeCloseTo(.9);
    expect(geyserHeight(0)).toBe(0);
  });
  it('não deixa caminhada prevista reaparecer na soltura',()=>{
    vi.stubGlobal('performance',{now:()=>1000});
    const p=createPredict();
    const s:WizView={id:'a',pos:{x:0,y:0},vel:{x:0,y:0},hp:1000,facing:0,alive:true,shield:false,status:33,geyserLeft:2,stunLeft:0};
    p.frame(s,1/60); p.move({x:5,y:0});
    expect(p.frame(s,1/60)).toEqual(s.pos);
    expect(p.frame({...s,geyserLeft:0},1/60)).toEqual(s.pos);
  });
});
