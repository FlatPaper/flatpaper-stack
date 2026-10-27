#!/usr/bin/env bash
# Check a plan written from the Multi-phase plan playbook skeleton.
# Prints one line per problem and exits 1 if any. Usage: check-plan.sh <plan.md>
set -uo pipefail
[ $# -eq 1 ] && [ -f "$1" ] || { echo "usage: check-plan.sh <plan.md>" >&2; exit 2; }

LC_ALL=C awk -v F="$1" '
function fail(n, m) { print F ":" n ": " m; bad++ }
# Replace each code span with one backtick. A span opens on a run of backticks
# and closes on the next run of the same length. Text after an unclosed run is prose.
function nocode(s,   out, run, rest) {
  out = ""
  while (match(s, /`+/)) {
    out = out substr(s, 1, RSTART - 1) "`"; run = RLENGTH; s = substr(s, RSTART + RLENGTH)
    rest = s
    while (match(rest, /`+/)) {
      if (RLENGTH == run) { s = substr(rest, RSTART + RLENGTH); break }
      rest = substr(rest, RSTART + RLENGTH)
    }
  }
  return out s
}
function boxes(b) { return gsub(/(^|\n)[ \t]*- \[[ x]\] /, "&", b) }
function endblock() { if (blk != "") { body[blk] = cur; cnt[blk] = boxes(cur) } cur = "" }
function endpr(   i, want, got, b, n, lines, k, m) {
  if (!inpr) return
  endblock()
  want = "Depends on.|Files.|Build.|You see.|Verify, unit.|Verify, live.|Verify, perf.|Review gate.|Merge."
  if (order != want) fail(prn, prt ": sub-blocks are [" order "], expected [" want "]")
  if (rest["Depends on."] == "") fail(prn, prt ": Depends on names nothing")
  split("Files.|Build.|You see.|Verify, unit.|Merge.", need, "|")
  for (i in need) if (need[i] in cnt && cnt[need[i]] == 0) fail(prn, prt ": " need[i] " has no box")
  split("Verify, unit.|Verify, live.|Verify, perf.", vb, "|")
  for (i in vb) if (vb[i] in rest && index(rest[vb[i]], RULE) != 1) fail(prn, prt ": " vb[i] " does not open with the rule")
  n = split(body["Verify, live."], lines, "\n"); k = 0
  for (i = 1; i <= n; i++) if (lines[i] ~ /^[ \t]*- \[[ x]\] /) {
    k++
    if (lines[i] !~ ("- \\[[ x]\\] Lane " k "\\. ")) { fail(prn, prt ": live box " k " is not \"Lane " k ".\""); continue }
    if (lines[i] !~ /Save `[^`]+`/) fail(prn, prt ": lane " k " names no saved file")
    if (index(lines[i], "Pass when") == 0) fail(prn, prt ": lane " k " has no pass predicate")
    if (k == 1 && index(lines[i], "Regression lane against trunk") == 0) fail(prn, prt ": lane 1 is not the regression lane against trunk")
  }
  if ("Verify, live." in rest && k == 0) fail(prn, prt ": Verify, live has no lanes")
  n = split(body["Verify, perf."], lines, "\n"); got = ""
  for (i = 1; i <= n; i++) if (match(lines[i], /- \[[ x]\] [A-Za-z]+\./)) got = got (got == "" ? "" : "|") substr(lines[i], RSTART + 6, RLENGTH - 6)
  if ("Verify, perf." in rest && got != "Metric.|Probe.|Baseline.|Rule.") fail(prn, prt ": perf boxes are [" got "], expected [Metric.|Probe.|Baseline.|Rule.]")
  if ("Review gate." in rest) {
    if (index(rest["Review gate."], "None.") == 1) { if (cnt["Review gate."]) fail(prn, prt ": Review gate says None but has boxes") }
    else {
      if (!cnt["Review gate."]) fail(prn, prt ": Review gate has no box")
      split("screenshot|video|user", w, "|")
      for (i in w) if (index(body["Review gate."], w[i]) == 0) fail(prn, prt ": Review gate lacks \"" w[i] "\"")
    }
  }
  prs++; inpr = 0
}
BEGIN {
  RULE = "Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked."
  SUB = "|Depends on.|Files.|Build.|You see.|Verify, unit.|Verify, live.|Verify, perf.|Review gate.|Merge.|"
}
NR == 1 { sub(/^\xef\xbb\xbf/, "") }
fence != "" {
  t = $0; gsub(/^[ \t]+|[ \t]+$/, "", t)
  if (length(t) >= length(fence) && t ~ (substr(fence, 1, 1) == "`" ? "^`+$" : "^~+$")) fence = ""
  next
}
# A fence opens with up to three spaces of indent. The info string of a backtick
# fence holds no backtick, so a line like ```x``` is inline code, not a fence.
match($0, /^(   |  | )?(```+|~~~+)/) {
  f = substr($0, RSTART, RLENGTH); gsub(/ /, "", f)
  if (!(substr(f, 1, 1) == "`" && index(substr($0, RSTART + RLENGTH), "`"))) { fence = f; fenceat = NR; next }
}
{
  prose = nocode($0)
  if (prose ~ /\xe2\x80[\x93\x94]/) fail(NR, "long dash")
  if (prose ~ /\xe2\x80[\x98\x99\x9c\x9d]/) fail(NR, "curly quote")
  if (prose ~ /<[A-Za-z][^>]*>/) fail(NR, "unfilled placeholder")
  if (prose ~ /: [^ ]/) fail(NR, "mid-sentence colon")
}
/^# / && !h1 { h1 = NR; next }
/^## / {
  endpr(); sec = substr($0, 4); h2n++
  if (sec == "How to read this") { how = NR; intro = nonblank }
  else if (sec == "Program checklist") prog = NR
  else if (sec == "Close the program") closeat = NR
  else if (closeat) { if (sec !~ /^Appendix/) fail(NR, "\"## " sec "\" after Close the program is not an appendix"); if (sec ~ /Prototype evidence/) proto = 1 }
  else if (prog) { inpr = 1; prn = NR; prt = sec; order = ""; blk = ""; delete rest; delete cnt; delete body }
  next
}
h1 && !how && NF { nonblank++ }
sec == "How to read this" { howtext = howtext $0 "\n" }
sec == "Program checklist" && /^### / { h3 = h3 "|" substr($0, 5) }
inpr && match($0, /^\*\*[^*]+\*\*/) && index(SUB, "|" substr($0, 3, RLENGTH - 4) "|") {
  endblock(); blk = substr($0, 3, RLENGTH - 4)
  order = order (order == "" ? "" : "|") blk
  rest[blk] = substr($0, RLENGTH + 1); sub(/^ +/, "", rest[blk]); next
}
inpr { cur = cur $0 "\n" }
END {
  endpr()
  if (fence != "") fail(fenceat, "unclosed fence")
  if (!h1) fail(1, "no H1 title")
  if (!how) fail(1, "no \"## How to read this\" section")
  else {
    if (intro >= 10) fail(h1, "intro is " intro " lines, under ten required")
    split("One box is one unit of work|Check a box only when its evidence exists|" RULE, m, "|")
    for (i in m) if (index(howtext, m[i]) == 0) fail(how, "How to read this lacks \"" m[i] "\"")
  }
  if (!prog) fail(1, "no \"## Program checklist\" section")
  else if (h3 !~ /\|Arm the program.*\|Order and boundaries.*\|PR mechanics.*\|Boot recipe/) fail(prog, "Program checklist lacks Arm the program, Order and boundaries, PR mechanics, Boot recipe in order")
  if (!closeat) fail(1, "no \"## Close the program\" section")
  else if (!proto) fail(closeat, "no \"## Appendix ... Prototype evidence\" section")
  if (!prs) fail(1, "no PR sections between Program checklist and Close the program")
  print prs + 0 " PR sections, " bad + 0 " problems"
  exit (bad > 0)
}' "$1"
