import sys

sys.stdout.reconfigure(encoding='utf-8')

# 1. Update DailyWorkspace.tsx to use <div> for sp-recon-card instead of <article>
with open('daily-app/src/DailyWorkspace.tsx', 'r', encoding='utf-8') as f:
    dw = f.read()

dw = dw.replace('<article\n        key={name}\n        className="sp-recon-card clickable-recon-row"', '<div\n        key={name}\n        className="sp-recon-card clickable-recon-row"')
dw = dw.replace('<article\r\n        key={name}\r\n        className="sp-recon-card clickable-recon-row"', '<div\r\n        key={name}\r\n        className="sp-recon-card clickable-recon-row"')

# And closing tag
old_end = '''        <div className="sp-recon-card-footer">
          <span className="sp-recon-card-hint">Günün dökümünə baxmaq üçün toxunun</span>
          <ChevronRight size={13} className="sp-recon-chevron" />
        </div>
      </article>'''

new_end = '''        <div className="sp-recon-card-footer">
          <span className="sp-recon-card-hint">Günün dökümünə baxmaq üçün toxunun</span>
          <ChevronRight size={13} className="sp-recon-chevron" />
        </div>
      </div>'''

dw = dw.replace(old_end.replace('\r\n', '\n'), new_end.replace('\r\n', '\n'))
dw = dw.replace(old_end.replace('\n', '\r\n'), new_end.replace('\n', '\r\n'))

with open('daily-app/src/DailyWorkspace.tsx', 'w', encoding='utf-8') as f:
    f.write(dw)

print("Updated DailyWorkspace.tsx to use <div> for sp-recon-card!")
