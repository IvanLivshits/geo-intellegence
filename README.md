# Geo-Intelligence — 3D-сканер рисков района

Превращает адрес в **интерактивный 3D-разбор района**: здания, дороги, источники
активности и сменные карты-маски — шум (Lden), качество воздуха (EAQI) и
затопляемость (HAND по спутниковому рельефу, с учётом инженерной защиты).

Принцип: **числа не выдумываются**. Каждый слой — либо реальные данные, либо модель,
явно подписанная как модель прямо в интерфейсе. Полное описание источников и формул —
в **[METHODOLOGY.md](./METHODOLOGY.md)**.

## Стек

Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui · deck.gl ·
Redis (кэш) · DuckDB (Overture/S3) · geotiff (Copernicus DEM/S3).

## Запуск

```bash
docker compose up -d        # Redis (кэш)
npm install
npm run dev                 # http://localhost:3000
```

Google-поиск мест включается переменной `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
(без неё — фолбэк на Nominatim). Redis не обязателен — без него всё работает,
просто без кэша.

## CLI

Полный скан из терминала, без веб-интерфейса:

```bash
npm run scan -- "Calle de Alcalá 50, Madrid"
npm run scan -- --lat=40.4168 --lon=-3.7038 --radius 1000 --out payload.json
```

Печатает сводку по всем маскам; `--out` сохраняет полный payload (тот же JSON,
что отдаёт `/api/scan`).

## Структура

```
app/            страницы + API-роуты (/api/scan, /api/geocode)
components/     App (оболочка), MapView (deck.gl-сцена), InspectorPanel, ui/
lib/            домен: scan (сборщик), masks (реестр), noise-mask / air / flood,
                dem (Copernicus S3), overture (DuckDB S3), http (кэш+rate-limit)
bin/duckdb      бинарник DuckDB для Overture-запросов
METHODOLOGY.md  что считаем и откуда (обновляется вместе с моделями)
```

## Первый скан района

Холодный скан — до ~70 с (скан Overture-parquet в S3); повторные — секунды (Redis).
