import re
with open('renderer.js', encoding='utf-8') as f: js = f.read()
with open('renderer.html', encoding='utf-8') as f: html = f.read()
ids = sorted(set(re.findall(r'getElementById\("([^"]+)"\)', js)))
missing = [i for i in ids if ('id="'+i+'"') not in html]
print('MISSING:')
for m in missing: print(' ', m)
print('TOTAL MISSING:', len(missing))
