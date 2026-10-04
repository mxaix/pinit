"""Print the Unicode L/M/N whitelist used in the SQL constraint.

Generated with Python's Unicode 16.0.0 database. For future Unicode changes, use
the output in a NEW migration; do not rewrite a migration already deployed.
"""
import unicodedata

points = [i for i in range(0x110000) if unicodedata.category(chr(i))[0] in "LMN"]
ranges = []
start = last = points[0]
for point in points[1:]:
    if point == last + 1:
        last = point
    else:
        ranges.append((start, last))
        start = last = point
ranges.append((start, last))

def escape(point):
    return f"\\{point:04x}" if point <= 65535 else f"\\+{point:06x}"

pattern = "^[\\0020\\0027\\002e\\005f\\2019"
pattern += "".join(escape(a) + ("-" + escape(b) if a != b else "") for a, b in ranges)
pattern += "\\002d]+$"
print(f"-- Unicode {unicodedata.unidata_version}")
print(f"alias ~ U&'{pattern}'")
