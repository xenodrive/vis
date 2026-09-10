# Run with LC_ALL=C. Input has already passed strict UTF-8 validation.
function quote(text,    i,c,out) {
  out = "\""
  for (i = 1; i <= length(text); i++) {
    c = substr(text, i, 1)
    if (c == "\\" || c == "\"") out = out "\\" c
    else if (c in controls) out = out controls[c]
    else out = out c
  }
  return out "\""
}
function bounded(text,    i,c,n,end) {
  n = 0
  end = length(text)
  for (i = 1; i <= length(text); i++) {
    c = substr(text, i, 1)
    if (c !~ /[\200-\277]/) {
      n++
      if (n == maxchars + 1) end = i - 1
    }
  }
  omitted = n > maxchars ? n - maxchars : 0
  return substr(text, 1, end)
}
function finish() {
  if (!hunk) return
  printf "%s{\"patch\":%s,\"omittedLines\":%d,\"omittedCharacters\":[%s]}", separator, quote(body), skipped, omissions
  separator = ","
}
BEGIN {
  for (i = 0; i < 32; i++) controls[sprintf("%c", i)] = sprintf("\\u%04x", i)
  printf "{\"hunks\":["
}
/^diff --git / { finish(); hunk = 0 }
/^@@ / {
  finish()
  hunk = 1
  body = bounded($0) "\n"
  omissions = omitted
  count = 0
  skipped = 0
  next
}
{
  if (!hunk) {
    header = header bounded($0) "\n"
    next
  }
  count++
  if (count <= maxlines) {
    body = body bounded($0) "\n"
    omissions = omissions "," omitted
  } else skipped++
}
END { finish(); printf "],\"header\":%s}\n", quote(header) }
