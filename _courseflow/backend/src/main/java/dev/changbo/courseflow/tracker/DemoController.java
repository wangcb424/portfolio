package dev.changbo.courseflow.tracker;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController
@RequestMapping("/api/demo")
@ConditionalOnProperty(name="courseflow.demo",havingValue="true")
public class DemoController {
  private final DemoFeed feed; private final CatalogService catalog; private final MonitorJobs jobs;
  public DemoController(DemoFeed feed,CatalogService catalog,MonitorJobs jobs) {this.feed=feed;this.catalog=catalog;this.jobs=jobs;}
  public record Change(@NotBlank String sectionId,@Min(0) @Max(100) int available) {}
  @PostMapping("/seats") public Map<String,String> change(@Valid @RequestBody Change body) {
    feed.setSeats(body.sectionId(),body.available());
    String[] parts=body.sectionId().split(":");
    catalog.search(parts[1],"CS"+parts[2].substring(5,9),true);jobs.deliver();
    return Map.of("message","Synthetic seat count updated.");
  }
}
