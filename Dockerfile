# syntax=docker/dockerfile:1
#
# One image for the whole app: the Go API (be/rest) plus the built SPA (fe/web/app). The API
# serves the bundle from STATIC_DIR and the SPA calls /api same-origin (cookie auth), so they
# ship together. Build context is the repo root; deploy/push.sh builds and pushes it to ECR.

FROM node:24-alpine AS webbuild
WORKDIR /web
COPY fe/web/app/package.json fe/web/app/package-lock.json ./
RUN npm ci
COPY fe/web/app/ ./
RUN npm run build

FROM golang:1.26.5-alpine AS gobuild
WORKDIR /src
COPY be/rest/go.mod be/rest/go.sum ./
RUN go mod download
COPY be/rest/ ./
# CGO_ENABLED=0 makes the distroless/static base viable.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/rest .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=gobuild /out/rest /app/rest
COPY --from=webbuild /web/dist /app/web
ENV STATIC_DIR=/app/web
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/app/rest"]
