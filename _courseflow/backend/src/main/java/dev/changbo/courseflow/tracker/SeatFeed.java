package dev.changbo.courseflow.tracker;
import java.util.List;
import static dev.changbo.courseflow.tracker.TrackerModels.*;
/** A failed request never means zero seats. */
public interface SeatFeed {
  List<Term> terms();
  SearchResult search(String term, String courseCode);
}
