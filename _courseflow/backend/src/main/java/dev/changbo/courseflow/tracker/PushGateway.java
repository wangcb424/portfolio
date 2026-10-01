package dev.changbo.courseflow.tracker;
import com.fasterxml.jackson.databind.ObjectMapper;
import nl.martijndwars.webpush.*;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import java.security.Security;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PushGateway {
  private final PushService service;
  private final ObjectMapper json;
  public final String publicKey;
  public PushGateway(ObjectMapper json,@Value("${courseflow.push-public-key}") String publicKey,
      @Value("${courseflow.push-private-key}") String privateKey,@Value("${courseflow.push-subject}") String subject,
      @Value("${courseflow.demo}") boolean demo) throws Exception {
    this.json=json;this.publicKey=publicKey;
    if(!demo && !publicKey.isBlank() && !privateKey.isBlank() && !subject.isBlank()) {
      if(Security.getProvider("BC")==null)Security.addProvider(new BouncyCastleProvider());
      service=new PushService(publicKey,privateKey,subject);
    } else service=null;
  }
  public boolean enabled(){return service!=null;}
  public int send(String endpoint,String key,String auth,String id,String body) throws Exception {
    if(service==null)return 204;
    var notification=new Notification(endpoint,key,auth,json.writeValueAsBytes(Map.of("title","CourseFlow · A seat is available","body",body,"id",id)));
    var future=service.sendAsync(notification);
    try{return future.get(15,TimeUnit.SECONDS).getStatusLine().getStatusCode();}
    finally{if(!future.isDone())future.cancel(true);}
  }
}
