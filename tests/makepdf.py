"""Write a minimal one-page PDF with the given lines of text (Helvetica,
WinAnsi), for synthetic bill fixtures: python3 tests/makepdf.py in.txt out.pdf"""
import sys

def pdf(lines):
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    body = "BT /F1 9 Tf 40 800 Td 12 TL " + " ".join(f"({esc(l)}) '" for l in lines) + " ET"
    stream = body.encode("cp1252")
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)

if __name__ == "__main__":
    lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
    open(sys.argv[2], "wb").write(pdf(lines))
