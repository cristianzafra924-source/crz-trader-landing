# CRZ Analytics API

API ligera para guardar eventos de la landing en Railway + Postgres.

## Variables en Railway

- `DATABASE_URL`: Railway la crea automaticamente al conectar Postgres.
- `ALLOWED_ORIGINS`: `https://crztrader.com,https://www.crztrader.com`
- `ADMIN_TOKEN`: una clave privada para consultar estadisticas.

## Endpoints

- `GET /health`: comprueba que la API esta viva.
- `POST /events`: recibe eventos de la landing.
- `GET /stats/videos/:videoId`: devuelve reproducciones, likes, dislikes y visitas unicas. Requiere:

```txt
Authorization: Bearer TU_ADMIN_TOKEN
```
