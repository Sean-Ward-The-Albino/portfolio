# Sean D. Ward's site: Vite builds the worlds, Spring Boot serves them and runs the API.
#   docker build -t seanward-site .                 GraalVM native image (starts in about 50 ms; slower to build)
#   docker build --target jvm -t seanward-site .    regular JVM image (quick to build)

# 1. Build the front end.
FROM node:22.22-bookworm-slim AS web
WORKDIR /src
COPY content ./content
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --no-audit --no-fund
COPY web ./web
RUN cd web && npm run build

# 2a. JVM build.
FROM eclipse-temurin:21-jdk AS jvm-build
WORKDIR /src
COPY server ./server
COPY content ./content
COPY --from=web /src/web/dist ./web/dist
RUN cd server && ./mvnw -q -B -DskipTests package && cp target/site-*.jar /site.jar

FROM eclipse-temurin:21-jre AS jvm
RUN useradd --system --uid 10001 site
USER 10001
COPY --from=jvm-build /site.jar /site.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-jar", "/site.jar"]

# 2b. Native build.
FROM ghcr.io/graalvm/native-image-community:21 AS native-build
WORKDIR /src
COPY server ./server
COPY content ./content
COPY --from=web /src/web/dist ./web/dist
RUN cd server && ./mvnw -q -B -Pnative -DskipTests native:compile && cp target/site /site

# Distroless: no shell, no package manager, runs as a non-root user.
FROM gcr.io/distroless/base-debian12:nonroot AS native
COPY --from=native-build /site /site
EXPOSE 8080
ENTRYPOINT ["/site"]
