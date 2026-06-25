# Fish Fin Voice - Beta 0.1 POLSKI

Fish Fin Voice to lokalna aplikacja desktopowa (Electron + Python) do generowania lektora AI dla audiobooków i materialow wideo. Projekt łączy synteze mowy TTS, obrobke tekstu, prace na napisach oraz automatyzacje pipeline'u audio.

## Co potrafi aplikacja
- generowanie audiobookow z tekstu (TXT/EPUB/PDF),
- tworzenie lektora dla materialow wideo na podstawie napisow,
- zarzadzanie glosami lektorow lokalnie,
- lokalne przetwarzanie audio i kolejkowanie zadan,
- tryby pomocnicze do pracy nad fragmentami i synchronizacja outputow.

## Wymagania
- Windows 10/11 (zalecane),
- Python 3.10+,
- Node.js 18+ i npm,
- GPU 16 GB VRAM

## Instalacja krok po kroku
1. Sklonuj repozytorium:

```bash
git clone https://github.com/koloda1988-jpg/Fish_s2_pro_polish/
cd "Fish Fin Voice"
```

2. Utworz srodowisko wirtualne:

```bash
python -m venv venv
```

3. Aktywuj venv:

PowerShell:

```powershell
venv\Scripts\Activate.ps1
```

CMD:

```bat
venv\Scripts\activate.bat
```

4. Zainstaluj zaleznosci Pythona:

```bash
pip install -r requirements.txt
```

5. Zainstaluj zaleznosci Node.js:

```bash
npm install
```

## Uruchomienie aplikacji
Po instalacji uruchom:

```bash
npm start
```

Alternatywnie (Windows):

```bat
start_app.bat
```

## Konfiguracja (API keys i sekrety)
Aplikacja nie zawiera twardo zakodowanych kluczy. Uzyj zmiennych srodowiskowych:

PowerShell:

```powershell
$env:GEMINI_API_KEY="wklej_tutaj_swoj_klucz"
```

CMD:

```bat
set GEMINI_API_KEY=wklej_tutaj_swoj_klucz
```

Mozesz tez trzymac ustawienia lokalnie w pliku `.env` 

- `GEMINI_API_KEY=...`
- `WHISPER_MODEL=small`

## Status wydania
Publiczne wydanie testowe: **Beta 0.1**.
