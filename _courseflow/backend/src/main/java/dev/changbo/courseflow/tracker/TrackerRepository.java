package dev.changbo.courseflow.tracker;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import static dev.changbo.courseflow.tracker.TrackerModels.*;
/** Parameterized SQL only. Account-specific queries include user_id. */
@Repository
public class TrackerRepository {
  private final JdbcTemplate db;
  public TrackerRepository(JdbcTemplate db) { this.db=db; }
  /** Access through a method so Spring repository proxies delegate to the initialized target. */
  public JdbcTemplate jdbc() { return db; }
  static Timestamp ts(Instant value) { return Timestamp.from(value); }
  static String id() { return UUID.randomUUID().toString(); }
  static Instant instant(ResultSet rs,String name) throws SQLException {
    Timestamp value=rs.getTimestamp(name); return value==null?null:value.toInstant();
  }
  static Seat mapSeat(ResultSet r,int n) throws SQLException {
    return new Seat(r.getString("id"),r.getString("source"),r.getString("term"),r.getString("crn"),
      r.getString("code"),r.getString("title"),r.getString("section_number"),r.getString("instructor"),
      r.getString("meeting_summary"),r.getInt("capacity"),r.getInt("available"),instant(r,"checked_at"),
      instant(r,"last_attempt_at"),r.getString("error_message"));
  }
  public Optional<Seat> find(String id) {
    return db.query("SELECT * FROM cf_sections WHERE id=?",TrackerRepository::mapSeat,id).stream().findFirst();
  }
  public Seat require(String id) {
    return find(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Section not found. Search first."));
  }
  public void save(Seat s) {
    int changed=db.update("UPDATE cf_sections SET title=?,instructor=?,meeting_summary=?,capacity=?,available=?,checked_at=?,last_attempt_at=?,error_message=NULL WHERE id=? AND checked_at<=?",
      s.title(),s.instructor(),s.meetingSummary(),s.capacity(),s.available(),ts(s.checkedAt()),ts(s.checkedAt()),s.id(),ts(s.checkedAt()));
    if(changed==0 && find(s.id()).isEmpty()) db.update("INSERT INTO cf_sections(id,source,term,crn,code,title,section_number,instructor,meeting_summary,capacity,available,checked_at,last_attempt_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      s.id(),s.source(),s.term(),s.crn(),s.code(),s.title(),s.sectionNumber(),s.instructor(),s.meetingSummary(),s.capacity(),s.available(),ts(s.checkedAt()),ts(s.checkedAt()));
  }
  public List<Seat> watchedSections(String source) {
    return db.query("SELECT s.* FROM cf_sections s WHERE source=? AND EXISTS(SELECT 1 FROM cf_watches w WHERE w.section_id=s.id AND w.enabled=TRUE) ORDER BY s.term,s.code,s.id",TrackerRepository::mapSeat,source);
  }
  public List<Watch> watches(String user) {
    return db.query("SELECT * FROM cf_watches WHERE user_id=? ORDER BY created_at DESC",(r,n)->new Watch(r.getString("id"),r.getString("section_id"),r.getInt("threshold"),r.getBoolean("enabled"),r.getBoolean("matched"),require(r.getString("section_id"))),user);
  }
  public List<Notice> notices(String user) {
    return db.query("SELECT * FROM cf_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",(r,n)->new Notice(r.getString("id"),r.getString("section_id"),r.getString("body"),instant(r,"created_at"),instant(r,"read_at"),r.getString("delivery"),r.getInt("attempts")),user);
  }
  public List<Sample> history(String section) {
    return db.query("SELECT * FROM cf_samples WHERE section_id=? ORDER BY checked_at DESC LIMIT 100",(r,n)->new Sample(r.getInt("available"),r.getInt("capacity"),instant(r,"checked_at")),section);
  }
}
