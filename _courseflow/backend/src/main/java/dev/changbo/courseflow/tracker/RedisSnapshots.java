package dev.changbo.courseflow.tracker;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.lettuce.core.*;
import io.lettuce.core.api.StatefulRedisConnection;
import jakarta.annotation.PreDestroy;
import java.time.*;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import static dev.changbo.courseflow.tracker.TrackerModels.*;

/** Optional TTL cache; a Redis outage falls back to the bounded in-process cache. */
@Component
public class RedisSnapshots {
  private final boolean enabled; private final String uri,source; private final ObjectMapper json;
  private RedisClient client; private StatefulRedisConnection<String,String> connection;
  private Instant retryAfter=Instant.EPOCH;
  public RedisSnapshots(@Value("${courseflow.redis-enabled}") boolean enabled,
      @Value("${courseflow.redis-url}") String uri,@Value("${courseflow.source}") String source,ObjectMapper json) {
    this.enabled=enabled;this.uri=uri;this.source=source;this.json=json;
  }
  private boolean ready() {
    if(!enabled || Instant.now().isBefore(retryAfter)) return false;
    try {
      if(client==null){client=RedisClient.create(uri);client.setDefaultTimeout(Duration.ofSeconds(2));}
      if(connection==null || !connection.isOpen())connection=client.connect();
      return true;
    }catch(RuntimeException e){retryAfter=Instant.now().plusSeconds(60);return false;}
  }
  public synchronized Optional<SearchResult> get(String key) {
    if(!ready())return Optional.empty();
    try {String data=connection.sync().get("courseflow:v2:"+source+":"+key);return data==null?Optional.empty():Optional.of(json.readValue(data,SearchResult.class));}
    catch(Exception e){retryAfter=Instant.now().plusSeconds(60);return Optional.empty();}
  }
  public synchronized void put(String key,SearchResult result) {
    if(!ready())return;
    try{connection.sync().setex("courseflow:v2:"+source+":"+key,60,json.writeValueAsString(result));}
    catch(Exception e){retryAfter=Instant.now().plusSeconds(60);}
  }
  @PreDestroy public synchronized void close(){if(connection!=null)connection.close();if(client!=null)client.shutdown();}
}
