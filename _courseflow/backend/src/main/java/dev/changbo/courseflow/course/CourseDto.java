package dev.changbo.courseflow.course;

import java.util.List;

public record CourseDto(
    Long id,
    String code,
    String title,
    String description,
    int credits,
    List<String> prerequisites) {

  public static CourseDto from(Course course) {
    return new CourseDto(
        course.getId(), course.getCode(), course.getTitle(), course.getDescription(),
        course.getCredits(),
        course.getPrerequisites().stream().map(Course::getCode).sorted().toList());
  }
}
