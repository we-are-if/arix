from pathlib import Path
import hashlib, json, subprocess, tarfile

root = Path('tmp/performance-fix')
files = ['index.js', 'database.js', 'dailyNotifications.js', 'dailyPushOutbox.js', 'dailySnapshotResponse.js', 'mutationScheduler.js', 'dailyImages.js']
for name in files[3:]:
    (root/name).write_bytes((Path('server')/name).read_bytes())
(root/'dailyNotifications.js').write_bytes(Path('server/dailyNotifications.js').read_bytes())
(root/'daily-transport.js').write_bytes(Path('shared/dailyTransport.js').read_bytes())
manifest = {name: hashlib.sha256((root/('live-'+name)).read_bytes()).hexdigest() for name in files[:3]}
(root/'baseline.json').write_text(json.dumps(manifest))
with tarfile.open(root/'release.tgz','w:gz') as archive:
    for name in files + ['daily-transport.js', 'baseline.json']:
        archive.add(root/name, arcname=name)
    archive.add('scripts/safety/release-daily-performance.py', arcname='release.py')
    archive.add('scripts/safety/test-daily-performance-live.py', arcname='test-live.py')
key = str(Path.home()/'.ssh/arix_production')
ssh = ['ssh','-i',key,'-o','BatchMode=yes','root@2.31.126.121']
stage = subprocess.check_output(ssh+['mktemp -d /root/daily-performance.XXXXXXXX'],text=True).strip()
assert stage.startswith('/root/daily-performance.') and ' ' not in stage
(root/'remote-stage.txt').write_text(stage)
subprocess.run(ssh+[f'cat > {stage}/release.tgz'],input=(root/'release.tgz').read_bytes(),check=True)
subprocess.run(ssh+[f'tar -xzf {stage}/release.tgz -C {stage}; python3 {stage}/test-live.py {stage}'],check=True)
print('Validated staging directory:',stage)
