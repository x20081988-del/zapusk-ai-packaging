#!/usr/bin/env python3
"""Screenshot the local cockpit under several roles/themes/viewports (design pass 06.10.2026).

Run from telegram-agent's venv (it has Playwright + chromium):
  ~/telegram-agent/.venv/bin/python3 scripts/ui-screenshots.py /tmp/ui-shots --base http://localhost:5273 \
      --founder demo-founder@zapusk.tech --investor demo-investor@zapusk.tech
Auth is injected into localStorage (dev header auth, x-user-email); /decide and CRM need the
decide bridge on 127.0.0.1:10000. Dev ports on the owner's mac: API 4100, web 5273.

usage: shoot.py <outdir> [--base http://127.0.0.1:5273] [--only path,path] [--themes light,dark]
                [--views desktop,mobile]
"""
import json, sys, time, pathlib, argparse
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('outdir')
ap.add_argument('--base', default='http://127.0.0.1:5273')
ap.add_argument('--only', default='')
ap.add_argument('--themes', default='light,dark')
ap.add_argument('--views', default='desktop,mobile')
ap.add_argument('--superadmin', default='founder@zapusk.tech')
ap.add_argument('--founder', default='')
ap.add_argument('--investor', default='')
args = ap.parse_args()

OUT = pathlib.Path(args.outdir); OUT.mkdir(parents=True, exist_ok=True)
VIEWS = {'desktop': (1440, 900), 'mobile': (390, 844)}

SCREENS = [
    # (role, path, slug)
    ('SUPER_ADMIN', '/home', 'home'),
    ('SUPER_ADMIN', '/decide', 'decide'),
    ('SUPER_ADMIN', '/crm', 'crm'),
    ('SUPER_ADMIN', '/crm/depts', 'crm-depts'),
    ('SUPER_ADMIN', '/crm/depts/clients', 'crm-dept-clients'),
    ('SUPER_ADMIN', '/crm/board', 'crm-board'),
    ('SUPER_ADMIN', '/system', 'system'),
    ('SUPER_ADMIN', '/mail', 'mail'),
    ('SUPER_ADMIN', '/inbound', 'inbound'),
    ('SUPER_ADMIN', '/admin', 'admin'),
    ('SUPER_ADMIN', '/admin/users', 'admin-users'),
    ('SUPER_ADMIN', '/templates', 'templates'),
    ('SUPER_ADMIN', '/meetings', 'meetings'),
    ('SUPER_ADMIN', '/conversation-analysis', 'conversation-analysis'),
    ('SUPER_ADMIN', '/admin/knowledge', 'admin-knowledge'),
    ('FOUNDER', '/dashboard', 'founder-dashboard'),
    ('FOUNDER', '/projects', 'founder-projects'),
    ('FOUNDER', '/sales-assistant', 'sales-assistant'),
    ('FOUNDER', '/ai-leads', 'ai-leads'),
    ('FOUNDER', '/meetings', 'founder-meetings'),
    ('INVESTOR', '/opportunities', 'investor-opportunities'),
    ('SUPER_ADMIN', '/decide', 'decide-drawer'),
    ('ANON', '/login', 'login'),
    ('ANON', '/signup', 'signup'),
]
EMAILS = {'SUPER_ADMIN': args.superadmin, 'FOUNDER': args.founder, 'INVESTOR': args.investor}
only = set(filter(None, args.only.split(',')))

log = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for theme in args.themes.split(','):
        for view in args.views.split(','):
            w, h = VIEWS[view]
            for role, path, slug in SCREENS:
                if only and path not in only and slug not in only:
                    continue
                email = EMAILS.get(role, '')
                if role != 'ANON' and not email:
                    continue
                ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1,
                                          is_mobile=(view == 'mobile'), has_touch=(view == 'mobile'),
                                          locale='ru-RU')
                auth = None if role == 'ANON' else json.dumps({
                    'email': email, 'name': email, 'role': role, 'token': None, 'workspaceStatus': 'active'})
                ctx.add_init_script(f"""
                    localStorage.setItem('zapusk.theme', {json.dumps(theme)});
                    {'localStorage.setItem("zapusk.auth", ' + json.dumps(auth) + ');' if auth else 'localStorage.removeItem("zapusk.auth");'}
                """)
                page = ctx.new_page()
                errors = []
                page.on('console', lambda m, errors=errors: errors.append(m.text) if m.type == 'error' else None)
                page.on('pageerror', lambda e, errors=errors: errors.append(str(e)))
                t0 = time.time()
                try:
                    page.goto(args.base + path, wait_until='networkidle', timeout=45000)
                except Exception as e:  # keep going, record
                    errors.append(f'goto: {e}')
                page.wait_for_timeout(1800)
                name = f'{slug}__{theme}__{view}.png'
                if slug.endswith('-drawer'):
                    # mobile menu: open the burger and shoot the viewport only
                    try:
                        page.click('button[aria-label="Открыть меню"]', timeout=3000)
                        page.wait_for_timeout(600)
                    except Exception as e:
                        errors.append(f'drawer: {e}')
                    page.screenshot(path=str(OUT / name), full_page=False)
                else:
                    page.screenshot(path=str(OUT / name), full_page=True)
                url = page.url
                log.append({'file': name, 'role': role, 'path': path, 'final_url': url,
                            'ms': int((time.time() - t0) * 1000), 'console_errors': errors[:5]})
                ctx.close()
    browser.close()

(OUT / 'log.json').write_text(json.dumps(log, ensure_ascii=False, indent=1))
for r in log:
    flag = ' !! ' + '; '.join(r['console_errors'])[:160] if r['console_errors'] else ''
    print(f"{r['file']:50s} {r['ms']:6d}ms -> {r['final_url'].replace(args.base, '')}{flag}")
