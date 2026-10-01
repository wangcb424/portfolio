FROM node:24-bookworm-slim AS ui
WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
COPY backend/ ./
COPY --from=ui /ui/dist/ ./src/main/resources/static/
RUN sh ./mvnw -B -ntp verify

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S courseflow && adduser -S courseflow -G courseflow
WORKDIR /app
RUN mkdir -p /app/data && chown -R courseflow:courseflow /app
COPY --from=build --chown=courseflow:courseflow /build/target/courseflow-0.2.0.jar /app/courseflow.jar
USER courseflow
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65 -XX:+ExitOnOutOfMemoryError"
ENTRYPOINT ["java","-jar","/app/courseflow.jar"]
