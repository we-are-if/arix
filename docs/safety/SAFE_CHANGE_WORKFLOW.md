# AriX Guvenli Degisiklik Duzeni

Bu belge Daily, Order, Panel ve Server degisikliklerinin birbirine karismamasini ve her canli surumun geri alinabilmesini saglayan zorunlu akisi tanimlar.

## Temel kurallar

1. Bir ekranin veya PDF'in "birebir geri getirildi" sayilmasi icin kaynak yedegi ya da kullanici tarafindan onaylanmis gorsel referans gerekir.
2. Benzer gorunum, tahmin veya yeniden cizim asla "ayni" diye adlandirilmaz.
3. Her is oncesinde yerel kontrol noktasi olusturulur.
4. Her commit yalnizca tek uygulama kapsaminda kalir.
5. Derleme ve ilgili testler gecmeden canliya cikilmaz.
6. Kullanici acikca onaylamadan gorsel referans "onayli" olarak kaydedilmez.
7. Production yayini, `-ConfirmProduction` kilidi olmadan calismaz.

## Uygulama kapsamlari

| Kapsam | Ana dosyalar |
| --- | --- |
| Daily | `daily-app/` |
| Order | `order-app/` |
| Panel | `src/`, `public/`, kok Vite dosyalari |
| Server | `server/` |

Guvenlik betikleri, bu dokumanlar ve Daily dagitim betikleri ortak altyapi olarak kabul edilir.

## Degisiklikten once

```powershell
./scripts/safety/New-ArixCheckpoint.ps1 -Scope Daily -Label "is-oncesi"
git switch -c work/daily-kisa-aciklama
```

Kontrol noktasi sunlari saklar:

- mevcut kaynak dosyalarinin `source.tar.gz` arsivi,
- Git HEAD ve dal bilgisi,
- takip edilen dosyalardaki calisma yamasi,
- sahnelenmis yama,
- takip edilmeyen dosya listesi,
- SHA-256 butunluk degeri.

Kontrol noktalari `.arix-backups/` altindadir ve Git'e gonderilmez.

Disk arizasina karsi secilen kontrol noktasini kullanicinin production sunucusundaki root erisimli arsive kopyalamak icin:

```powershell
./scripts/safety/Sync-ArixCheckpoint.ps1 -ConfirmRemote
```

Uzak kopya `/srv/arix/source-checkpoints/` altinda `0600` yetkisiyle saklanir ve yuklemeden sonra SHA-256 ile dogrulanir. Bu kopya GitHub'a gonderilmez.

## Degisiklikten sonra

Yalnizca ilgili dosyalari sahneleyin:

```powershell
git add daily-app scripts/safety docs/safety deploy/daily-release.sh deploy/daily-rollback.sh
./scripts/safety/Test-ArixScope.ps1 -Scope Daily -Mode Staged
./scripts/safety/Invoke-ArixVerification.ps1 -Scope Daily
```

Kapsam disinda tek dosya varsa denetim hata verir. Boylece Daily duzeltilirken Order veya Panel degisikligi ayni commite giremez.

## Gorsel dogrulama

Kritik ekranlar masaustu ve mobilde kontrol edilir. PDF/form icin su alanlar birlikte dogrulanir:

- baslik ve belge numarasi,
- musteri ve urun verileri,
- tutarlar ve para bicimi,
- durum etiketi,
- imza, not ve footer,
- yazdirma ve paylasma ciktisi.

Onaylanan goruntu veya PDF `docs/safety/visual-baselines/` altina eklenir ve `VISUAL_BASELINES.md` tablosunda kullanici onayi kaydedilir. Onay yoksa referans yoktur.

## Production yayini

```powershell
./scripts/safety/Publish-Daily.ps1 -ConfirmProduction
```

Bu komut sirasiyla kontrol noktasi olusturur, Daily production derlemesini calistirir, arsivin SHA-256 degerini dogrular, mevcut canli klasoru yedekler, yeni surumu etkinlestirir ve saglik kontrolu yapar. Herhangi bir adim hata verirse sunucudaki onceki surum otomatik geri gelir.

## Geri donus

Sunucudaki son Daily yedeklerini listelemek:

```bash
bash /usr/local/sbin/arix-daily-rollback
```

Secilen yedege geri donmek:

```bash
bash /usr/local/sbin/arix-daily-rollback daily-app.prev-YYYYMMDD-HHMMSS
```

Rollback islemi mevcut canliyi da `daily-app.before-rollback-*` adi ile saklar; geri donus sirasinda da veri kaybi yaratmaz.

## Yerel kontrol noktasini incelemek

Kontrol noktasi mevcut calisma alaninin uzerine acilmaz. Ayri bir klasore cikarilir:

```powershell
./scripts/safety/Restore-ArixCheckpoint.ps1 -Checkpoint ./.arix-backups/CONTROL-NOKTASI-ADI
```

Cikti `.arix-restores/` altina gelir. Karsilastirma yapildiktan sonra gerekli dosyalar bilincli olarak alinir.

## Veri guvenligi

- `.env` dosyalari, anahtarlar ve yuklenen belgeler kaynak arsivine alinmaz.
- `daily-app/data/` Git'e gonderilmez.
- Uretimde hem ana `arix.sqlite` hem Daily `daily.sqlite` her gece ayri ve tutarli SQLite yedegi olarak alinir; hash dosyasi ile butunluk kontrol edilir ve 30 gun saklanir.
- Kod geri donusu, musteri ve muhasebe verisini geriye sarmaz.
