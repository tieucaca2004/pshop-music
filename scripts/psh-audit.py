#!/usr/bin/env python3
"""PSH Platform Audit — verified from source code only"""
import os, subprocess, json

os.chdir(r'D:\PshopMusicSite')

def fsize(p):
    return os.path.getsize(p) if os.path.exists(p) else 0

def flines(p):
    try:
        with open(p,'r',encoding='utf-8',errors='replace') as f:
            return len(f.readlines())
    except: return 0

project = {'dirs': [], 'admin_pages': [], 'admin_ai_pages': [], 'js_files': [],
           'ai_modules': [], 'ai_providers': [], 'ai_core': [], 'functions': [],
           'workflows': [], 'scripts': []}

for d in os.listdir('.'):
    if os.path.isdir(d) and not d.startswith('.') and d not in ('node_modules','media'):
        project['dirs'].append(d)

for f in sorted(os.listdir('admin')):
    p = os.path.join('admin',f)
    if os.path.isfile(p):
        project['admin_pages'].append({'file':f,'lines':flines(p),'size':fsize(p)})

for f in sorted(os.listdir('admin/ai')):
    p = os.path.join('admin/ai',f)
    if os.path.isfile(p):
        project['admin_ai_pages'].append({'file':f,'lines':flines(p),'size':fsize(p)})

for f in sorted(os.listdir('js/ai/modules')):
    p = os.path.join('js/ai/modules',f)
    project['ai_modules'].append({'file':f,'lines':flines(p),'size':fsize(p)})

for f in sorted(os.listdir('js/ai/providers')):
    p = os.path.join('js/ai/providers',f)
    project['ai_providers'].append({'file':f,'lines':flines(p),'size':fsize(p)})

for f in sorted(os.listdir('js/ai')):
    p = os.path.join('js/ai',f)
    if os.path.isfile(p) and f.endswith('.js'):
        project['ai_core'].append({'file':f,'lines':flines(p),'size':fsize(p)})

for f in sorted(os.listdir('functions')):
    p = os.path.join('functions',f)
    if os.path.isfile(p) and f.endswith('.js') and f != 'index.js':
        project['functions'].append({'file':f,'lines':flines(p),'size':fsize(p)})

if os.path.isdir('workflows'):
    for f in os.listdir('workflows'):
        project['workflows'].append(f)

for f in sorted(os.listdir('scripts')):
    p = os.path.join('scripts',f)
    if os.path.isfile(p) and f.endswith('.js'):
        project['scripts'].append({'file':f,'lines':flines(p),'size':fsize(p)})

# REPORT
print('=== PSH PLATFORM AUDIT ===')
print(f'\nDirectories: {len(project["dirs"])}')
print(f'  {", ".join(project["dirs"])}')

print(f'\nAdmin Pages: {len(project["admin_pages"])}')
for p in project['admin_pages']:
    print(f'  {p["file"]} ({p["lines"]} lines, {p["size"]} bytes)')

print(f'\nAdmin AI Pages: {len(project["admin_ai_pages"])}')
for p in project['admin_ai_pages']:
    print(f'  {p["file"]} ({p["lines"]} lines, {p["size"]} bytes)')

print(f'\nAI Content Modules: {len(project["ai_modules"])}')
for m in project['ai_modules']:
    print(f'  {m["file"]} ({m["lines"]} lines, {m["size"]} bytes)')

print(f'\nAI Providers: {len(project["ai_providers"])}')
for p in project['ai_providers']:
    print(f'  {p["file"]} ({p["lines"]} lines, {p["size"]} bytes)')

print(f'\nAI Core Engine: {len(project["ai_core"])}')
for c in project['ai_core']:
    print(f'  {c["file"]} ({c["lines"]} lines, {c["size"]} bytes)')

print(f'\nFunctions: {len(project["functions"])}')
for f in project['functions']:
    print(f'  {f["file"]} ({f["lines"]} lines, {f["size"]} bytes)')

print(f'\nWorkflows: {len(project["workflows"])}')
for w in project['workflows']:
    print(f'  {w}')

print(f'\nScripts: {len(project["scripts"])}')
for s in project['scripts']:
    print(f'  {s["file"]} ({s["lines"]} lines, {s["size"]} bytes)')

# Media AI Center audit
print(f'\n{"="*60}')
print('MEDIA AI CENTER AUDIT')
print('='*60)
media_modules = {
    'AI Video Studio': ('admin/ai/video.html', 'admin_ai'),
    'AI Image Studio': ('admin/ai/images.html', 'admin_ai'),
    'AI Voice Studio': ('js/ai/modules/voice-generator.js', 'js_module'),
    'Content Studio': ('admin/ai/content.html', 'admin_ai'),
    'Prompt Builder': ('js/ai/context-builder.js', 'ai_core'),
    'Storyboard': ('admin/ai/storyboard.html', 'admin_ai'),
    'Asset Library': ('admin/media-library.html', 'admin'),
    'Render Queue': ('admin/ai/jobs.html', 'admin_ai'),
    'Job Queue': ('js/ai/job-queue.js', 'ai_core'),
    'Provider Manager': ('admin/ai/providers.html', 'admin_ai'),
    'Workflow Builder': ('admin/ai/workflow.html', 'admin_ai'),
    'Subtitle': ('js/ai/modules/subtitle-generator.js', 'js_module'),
    'Lip Sync': ('js/ai/modules/lip-sync.js', 'js_module'),
    'Voice Clone': ('js/ai/modules/voice-clone.js', 'js_module'),
    'Social Export': ('admin/social-media-center.html', 'admin'),
    'Template Library': ('admin/ai/templates.html', 'admin_ai'),
    'Media History': ('admin/ai/history.html', 'admin_ai'),
    'Project Manager': ('admin/ai/projects.html', 'admin_ai'),
    'Batch Processing': ('admin/ai/batch.html', 'admin_ai'),
    'Quality Checker': ('js/ai/modules/quality-checker.js', 'js_module'),
}

for name, (path, _) in sorted(media_modules.items()):
    exists = os.path.exists(path)
    lines = flines(path) if exists else 0
    size = fsize(path) if exists else 0
    status = 'FOUND' if exists else 'MISSING'
    print(f'  [{status}] {name}: {f"{lines} lines, {size} bytes" if exists else "not implemented"}')
