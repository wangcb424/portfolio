package dev.changbo.courseflow.tracker;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import static dev.changbo.courseflow.tracker.TrackerModels.*;
@Component
@ConditionalOnProperty(name="courseflow.source",havingValue="demo")
public class DemoFeed implements SeatFeed {
  private final Map<String,Integer> seats=new ConcurrentHashMap<>();
  private final Map<String,String> courses=Map.of("CS3000","Algorithms and Data",
      "CS3100","Program Design and Implementation II","CS3200","Introduction to Databases");
  public List<Term> terms() { return List.of(new Term("202710","Fall 2026 · Demo")); }
  public SearchResult search(String term,String code) {
    Instant now=Instant.now();
    if(!term.equals("202710") || !courses.containsKey(code)) return new SearchResult(List.of(),false,now);
    List<Seat> found=new ArrayList<>();
    for(int i=1;i<=3;i++) {
      String crn="DEMO-"+code.substring(2)+i, id="demo:"+term+":"+crn;
      found.add(new Seat(id,"demo",term,crn,code,courses.get(code),"0"+i,"Demo Instructor "+i,
          i==2?"Tue / Fri · 13:35–15:15":"Mon / Wed · 14:50–16:30",100,seats.getOrDefault(id,i==2?6:0),now,now,null));
    }
    return new SearchResult(found,false,now);
  }
  public void setSeats(String id,int available) {
    if(!id.matches("demo:202710:DEMO-(3000|3100|3200)[123]") || available<0 || available>100)
      throw new IllegalArgumentException("Invalid demo section or seat count.");
    seats.put(id,available);
  }
}
