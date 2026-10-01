package dev.changbo.courseflow.schedule;

import dev.changbo.courseflow.section.Section;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;

public final class ScheduleModels {
  private ScheduleModels() {}

  public record GenerateRequest(
      @NotEmpty @jakarta.validation.constraints.Size(max=6) List<@NotBlank @jakarta.validation.constraints.Size(max=20) String> courseCodes,
      @NotBlank String term,
      LocalTime earliestStart,
      LocalTime latestEnd,
      boolean avoidFriday,
      @Min(1) @Max(20) int maxResults) {
    public GenerateRequest {
      if (earliestStart == null) earliestStart = LocalTime.of(8, 0);
      if (latestEnd == null) latestEnd = LocalTime.of(21, 0);
      if (maxResults == 0) maxResults = 5;
    }
  }

  public record MeetingView(DayOfWeek day, LocalTime start, LocalTime end) {}

  public record SectionView(
      Long id, String courseCode, String crn, String instructor,
      int capacity, int availableSeats, List<MeetingView> meetings) {
    static SectionView from(Section section) {
      return new SectionView(
          section.getId(), section.getCourse().getCode(), section.getCrn(), section.getInstructor(),
          section.getCapacity(), section.getAvailableSeats(),
          section.getMeetings().stream()
              .map(meeting -> new MeetingView(
                  meeting.getDayOfWeek(), meeting.getStartTime(), meeting.getEndTime()))
              .toList());
    }
  }

  public record ScheduleView(int score, List<String> warnings, List<SectionView> sections) {}
}
