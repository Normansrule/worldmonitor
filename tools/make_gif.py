#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Terra Atlas — render the spinning-globe GIF used at the top of the README (needs the site served on :8765).
import base64, io, sys
from PIL import Image
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
frames = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 900, 'height': 560})
    if '--offline' in sys.argv: pg.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    pg.goto(BASE + '/app/#@15,0,2.3&b=daynight&l=sun,stations,cables,routes', wait_until='commit'); pg.wait_for_timeout(15000)
    pg.evaluate("document.querySelectorAll('.topbar,.bottombar,.panel').forEach(e=>e.style.display='none')")
    cdp = pg.context.new_cdp_session(pg)
    for i in range(24):
        pg.evaluate(f"(() => {{ const g = terraAtlas.globe; g.pointOfView({{ lat: 15, lng: {-i * 15}, altitude: 2.3 }}, 0); }})()")
        pg.wait_for_timeout(1800)
        d = cdp.send('Page.captureScreenshot', {'format': 'png'})['data']
        frames.append(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB').resize((600, 373), Image.LANCZOS))
    b.close()
pal = [f.quantize(colors=160, method=Image.Quantize.MEDIANCUT) for f in frames]
pal[0].save('site/docs-media/terra-atlas-spin.gif', save_all=True, append_images=pal[1:], duration=110, loop=0, optimize=True)
print('gif frames', len(frames))
