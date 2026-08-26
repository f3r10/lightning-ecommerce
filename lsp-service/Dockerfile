# Build context: workspace root
#   docker build -f lsp-service/Dockerfile -t lsp-service .

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
# Now copy real source and build only lsp-service
COPY . .
RUN cargo build --release -p lsp-service

# ── Stage 4: minimal runtime ─────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/lsp-service /usr/local/bin/lsp-service
# Lightning peer port — set LISTEN_ADDRESS=0.0.0.0:9737 in your env
EXPOSE 9737
CMD ["lsp-service"]
