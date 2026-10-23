#!/usr/bin/env bash
# Opções da issue #203 (teste local, painel do Sandbox): gera public/sfx/opcoes/<magia>-<n>.mp3 com o mesmo corte e o mesmo volume (-18 LUFS)
# do make-audio.sh, a partir de uma tabela TSV: magia<TAB>n<TAB>fonte<TAB>inicio<TAB>duracao|0<TAB>fade<TAB>rotulo
# bash scripts/assets/make-opcoes.sh scripts/assets/opcoes.tsv . <pasta-temporária> [pasta em public/sfx, padrão opcoes]   (fontes em /d/Projetos/warlock-assets, caminhos na tabela)
set -euo pipefail
TAB=$1; R=$2; T=$3; O="$R/public/sfx/${4:-opcoes}"; LUFS=-18
mkdir -p "$O" "$T"
json="{"
declare -A labels
while IFS=$'\t' read -r id n src ss dur fade label; do
  [ -z "$id" ] || [ "${id:0:1}" = "#" ] && continue
  wav="$T/$id-$n.wav"
  f="silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02"
  [ "$dur" != 0 ] && f="$f,atrim=0:$dur,asetpts=PTS-STARTPTS,afade=t=out:st=$(python -I -c "print(max(0,$dur-$fade))"):d=$fade"
  ffmpeg -v error -y -ss "$ss" -i "$src" -ac 1 -ar 44100 -af "$f" "$wav"
  i=$(ffmpeg -hide_banner -nostats -i "$wav" -af apad=whole_dur=0.4,ebur128 -f null - 2>&1 | sed -n 's/^ *I: *\(-\?[0-9.]*\) LUFS/\1/p' | tail -1)
  gain=$(python -I -c "print(round($LUFS-($i),2))")
  ffmpeg -v error -y -i "$wav" -af "volume=${gain}dB,alimiter=limit=0.891:attack=1:release=50:level=false" -ac 1 -ar 44100 -c:a libmp3lame -b:a 80k "$O/$id-$n.mp3"
  labels[$id]="${labels[$id]:-}${labels[$id]:+,}\"$label\""
  echo "$id-$n: I_in=$i gain=$gain ($label)"
done < "$TAB"
for id in "${!labels[@]}"; do json="$json\"$id\":[${labels[$id]}],"; done
echo "${json%,}}" > "$O/lista.json"
