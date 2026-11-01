# Gorsel Referans Durumu

Bir satir ancak kullanici ekrani veya PDF'i acikca onayladiginda `Onaylandi` durumuna getirilebilir.

| Uygulama | Ekran / belge | Durum | Onayli dosya | Onay tarihi | Not |
| --- | --- | --- | --- | --- | --- |
| Daily | Qaimə formu | Onaylanmadi | Yok | - | Mevcut gorunum kaynak kontrol noktasi olarak saklanabilir, ancak tasarim referansi degildir. |
| Daily | Gunluk defter masaustu | Onaylanmadi | Yok | - | Gorsel referans bekliyor. |
| Daily | Gunluk defter mobil | Onaylanmadi | Yok | - | Gorsel referans bekliyor. |
| Order | Siparis onay formu | Onaylanmadi | Yok | - | Gorsel referans bekliyor. |
| Panel | Ana panel | Onaylanmadi | Yok | - | Gorsel referans bekliyor. |

## Onay kaydi formati

Onaylanan dosya degistirilmeden saklanir ve SHA-256 degeri ayni satirin notuna eklenir:

```text
Onaylandi | docs/safety/visual-baselines/daily-qaime-YYYYMMDD.pdf | YYYY-MM-DD | SHA256: ...
```
