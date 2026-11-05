#!/usr/bin/env python3
"""Drive an interactive CLI through a PTY, for hosts without tmux.

  pty-drive.py [--size COLSxROWS] [--transcript FILE] STEP... -- COMMAND [ARGS...]

Steps run in order:
  --timeout SECONDS  timeout for the waits after it (default 10)
  --wait REGEX       wait for REGEX in the output since the last match
  --send TEXT        write TEXT; backslash escapes work, so "\\r" is Enter
                     and "\\x03" is Ctrl-C

Matching strips terminal escape sequences first. At the end it prints the
transcript and exits 0. It exits 1 if the command exited before a match and
124 on a wait timeout, printing the transcript so far. It always kills the
command's process group.
"""

import fcntl
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time

ESCAPES = re.compile(rb"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>]")


def parse(argv):
    opts = {"size": "120x40", "transcript": None}
    steps = []
    while argv and argv[0] != "--":
        flag = argv.pop(0)
        if not argv:
            sys.exit(__doc__)
        value = argv.pop(0)
        if flag in ("--size", "--transcript"):
            opts[flag[2:]] = value
        elif flag in ("--timeout", "--wait", "--send"):
            steps.append((flag[2:], value))
        else:
            sys.exit("unknown option %s\n%s" % (flag, __doc__))
    if len(argv) < 2:
        sys.exit(__doc__)
    return opts, steps, argv[1:]


class Session:
    def __init__(self, command, size, transcript):
        self.transcript = transcript
        self.raw = bytearray()
        self.seen = 0
        self.exited = False
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            try:
                os.execvp(command[0], command)
            finally:
                os._exit(127)
        cols, rows = (int(n) for n in size.split("x"))
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

    def pump(self, wait):
        ready, _, _ = select.select([self.fd], [], [], wait)
        if not ready:
            return
        try:
            chunk = os.read(self.fd, 65536)
        except OSError:
            chunk = b""
        if chunk:
            self.raw.extend(chunk)
        else:
            self.exited = True

    def wait(self, regex, timeout):
        pattern = re.compile(regex.encode(), re.M)
        deadline = time.monotonic() + timeout
        while True:
            found = pattern.search(ESCAPES.sub(b"", bytes(self.raw)), self.seen)
            if found:
                self.seen = found.end()
                return
            if self.exited:
                self.finish(1, "command exited before /%s/ appeared" % regex)
            left = deadline - time.monotonic()
            if left <= 0:
                self.finish(124, "timed out after %gs waiting for /%s/" % (timeout, regex))
            self.pump(min(left, 0.25))

    def finish(self, code, message=None):
        sys.stdout.write(self.raw.decode(errors="replace"))
        sys.stdout.flush()
        if self.transcript:
            with open(self.transcript, "wb") as f:
                f.write(self.raw)
        if message:
            print("\npty-drive: " + message, file=sys.stderr)
        try:
            os.killpg(self.pid, signal.SIGTERM)
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and os.waitpid(self.pid, os.WNOHANG) == (0, 0):
                time.sleep(0.05)
            os.killpg(self.pid, signal.SIGKILL)
        except OSError:
            pass
        sys.exit(code)


def main():
    opts, steps, command = parse(sys.argv[1:])
    s = Session(command, opts["size"], opts["transcript"])
    signal.signal(signal.SIGTERM, lambda *_: s.finish(143, "terminated"))
    timeout = 10.0
    for kind, value in steps:
        if kind == "timeout":
            timeout = float(value)
        elif kind == "send":
            os.write(s.fd, value.encode().decode("unicode_escape").encode("latin-1"))
        else:
            s.wait(value, timeout)
    end = time.monotonic() + 0.2
    while not s.exited and time.monotonic() < end:
        s.pump(0.05)
    s.finish(0)


if __name__ == "__main__":
    main()

# ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 skills/control-cli/SKILL.md (MIT)
