# PROTOTYPE (ticket #47)
# Prompt layer — p10k config; location of ~/.p10k.zsh owned by ticket #48
PROMPT="%{$fg[white]%}%n@%{$fg[green]%}%m%{$reset_color%} ${PROMPT}"

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
