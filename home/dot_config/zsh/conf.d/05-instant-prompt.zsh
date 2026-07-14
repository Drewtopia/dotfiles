# PROTOTYPE (ticket #47)
# Enable Powerlevel10k instant prompt. Must load before anything that might
# print or prompt; keep this the first conf.d fragment.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi
