# AeroBook

AeroBook is a flight-booking backend split into four small NestJS services that talk to each
other over HTTP and RabbitMQ, with OpenTelemetry tracing and Prometheus metrics wired through the
whole thing.

## What This Project Does

Booking a seat is not one database write: you have to prove who you are, find the flight,
make sure nobody else takes the seat, and keep a passenger record. AeroBook models that as
separate services, each owning its own Postgres schema, so the flow can be studied — or
extended — one service at a time.

It is for people who want a working, all-TypeScript microservice setup rather than a
diagram: real JWT login, real seat reservation, real message contracts, real traces.

- Sign in with email and password, get an access token and a refresh token (`identity`)
- Manage airports, aircraft, flights and seats, and reserve a seat (`flight`)
- Keep passenger records, created automatically when a user signs up (`passenger`)
- Create a booking, which pulls the passenger, reserves the seat and publishes an event (`booking`)
- One shared library (`building-blocks`) for config validation, TypeORM plumbing, RabbitMQ,
  JWT guards, OpenTelemetry, error responses and pagination
- Vertical-slice layout: each feature is a folder with its command handler, DTO, entity and
  mapping, instead of a layer-wide controller/service/repository split
- Swagger UI, `/metrics` endpoint and Grafana dashboards on every service
