package dev.changbo.courseflow.schedule;

import static dev.changbo.courseflow.schedule.ScheduleModels.*;

import dev.changbo.courseflow.section.Meeting;
import dev.changbo.courseflow.section.Section;
import dev.changbo.courseflow.section.SectionRepository;
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ScheduleService {
  private final SectionRepository sections;

  public ScheduleService(SectionRepository sections) {
    this.sections = sections;
  }

  public List<ScheduleView> generate(GenerateRequest request) {
    if (!request.earliestStart().isBefore(request.latestEnd())) {
      throw new IllegalArgumentException("Earliest start must be before latest end.");
    }
    List<String> codes = request.courseCodes().stream().map(String::trim)
        .map(code -> code.toUpperCase(Locale.ROOT)).filter(code -> !code.isBlank()).distinct().toList();
    if (codes.isEmpty()) {
      throw new IllegalArgumentException("At least one course code is required.");
    }
    Map<String, List<Section>> choices = new LinkedHashMap<>();
    codes.forEach(code -> choices.put(code, new ArrayList<>()));
    sections.findAllForCourseCodes(codes, request.term()).forEach(section -> {
      List<Section> list = choices.get(section.getCourse().getCode().toUpperCase(Locale.ROOT));
      if (list != null) list.add(section);
    });
    List<String> missing = choices.entrySet().stream()
        .filter(entry -> entry.getValue().isEmpty()).map(Map.Entry::getKey).toList();
    if (!missing.isEmpty()) {
      throw new IllegalArgumentException("No sections found for: " + String.join(", ", missing));
    }
    List<ScheduleView> results = new ArrayList<>();
    long combinations=1;
    for(var list:choices.values()) {
      combinations*=list.size();
      if(combinations>100_000) throw new IllegalArgumentException("Too many combinations. Choose fewer courses.");
    }
    search(new ArrayList<>(choices.values()), 0, new ArrayList<>(), request, results);
    return results.stream().sorted(Comparator.comparingInt(ScheduleView::score).reversed()).limit(request.maxResults()).toList();
  }

  private void search(List<List<Section>> choices, int index, List<Section> current,
                      GenerateRequest request, List<ScheduleView> results) {
    if (index == choices.size()) {
      results.add(evaluate(current, request));
      return;
    }
    for (Section candidate : choices.get(index)) {
      if (current.stream().noneMatch(section -> conflicts(section, candidate))) {
        current.add(candidate);
        search(choices, index + 1, current, request, results);
        current.remove(current.size() - 1);
      }
    }
  }

  static boolean conflicts(Section a, Section b) {
    for (Meeting first : a.getMeetings()) {
      for (Meeting second : b.getMeetings()) {
        boolean sameDay = first.getDayOfWeek() == second.getDayOfWeek();
        boolean overlaps = first.getStartTime().isBefore(second.getEndTime())
            && second.getStartTime().isBefore(first.getEndTime());
        if (sameDay && overlaps) return true;
      }
    }
    return false;
  }

  private ScheduleView evaluate(List<Section> selected, GenerateRequest request) {
    int score = 100;
    List<String> warnings = new ArrayList<>();
    for (Section section : selected) {
      for (Meeting meeting : section.getMeetings()) {
        if (meeting.getStartTime().isBefore(request.earliestStart())) {
          score -= 10;
          warnings.add(section.getCourse().getCode() + " starts before preferred time");
        }
        if (meeting.getEndTime().isAfter(request.latestEnd())) {
          score -= 10;
          warnings.add(section.getCourse().getCode() + " ends after preferred time");
        }
        if (request.avoidFriday() && meeting.getDayOfWeek() == DayOfWeek.FRIDAY) {
          score -= 15;
          warnings.add(section.getCourse().getCode() + " meets Friday");
        }
      }
    }
    return new ScheduleView(
        Math.max(score, 0), warnings.stream().distinct().toList(),
        selected.stream().map(SectionView::from).toList());
  }
}
