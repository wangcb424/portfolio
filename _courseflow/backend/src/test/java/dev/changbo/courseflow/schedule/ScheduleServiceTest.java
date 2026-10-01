package dev.changbo.courseflow.schedule;
import dev.changbo.courseflow.course.Course;
import dev.changbo.courseflow.section.Meeting;
import dev.changbo.courseflow.section.Section;
import org.junit.jupiter.api.Test;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import static org.junit.jupiter.api.Assertions.*;

class ScheduleServiceTest {
  @Test
  void overlappingSectionsConflict() {
    Section a = section("A", DayOfWeek.MONDAY, LocalTime.of(10, 0), LocalTime.of(11, 0));
    Section b = section("B", DayOfWeek.MONDAY, LocalTime.of(10, 30), LocalTime.of(12, 0));

    assertTrue(ScheduleService.conflicts(a, b));
  }

  @Test
  void touchingSectionsDoNotConflict() {
    Section a = section("A", DayOfWeek.MONDAY, LocalTime.of(10, 0), LocalTime.of(11, 0));
    Section b = section("B", DayOfWeek.MONDAY, LocalTime.of(11, 0), LocalTime.of(12, 0));

    assertFalse(ScheduleService.conflicts(a, b));
  }

  @Test
  void sameTimeOnDifferentDaysDoesNotConflict() {
    Section a = section("A", DayOfWeek.MONDAY, LocalTime.of(10, 0), LocalTime.of(11, 0));
    Section b = section("B", DayOfWeek.TUESDAY, LocalTime.of(10, 0), LocalTime.of(11, 0));

    assertFalse(ScheduleService.conflicts(a, b));
  }

  private Section section(String crn, DayOfWeek day, LocalTime start, LocalTime end) {
    Course course = new Course("CS0000", "Test", "Test course", 4);
    Section section = new Section(course, crn, "Fall 2026", "Instructor", 10, 1, Instant.EPOCH);
    section.addMeeting(new Meeting(day, start, end));
    return section;
  }
}
