package dev.changbo.courseflow.section;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;

public record SectionDto(
    Long id,
    String courseCode,
    String crn,
    String term,
    String instructor,
    int capacity,
    int availableSeats,
    Instant seatsCheckedAt,
    List<MeetingDto> meetings) {

  public record MeetingDto(DayOfWeek day, LocalTime start, LocalTime end) {}

  public static SectionDto from(Section section) {
    return new SectionDto(
        section.getId(), section.getCourse().getCode(), section.getCrn(), section.getTerm(),
        section.getInstructor(), section.getCapacity(), section.getAvailableSeats(),
        section.getSeatsCheckedAt(),
        section.getMeetings().stream()
            .map(m -> new MeetingDto(m.getDayOfWeek(), m.getStartTime(), m.getEndTime()))
            .toList());
  }
}
