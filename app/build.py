#!/usr/bin/env python3
"""Inline the ThermoScope sources into one self-contained ThermoScope.html.

Reads app/index.html, replaces the <link> and <script src> references with the
file contents inlined, and writes ../ThermoScope.html — a single file you can
double-click or email that runs offline with no install.
"""
import datetime
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
INDEX = os.path.join(HERE, 'index.html')
OUT = os.path.abspath(os.path.join(HERE, '..', 'ThermoScope.html'))


def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def strip_query(href):
    return href.split('?', 1)[0]


def main():
    html = read(INDEX)

    def css_repl(m):
        href = strip_query(m.group(1))
        css = read(os.path.join(HERE, href))
        return '<style>\n' + css + '\n</style>'

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css_repl, html)

    def js_repl(m):
        src = strip_query(m.group(1))
        js = read(os.path.join(HERE, src))
        return '<script>\n' + js + '\n</script>'

    html = re.sub(r'<script src="([^"]+)"></script>', js_repl, html)

    # Stamp the build date into the inlined source (main.js carries a @@BUILD_DATE@@
    # token, shown in the About dialog). Must run after the JS is inlined.
    build_date = datetime.date.today().isoformat()
    html = html.replace('@@BUILD_DATE@@', build_date)

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print('Wrote', OUT, '(%d KB)' % (os.path.getsize(OUT) // 1024), '- v build', build_date)


if __name__ == '__main__':
    main()
