package dev.changbo.courseflow.tracker;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import static dev.changbo.courseflow.tracker.TrackerModels.*;
import static dev.changbo.courseflow.tracker.TrackerRepository.*;

@RestController
@RequestMapping("/api")
public class TrackerController {
  private final CatalogService catalog; private final TrackerService tracker;
  private final TrackerRepository repo; private final MonitorJobs jobs;
  private final boolean demo; private final String source; private final long poll,stale;
  public TrackerController(CatalogService catalog,TrackerService tracker,TrackerRepository repo,MonitorJobs jobs,
      @Value("${courseflow.demo}") boolean demo,@Value("${courseflow.source}") String source,
      @Value("${courseflow.poll-ms}") long poll,@Value("${courseflow.stale-seconds}") long stale) {
    this.catalog=catalog;this.tracker=tracker;this.repo=repo;this.jobs=jobs;this.demo=demo;this.source=source;this.poll=poll;this.stale=stale;
  }
  @GetMapping("/status") public Map<String,Object> status() {
    Map<String,Object> status=new LinkedHashMap<>();status.put("demo",demo);status.put("source",source);
    status.put("pollSeconds",poll/1000);status.put("staleSeconds",stale);status.put("lastPoll",jobs.lastPoll);
    status.put("officialUrl",BannerFeed.PUBLIC_PAGE);status.put("version","0.2.0");return status;
  }
  @GetMapping("/catalog/terms") public List<Term> terms() {return catalog.terms();}
  @GetMapping("/catalog/sections") public SearchResult search(@RequestParam String term,@RequestParam String q) {return catalog.search(term,q,false);}
  @GetMapping("/watchlist") public List<Watch> watches(Principal user) {return repo.watches(user.getName());}
  public record AddWatch(@NotBlank @Size(max=80) String sectionId,@Min(1) @Max(100) int threshold) {}
  public record EditWatch(@Min(1) @Max(100) int threshold,boolean enabled) {}
  @PostMapping("/watchlist") @ResponseStatus(HttpStatus.CREATED)
  public Watch add(Principal user,@Valid @RequestBody AddWatch body) {return tracker.add(user.getName(),body.sectionId(),body.threshold());}
  @PatchMapping("/watchlist/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void edit(Principal user,@PathVariable String id,@Valid @RequestBody EditWatch body) {tracker.edit(user.getName(),id,body.threshold(),body.enabled());}
  @DeleteMapping("/watchlist/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(Principal user,@PathVariable String id) {tracker.delete(user.getName(),id);}
  @GetMapping("/history/{id}") public List<Sample> history(@PathVariable String id) {repo.require(id);return repo.history(id);}
  @GetMapping("/notifications") public List<Notice> notices(Principal user) {return repo.notices(user.getName());}
  @PostMapping("/notifications/read") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void read(Principal user) {repo.jdbc().update("UPDATE cf_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",ts(Instant.now()),user.getName());}
}
