package dev.changbo.courseflow.tracker;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import static dev.changbo.courseflow.tracker.TrackerModels.*;

/** Short, bounded cache shares requests across users; all upstream access is serialized. */
@Service
public class CatalogService {
  private final SeatFeed feed;
  private final TrackerService tracker;
  private final RedisSnapshots redis;
  private final Map<String,SearchResult> cache=new LinkedHashMap<>();
  private List<Term> terms=List.of();
  private Instant termsAt=Instant.EPOCH;
  public CatalogService(SeatFeed feed,TrackerService tracker,RedisSnapshots redis) { this.feed=feed; this.tracker=tracker;this.redis=redis; }
  public synchronized List<Term> terms() {
    if(termsAt.isBefore(Instant.now().minusSeconds(3600))) { terms=feed.terms(); termsAt=Instant.now(); }
    return terms;
  }
  public synchronized SearchResult search(String term,String query,boolean force) {
    String code=normalize(query);
    if(!term.matches("[0-9]{6}")) throw new IllegalArgumentException("Choose a valid term.");
    String key=term+":"+code; SearchResult result=cache.get(key);
    if(!force && result!=null && result.fetchedAt().isAfter(Instant.now().minusSeconds(60))) return result;
    result=force?feed.search(term,code):redis.get(key).filter(r->r.fetchedAt().isAfter(Instant.now().minusSeconds(60))).orElseGet(()->feed.search(term,code));
    result.sections().forEach(tracker::observe);
    cache.put(key,result);
    redis.put(key,result);
    while(cache.size()>256) cache.remove(cache.keySet().iterator().next());
    return result;
  }
  static String normalize(String query) {
    if(query==null || query.length()>30) throw new IllegalArgumentException("Enter a course code such as CS3100.");
    String code=query.replaceAll("\\s+","").toUpperCase(Locale.ROOT);
    if(!code.matches("[A-Z]{2,6}[0-9]{4}[A-Z]?")) throw new IllegalArgumentException("Enter a course code such as CS3100, then choose its CRN.");
    return code;
  }
}
