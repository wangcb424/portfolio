package dev.changbo.courseflow.course;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CourseService {
  private static final int MAX_QUERY_LENGTH = 100;
  private final CourseRepository courseRepository;

  public CourseService(CourseRepository courseRepository) {
    this.courseRepository = courseRepository;
  }

  public List<CourseDto> search(String rawQuery) {
    String query = rawQuery == null ? "" : rawQuery.trim();
    if (query.length() > MAX_QUERY_LENGTH) {
      throw new IllegalArgumentException("Search query must be 100 characters or fewer.");
    }
    return courseRepository.search(query).stream().map(CourseDto::from).toList();
  }

  public CourseDto getByCode(String rawCode) {
    String code = rawCode == null ? "" : rawCode.trim();
    return courseRepository.findByCodeIgnoreCase(code)
        .map(CourseDto::from)
        .orElseThrow(() -> new CourseNotFoundException(code));
  }
}
