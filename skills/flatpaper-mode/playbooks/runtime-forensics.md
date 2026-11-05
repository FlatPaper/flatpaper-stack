### Runtime forensics

**You own the diagnosis. Instrument the live process. Don't theorize from source.** The deliverable is a cited diagnosis, not a fix.

For a process that is misbehaving right now: spinning, leaking, hung, or doing work nobody asked for. When the capture already exists as a file, use Trace forensics instead.

1. Name the symptom as one observable line (CPU pinned at 100% while idle, RSS grows 50 MB a minute, request hangs past 30 s) and the PID or service it belongs to. Confirm it with `top`, `ps`, or the app's own metrics before capturing anything. Decide whether the process may be paused or perturbed. Production, or anything serving users, gets sampling tools only (`sample`, `py-spy dump`, `perf top`) until the user approves a debugger attach, breakpoint, or toggle. When the symptom needs user input to trigger, drive an instance this run owns through the project's `verify-<app>` skill. Never drive production through it. Run its Cleanup only after step 2's captures are saved.
2. Capture a real signal from the live process with the tool that matches the symptom. Save every capture to a file and keep its path.
   - **Spinning or slow.** macOS: `sample <pid> 10 -file <out>` or Instruments Time Profiler. Linux: `perf record -g -p <pid>` or `perf top`. Runtime profilers: `py-spy record --pid <pid>`, `node --inspect` or `--cpu-prof`, `jcmd <pid> Thread.print`.
   - **Hung or blocked.** A thread dump (`py-spy dump --pid <pid>`, `jstack`, `lldb -p <pid>` or `gdb -p <pid>` then `thread backtrace all`), plus what it waits on: `lsof -p <pid>`, `strace -f -p <pid>` on Linux, `fs_usage -w <pid>` on macOS, `/proc/<pid>/stack` and `/proc/<pid>/status`.
   - **Leaking.** Two heap snapshots or memory samples taken minutes apart (`node --inspect` heap snapshot, `tracemalloc`, `vmmap` or `heap` on macOS, `/proc/<pid>/smaps_rollup` on Linux).
   - **Unexpected I/O or syscalls.** `strace -c -f -p <pid>` or `ltrace` on Linux, `fs_usage` or `dtruss` (needs root and SIP off) on macOS.
   - **A browser or Electron UI.** Use the `control-ui` skill. Attach with `cdp.mjs --port <n> --match <css>` to a browser started with `--remote-debugging-port`, and save console messages and exceptions with `--console`. Record a CDP trace, a CPU profile, or two heap snapshots over raw CDP (`Tracing`, `Profiler`, `HeapProfiler`), per that skill's CDP capabilities section. A CDP attach counts as a debugger attach under step 1's production rule.

   The check is a capture file on disk, not a guess.
3. Reduce the capture to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a root, the lock a thread waits on, the loop firing without input. Parse large captures in an `Explore` subagent via the Agent tool, briefed per `../references/subagent-brief.md`, and keep only the reduced finding in the main thread (guard the context window). The check is one named frame, chain, or wait.
4. Prove the mechanism before believing it. Change one input on the live process and predict the effect: attach a debugger and break on the suspect frame, evaluate an expression over `node --inspect` or on the live page with `cdp.mjs --port <n> --match <css> --eval <js>`, add a dtrace or bpftrace probe, toggle the suspect feature and capture again, or hotfix the live code without reloading. A hotfix patches the running process in memory, leaves the source unchanged, and counts as a perturbation under step 1's production rule. The check is a prediction that came true. A hypothesis that never failed a test is still a hypothesis.
5. Map the finding back to source: file, symbol, and the line that allocates, schedules, or blocks. Cite `file:line`. A frame you cannot map is not yet a diagnosis. Resolve the symbols or say plainly that the build does not carry them.

No code changes. Once the cause is known, the fix is matched to Bug fix or Perf on the next prompt.

**Reply:** the symptom, the signal captured, the reduced finding, how you proved the mechanism, the source location, and the capture paths. No fix unless asked.

<!-- ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 pstack/skills/poteto-mode/playbooks/runtime-forensics.md (MIT) -->
