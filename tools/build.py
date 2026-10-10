"""Собирает весь сайт в один файл dist/chess-class.html, который открывается без сервера и без интернета."""
import pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
read = lambda p: (root / p).read_text(encoding='utf-8')

# Шрифты Google подключаются, если есть интернет; без него используются системные шрифты.
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + read('style.css') + '\n</style>')

# Код бота для Web Worker: создаём воркер из blob-ссылки, отдельные файлы не нужны.
worker_src = read('js/chess.js') + '\n' + read('js/ai.js') + '\n' + re.sub(r"importScripts\([^)]*\);", '', read('js/worker.js'))
boot = ('<script type="text/plain" id="worker-src">' + worker_src.replace('</script', '<\\/script') + '</script>\n'
        '<script>try { self.ENGINE_WORKER_URL = URL.createObjectURL(new Blob([document.getElementById("worker-src").textContent], '
        '{ type: "text/javascript" })); } catch (e) {}</script>\n')

def inline(m):
    return '<script>\n' + read(m.group(1)).replace('</script', '<\\/script') + '\n</script>'

html = html.replace('<script src="js/chess.js"></script>', boot + '<script src="js/chess.js"></script>', 1)
html = re.sub(r'<script src="(js/[a-z]+\.js)"></script>', inline, html)
out = root / 'dist' / 'chess-class.html'
out.write_text(html, encoding='utf-8')
print(out, len(html.encode()), 'байт')
