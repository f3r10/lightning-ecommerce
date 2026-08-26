# Build context: workspace root
#   docker build -f node-service/Dockerfile -t node-service .

# ── Stage 1: base with cargo-chef ───────────────────────────────────────────
FROM rust:1-slim AS chef
RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
RUN cargo install cargo-chef --locked
WORKDIR /app

# ── Stage 2: compute dependency recipe ──────────────────────────────────────
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 3: build dependencies (cached unless Cargo.toml/Cargo.lock change) ─
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
# Now copy real source and build only node-service
COPY . .
RUN cargo build --release -p node-service

# ── Stage 4: minimal runtime ─────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/node-service /usr/local/bin/node-service
EXPOSE 3001
CMD ["node-service"]
