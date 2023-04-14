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

## How It Works

Every service starts the same way: `OpenTelemetryModule.start()` boots the SDK before Nest,
then `main.ts` applies the global `api` prefix, URI versioning (`/api/v1/...`), a global
validation pipe, the JWT bearer setup, the Prometheus `/metrics` endpoint and a single
exception filter, and listens on its own port.

A booking request travels like this:

1. `POST /api/v1/identity/login` returns an access token. The token is checked on every
   protected route by `JwtGuard` + `JwtStrategy` in `building-blocks`.
2. `POST /api/v1/booking/create` hits `CreateBookingHandler`. Joi validates the body before
   anything else runs.
3. The handler calls the command bus, then uses `PassengerClient` (axios, `http://localhost:3355`,
   `GET /api/v1/passenger/get-by-id`) to load the passenger and `FlightClient` (axios,
   `http://localhost:3344`) to `POST /api/v1/seat/reserve` — the seat row is flipped to taken
   inside the flight service's own database.
4. The booking row is written through `BookingRepository` (TypeORM) into the booking database.
5. `RabbitmqPublisher.publishMessage(new BookingCreated(...))` drops the event on the
   `booking` exchange, so anything else interested can react.

The other async path is signup: when `identity` creates a user it publishes `UserCreated` on
the `identity` exchange, and `passenger` runs `CreateUserHandler.createUserConsumerHandler`
as a consumer to create the matching passenger record.

Requests and events carry a W3C trace context. `RabbitmqPublisher` injects the current span
into the message headers and `RabbitmqSubscriber` extracts it on the other side, so a trace
in Tempo spans both services rather than stopping at the queue.

```mermaid
flowchart LR
  Client([Client])

  subgraph identity["identity :3333"]
    Login[login / refresh / validate]
    User[(users)]
  end

  subgraph flight["flight :3344"]
    Flights[airports, aircraft, flights]
    Seats[seat reserve + availability]
    Fdb[(flight db)]
  end

  subgraph passenger["passenger :3355"]
    Pcons[UserCreated consumer]
    Pdb[(passenger db)]
  end

  subgraph booking["booking :3366"]
    Create[create booking]
    Bdb[(booking db)]
  end

  Bus{{RabbitMQ exchanges}}
  Otel[[OTel collector -> Tempo / Prometheus / Grafana]]

  Client -->|Bearer JWT| Login
  Client -->|POST /api/v1/booking/create| Create
  Create -->|HTTP get passenger| passenger
  Create -->|HTTP reserve seat| flight
  Create --> Bdb
  Create -->|BookingCreated| Bus
  Login -->|UserCreated| Bus
  Bus --> Pcons
  Pcons --> Pdb
  identity -.-> User
  flight -.-> Fdb
  Client --> Otel
  identity --> Otel
  flight --> Otel
  passenger --> Otel
  booking --> Otel
```

## Project Structure

```
aerobook/
├── src/
│   ├── building-blocks/          # shared library, consumed as `building-blocks` via file:../building-blocks
│   │   ├── configs/              # joi schema that loads and validates .env.<NODE_ENV>
│   │   ├── context/              # HttpContext, holds the incoming request headers for outbound calls
│   │   ├── contracts/            # DTOs and events shared between services (booking, flight, identity, passenger)
│   │   ├── filters/              # single exception filter, renders RFC-7807 style problem details
│   │   ├── monitoring/           # prom-client registry, request counter + duration middleware
│   │   ├── openTelemetry/        # NodeSDK bootstrap and the tracer provider
│   │   ├── passport/             # JwtGuard and JwtStrategy
│   │   ├── rabbitmq/             # connection, publisher, subscriber, module
│   │   ├── test/container/       # testcontainers for Postgres and RabbitMQ used by the test suites
│   │   ├── types/                # application exceptions and paged-result wrapper
│   │   └── utils/                # bcrypt helpers, reflection, serialization, time, validation
│   ├── identity/                 # :3333 — users, login, access + refresh tokens
│   │   ├── src/auth/features/v1/ # login, logout, generate-token, refresh-token, validate-token
│   │   ├── src/user/features/v1/ # create, get, get-by-id, update, delete user
│   │   ├── src/data/             # data-source, migrations, repositories, seeds
│   │   └── test/                 # unit, integration and end-to-end suites
│   ├── flight/                   # :3344 — airports, aircraft, flights, seats
│   │   ├── src/{airport,aircraft,flight,seat}/  # one folder per aggregate, features/v1 inside
│   │   └── src/data/             # data-source, migrations, repositories, seed data
│   ├── passenger/                # :3355 — passenger records, consumes UserCreated
│   │   ├── src/passenger/features/v1/
│   │   └── src/user/consumers/   # create-user consumer
│   └── booking/                  # :3366 — creates bookings, calls flight + passenger
│       ├── src/booking/features/v1/create-booking/
│       ├── src/booking/http-client/services/  # flight and passenger axios clients
│       └── src/data/
├── deployments/
│   ├── docker-compose/docker-compose.yaml       # infra + the four services
│   ├── docker-compose/infrastructure.yaml       # infra only, for running services from your machine
│   └── configs/                  # prometheus, tempo, loki and otel-collector configs
├── assets/                       # airplane icon and the vertical-slice diagram
├── booking.rest                  # REST client requests against all four services
└── LICENSE                       # MIT
```

Each service folder also carries its own `Dockerfile`, `nest-cli.json`, `tsconfig.json`,
`package.json` and `.env.example` / `.env.docker.example`.
