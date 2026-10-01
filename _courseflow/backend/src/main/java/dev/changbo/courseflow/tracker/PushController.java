package dev.changbo.courseflow.tracker;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import static dev.changbo.courseflow.tracker.TrackerRepository.*;

@RestController
@RequestMapping("/api/push")
public class PushController {
  private final TrackerRepository repo;private final PushGateway gateway;
  public PushController(TrackerRepository repo,PushGateway gateway){this.repo=repo;this.gateway=gateway;}
  public record Keys(@NotBlank @Size(max=200) String p256dh,@NotBlank @Size(max=100) String auth){}
  public record Subscription(@NotBlank @Size(max=2000) String endpoint,@Valid @NotNull Keys keys){}
  @GetMapping("/config") public Map<String,Object> config(){return Map.of("enabled",gateway.enabled(),"publicKey",gateway.publicKey);}
  @PostMapping("/subscriptions") public synchronized Map<String,String> add(Principal user,@Valid @RequestBody Subscription body) throws Exception {
    if(!gateway.enabled())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Web push is not configured. Email alerts are available.");
    validateEndpoint(body.endpoint());
    byte[] key,auth;
    try{key=Base64.getUrlDecoder().decode(body.keys().p256dh());auth=Base64.getUrlDecoder().decode(body.keys().auth());}
    catch(IllegalArgumentException ex){throw new IllegalArgumentException("Invalid push keys.");}
    if(key.length!=65||key[0]!=4||auth.length!=16)throw new IllegalArgumentException("Invalid push keys.");
    String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.endpoint().getBytes(StandardCharsets.UTF_8)));
    if(repo.jdbc().queryForObject("SELECT COUNT(*) FROM cf_push_devices WHERE user_id=?",Integer.class,user.getName())>=10)
      throw new IllegalArgumentException("At most 10 notification devices per account.");
    // A browser endpoint belongs to the most recently signed-in account on that browser.
    int changed=repo.jdbc().update("UPDATE cf_push_devices SET user_id=?,public_key=?,auth_secret=? WHERE endpoint_hash=?",user.getName(),body.keys().p256dh(),body.keys().auth(),hash);
    if(changed==0)repo.jdbc().update("INSERT INTO cf_push_devices(id,user_id,endpoint,endpoint_hash,public_key,auth_secret,created_at) VALUES(?,?,?,?,?,?,?)",id(),user.getName(),body.endpoint(),hash,body.keys().p256dh(),body.keys().auth(),ts(Instant.now()));
    return Map.of("message","This device is subscribed.");
  }
  @DeleteMapping("/subscriptions") public void remove(Principal user,@RequestBody Map<String,String> body){repo.jdbc().update("DELETE FROM cf_push_devices WHERE user_id=? AND endpoint=?",user.getName(),body.getOrDefault("endpoint",""));}
  static void validateEndpoint(String endpoint) {
    URI uri;
    try{uri=URI.create(endpoint);}catch(IllegalArgumentException ex){throw new IllegalArgumentException("Invalid push endpoint.");}
    String host=uri.getHost();
    boolean allowed=host!=null && (host.equals("fcm.googleapis.com") || host.equals("updates.push.services.mozilla.com")
      || host.endsWith(".push.services.mozilla.com") || host.equals("web.push.apple.com") || host.endsWith(".notify.windows.com"));
    if(!"https".equals(uri.getScheme()) || !allowed || (uri.getPort()!=-1&&uri.getPort()!=443) || uri.getUserInfo()!=null || uri.getFragment()!=null)
      throw new IllegalArgumentException("Unsupported push provider. Email alerts are still available.");
  }
}
