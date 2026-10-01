package dev.changbo.courseflow.course;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/courses")
public class CourseController {
  private final CourseService courseService;

  public CourseController(CourseService courseService) {
    this.courseService = courseService;
  }

  @GetMapping
  public List<CourseDto> search(@RequestParam(defaultValue = "") String q) {
    return courseService.search(q);
  }

  @GetMapping("/{code}")
  public CourseDto getByCode(@PathVariable String code) {
    return courseService.getByCode(code);
  }
}
