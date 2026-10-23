"""Monta scripts/assets/opcoes-rpg.tsv (lançamento) e opcoes-rpg-impacto.tsv (impacto): 10 opções por efeito sonoro,
só da biblioteca assets/sons-rpg. Escolha por palavra-chave no caminho do arquivo, em ordem de prioridade.
Uso: python -I scripts/assets/monta-opcoes-rpg.py .   (depois: bash scripts/assets/make-opcoes.sh scripts/assets/opcoes-rpg.tsv . <tmp> opcoes-rpg, e o mesmo com opcoes-rpg-impacto)"""
import os, re, sys

R = sys.argv[1]
BASE = 'assets/sons-rpg'
ALL = sorted(os.path.relpath(os.path.join(d, f), R).replace('\\', '/')
             for d, _, fs in os.walk(os.path.join(R, BASE)) for f in fs if f.lower().endswith('.wav'))
IMPACT = re.compile(r'(hit|death|impact|target|damage|strike|land|decay|bash|chop|slice)', re.I)
LOOP = re.compile(r'loop', re.I)

# palavras por magia, da mais parecida para a mais genérica
CAST = {
  'fireball': ['FireBallMissileLaunch', 'PhoenixAttack', 'FlamingArrow', 'BreathOfFire', 'Incinerate', 'LavaSpawnMissileBirth', 'SearingArrowMissileLaunch', 'FireLord', 'BloodMageRanged', 'Immolation'],
  'lightning': ['LightningBolt', 'StormBolt', 'MonsoonLightning', 'LightningShield', 'Purge', 'FarseerMissile', 'Feedback', 'ThunderBolt', 'Thunderclap', 'ManaFlare'],
  'homing': ['SorceressMissileLaunch', 'BansheeMissileLaunch', 'KeeperOfTheGroveMissileLaunch', 'NecromancerMissileLaunch', 'FarseerMissileLaunch', 'PriestCastAttack', 'DruidOfTheTalonMissileLaunch', 'LichMissile', 'FaerieDragonAttack', 'WitchDoctorCastAttack'],
  'meteor': ['VolcanicRockLaunch', 'RainOfFire', 'Volcano', 'FlameStrikeBirth', 'CatapultMissile', 'Starfall', 'InfernalBirth', 'CannonTowerMissileLaunch', 'Mortar', 'FireLord'],
  'cluster': ['FlameStrike', 'BreathOfFire', 'FragBombs', 'RainOfFire', 'Incinerate', 'Immolation', 'LiquidFire', 'FlamingArrow', 'SearingArrowMissileLaunch', 'PhoenixAttack'],
  'boomerang': ['AxeMissile', 'HuntressMissileLaunch', 'WyvernSpear', 'HeadHunterMissileLaunch', 'BristleBackMissileLaunch', 'GryphonRiderMissileLaunch', 'WindSerpent', 'RangerMissile', 'ArrowAttack', 'DryadMissile'],
  'bouncer': ['HeadHunterMissile', 'HeroDemonMissileLaunch', 'DryadMissile', 'HuntressMissileLaunch', 'GlaiveMissile', 'DemonHunterMissile', 'HarpyMissileLaunch', 'GargoyleMissileLaunch', 'TrollBatriderMissile', 'SnapDragon'],
  'recharge': ['ManaFlare', 'SpiritTouch', 'ManaPotion', 'Levelup', 'RestorationPotion', 'ReplenishMana', 'AbsorbMana', 'Tomes', 'SoulGem', 'ReceiveGold'],
  'splitter': ['FanOfKnives', 'CarrionSwarmLaunch', 'StarfallCaster', 'FragBombs', 'FlakCannon', 'SpellStealMissile', 'ShadowStrikeMissile', 'CryptFiendMissileLaunch', 'ZigguratMissileLaunch', 'GuardTowerMissileLaunch'],
  'snowball': ['FrostBoltLaunch', 'FrostArrowLaunch', 'ColdArrow', 'BreathOfFrost', 'FrostNova', 'FrostArmor', 'FreezingBreath', 'Blizzard', 'WaterElementalMissile', 'CrushingWaveCaster'],
  'teleport': ['BlinkBirth', 'MassTeleport', 'BlinkArrival', 'DarkSummoningLaunch', 'Submerge', 'PhaseShift', 'Burrow', 'RevealMap', 'Resurrect', 'SpiritWalkerMorph'],
  'swap': ['PolymorphTarget', 'SpellStealTarget', 'AlchemistTransmute', 'PolymorphDone', 'SpellStealMissile', 'ControlMagic', 'CharmTarget', 'Possession', 'Hex', 'Voodoo'],
  'rush': ['BloodlustTarget', 'Berzerker', 'StampedeCaster', 'BattleRoar', 'Berserker', 'UnholyFrenzy', 'Avatar', 'HowlOfTerror', 'Taunt', 'CallToArms'],
  'thrust': ['ImpaleLaunch', 'Shockwave', 'ShadowStrikeBirth', 'ImpaleHit', 'WyvernSpear', 'MetalHeavySlice', 'MetalMediumSlice', 'MetalLightSlice', 'ShadowStrike', 'HeroShadowhunterMissileLaunch'],
  'windwalk': ['WindWalk', 'ShadowMeld', 'InvisibilityTarget', 'SpiritWalkerMorph', 'FaerieFireLaunch', 'CycloneBirth', 'Tornado', 'CloudOfFog', 'PhaseShift', 'Sleep'],
  'shield': ['DivineShield', 'AntiMagicShell', 'SpellShield', 'ManaShield', 'DefendCaster', 'InnerFire', 'BarkSkin', 'FrostArmor', 'CityscapeCrystalShield', 'LightningShield'],
  'alteration': ['ControlMagic', 'PhaseShift', 'Feedback', 'MarkOfChaos', 'WandOfNeutralization', 'DispelMagic', 'Transmute', 'Disenchant', 'DevourMagic', 'Silence'],
  'illusion': ['MirrorImage', 'WandOfIllusion', 'CloudOfFog', 'BigBadVoodoo', 'ShadowMeld', 'Invisibility', 'PhaseShift', 'SoulPreservation', 'Banish', 'Sleep'],
  'warpzone': ['SlowTarget', 'Banish', 'SleepBirth', 'CreepSleep', 'Cyclone', 'Silence', 'Cripple', 'Tranquility', 'Renew', 'CityScapeMagicRunes'],
  'rockpillar': ['EarthquakeRock', 'ImpaleLand', 'GravemarkerBirth', 'Earthquake', 'StampedeHit', 'RockHeavyBash', 'Uproot', 'Burrow', 'AncientProtectorMissileLaunch', 'MetalHeavyBashStone'],
  'grip': ['EntanglingRootsTarget', 'EnsnareTarget', 'WebTarget', 'EntanglingRoots', 'WebMissileLaunch', 'EntangleMine', 'Root', 'MagicLariat', 'EnsnareMissile', 'Parasite'],
  'gravity': ['CycloneBirth', 'Tornado', 'DarkSummoningTarget', 'CycloneDeath', 'CrushingWave', 'Cyclone', 'Volcano', 'DeathAndDecay', 'LocustSwarm', 'Monsoon'],
  'link': ['SpiritLink', 'MagicLariat', 'EnsnareMissile', 'PossessionMissileHit', 'Root', 'Possession', 'LifeDrain', 'SiphonMana', 'WebMissile', 'Ensnare'],
  'magnetize': ['OrbOfCorruptionTarget', 'PossessionMissileLaunch', 'DispelMagic', 'OrbOfCorruptionMissile', 'DevourMagic', 'AbsorbMana', 'ControlMagic', 'Feedback', 'ManaDrain', 'SpellSteal'],
  'drain': ['LifeDrain', 'ManaDrainTarget', 'AbsorbMana', 'SiphonMana', 'SoulBurn', 'DeathCoil', 'Parasite', 'CurseTarget', 'DarkRitual', 'DeathPact'],
  'scourge': ['ThunderclapCaster', 'DeathCoilSpecialArt', 'HowlOfTerror', 'DeathAndDecayTarget', 'Avatar', 'Shockwave', 'WarStomp', 'BattleRoar', 'StampedeCaster', 'FrostNova'],
  'pact': ['DeathPactTargetBirth', 'DarkRitualTarget', 'InnerFireBirth', 'UnholyFrenzy', 'BerserkerTarget', 'CurseTarget', 'SoulBurn', 'Doom', 'BloodlustTarget', 'SacrificeUnit'],
}
# impacto: quando a magia acerta alguém (evento 'hit' com src da magia), quando o Escudo devolve ('reflect') e quando o Agarrar prende ('grip')
HIT = {
  'fireball': ['FireBallMissileDeath', 'FireLordMissileDeath', 'LavaSpawnMissileDeath', 'SearingArrowTarget', 'RainOfFireTarget', 'FlameStrikeTargetWave', 'PhoenixAttack', 'ImmolationTarget', 'Incinerate', 'AlchemistAcidBurnMissileDeath'],
  'lightning': ['ThunderBoltMissileDeath', 'MonsoonLightningHit', 'LightningShieldTarget', 'PurgeTarget', 'FarseerMissile', 'ManaFlareStrike', 'Feedback', 'ThunderclapCaster', 'EtherealHeavyHit', 'EtherealMediumHit'],
  'homing': ['SorceressMissileHit', 'BansheeMissileHit', 'KeeperOfTheGroveMissileHit', 'NecromancerMissileHit', 'PriestMissileHit', 'DruidOfTheTalonMissileHit', 'LichMissileHit', 'WitchDoctorMissileHit', 'ZigguratMissileHit', 'EtherealMediumHit'],
  'meteor': ['RainOfFireTarget', 'CatapultMissile', 'MortarImpact', 'FireLordMissileDeath', 'CannonTowerMissile', 'BoatMissileHit', 'EarthquakeRock', 'FlameStrikeTargetWave', 'MeatWagonMissileHit', 'TinkerMissileDeath'],
  'cluster': ['FlameStrikeTargetWave', 'RainOfFireTarget', 'FireBallMissileDeath', 'SearingArrowTarget', 'ImmolationTarget', 'AlchemistAcidBurnMissileDeath', 'LavaSpawnMissileDeath', 'TinkerMissileDeath', 'CannonTowerMissile', 'MortarImpact'],
  'boomerang': ['AxeMissile', 'MetalMediumSliceFlesh', 'MetalLightSliceFlesh', 'HeadHunterMissileHit', 'BristleBackMissileHit', 'ArrowImpact', 'WoodMediumBashFlesh', 'MetalMediumChopFlesh', 'HuntressMissile', 'DemonHunterMissileHit'],
  'bouncer': ['DemonHunterMissileHit', 'HeadHunterMissileHit', 'GargoyleMissileHit', 'HarpyMissileHit', 'CryptFiendMissileHit', 'ChimaeraAlternateMissileHit', 'AncientProtectorMissileHit', 'GuardTowerMissileHit', 'ZigguratMissileHit', 'EtherealMediumHit'],
  'recharge': ['ManaFlareStrike', 'PriestMissileHit', 'SorceressMissileHit', 'SpiritTouch', 'HolyBolt', 'EtherealMediumHit', 'KeeperOfTheGroveMissileHit', 'DruidOfTheTalonMissileHit', 'Levelup', 'HealTarget'],
  'splitter': ['FanOfKnivesMissileHit', 'CarrionSwarmDamage', 'GuardTowerMissileHit', 'CryptFiendMissileHit', 'ZigguratMissileHit', 'GargoyleMissileHit', 'HarpyMissileHit', 'ArrowImpact', 'FlareTarget', 'FragBombs'],
  'snowball': ['FrostBoltHit', 'FrostArrowHit', 'FrostNovaTarget', 'BlizzardTarget', 'FreezingBreathTarget', 'FrostArmorTarget', 'ColdArrow', 'LichMissileHit', 'CrushingWaveTarget', 'WaterElementalMissile'],
  'rush': ['StampedeHit', 'MetalHeavyBashFlesh', 'RockHeavyBashFlesh', 'WoodHeavyBashFlesh', 'MetalMediumBashFlesh', 'EtherealHeavyHit', 'WoodMediumBashFlesh', 'MetalHeavyChopFlesh', 'Shockwave', 'ThunderclapCaster'],
  'thrust': ['MetalHeavySliceFlesh', 'MetalMediumSliceFlesh', 'ImpaleHit', 'MetalHeavyChopFlesh', 'MetalLightSliceFlesh', 'MetalMediumChopFlesh', 'ShadowStrike', 'WyvernSpear', 'HeroShadowHunterMissileHit', 'MetalLightChopFlesh'],
  'windwalk': ['MetalHeavySliceFlesh', 'MetalMediumChopFlesh', 'ShadowStrikeMissile', 'EtherealHeavyHit', 'MetalLightSliceFlesh', 'WoodMediumBashFlesh', 'MetalHeavyBashFlesh', 'HeroShadowHunterMissileHit', 'ShadowStrikeBirth', 'EtherealMediumHit'],
  'drain': ['LifeDrain', 'SiphonMana', 'ManaDrainTarget', 'SoulBurn', 'DeathCoil', 'CurseTarget', 'AbsorbMana', 'CrippleTarget', 'Parasite', 'DarkRitual'],
  'gravity': ['CycloneDeath', 'CrushingWaveTarget', 'DarkSummoningTarget', 'EarthquakeRock', 'EtherealHeavyHit', 'RockHeavyBashFlesh', 'DeathAndDecayTarget', 'Tornado', 'StampedeHit', 'ImpaleLand'],
  'link': ['PossessionMissileHit', 'EnsnareTarget', 'SpiritLink', 'MetalHeavyBashFlesh', 'MetalMediumBashMetal', 'EntanglingRootsTarget', 'WebTarget', 'RockHeavyBashFlesh', 'EtherealHeavyHit', 'MetalHeavyChopMetal'],
  'scourge': ['DeathAndDecayTarget', 'DeathCoilSpecialArt', 'ThunderclapCaster', 'Shockwave', 'FrostNovaTarget', 'StampedeHit', 'EtherealHeavyHit', 'RockHeavyBashFlesh', 'CarrionSwarmDamage', 'ImpaleHit'],
  'shield': ['SpellShieldImpact', 'DivineShield', 'AntiMagicShell', 'MetalHeavyBashMetal', 'MetalMediumBashMetal', 'ManaShield', 'DefendCaster', 'CityscapeCrystalShield', 'MetalHeavyChopMetal', 'MetalLightChopMetal'],
  'grip': ['EntanglingRootsTarget', 'EnsnareTarget', 'WebTarget', 'EntanglingRootsDecay', 'MagicLariat', 'Root', 'EntangleMine', 'Parasite', 'WebMissile', 'TreeOfLifeGoldMine'],
}

def pick(words, impact):
    out = []
    for w in words:
        for f in ALL:
            if w.lower() in f.lower() and f not in out and (not impact or IMPACT.search(f) or True):
                out.append(f)
                break
        if len(out) == 10:
            break
    # completa com outros arquivos das mesmas palavras (2º arquivo de cada), depois da categoria genérica
    for w in words:
        for f in ALL:
            if len(out) >= 10:
                break
            if w.lower() in f.lower() and f not in out:
                out.append(f)
    return out[:10]

def write(table, name):
    lines, short = [], []
    for sid, words in table.items():
        fs = pick(words, name.endswith('impacto.tsv'))
        if len(fs) < 10:
            short.append((sid, len(fs)))
        for n, f in enumerate(fs, 1):
            dur = '1.5' if not LOOP.search(f) else '1.4'
            lines.append(f"{sid}\t{n}\t{f}\t0\t{dur}\t0.3\t{os.path.splitext(os.path.basename(f))[0]}")
    open(os.path.join(R, 'scripts/assets', name), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    print(name, len(lines), 'linhas; com menos de 10:', short)

write(CAST, 'opcoes-rpg.tsv')
write(HIT, 'opcoes-rpg-impacto.tsv')
