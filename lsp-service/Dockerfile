# Build context: workspace root
#   docker build -f lsp-service/Dockerfile -t lsp-service .

# ── Stage 1: base with cargo-chef ───────────────────────────────────────────
FROM rust:1-slim-bookworm@sha256:1469a27c125cb5a3aebfa4f4e4665d935b02fb72cc093b2c974b3d740e43f157 AS chef
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
RUN cargo chef cook --release --locked --recipe-path recipe.json
# Now copy real source and build only lsp-service
COPY . .
RUN cargo build --release --locked -p lsp-service

# ── Stage 4: minimal runtime ─────────────────────────────────────────────────
FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171 AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid 1001 --no-create-home --shell /sbin/nologin app \
    && mkdir -p /app/data \
    && chown app:app /app/data
WORKDIR /app
COPY --from=builder /app/target/release/lsp-service /usr/local/bin/lsp-service
USER app
# Lightning peer port — set LISTEN_ADDRESS=0.0.0.0:9737 in your env
EXPOSE 9737
CMD ["lsp-service"]
