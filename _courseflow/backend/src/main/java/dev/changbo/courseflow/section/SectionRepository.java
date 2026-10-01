package dev.changbo.courseflow.section;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface SectionRepository extends JpaRepository<Section,Long> {
  @Query("select distinct s from Section s join fetch s.course left join fetch s.meetings "
      + "where upper(s.course.code) in :codes and upper(s.term) = upper(:term)")
  List<Section> findAllForCourseCodes(
      @Param("codes") Collection<String> codes, @Param("term") String term);

  @Query("select distinct s from Section s join fetch s.course left join fetch s.meetings "
      + "where upper(s.course.code) = upper(:courseCode) order by s.crn")
  List<Section> findAllByCourseCode(@Param("courseCode") String courseCode);
}
