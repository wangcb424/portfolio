package dev.changbo.courseflow.tracker;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import static dev.changbo.courseflow.tracker.TrackerModels.*;
import static dev.changbo.courseflow.tracker.TrackerRepository.*;
@Service
public class TrackerService {
  private final TrackerRepository repo;
  private final String source;
  private final long staleSeconds;
  public TrackerService(TrackerRepository repo,@Value("${courseflow.source}") String source,
      @Value("${courseflow.stale-seconds}") long staleSeconds) {
    this.repo=repo; this.source=source; this.staleSeconds=staleSeconds;
  }
  /** Commit the observation and notification outbox in the same transaction. */
  @Transactional
  public synchronized void observe(Seat seat) {
    repo.jdbc().queryForList("SELECT id FROM cf_sections WHERE id=? FOR UPDATE",seat.id());
    Optional<Seat> previous=repo.find(seat.id());
    if(previous.isPresent() && !seat.checkedAt().isAfter(previous.get().checkedAt())) return;
    repo.save(seat);
    if(previous.isEmpty() || previous.get().available()!=seat.available() || previous.get().capacity()!=seat.capacity())
      repo.jdbc().update("INSERT INTO cf_samples(id,section_id,available,capacity,checked_at) VALUES(?,?,?,?,?)",id(),seat.id(),seat.available(),seat.capacity(),ts(seat.checkedAt()));
    var watches=repo.jdbc().queryForList("SELECT * FROM cf_watches WHERE section_id=? AND enabled=TRUE FOR UPDATE",seat.id());
    for(var w:watches) {
      boolean matched=seat.available()>=((Number)w.get("threshold")).intValue();
      if(matched && !Boolean.TRUE.equals(w.get("matched"))) enqueue((String)w.get("user_id"),seat);
      repo.jdbc().update("UPDATE cf_watches SET matched=? WHERE id=?",matched,w.get("id"));
    }
  }
  private void enqueue(String user,Seat seat) {
    Instant now=Instant.now();
    String body=seat.code()+" · CRN "+seat.crn()+" has "+seat.available()+" available seat(s). Check registration eligibility in Banner.";
    repo.jdbc().update("INSERT INTO cf_notifications(id,user_id,section_id,body,created_at,next_attempt_at) VALUES(?,?,?,?,?,?)",id(),user,seat.id(),body,ts(now),ts(now));
  }
  public boolean fresh(Seat seat) {
    return seat.errorMessage()==null && seat.checkedAt().isAfter(Instant.now().minusSeconds(staleSeconds));
  }
  @Transactional
  public synchronized Watch add(String user,String sectionId,int threshold) {
    checkThreshold(threshold);
    repo.jdbc().queryForList("SELECT id FROM cf_users WHERE id=? FOR UPDATE",user);
    repo.jdbc().queryForList("SELECT id FROM cf_sections WHERE id=? FOR UPDATE",sectionId);
    Seat seat=repo.require(sectionId);
    if(!seat.source().equals(source)) throw new IllegalArgumentException("This section belongs to another data source.");
    var existing=repo.watches(user).stream().filter(w->w.sectionId().equals(sectionId)).findFirst();
    if(existing.isPresent()) return existing.get();
    if(repo.watches(user).size()>=20) throw new IllegalArgumentException("You can track up to 20 sections.");
    String watch=id(); boolean matched=fresh(seat) && seat.available()>=threshold;
    repo.jdbc().update("INSERT INTO cf_watches(id,user_id,section_id,threshold,enabled,matched,created_at) VALUES(?,?,?,?,TRUE,?,?)",watch,user,sectionId,threshold,matched,ts(Instant.now()));
    if(matched) enqueue(user,seat);
    return new Watch(watch,sectionId,threshold,true,matched,seat);
  }
  @Transactional
  public synchronized void edit(String user,String watch,int threshold,boolean enabled) {
    checkThreshold(threshold);
    // Use the same section-then-watch lock order as observe; the transaction
    // commits after this method returns, so Java synchronization alone is insufficient.
    var owned=repo.jdbc().queryForList("SELECT section_id FROM cf_watches WHERE id=? AND user_id=?",watch,user);
    if(owned.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Watch not found.");
    repo.jdbc().queryForList("SELECT id FROM cf_sections WHERE id=? FOR UPDATE",owned.get(0).get("section_id"));
    repo.jdbc().queryForList("SELECT id FROM cf_watches WHERE id=? AND user_id=? FOR UPDATE",watch,user);
    var found=repo.watches(user).stream().filter(w->w.id().equals(watch)).findFirst()
      .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Watch not found."));
    boolean newMatch=fresh(found.section()) && found.section().available()>=threshold && enabled;
    if(newMatch && (!found.matched() || !found.enabled())) enqueue(user,found.section());
    repo.jdbc().update("UPDATE cf_watches SET threshold=?,enabled=?,matched=? WHERE id=? AND user_id=?",threshold,enabled,newMatch,watch,user);
  }
  public void delete(String user,String watch) {
    if(repo.jdbc().update("DELETE FROM cf_watches WHERE id=? AND user_id=?",watch,user)==0)
      throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Watch not found.");
  }
  public void failed(String section,String message) {
    repo.jdbc().update("UPDATE cf_sections SET last_attempt_at=?,error_message=? WHERE id=?",ts(Instant.now()),message,section);
  }
  static void checkThreshold(int threshold) {
    if(threshold<1 || threshold>100) throw new IllegalArgumentException("Seat threshold must be 1–100.");
  }
}
