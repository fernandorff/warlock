#!/usr/bin/env bash
# Gera public/sfx/*.mp3 e public/music/battle.mp3 a partir de D:\Projetos\warlock-assets (mono, 44.1 kHz, pico em -1 dBFS nos sfx). Grava no public/ do próprio repo.
# bash scripts/assets/make-audio.sh <scratch-dir>
set -euo pipefail
A=/d/Projetos/warlock-assets; P="$(cd "$(dirname "$0")/../.." && pwd)/public"; T=${1:?scratch dir}
mkdir -p "$P/sfx" "$P/music" "$T"

# sfx <fonte> <saida> <inicio> <duracao|0> <fade-out> [bitrate] [ganho-dB]
# corta o silêncio inicial, limita a duração, aplica fade-out e normaliza o pico para -1 dBFS;
# ganho-dB (negativo) abaixa o som depois disso. Os sons das magias (SPELLS) saem todos no mesmo volume percebido (LUFS)
SPELLS=" fireball lightning homing shield teleport frost swap grip meteor rush cluster boomerang thrust gravity rockpillar bouncer drain illusion magnetize recharge alteration link windwalk splitter warpzone "
sfx() {
  local src=$1 out=$2 ss=$3 dur=$4 fade=$5 br=${6:-80k} trim=${7:-0} wav="$T/$2.wav" f
  f="silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02"
  [ "$dur" != 0 ] && f="$f,atrim=0:$dur,asetpts=PTS-STARTPTS"
  [ "$dur" != 0 ] && f="$f,afade=t=out:st=$(python -I -c "print(max(0,$dur-$fade))"):d=$fade"
  ffmpeg -v error -y -ss "$ss" -i "$src" -ac 1 -ar 44100 -af "$f" "$wav"
  if [[ $SPELLS == *" $out "* ]]; then loud_encode "$wav" "$P/sfx/$out.mp3" "$br"; else norm_encode "$wav" "$P/sfx/$out.mp3" "$br" "$trim"; fi
}
# loud_encode: volume percebido igual em todos (-18 LUFS integrado; antes iam de -11,8 a -20,4) e pico limitado a -1 dB;
# som com menos de 0,4 s é medido completado com silêncio até 0,4 s (a medida precisa de uma janela de 0,4 s)
LUFS=-18
loud_encode() {
  local wav=$1 out=$2 br=$3 i gain
  i=$(ffmpeg -hide_banner -nostats -i "$wav" -af apad=whole_dur=0.4,ebur128 -f null - 2>&1 | sed -n 's/^ *I: *\(-\?[0-9.]*\) LUFS/\1/p' | tail -1)
  gain=$(python -I -c "print(round($LUFS-($i),2))")
  ffmpeg -v error -y -i "$wav" -af "volume=${gain}dB,alimiter=limit=0.891:attack=1:release=50:level=false" -ac 1 -ar 44100 -c:a libmp3lame -b:a "$br" "$out"
  echo "$(basename "$out"): I_in=${i}LUFS gain=${gain}dB"
}
norm_encode() {
  local wav=$1 out=$2 br=$3 trim=${4:-0} mx gain
  mx=$(ffmpeg -hide_banner -i "$wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\?[0-9.]*\) dB/\1/p')
  gain=$(python -I -c "print(round(-1-($mx)+($trim),2))")
  ffmpeg -v error -y -i "$wav" -af "volume=${gain}dB" -ac 1 -ar 44100 -c:a libmp3lame -b:a "$br" "$out"
  echo "$(basename "$out"): max_in=${mx}dB gain=${gain}dB"
}

sfx "$A/oga-fireball/105016__julien-matthey__jm-fx-fireball-01.wav" fireball 0 2.3 0.12
sfx "$A/kenney-scifi/x/Audio/explosionCrunch_000.ogg" explode 0 0 0
sfx "$A/kenney-scifi/x/Audio/forceField_000.ogg" shield 0 0 0
sfx "$A/oga-spells/teleport.ogg" teleport 0.70 1.2 0.12      # primeira das 3 takes (0.74-1.82 s)
sfx "$A/lentikula-spell-impacts/extracted/Lightning Spell Impacts/Lightning Spell Impact 1.wav" lightning 0.44 1.2 0.2 # ataque seco em 0,46 s
sfx "$A/oga-magicspell/magical_7_0.ogg" homing 0 0 0         # mais brilhante (centroide ~3.5 kHz)
sfx "$A/lentikula-spell-impacts/extracted/Ice Spell Impacts/Ice Spell Impact 5.wav" frost 0.08 1.1 0.15 # Bola de neve
sfx "$A/kenney-impact/x/Audio/impactPunch_heavy_000.ogg" hit 0 0 0
sfx "$A/kenney-interface/x/Audio/click_001.ogg" click 0 0 0
sfx "$A/kenney-interface/x/Audio/confirmation_001.ogg" confirm 0 0 0

# um som próprio por magia (cada arquivo tem o nome do id; a Bola de neve usa frost, acima). O último número abaixa os sons contínuos (dB)
L="$A/lentikula-spell-impacts/extracted"; K="$A/kenney-scifi/x/Audio"; M="$A/oga-magicspell"; B="$A/oga-breaking75/extracted"
sfx "$M/magical_2.ogg" swap 0 1.2 0.2                                   # Troca
sfx "$B/bfh1_metal_hit_02.ogg" grip 0 0 0                               # Agarrar
sfx "$L/Fire Spell Impacts/Fire Spell Impact 4.wav" meteor 0.05 1.3 0.25 # Meteoro (o mais grave dos 5 de fogo)
sfx "$K/thrusterFire_001.ogg" rush 0 0.9 0.3                            # Investida
sfx "$L/Fire Spell Impacts/Fire Spell Impact 5.wav" cluster 0.05 1.1 0.25 # Rajada
sfx "$K/engineCircular_002.ogg" boomerang 0 1.1 0.3 80k -2              # Bumerangue
sfx "$B/bfh1_metal_hit_04.ogg" thrust 0 0 0                             # Estocada
sfx "$K/spaceEngineLow_000.ogg" gravity 0.2 1.4 0.4 80k -6              # Gravidade (zumbido grave contínuo)
sfx "$A/oga-boulder/boulder_drop_0.ogg" rockpillar 0 0 0                # Barricada
sfx "$L/Lightning Spell Impacts/Lightning Spell Impact 3.wav" bouncer 0.35 1.2 0.25 # Ricochete
sfx "$L/Water Spell Impacts/Water Spell Impact 1.wav" drain 0.15 1.2 0.25 # Drenar
sfx "$M/magical_3.ogg" illusion 0 1.3 0.3 80k -3                        # Ilusão
sfx "$M/magical_1_0.ogg" magnetize 0 1.3 0.3 80k -1                     # Magnetizar
sfx "$M/magical_4.ogg" recharge 0 1.4 0.4                               # Recarga
sfx "$M/magical_5.ogg" alteration 0 1.2 0.3 80k -2                      # Alteração
sfx "$K/laserLarge_001.ogg" link 0 0 0                                  # Elo
sfx "$K/doorOpen_000.ogg" windwalk 0 0 0                                # Caminhada no vento
sfx "$L/Fire Spell Impacts/Fire Spell Impact 1.wav" splitter 0.35 1.2 0.3 # Divisor
sfx "$K/spaceEngine_000.ogg" warpzone 0 1.4 0.3                         # Zona de dobra (zumbido que pulsa)

# lava_loop: crossfade de 0.4 s entre o fim e o início, para o laço não estalar
X=0.4; SRC="$A/oga-firecrackle/fire-1_0.ogg"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
ffmpeg -v error -y -i "$SRC" -ac 1 -ar 44100 -filter_complex \
 "[0:a]asplit=3[a][b][c];[a]atrim=$(python -I -c "print($D-$X)"):$D,asetpts=PTS-STARTPTS[tail];[b]atrim=0:$X,asetpts=PTS-STARTPTS[head];[c]atrim=$X:$(python -I -c "print($D-$X)"),asetpts=PTS-STARTPTS[mid];[tail][head]acrossfade=d=$X:c1=qsin:c2=qsin[cf];[cf][mid]concat=n=2:v=0:a=1[o]" \
 -map "[o]" "$T/lava_loop.wav"
norm_encode "$T/lava_loop.wav" "$P/sfx/lava_loop.mp3" 64k

# música: sem corte (é laço), mono 64 kbps. A fonte é estéreo no pico (0 dBFS): mistura 50/50 e -5,4 dB para igualar os -17,8 LUFS da faixa anterior.
# (cd: o ffmpeg do Git Bash não acha caminho absoluto com colchetes no nome)
(cd "$A/oga-epic-boss-battle" && ffmpeg -v error -y -i "Juhani Junkala - Epic Boss Battle [Seamlessly Looping].wav" -af "pan=mono|c0=0.5*c0+0.5*c1,volume=-5.4dB" -ar 44100 -c:a libmp3lame -b:a 64k "$P/music/battle.mp3")
