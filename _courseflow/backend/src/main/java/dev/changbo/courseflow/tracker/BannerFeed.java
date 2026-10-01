package dev.changbo.courseflow.tracker;

import com.fasterxml.jackson.databind.*;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.web.util.HtmlUtils;
import static dev.changbo.courseflow.tracker.TrackerModels.*;

/** Public Banner search, with anonymous cookies only. No registration or account endpoints. */
@Component
@ConditionalOnProperty(name="courseflow.source",havingValue="banner")
public class BannerFeed implements SeatFeed {
  public static final String BASE="https://nubanner.neu.edu/StudentRegistrationSsb";
  public static final String PUBLIC_PAGE=BASE+"/ssb/term/termSelection?mode=search";
  private final ObjectMapper json;
  private final long gapMs;
  private long nextCall;
  public BannerFeed(ObjectMapper json,@Value("${courseflow.upstream-gap-ms:1200}") long gapMs) {
    this.json=json; this.gapMs=Math.max(1000,gapMs);
  }
  private HttpClient client() {
    return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
      .cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ORIGINAL_SERVER))
      .followRedirects(HttpClient.Redirect.NEVER).build();
  }
  private String request(HttpClient client,String path,String form) throws Exception {
    long delay=nextCall-System.currentTimeMillis();
    if(delay>0) Thread.sleep(delay);
    nextCall=System.currentTimeMillis()+gapMs;
    var builder=HttpRequest.newBuilder(URI.create(BASE+path)).timeout(Duration.ofSeconds(15))
      .header("User-Agent","CourseFlow/0.2 (public course availability tracker)")
      .header("Accept","application/json,text/html");
    if(form==null) builder.GET();
    else builder.header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form));
    var response=client.send(builder.build(),HttpResponse.BodyHandlers.ofInputStream());
    try(var stream=response.body()) {
      if(response.statusCode()!=200) throw new IOException("Upstream HTTP "+response.statusCode());
      byte[] data=stream.readNBytes(2_000_001);
      if(data.length>2_000_000) throw new IOException("Upstream response too large");
      return new String(data,StandardCharsets.UTF_8);
    }
  }
  @Override public synchronized List<Term> terms() {
    try {
      JsonNode root=json.readTree(request(client(),"/ssb/classSearch/getTerms?searchTerm=&offset=1&max=30",null));
      if(!root.isArray()) throw new IOException("Terms response is not an array");
      List<Term> result=new ArrayList<>();
      for(JsonNode row:root) if(row.path("code").asText().matches("[0-9]{6}"))
        result.add(new Term(row.path("code").asText(),row.path("description").asText()));
      return result;
    } catch(Exception ex) { throw unavailable(ex); }
  }
  @Override public synchronized SearchResult search(String term,String courseCode) {
    try {
      var match=java.util.regex.Pattern.compile("([A-Z]{2,6})([0-9]{4}[A-Z]?)").matcher(courseCode);
      if(!term.matches("[0-9]{6}") || !match.matches()) throw new IllegalArgumentException("Use a course code such as CS3100.");
      HttpClient client=client(); String session=UUID.randomUUID().toString();
      request(client,"/ssb/term/termSelection?mode=search",null);
      JsonNode selected=json.readTree(request(client,"/ssb/term/search?mode=search",
          "term="+term+"&studyPath=&studyPathText=&startDatepicker=&endDatepicker=&uniqueSessionId="+session));
      if(!selected.path("fwdURL").asText().equals("/StudentRegistrationSsb/ssb/classSearch/classSearch"))
        throw new IOException("Public term selection is unavailable");
      request(client,"/ssb/classSearch/classSearch",null);
      String query="/ssb/searchResults/searchResults?txt_subject="+match.group(1)+"&txt_courseNumber="+match.group(2)
          +"&txt_term="+term+"&startDatepicker=&endDatepicker=&pageOffset=0&pageMaxSize=50&sortColumn=subjectDescription&sortDirection=asc&uniqueSessionId="+session;
      return parse(json.readTree(request(client,query,null)),term,courseCode,Instant.now());
    } catch(IllegalArgumentException ex) { throw ex; }
      catch(Exception ex) { throw unavailable(ex); }
  }
  static SearchResult parse(JsonNode root,String term,String courseCode,Instant now) throws IOException {
    if(!root.path("success").asBoolean() || !root.path("data").isArray())
      throw new IOException("Invalid Banner search response");
    List<Seat> rows=new ArrayList<>();
    for(JsonNode row:root.path("data")) {
      String code=row.path("subject").asText()+row.path("courseNumber").asText();
      if(!term.equals(row.path("term").asText()) || !courseCode.equals(code)) continue;
      String crn=row.path("courseReferenceNumber").asText();
      if(!crn.matches("[0-9]{4,8}") || !row.path("maximumEnrollment").isIntegralNumber()
          || !row.path("seatsAvailable").isIntegralNumber()) throw new IOException("Missing seat fields");
      Set<String> names=new LinkedHashSet<>(),meetings=new LinkedHashSet<>();
      for(JsonNode faculty:row.path("faculty")) if(!faculty.path("displayName").asText().isBlank()) names.add(faculty.path("displayName").asText());
      for(JsonNode item:row.path("meetingsFaculty")) {
        JsonNode m=item.path("meetingTime"); List<String> days=new ArrayList<>();
        String[] keys={"monday","tuesday","wednesday","thursday","friday","saturday","sunday"};
        String[] labels={"Mon","Tue","Wed","Thu","Fri","Sat","Sun"};
        for(int i=0;i<keys.length;i++) if(m.path(keys[i]).asBoolean()) days.add(labels[i]);
        if(!days.isEmpty()) meetings.add(String.join(" / ",days)+" · "+clock(m.path("beginTime").asText())+"–"+clock(m.path("endTime").asText()));
      }
      rows.add(new Seat("banner:"+term+":"+crn,"banner",term,crn,code,
        clip(HtmlUtils.htmlUnescape(row.path("courseTitle").asText()),255),clip(row.path("sequenceNumber").asText(),20),
        clip(names.isEmpty()?"Instructor not listed":String.join(", ",names),255),
        clip(meetings.isEmpty()?"Meeting time not listed":String.join("; ",meetings),1000),
        row.path("maximumEnrollment").intValue(),row.path("seatsAvailable").intValue(),now,now,null));
    }
    return new SearchResult(List.copyOf(rows),root.path("totalCount").asInt()>root.path("data").size(),now);
  }
  private static String clock(String time) { return time.matches("[0-9]{4}")?time.substring(0,2)+":"+time.substring(2):"TBA"; }
  private static String clip(String text,int max) { return text.substring(0,Math.min(max,text.length())); }
  private static ResponseStatusException unavailable(Exception ex) {
    if(ex instanceof InterruptedException) Thread.currentThread().interrupt();
    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Banner is unavailable. Existing seat counts have not been changed.");
  }
}
