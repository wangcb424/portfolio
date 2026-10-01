package dev.changbo.courseflow.config;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.*;
/** Convert a cloud provider's PostgreSQL URL into JDBC configuration without logging secrets. */
public class ManagedDatabaseEnvironment implements EnvironmentPostProcessor,Ordered {
  @Override public int getOrder(){return Ordered.LOWEST_PRECEDENCE;}
  @Override public void postProcessEnvironment(ConfigurableEnvironment env,SpringApplication app){
    Map<String,Object> values=new HashMap<>();
    String raw=env.getProperty("DATABASE_URL","");
    if(!raw.isBlank() && env.getProperty("DB_URL","").isBlank()){
      try{
        URI uri=URI.create(raw);
        if(!Set.of("postgres","postgresql").contains(uri.getScheme()) || uri.getHost()==null
            || uri.getRawPath()==null || uri.getRawPath().length()<2)throw new IllegalArgumentException();
        values.put("spring.datasource.url","jdbc:postgresql://"+uri.getHost()+":"+(uri.getPort()<0?5432:uri.getPort())+uri.getRawPath()+(uri.getRawQuery()==null?"":"?"+uri.getRawQuery()));
        if(uri.getRawUserInfo()!=null){String[] auth=uri.getRawUserInfo().split(":",2);
          values.put("spring.datasource.username",decodeCredential(auth[0]));
          if(auth.length==2)values.put("spring.datasource.password",decodeCredential(auth[1]));
        }
      }catch(RuntimeException ex){throw new IllegalStateException("DATABASE_URL must be a valid PostgreSQL URL.");}
    }
    String publicUrl=env.getProperty("RENDER_EXTERNAL_URL","");
    if(!publicUrl.isBlank() && env.getProperty("PUBLIC_URL","").isBlank())values.put("courseflow.public-url",publicUrl);
    if(!values.isEmpty())env.getPropertySources().addFirst(new MapPropertySource("managed-database",values));
  }
  private static String decodeCredential(String value){
    // URI user-info is not form data: an unescaped '+' is a literal plus.
    return URLDecoder.decode(value.replace("+","%2B"),StandardCharsets.UTF_8);
  }
}
