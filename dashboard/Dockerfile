# syntax=docker/dockerfile:1
#
# One image for the whole dashboard: the Go API binary plus the built web
# bundle. The API serves ../web/dist relative to its working directory and
# the SPA calls /api same-origin (cookie auth, no CORS in the API), so
# splitting them into separate containers would only add a hop.
#
# Build context is the dashboard/ directory:
#
#     docker build -f dashboard/Dockerfile dashboard/
#
# deployments/push-dashboard.sh builds and pushes this image to ECR.

FROM node:24-alpine AS webbuild
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.26.5-alpine AS gobuild
WORKDIR /src
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ ./
# CGO_ENABLED=0 makes the distroless/static base viable.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/dashboard .

FROM gcr.io/distroless/static-debian12:nonroot
# WORKDIR matters: main.go looks for the bundle at ../web/dist.
WORKDIR /app/api
COPY --from=gobuild /out/dashboard /app/api/dashboard
COPY --from=webbuild /web/dist /app/web/dist
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/app/api/dashboard"]
