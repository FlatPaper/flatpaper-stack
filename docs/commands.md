# Commands

Start real work with `/flatpaper-stack:flatpaper-mode`. It picks a playbook and calls the other skills. Call these yourself:

| Command | When |
|---|---|
| `/flatpaper-stack:flatpaper-help` | You're not sure how to word a request or which skill fits |
| `/flatpaper-stack:ketchup` | You stepped away and want a short catch-up |
| `/flatpaper-stack:bro` | The last reply was too dense |
| `/flatpaper-stack:recall` | You're starting a session and want your recent context back |
| `/flatpaper-stack:teach` | You want a change or subsystem explained |
| `/flatpaper-stack:thermos` | You want the bug and security review and the code quality review of a branch, merged into one verdict |
| `/flatpaper-stack:thermo-nuclear-review` | You want only the bug, breakage, and security audit of a diff |
| `/flatpaper-stack:thermo-nuclear-code-quality-review` | You want only the code quality audit of a diff |
| `/flatpaper-stack:fix-ci` | A PR has failing checks |
| `/flatpaper-stack:fix-merge-conflicts` | A merge or rebase hit conflicts |
| `/flatpaper-stack:get-pr-comments` | You want a PR's review comments summarized |
| `/flatpaper-stack:make-pr-easy-to-review` | A PR is hard to read |
| `/flatpaper-stack:what-did-i-get-done` | You want your commits over a period summarized |

For the best code, run the session on Opus at `high` effort: `claude --model opus --effort high`.

## Session hook

A session hook starts flatpaper-mode for work that touches more than one file, makes a design choice, or chases a bug or slowdown with an unknown cause. To turn it off, put `session hook: off` in `~/.claude/flatpaper-stack/models.md`.

## Project playbooks

A repo can extend a bundled playbook with `.agents/playbooks/<name>.md`. Each file names the playbook it `extends`, a `when` line, and changes anchored on quoted step text.

From the repo root, `node <plugin>/skills/flatpaper-mode/scripts/check-playbooks.mjs` fails when a quoted step no longer exists in the bundled playbook.
