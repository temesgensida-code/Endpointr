FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o metrics-service ./cmd/server

FROM scratch
COPY --from=builder /build/metrics-service /metrics-service
ENTRYPOINT ["/metrics-service"]
