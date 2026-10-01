package dev.changbo.courseflow.config;
import jakarta.annotation.PostConstruct;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
@Component
public class ProductionGuard {
  private final Environment env;
  public ProductionGuard(Environment env) { this.env=env; }
  @PostConstruct void validate() {
    boolean demo=env.getProperty("courseflow.demo",Boolean.class,false);
    String source=env.getProperty("courseflow.source","");
    if(demo && !source.equals("demo")) throw new IllegalStateException("Demo login may only be used with synthetic demo data.");
    if(!demo) {
      if(!env.getProperty("courseflow.public-url","").startsWith("https://")) throw new IllegalStateException("Set PUBLIC_URL to your HTTPS address.");
      if(env.getProperty("courseflow.mail-from","").isBlank() || env.getProperty("spring.mail.host","localhost").equals("localhost"))
        throw new IllegalStateException("Configure SMTP_HOST and MAIL_FROM for verified email login.");
      if(!env.getProperty("server.servlet.session.cookie.secure",Boolean.class,true)) throw new IllegalStateException("Live mode requires secure cookies.");
      if(env.getProperty("courseflow.poll-ms",Long.class,0L)<60000) throw new IllegalStateException("Polling interval must be at least 60 seconds.");
    }
  }
}
