FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app
COPY . .
RUN sh ./mvnw -B -ntp verify

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/courseflow-0.2.0.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
