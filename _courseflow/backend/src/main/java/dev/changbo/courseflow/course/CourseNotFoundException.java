package dev.changbo.courseflow.course;

public class CourseNotFoundException extends RuntimeException {
  public CourseNotFoundException(String code) {
    super("Course not found: " + code);
  }
}
