package dev.changbo.courseflow.tracker;
import java.time.Instant;
import java.util.List;
/** Immutable values shared by the adapter, services, and browser. */
public final class TrackerModels {
  private TrackerModels() {}
  public record Term(String code, String description) {}
  public record Seat(String id, String source, String term, String crn, String code,
      String title, String sectionNumber, String instructor, String meetingSummary,
      int capacity, int available, Instant checkedAt, Instant lastAttemptAt, String errorMessage) {}
  public record SearchResult(List<Seat> sections, boolean truncated, Instant fetchedAt) {}
  public record Watch(String id, String sectionId, int threshold, boolean enabled, boolean matched, Seat section) {}
  public record Notice(String id, String sectionId, String body, Instant createdAt,
      Instant readAt, String delivery, int attempts) {}
  public record Sample(int available, int capacity, Instant checkedAt) {}
}
