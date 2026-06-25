# Fish Fin Voice - Wersja Beta 0.1 (PL)

Fish Fin Voice to lokalna aplikacja desktopowa (Electron + Python) do zaawansowanego generowania lektora AI dla audiobookow oraz materialow wideo. Projekt integruje synteze mowy TTS oparta o ekosystem Fish Speech, automatyczne przetwarzanie tekstu, operacje na napisach oraz inteligentne kolejkowanie zadan audio.

Aplikacja jest zoptymalizowana pod katem jezyka polskiego i pracy lokalnej.

## Kluczowe funkcje
- Generator audiobookow: konwersja TXT/EPUB/PDF do audio.
- Lektor do wideo: tworzenie sciezki lektorskiej na podstawie napisow.
- Lokalne zarzadzanie glosami: kontrola probek lektorow w aplikacji.
- Wydajny pipeline audio: batch processing, scalanie i obrobka fragmentow.
- Prywatnosc: przetwarzanie lokalne, bez wysylania danych audio do chmury.

## Wymagania sprzetowe i systemowe
- System operacyjny: Windows 11 (64-bit).
- Node.js: 18+.
- Python: 3.10+ (rekomendowane 3.11) lub wariant portable.
- GPU: NVIDIA z CUDA, minimum 8 GB VRAM, zalecane 16 GB VRAM.
- RAM: minimum 32 GB.
- FFmpeg: wymagany do przetwarzania audio.
- Miejsce na dysku: ok. 10 GB (bez wag modeli).

## Instalacja krok po kroku (ze zrodel)
1. Sklonuj repozytorium:

```bash
git clone https://github.com/TWOJ_LOGIN/TWOJE_REPO.git
cd "Fish Fin Voice"
```

2. Utworz i aktywuj srodowisko Python:

```bash
python -m venv venv
```

PowerShell:

```powershell
venv\Scripts\Activate.ps1
```

CMD:

```bat
venv\Scripts\activate.bat
```

3. Zainstaluj zaleznosci:

```bash
pip install -r requirements.txt
npm install
```

Opcjonalnie (z `uv`):

```bash
uv venv
uv pip install -r requirements.txt
```

## Uruchomienie aplikacji

```bash
npm start
```

Alternatywnie (Windows):

```bat
start_app.bat
```

## Quick instalator (.exe)
Jesli masz gotowy instalator z wydania:
1. Pobierz najnowszy `AudiobookGenerator-<wersja>-setup.exe` z zakladki Releases.
2. Uruchom instalator i przejdz przez kreator.
3. Wlacz aplikacje ze skrotu na pulpicie lub z menu Start.

Uwaga: przy pierwszym uruchomieniu system moze zapytac o zgode zapory sieciowej.

## Quick instalator (Pinokio)
Repo zawiera gotowy launcher Pinokio do instalacji jednym kliknieciem:
- `pinokio.js`
- `install.json`
- `start.json`

Workflow Pinokio:
1. Install: przygotowuje srodowisko per platforma (Windows/Linux/macOS), tworzy lokalne `venv`, instaluje `requirements.txt` oraz `npm install`.
2. Start: uruchamia Electron przez `start.json`, a aplikacja samodzielnie odpala backend Python z lokalnego `venv`.

One-click flow w Pinokio:
1. Otworz repo w Pinokio.
2. Kliknij `Zainstaluj`.
3. Po zakonczeniu kliknij `Uruchom`.

## Budowa instalatora Windows
Konfiguracja NSIS jest gotowa w projekcie.

```bash
npm run build
```

Po buildzie instalator `.exe` znajdziesz w katalogu `dist/`.

## Konfiguracja i sekrety
Klucze API nie sa trzymane na sztywno w kodzie.

PowerShell:

```powershell
$env:GEMINI_API_KEY="wklej_tutaj_swoj_klucz"
```

CMD:

```bat
set GEMINI_API_KEY=wklej_tutaj_swoj_klucz
```

Opcjonalnie plik `.env` (nie commitujemy):
- `GEMINI_API_KEY=...`
- `WHISPER_MODEL=small`

## Informacje o wydaniu
Projekt opiera sie o Fish Speech S2 Pro:
- https://fish.audio/s2/

- Status projektu: Wersja Publiczna Testowa (Beta 0.1).
- Zglaszanie bledow: przez zakladke Issues na GitHub.

## Warunki uzycia i licencja
- Licencja kodu: MIT (patrz `package.json`).
- Uzycie prywatne/edukacyjne: dozwolone.
- Zakaz komercyjnego uzycia: bez uprzedniej zgody autora.

## Oficjalne linki i uznania
- Fish Audio: https://fish.audio/
- Fish Speech GitHub: https://github.com/fishaudio/fish-speech
