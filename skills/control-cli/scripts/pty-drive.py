#!/usr/bin/env python3
"""Drive an interactive CLI through a PTY, for hosts without tmux.

  pty-drive.py [--size COLSxROWS] [--transcript FILE] STEP... -- COMMAND [ARGS...]

  --size COLSxROWS   terminal size (default 120x40)
  --transcript FILE  also write the raw output, escape sequences included

Steps run in order:
  --timeout SECONDS  timeout for the waits after it (default 10, decimals allowed)
  --wait REGEX       wait for REGEX in the output since the last match
  --send TEXT        write TEXT; backslash escapes work, so "\\r" is Enter
                     and "\\x03" is Ctrl-C
  --wait-exit        wait for the command to exit and print
                     "pty-drive: command exited with status N" on stderr

Matching strips terminal escape sequences and turns \\r\\n into \\n first.
At the end it prints the transcript and exits 0, or 3 if --wait-exit saw a
non-zero status. It exits 1 if the command exited before a match, 2 on a
usage error, 124 on a timeout, and 130 or 143 on SIGINT or SIGTERM,
printing the transcript so far. It always kills the command's process
group.
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


def usage(problem):
    print("pty-drive: %s\n\n%s" % (problem, __doc__), file=sys.stderr)
    sys.exit(2)


def parse(argv):
    if argv[:1] in (["--help"], ["-h"]):
        print(__doc__)
        sys.exit(0)
    size, transcript, steps = (120, 40), None, []
    while argv and argv[0] != "--":
        flag = argv.pop(0)
        if flag == "--wait-exit":
            steps.append(("wait-exit", None))
            continue
        if not argv:
            usage("%s needs a value" % flag)
        value = argv.pop(0)
        if flag == "--size":
            m = re.fullmatch(r"(\d+)x(\d+)", value)
            if not m:
                usage("--size must look like 120x40")
            size = (int(m.group(1)), int(m.group(2)))
        elif flag == "--transcript":
            transcript = value
        elif flag == "--timeout":
            try:
                seconds = float(value)
            except ValueError:
                seconds = 0
            if not seconds > 0:
                usage("--timeout must be a positive number of seconds")
            steps.append(("timeout", seconds))
        elif flag == "--wait":
            try:
                steps.append(("wait", (value, re.compile(value.encode(), re.M))))
            except re.error as err:
                usage("bad --wait regex %r: %s" % (value, err))
        elif flag == "--send":
            try:
                steps.append(("send", value.encode().decode("unicode_escape").encode("latin-1")))
            except UnicodeError as err:
                usage("bad escape in --send %r: %s" % (value, err))
        else:
            usage("unknown option %s" % flag)
    if len(argv) < 2:
        usage("no command after --")
    return size, transcript, steps, argv[1:]


class Session:
    def __init__(self, command, size, transcript):
        self.transcript = transcript
        self.raw = bytearray()
        self.seen = 0
        self.exited = False
        self.status = None
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            try:
                os.execvp(command[0], command)
            finally:
                os._exit(127)
        cols, rows = size
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

    def wait(self, regex, pattern, timeout):
        deadline = time.monotonic() + timeout
        while True:
            text = ESCAPES.sub(b"", bytes(self.raw)).replace(b"\r\n", b"\n").replace(b"\r", b"\n")
            found = pattern.search(text, self.seen)
            if found:
                self.seen = found.end()
                return
            if self.exited:
                self.finish(1, "command exited before /%s/ appeared" % regex)
            left = deadline - time.monotonic()
            if left <= 0:
                self.finish(124, "timed out after %gs waiting for /%s/" % (timeout, regex))
            self.pump(min(left, 0.25))

    def wait_exit(self, timeout):
        deadline = time.monotonic() + timeout
        while True:
            try:
                pid, raw_status = os.waitpid(self.pid, os.WNOHANG)
            except ChildProcessError:
                return self.status
            if pid:
                self.status = os.waitstatus_to_exitcode(raw_status)
                break
            left = deadline - time.monotonic()
            if left <= 0:
                self.finish(124, "timed out after %gs waiting for the command to exit" % timeout)
            self.pump(min(left, 0.1))
        while not self.exited:
            before = len(self.raw)
            self.pump(0.05)
            if len(self.raw) == before:
                break
        print("pty-drive: command exited with status %d" % self.status, file=sys.stderr)
        return self.status

    def finish(self, code, message=None):
        sys.stdout.write(self.raw.decode(errors="replace"))
        sys.stdout.flush()
        if self.transcript:
            with open(self.transcript, "wb") as f:
                f.write(self.raw)
        if message:
            print("\npty-drive: " + message, file=sys.stderr)
        status = None
        grace = time.monotonic() + (1 if self.exited else 0)
        while True:
            try:
                pid, raw_status = os.waitpid(self.pid, os.WNOHANG)
            except OSError:
                break
            if pid:
                status = os.waitstatus_to_exitcode(raw_status)
                break
            if time.monotonic() >= grace:
                break
            time.sleep(0.02)
        if status is not None:
            print("pty-drive: command exited with status %d" % status, file=sys.stderr)
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
    size, transcript, steps, command = parse(sys.argv[1:])
    s = Session(command, size, transcript)
    signal.signal(signal.SIGTERM, lambda *_: s.finish(143, "terminated"))
    signal.signal(signal.SIGINT, lambda *_: s.finish(130, "interrupted"))
    timeout = 10.0
    for kind, value in steps:
        if kind == "timeout":
            timeout = value
        elif kind == "send":
            os.write(s.fd, value)
        elif kind == "wait-exit":
            s.wait_exit(timeout)
        else:
            s.wait(value[0], value[1], timeout)
    end = time.monotonic() + 0.2
    while not s.exited and time.monotonic() < end:
        s.pump(0.05)
    s.finish(3 if s.status else 0)


if __name__ == "__main__":
    main()

# ported from cursor/plugins@2776ddd2355d6d6c8747d3964600f28daf62f049 skills/control-cli/SKILL.md (MIT)
