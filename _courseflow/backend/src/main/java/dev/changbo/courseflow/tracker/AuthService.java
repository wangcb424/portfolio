package dev.changbo.courseflow.tracker;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import static dev.changbo.courseflow.tracker.TrackerRepository.*;

@Service
public class AuthService {
  private final JdbcTemplate db;
  private final MailGateway mail;
  private final boolean demo;
  private final SecureRandom random=new SecureRandom();
  private final BCryptPasswordEncoder encoder=new BCryptPasswordEncoder();
  public AuthService(JdbcTemplate db,MailGateway mail,@Value("${courseflow.demo}") boolean demo) {this.db=db;this.mail=mail;this.demo=demo;}
  @Transactional
  public synchronized Map<String,String> requestCode(String email) {
    email=email.trim().toLowerCase(Locale.ROOT); Instant now=Instant.now();
    if(db.queryForObject("SELECT COUNT(*) FROM cf_login_codes WHERE email=? AND created_at>?",Integer.class,email,ts(now.minusSeconds(900)))>=3)
      throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Wait 15 minutes before requesting another code.");
    String code=String.format(Locale.ROOT,"%06d",random.nextInt(1000000));
    db.update("UPDATE cf_login_codes SET consumed=TRUE WHERE email=?",email);
    db.update("INSERT INTO cf_login_codes(id,email,code_hash,created_at,expires_at) VALUES(?,?,?,?,?)",id(),email,encoder.encode(code),ts(now),ts(now.plusSeconds(600)));
    mail.send(email,"Your CourseFlow sign-in code", "Your code is "+code+". It expires in 10 minutes. If you did not request it, ignore this email.");
    return demo?Map.of("message","Demo only: no email was sent.","demoCode",code):Map.of("message","Check your email for a sign-in code.");
  }
  // noRollbackFor preserves failed-attempt counters and consumed state on invalid login.
  @Transactional(noRollbackFor=ResponseStatusException.class)
  public synchronized String verify(String email,String code) {
    email=email.trim().toLowerCase(Locale.ROOT);
    var codes=db.queryForList("SELECT * FROM cf_login_codes WHERE email=? AND consumed=FALSE ORDER BY created_at DESC LIMIT 1 FOR UPDATE",email);
    if(codes.isEmpty()) throw invalid();
    var row=codes.get(0); String challenge=(String)row.get("id");
    Instant expiry=db.queryForObject("SELECT expires_at FROM cf_login_codes WHERE id=?",(r,n)->instant(r,"expires_at"),challenge);
    if(!expiry.isAfter(Instant.now()) || ((Number)row.get("attempts")).intValue()>=5) throw invalid();
    db.update("UPDATE cf_login_codes SET attempts=attempts+1 WHERE id=?",challenge);
    if(!encoder.matches(code,(String)row.get("code_hash"))) throw invalid();
    db.update("UPDATE cf_login_codes SET consumed=TRUE WHERE id=?",challenge);
    var users=db.queryForList("SELECT id FROM cf_users WHERE email=?",String.class,email);
    if(!users.isEmpty()) return users.get(0);
    String user=id();db.update("INSERT INTO cf_users(id,email,created_at) VALUES(?,?,?)",user,email,ts(Instant.now()));return user;
  }
  public String email(String user) { return db.queryForObject("SELECT email FROM cf_users WHERE id=?",String.class,user); }
  private ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid or expired code. Request a new code if needed."); }
}
