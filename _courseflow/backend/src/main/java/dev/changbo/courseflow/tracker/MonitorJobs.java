package dev.changbo.courseflow.tracker;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import static dev.changbo.courseflow.tracker.TrackerModels.*;
import static dev.changbo.courseflow.tracker.TrackerRepository.*;

/** Deliberately one worker instance; deployments must use one replica. */
@Component
public class MonitorJobs {
  private final TrackerRepository repo;
  private final CatalogService catalog;
  private final TrackerService tracker;
  private final MailGateway mail;
  private final String source,publicUrl;
  private final boolean enabled,demo;
  private final AtomicBoolean running=new AtomicBoolean();
  public volatile Instant lastPoll;
  public MonitorJobs(TrackerRepository repo,CatalogService catalog,TrackerService tracker,MailGateway mail,
      @Value("${courseflow.source}") String source,@Value("${courseflow.public-url}") String publicUrl,
      @Value("${courseflow.polling-enabled}") boolean enabled,@Value("${courseflow.demo}") boolean demo) {
    this.repo=repo;this.catalog=catalog;this.tracker=tracker;this.mail=mail;
    this.source=source;this.publicUrl=publicUrl;this.enabled=enabled;this.demo=demo;
  }
  @Scheduled(fixedDelayString="${courseflow.poll-ms}",initialDelay=15000)
  public void poll() {
    if(!enabled || !running.compareAndSet(false,true)) return;
    try {
      Map<String,List<Seat>> groups=new LinkedHashMap<>();
      for(Seat s:repo.watchedSections(source)) groups.computeIfAbsent(s.term()+":"+s.code(),k->new ArrayList<>()).add(s);
      for(List<Seat> group:groups.values()) {
        try {
          var found=catalog.search(group.get(0).term(),group.get(0).code(),true);
          Set<String> ids=new HashSet<>(); found.sections().forEach(s->ids.add(s.id()));
          for(Seat watched:group) if(!ids.contains(watched.id())) tracker.failed(watched.id(),"Section not returned by the source; availability is unknown.");
        } catch(RuntimeException ex) {
          for(Seat watched:group) tracker.failed(watched.id(),"Source update failed. Showing the last successful observation.");
        }
      }
      lastPoll=Instant.now();
    } finally { running.set(false); }
  }
  @Scheduled(fixedDelay=15000,initialDelay=5000)
  public synchronized void deliver() {
    if(!enabled) return;
    var pending=repo.jdbc().queryForList("SELECT n.*,u.email FROM cf_notifications n JOIN cf_users u ON n.user_id=u.id WHERE n.delivery='PENDING' AND n.next_attempt_at<=? ORDER BY n.created_at LIMIT 50",ts(Instant.now()));
    for(var event:pending) {
      String id=(String)event.get("id"); int attempts=((Number)event.get("attempts")).intValue()+1;
      try {
        mail.send((String)event.get("email"),"CourseFlow · A seat is available",event.get("body")+"\n\nManage your watches: "+publicUrl+"\n\nOfficial registration: "+BannerFeed.PUBLIC_PAGE+"\nSeat availability does not guarantee registration eligibility.");
        repo.jdbc().update("UPDATE cf_notifications SET delivery=?,attempts=?,sent_at=? WHERE id=?",demo?"SIMULATED":"SENT",attempts,ts(Instant.now()),id);
      } catch(RuntimeException ex) {
        repo.jdbc().update("UPDATE cf_notifications SET delivery=?,attempts=?,next_attempt_at=? WHERE id=?",attempts>=5?"FAILED":"PENDING",attempts,ts(Instant.now().plusSeconds(Math.min(3600,30L*(1L<<attempts)))),id);
      }
    }
  }
  @Scheduled(fixedDelay=86400000,initialDelay=60000)
  public void cleanup() {
    repo.jdbc().update("DELETE FROM cf_login_codes WHERE created_at<?",ts(Instant.now().minusSeconds(86400)));
    repo.jdbc().update("DELETE FROM cf_samples WHERE checked_at<?",ts(Instant.now().minusSeconds(90L*86400)));
  }
}
