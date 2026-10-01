package dev.changbo.courseflow.tracker;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import static dev.changbo.courseflow.tracker.TrackerRepository.*;
@Component
public class PushJobs {
  private final TrackerRepository repo;private final PushGateway gateway;private final boolean enabled;
  public PushJobs(TrackerRepository repo,PushGateway gateway,@Value("${courseflow.polling-enabled}") boolean enabled){this.repo=repo;this.gateway=gateway;this.enabled=enabled;}
  @Scheduled(fixedDelay=15000,initialDelay=8000)
  public synchronized void deliver(){
    if(!enabled||!gateway.enabled())return;
    var events=repo.jdbc().queryForList("SELECT * FROM cf_notifications WHERE push_delivery='PENDING' AND (push_next_at IS NULL OR push_next_at<=?) ORDER BY created_at LIMIT 30",ts(Instant.now()));
    for(var event:events){
      var devices=repo.jdbc().queryForList("SELECT * FROM cf_push_devices WHERE user_id=?",event.get("user_id"));boolean failed=false;
      for(var device:devices)try{
        int status=gateway.send((String)device.get("endpoint"),(String)device.get("public_key"),(String)device.get("auth_secret"),(String)event.get("id"),(String)event.get("body"));
        if(status==404||status==410)repo.jdbc().update("DELETE FROM cf_push_devices WHERE id=?",device.get("id"));
        else if(status<200||status>=300)failed=true;
      }catch(Exception ex){failed=true;}
      int attempts=((Number)event.get("push_attempts")).intValue()+1;
      repo.jdbc().update("UPDATE cf_notifications SET push_delivery=?,push_attempts=?,push_next_at=? WHERE id=?",
        failed?(attempts>=5?"FAILED":"PENDING"):(devices.isEmpty()?"SKIPPED":"SENT"),attempts,ts(Instant.now().plusSeconds(Math.min(3600,30L*(1L<<attempts)))),event.get("id"));
    }
  }
}
