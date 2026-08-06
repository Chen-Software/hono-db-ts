# Hono + Drizzle ORM Starter

A starter project for a REST API built with **Hono** and **Drizzle ORM**, run on **Bun**.

## Stack

- [Bun](https://bun.sh) — runtime & test runner
- [Hono](https://hono.dev) — web framework
- [Drizzle ORM](https://orm.drizzle.team) — database access layer
- [Biome](https://biomejs.dev) — lint & format

## Setup

```bash
bun install          # install dependencies
cp .env.example .env # configure DATABASE_TYPE / DATABASE_URL
bun run db:generate  # (re)generate SQL migrations from src/schema.ts
bun run db:migrate   # apply migrations to the database
```

By default the app uses SQLite (`sqlite.db`). For Postgres dialect testing:

```bash
docker compose up -d # start local Postgres on :5432
# then point DATABASE_URL at the Postgres instance in .env
```

## Scripts

| Script                | Description                                  |
| --------------------- | -------------------------------------------- |
| `bun run dev`         | Start the Hono server in watch mode          |
| `bun test`            | Run the test suite                           |
| `bun run db:generate` | Generate SQL migrations from the schema      |
| `bun run db:migrate`  | Apply migrations to the database             |
| `bun run db:seed`     | Seed the database                            |
| `bun run check`       | Lint & format check (Biome)                  |
| `bun run start`       | Run the server without watch mode            |

## API

### Movies

| Method   | Path           | Description      | Request body                        | Success    |
| -------- | -------------- | ---------------- | ----------------------------------- | ---------- |
| `GET`    | `/movies`      | List all movies  | —                                   | `200`      |
| `GET`    | `/movies/:id`  | Get one movie    | —                                   | `200`      |
| `POST`   | `/movies`      | Create a movie   | `{ "title": string, "releaseYear"?: number }` | `201` |
| `PUT`    | `/movies/:id`  | Update a movie   | `{ "title"?: string, "releaseYear"?: number \| null }` | `200` |
| `DELETE` | `/movies/:id`  | Delete a movie   | —                                   | `200`      |

Errors return `{ "error": string }` with an appropriate status code (`400` invalid input, `404` not found).

#### Examples

```bash
# List
curl http://localhost:3000/movies

# Create
curl -X POST http://localhost:3000/movies \
  -H 'Content-Type: application/json' \
  -d '{"title": "Inception", "releaseYear": 2010}'

# Get one
curl http://localhost:3000/movies/1

# Update
curl -X PUT http://localhost:3000/movies/1 \
  -H 'Content-Type: application/json' \
  -d '{"title": "Interstellar"}'

# Delete
curl -X DELETE http://localhost:3000/movies/1
```

### Schema

A movie has:

| Column        | Type   |
| ------------- | ------ |
| `id`          | `int`  |
| `title`       | `text` |
| `releaseYear` | `int`  |

## Project layout

```
src/
  main.ts            # app entry, mounts routes
  schema.ts          # Drizzle table definitions
  db.ts              # database connection (bun:sqlite)
  routes/
    movies.ts        # /movies REST handlers
    movies.test.ts   # /movies endpoint tests
scripts/
  db-migrate.ts      # apply migrations
  db-seed.ts         # seed data
```
