package dev.changbo.courseflow.course;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CourseRepository extends JpaRepository<Course, Long> {
  Optional<Course> findByCodeIgnoreCase(String code);

  @Query("""
      select distinct c from Course c
      left join fetch c.prerequisites
      where :query = ''
         or upper(c.code) like upper(concat('%', :query, '%'))
         or upper(c.title) like upper(concat('%', :query, '%'))
      order by c.code
      """)
  List<Course> search(@Param("query") String query);
}
