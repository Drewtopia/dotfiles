---
description: Show jj status and recent log
allowed-tools: Bash
---

Show the current jj status and recent history:

```bash
jj status && echo "" && jj log -r "@-5::@"
```
