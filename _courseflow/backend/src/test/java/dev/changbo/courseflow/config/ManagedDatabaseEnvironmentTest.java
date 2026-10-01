package dev.changbo.courseflow.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class ManagedDatabaseEnvironmentTest {
  private final ManagedDatabaseEnvironment processor=new ManagedDatabaseEnvironment();

  @Test void decodesCloudDatabaseCredentialsWithoutChangingLiteralPlus(){
    var env=new MockEnvironment().withProperty("DATABASE_URL",
        "postgres://course%40flow:p+ss%3Aword@db.example.test/courseflow?sslmode=require")
        .withProperty("RENDER_EXTERNAL_URL","https://courseflow.example.test");
    processor.postProcessEnvironment(env,new SpringApplication());
    assertEquals("jdbc:postgresql://db.example.test:5432/courseflow?sslmode=require",env.getProperty("spring.datasource.url"));
    assertEquals("course@flow",env.getProperty("spring.datasource.username"));
    assertEquals("p+ss:word",env.getProperty("spring.datasource.password"));
    assertEquals("https://courseflow.example.test",env.getProperty("courseflow.public-url"));
  }

  @Test void explicitConfigurationTakesPrecedence(){
    var env=new MockEnvironment().withProperty("DATABASE_URL","postgres://ignored:ignored@ignored.test/ignored")
        .withProperty("DB_URL","jdbc:postgresql://explicit.test/app")
        .withProperty("PUBLIC_URL","https://explicit.test")
        .withProperty("RENDER_EXTERNAL_URL","https://ignored.test");
    processor.postProcessEnvironment(env,new SpringApplication());
    assertNull(env.getProperty("spring.datasource.url"));
    assertNull(env.getProperty("courseflow.public-url"));
  }

  @Test void rejectsMissingDatabaseWithoutLeakingCredentials(){
    var env=new MockEnvironment().withProperty("DATABASE_URL","postgres://alice:private-password@db.example.test");
    var error=assertThrows(IllegalStateException.class,()->processor.postProcessEnvironment(env,new SpringApplication()));
    assertEquals("DATABASE_URL must be a valid PostgreSQL URL.",error.getMessage());
    assertNull(error.getCause());
  }
}
