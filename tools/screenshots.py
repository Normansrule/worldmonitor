#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Terra Atlas — regenerate the README screenshots and the promo-video stills.
#   pip install playwright && python -m playwright install chromium
#   cd site && python3 -m http.server 8765 &      # in another terminal
#   python3 tools/screenshots.py                    # writes site/docs-media/*.jpg and video/public/*.jpg
# Live layers load when you have internet; offline, the bundled datasets still render.
import base64, os, shutil, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('ATLAS_URL', 'http://localhost:8765')
OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'docs-media')
VID = os.path.join(os.path.dirname(__file__), '..', 'video', 'public')
OFFLINE = '--offline' in sys.argv  # block every non-local request (used in sandboxes without internet)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
PAUSE = "() => { try { if (window.fluidLab) window.fluidLab.config.PAUSED = true; } catch (e) {} }"

SHOTS = [  # name, path, wait seconds, js to run first, seconds after js
    ('home', '/', 12, 'scrollTo(0,0)', 1),
    ('app-daynight', '/app/#@22,-30,2.3&b=daynight&l=sun,stations,borders,cables,quakes,events', 16, None, 0),
    ('app-plates', '/app/#@-5,-120,2.1&b=bluemarble&l=plates,quakes,borders,grid', 16, "terraAtlas.showLearn('plates')", 3),
    ('app-orbits', '/app/#@30,-20,3.6&b=daynight&l=satellites,stations,sun', 18, "terraAtlas.showLearn('satellites')", 3),
    ('app-infra', '/app/#@28,55,1.5&b=night&l=cables,pipelines,routes,waterways,datacenters', 16, "terraAtlas.select({layer:'waterways', d:{name:'STRAIT OF HORMUZ', lat:26.5, lon:56.3, description:'Only sea exit from the Persian Gulf'}})", 3),
    ('app-flir', '/app/?look=flir#@36,138,1.2&b=bluemarble&l=borders,cables,quakes,nuclear', 16, None, 0),
    ('app-tour', '/app/?tour=ring-of-fire#@5,-160,2.6&b=bluemarble&l=quakes,plates,events,borders', 16, None, 0),
    ('app-country', '/app/#@47,8,1.3&b=bluemarble&l=borders,cables', 14, "terraAtlas.surfaceClick(46.8, 8.2, terraAtlas.countryAt(46.8, 8.2))", 4),
    ('app-trace', '/app/?mode=trace#@51.5,-0.1,1.2&b=bluemarble&l=sun,borders,cities,cameras,power,internet', 16, "terraAtlas.tracer().trace(51.5, -0.1)", 9),
    ('app-wind', '/app/#@20,-40,2.3&b=bluemarble&l=borders,cities,wind', 16, None, 0),
    ('app-launches', '/app/#@28,-70,2.2&b=bluemarble&l=sun,borders,cities,launches,stations', 16, "terraAtlas.select({layer:'launches', d: terraAtlas.state.data.launches[0]})", 3),
    ('fluid', '/fluid/', 8, "document.getElementById('cyclone-n').click(); setTimeout(()=>document.getElementById('jet').click(), 800)", 4),
    ('learn', '/learn/', 6, None, 0),
    ('credits', '/credits/', 5, None, 0),
    ('download', '/download/', 5, None, 0),
]

def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(VID, exist_ok=True)
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        for name, path, wait, js, after in SHOTS:
            if only and name not in only: continue
            pg = b.new_page(viewport={'width': 1440, 'height': 900})
            if OFFLINE: pg.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(BASE + path, wait_until='commit', timeout=60000); pg.wait_for_timeout(wait * 1000)
            if js: pg.evaluate(js); pg.wait_for_timeout(after * 1000)
            pg.evaluate(PAUSE); pg.wait_for_timeout(1500)
            data = pg.context.new_cdp_session(pg).send('Page.captureScreenshot', {'format': 'jpeg', 'quality': 82})['data']
            f = os.path.join(OUT, f'{name}.jpg'); open(f, 'wb').write(base64.b64decode(data))
            shutil.copy(f, os.path.join(VID, f'{name}.jpg'))
            print(f'{name:14} ok', ' | errors: ' + '; '.join(errs[:2]) if errs else '')
            pg.close()
        b.close()

if __name__ == '__main__':
    main()
